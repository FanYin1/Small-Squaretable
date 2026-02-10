package com.squaretable.flink.jobs;

import com.google.gson.Gson;
import com.squaretable.flink.functions.MetricsWindowFunction;
import com.squaretable.flink.functions.PiiFilter;
import com.squaretable.flink.models.AggregatedMetrics;
import com.squaretable.flink.schemas.BaseEvent;
import com.squaretable.flink.schemas.BaseEventDeserializer;
import com.squaretable.flink.sinks.ClickHouseSink;
import com.squaretable.flink.sinks.RedisSink;
import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.datastream.SingleOutputStreamOperator;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.windowing.assigners.TumblingEventTimeWindows;
import org.apache.flink.streaming.api.windowing.time.Time;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Duration;
import java.util.Arrays;
import java.util.List;

/**
 * Flink job that consumes events from all Kafka topics and produces
 * multi-granularity aggregations:
 *
 * <ul>
 *   <li>1-minute aggregations -> Redis (real-time dashboard)</li>
 *   <li>Raw events -> ClickHouse ods_events (feeds hourly/daily materialized views)</li>
 * </ul>
 *
 * <p>Pipeline: KafkaSource -> PiiFilter -> keyBy(tenantId) ->
 *   TumblingEventTimeWindow(1min) -> MetricsWindowFunction -> RedisSink
 *   (branched: filtered stream also sinks raw events to ClickHouse)</p>
 */
public class MetricsAggregatorJob {

    private static final Logger LOG = LoggerFactory.getLogger(MetricsAggregatorJob.class);
    private static final Gson GSON = new Gson();

    /** All Kafka topics consumed by this job. */
    static final List<String> KAFKA_TOPICS = Arrays.asList(
            "events.user",
            "events.chat",
            "events.character",
            "events.recommendation",
            "events.system"
    );

    /** TTL for 1-minute Redis metrics: 24 hours. */
    private static final int REDIS_TTL_SECONDS = 86400;

    public static void main(String[] args) throws Exception {
        // Read configuration from environment variables with sensible defaults
        String kafkaBootstrap = getEnv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092");
        String kafkaGroupId = getEnv("KAFKA_GROUP_ID", "metrics-aggregator");
        String redisUrl = getEnv("REDIS_URL", "redis://localhost:6379");
        String clickhouseUrl = getEnv("CLICKHOUSE_JDBC_URL",
                "jdbc:clickhouse://localhost:8123/analytics");

        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();

        // Enable checkpointing every 60 seconds for fault tolerance
        env.enableCheckpointing(60_000);

        // Build the pipeline
        buildPipeline(env, kafkaBootstrap, kafkaGroupId, redisUrl, clickhouseUrl);

        env.execute("MetricsAggregatorJob");
    }

    /**
     * Builds the full Flink pipeline. Extracted as a static method so it can be
     * tested with a MiniCluster or mock environment.
     */
    static void buildPipeline(
            StreamExecutionEnvironment env,
            String kafkaBootstrap,
            String kafkaGroupId,
            String redisUrl,
            String clickhouseUrl) {

        // --- Source: Kafka consuming all 5 topics ---
        KafkaSource<BaseEvent> kafkaSource = KafkaSource.<BaseEvent>builder()
                .setBootstrapServers(kafkaBootstrap)
                .setTopics(KAFKA_TOPICS)
                .setGroupId(kafkaGroupId)
                .setStartingOffsets(OffsetsInitializer.latest())
                .setValueOnlyDeserializer(new BaseEventDeserializer())
                .build();

        // Watermark strategy: event-time based on BaseEvent.timestamp with 5s tolerance
        WatermarkStrategy<BaseEvent> watermarkStrategy = WatermarkStrategy
                .<BaseEvent>forBoundedOutOfOrderness(Duration.ofSeconds(5))
                .withTimestampAssigner((event, recordTimestamp) -> event.getTimestamp());

        DataStream<BaseEvent> sourceStream = env
                .fromSource(kafkaSource, watermarkStrategy, "kafka-all-topics");

        // --- Step 1: PII filtering ---
        SingleOutputStreamOperator<BaseEvent> filteredStream = sourceStream
                .map(new PiiFilter())
                .name("pii-filter");

        // --- Branch A: Raw events -> ClickHouse ods_events ---
        // ClickHouse materialized views (dws_user_hourly, dws_character_daily)
        // are triggered automatically on insert.
        filteredStream
                .addSink(ClickHouseSink.eventSink(clickhouseUrl))
                .name("clickhouse-ods-events-sink");

        // --- Branch B: 1-minute tumbling window -> Redis (real-time dashboard) ---
        DataStream<AggregatedMetrics> oneMinMetrics = filteredStream
                .keyBy(BaseEvent::getTenantId)
                .window(TumblingEventTimeWindows.of(Time.minutes(1)))
                .process(new MetricsWindowFunction())
                .name("1min-metrics-window");

        oneMinMetrics
                .addSink(createRedisSink(redisUrl))
                .name("redis-1min-metrics-sink");

        // --- Branch C: 1-hour tumbling window -> Redis (hourly summary) ---
        DataStream<AggregatedMetrics> oneHourMetrics = filteredStream
                .keyBy(BaseEvent::getTenantId)
                .window(TumblingEventTimeWindows.of(Time.hours(1)))
                .process(new MetricsWindowFunction())
                .name("1h-metrics-window");

        oneHourMetrics
                .addSink(createHourlyRedisSink(redisUrl))
                .name("redis-1h-metrics-sink");

        LOG.info("MetricsAggregatorJob pipeline built: Kafka({}) -> PII -> " +
                "[ClickHouse ods_events, Redis 1min, Redis 1h]", KAFKA_TOPICS);
    }

    /**
     * Creates a RedisSink for 1-minute aggregated metrics.
     * Key format: metrics:realtime:{tenantId}:{minuteTimestamp}
     * TTL: 24 hours
     */
    static RedisSink<AggregatedMetrics> createRedisSink(String redisUrl) {
        return new RedisSink<>(redisUrl, metrics -> {
            String key = String.format("metrics:realtime:%s:%d",
                    metrics.getTenantId(), metrics.getWindowStart());
            String value = GSON.toJson(metrics);
            return new RedisSink.RedisCommand(key, value, REDIS_TTL_SECONDS);
        });
    }

    /**
     * Creates a RedisSink for 1-hour aggregated metrics.
     * Key format: metrics:hourly:{tenantId}:{hourTimestamp}
     * TTL: 7 days
     */
    static RedisSink<AggregatedMetrics> createHourlyRedisSink(String redisUrl) {
        int sevenDaysTtl = 7 * 86400;
        return new RedisSink<>(redisUrl, metrics -> {
            String key = String.format("metrics:hourly:%s:%d",
                    metrics.getTenantId(), metrics.getWindowStart());
            String value = GSON.toJson(metrics);
            return new RedisSink.RedisCommand(key, value, sevenDaysTtl);
        });
    }

    private static String getEnv(String key, String defaultValue) {
        String value = System.getenv(key);
        return (value != null && !value.isEmpty()) ? value : defaultValue;
    }
}