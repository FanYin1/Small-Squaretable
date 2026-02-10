package com.squaretable.flink.jobs;

import com.squaretable.flink.models.RecommendationEvent;
import com.squaretable.flink.schemas.BaseEvent;
import com.squaretable.flink.schemas.BaseEventDeserializer;
import org.apache.flink.api.common.eventtime.SerializableTimestampAssigner;
import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.api.common.functions.MapFunction;
import org.apache.flink.connector.jdbc.JdbcConnectionOptions;
import org.apache.flink.connector.jdbc.JdbcExecutionOptions;
import org.apache.flink.connector.jdbc.JdbcSink;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.functions.windowing.ProcessWindowFunction;
import org.apache.flink.streaming.api.windowing.assigners.TumblingEventTimeWindows;
import org.apache.flink.streaming.api.windowing.time.Time;
import org.apache.flink.streaming.api.windowing.windows.TimeWindow;
import org.apache.flink.util.Collector;

import java.sql.Timestamp;
import java.time.Duration;
import java.util.Map;
import java.util.Set;

/**
 * Flink job that consumes recommendation events from the Kafka topic
 * "events.recommendation" and writes individual event records to the
 * ClickHouse analytics.dwd_recommendation_events table.
 *
 * <p>The ClickHouse materialized view dws_recommendation_hourly automatically
 * aggregates impressions, clicks, and conversions per experiment/variant/scene
 * on an hourly basis.</p>
 *
 * <p>Configuration via environment variables:</p>
 * <ul>
 *   <li>KAFKA_BROKERS - Kafka bootstrap servers (default: localhost:9092)</li>
 *   <li>CLICKHOUSE_URL - ClickHouse JDBC URL (default: jdbc:clickhouse://localhost:8123/analytics)</li>
 * </ul>
 */
public class RecommendationTrackerJob {

    static final String KAFKA_TOPIC = "events.recommendation";
    static final String CONSUMER_GROUP = "flink-recommendation-tracker";
    private static final String CH_DRIVER = "ru.yandex.clickhouse.ClickHouseDriver";
    private static final Set<String> VALID_ACTIONS = Set.of("show", "click", "convert");


    public static void main(String[] args) throws Exception {
        String kafkaBrokers = envOrDefault("KAFKA_BROKERS", "localhost:9092");
        String clickhouseUrl = envOrDefault("CLICKHOUSE_URL",
                "jdbc:clickhouse://localhost:8123/analytics");

        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();

        KafkaSource<BaseEvent> kafkaSource = KafkaSource.<BaseEvent>builder()
                .setBootstrapServers(kafkaBrokers)
                .setTopics(KAFKA_TOPIC)
                .setGroupId(CONSUMER_GROUP)
                .setStartingOffsets(OffsetsInitializer.latest())
                .setDeserializer(new BaseEventDeserializer())
                .build();

        WatermarkStrategy<BaseEvent> watermarkStrategy = WatermarkStrategy
                .<BaseEvent>forBoundedOutOfOrderness(Duration.ofSeconds(10))
                .withTimestampAssigner(
                        (SerializableTimestampAssigner<BaseEvent>) (event, ts) -> event.getTimestamp()
                );

        DataStream<RecommendationEvent> recEvents = env
                .fromSource(kafkaSource, watermarkStrategy, "kafka-recommendation-source")
                .map(new RecommendationEventMapper())
                .filter(event -> event != null)
                .name("extract-recommendation-events")
                .keyBy(RecommendationEvent::getExperimentId)
                .window(TumblingEventTimeWindows.of(Time.minutes(5)))
                .process(new PassThroughWindowFunction())
                .name("tumbling-5min-window");

        recEvents.addSink(recommendationEventSink(clickhouseUrl))
                .name("clickhouse-dwd-recommendation-events");

        env.execute("RecommendationTrackerJob");
    }


    /**
     * Extracts recommendation-specific fields from a BaseEvent into a
     * RecommendationEvent POJO. Returns null if required fields are missing
     * or the action is not one of the valid values (show, click, convert).
     *
     * <p>Expected properties in BaseEvent:</p>
     * <ul>
     *   <li>experiment_id (required)</li>
     *   <li>variant (required)</li>
     *   <li>scene (required)</li>
     *   <li>character_id (optional, defaults to "")</li>
     *   <li>action (required, one of: show, click, convert)</li>
     *   <li>position (optional, defaults to 0)</li>
     * </ul>
     */
    static RecommendationEvent extractRecommendationEvent(BaseEvent baseEvent) {
        if (baseEvent == null) {
            return null;
        }
        Map<String, Object> props = baseEvent.getProperties();
        if (props == null) {
            return null;
        }

        String experimentId = getStringProp(props, "experiment_id");
        String variant = getStringProp(props, "variant");
        String scene = getStringProp(props, "scene");
        String action = getStringProp(props, "action");

        // Required fields validation
        if (experimentId == null || variant == null || scene == null || action == null) {
            return null;
        }

        // Validate action is one of the expected values
        if (!VALID_ACTIONS.contains(action)) {
            return null;
        }

        String characterId = getStringProp(props, "character_id");
        int position = getIntProp(props, "position", 0);

        RecommendationEvent event = new RecommendationEvent();
        event.setEventId(baseEvent.getEventId());
        event.setUserId(baseEvent.getUserId());
        event.setExperimentId(experimentId);
        event.setVariant(variant);
        event.setScene(scene);
        event.setCharacterId(characterId != null ? characterId : "");
        event.setAction(action);
        event.setPosition(position);
        event.setTimestamp(baseEvent.getTimestamp());

        return event;
    }


    /**
     * MapFunction that delegates to extractRecommendationEvent.
     * Returns null for events that cannot be parsed (filtered downstream).
     */
    static class RecommendationEventMapper implements MapFunction<BaseEvent, RecommendationEvent> {
        @Override
        public RecommendationEvent map(BaseEvent value) {
            return extractRecommendationEvent(value);
        }
    }

    /**
     * ProcessWindowFunction that emits each individual RecommendationEvent
     * within the 5-minute tumbling window. This provides event-time windowing
     * semantics (watermark-driven processing boundaries) while still writing
     * individual records to the DWD table. The ClickHouse materialized view
     * dws_recommendation_hourly handles the actual aggregation.
     */
    static class PassThroughWindowFunction
            extends ProcessWindowFunction<RecommendationEvent, RecommendationEvent, String, TimeWindow> {
        @Override
        public void process(
                String experimentId,
                ProcessWindowFunction<RecommendationEvent, RecommendationEvent, String, TimeWindow>.Context context,
                Iterable<RecommendationEvent> elements,
                Collector<RecommendationEvent> out) {
            for (RecommendationEvent event : elements) {
                out.collect(event);
            }
        }
    }

    /**
     * Creates a JDBC sink for writing RecommendationEvent records to the
     * analytics.dwd_recommendation_events ClickHouse table.
     */
    static org.apache.flink.streaming.api.functions.sink.SinkFunction<RecommendationEvent>
            recommendationEventSink(String jdbcUrl) {
        String sql = "INSERT INTO analytics.dwd_recommendation_events "
                + "(event_id, user_id, experiment_id, variant, scene, "
                + "character_id, action, position, timestamp) "
                + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";

        return JdbcSink.sink(
                sql,
                (ps, event) -> {
                    ps.setString(1, event.getEventId());
                    ps.setString(2, event.getUserId());
                    ps.setString(3, event.getExperimentId());
                    ps.setString(4, event.getVariant());
                    ps.setString(5, event.getScene());
                    ps.setString(6, event.getCharacterId());
                    ps.setString(7, event.getAction());
                    ps.setShort(8, (short) event.getPosition());
                    ps.setTimestamp(9, new Timestamp(event.getTimestamp()));
                },
                JdbcExecutionOptions.builder()
                        .withBatchSize(500)
                        .withBatchIntervalMs(5000)
                        .withMaxRetries(3)
                        .build(),
                new JdbcConnectionOptions.JdbcConnectionOptionsBuilder()
                        .withUrl(jdbcUrl)
                        .withDriverName(CH_DRIVER)
                        .build()
        );
    }

    private static String getStringProp(Map<String, Object> props, String key) {
        Object value = props.get(key);
        return value != null ? value.toString() : null;
    }

    private static int getIntProp(Map<String, Object> props, String key, int defaultValue) {
        Object value = props.get(key);
        if (value == null) {
            return defaultValue;
        }
        if (value instanceof Number) {
            return ((Number) value).intValue();
        }
        try {
            return Integer.parseInt(value.toString());
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }

    private static String envOrDefault(String name, String defaultValue) {
        String value = System.getenv(name);
        return value != null && !value.isEmpty() ? value : defaultValue;
    }
}
