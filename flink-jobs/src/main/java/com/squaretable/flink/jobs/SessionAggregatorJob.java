package com.squaretable.flink.jobs;

import com.squaretable.flink.functions.SessionWindowFunction;
import com.squaretable.flink.models.ActiveUserCount;
import com.squaretable.flink.models.SessionSummary;
import com.squaretable.flink.schemas.BaseEvent;
import com.squaretable.flink.schemas.BaseEventDeserializer;
import com.squaretable.flink.sinks.ClickHouseSink;
import com.squaretable.flink.sinks.RedisSink;
import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.api.common.functions.AggregateFunction;
import org.apache.flink.api.java.functions.KeySelector;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.datastream.SingleOutputStreamOperator;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.windowing.assigners.EventTimeSessionWindows;
import org.apache.flink.streaming.api.windowing.assigners.TumblingEventTimeWindows;
import org.apache.flink.streaming.api.windowing.windows.TimeWindow;
import org.apache.flink.streaming.api.functions.windowing.ProcessWindowFunction;
import org.apache.flink.util.Collector;
import org.apache.flink.util.OutputTag;

import java.time.Duration;
import java.util.HashSet;
import java.util.Set;

/**
 * Flink job that aggregates user session data from Kafka topics (events.user, events.chat)
 * into session summaries written to ClickHouse ods_sessions table.
 *
 * <p>Side output: 1-minute tumbling window counting distinct active users per tenant,
 * written to Redis key {@code metrics:active_users:{tenantId}}.</p>
 */
public class SessionAggregatorJob {

    /** Side output tag for raw events routed to the active-user counting pipeline. */
    static final OutputTag<BaseEvent> ACTIVE_USER_TAG =
            new OutputTag<BaseEvent>("active-user-events") {};

    public static void main(String[] args) throws Exception {
        String kafkaBrokers = envOrDefault("KAFKA_BROKERS", "localhost:9092");
        String clickhouseUrl = envOrDefault("CLICKHOUSE_JDBC_URL",
                "jdbc:clickhouse://localhost:8123/analytics");
        String redisUrl = envOrDefault("REDIS_URL", "redis://localhost:6379");
        String groupId = envOrDefault("KAFKA_GROUP_ID", "session-aggregator");

        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        env.enableCheckpointing(60_000); // checkpoint every 60s

        DataStream<SessionSummary> sessionStream = buildSessionPipeline(
                env, kafkaBrokers, groupId, clickhouseUrl, redisUrl);

        env.execute("SessionAggregatorJob");
    }

    /**
     * Builds the full session aggregation pipeline. Extracted for testability.
     */
    static DataStream<SessionSummary> buildSessionPipeline(
            StreamExecutionEnvironment env,
            String kafkaBrokers,
            String groupId,
            String clickhouseUrl,
            String redisUrl) {

        // Kafka source consuming events.user and events.chat topics
        KafkaSource<BaseEvent> kafkaSource = KafkaSource.<BaseEvent>builder()
                .setBootstrapServers(kafkaBrokers)
                .setTopics("events.user", "events.chat")
                .setGroupId(groupId)
                .setStartingOffsets(OffsetsInitializer.latest())
                .setValueOnlyDeserializer(new BaseEventDeserializer())
                .build();

        // Assign event-time watermarks with 5-second tolerance for out-of-order events
        WatermarkStrategy<BaseEvent> watermarkStrategy = WatermarkStrategy
                .<BaseEvent>forBoundedOutOfOrderness(Duration.ofSeconds(5))
                .withTimestampAssigner((event, recordTimestamp) -> event.getTimestamp());

        DataStream<BaseEvent> eventStream = env
                .fromSource(kafkaSource, watermarkStrategy, "kafka-events-source");

        // --- Main pipeline: Session windows keyed by sessionId ---
        SingleOutputStreamOperator<SessionSummary> sessionSummaries = eventStream
                .keyBy((KeySelector<BaseEvent, String>) BaseEvent::getSessionId)
                .window(EventTimeSessionWindows.withGap(Duration.ofMinutes(30)))
                .process(new SessionWindowFunctionWithSideOutput())
                .name("session-window-aggregation");

        // Sink session summaries to ClickHouse
        sessionSummaries.addSink(ClickHouseSink.sessionSink(clickhouseUrl))
                .name("clickhouse-ods-sessions-sink");

        // --- Side output: 1-min tumbling window for active user count per tenant ---
        DataStream<BaseEvent> sideEvents = sessionSummaries.getSideOutput(ACTIVE_USER_TAG);

        DataStream<ActiveUserCount> activeUserCounts = sideEvents
                .keyBy((KeySelector<BaseEvent, String>) BaseEvent::getTenantId)
                .window(TumblingEventTimeWindows.of(Duration.ofMinutes(1)))
                .aggregate(new ActiveUserAggregator(), new ActiveUserWindowFunction())
                .name("active-user-count-window");

        // Sink active user counts to Redis
        activeUserCounts.addSink(new RedisSink<>(redisUrl, element ->
                new RedisSink.RedisCommand(
                        "metrics:active_users:" + element.getTenantId(),
                        String.valueOf(element.getCount()),
                        120 // TTL 2 minutes
                )
        )).name("redis-active-users-sink");

        return sessionSummaries;
    }

    /**
     * Extended SessionWindowFunction that also emits events to the side output
     * for active user counting.
     */
    static class SessionWindowFunctionWithSideOutput
            extends ProcessWindowFunction<BaseEvent, SessionSummary, String, TimeWindow> {

        private final SessionWindowFunction delegate = new SessionWindowFunction();

        @Override
        public void process(
                String sessionId,
                ProcessWindowFunction<BaseEvent, SessionSummary, String, TimeWindow>.Context context,
                Iterable<BaseEvent> elements,
                Collector<SessionSummary> out) {

            // Collect elements so we can iterate twice
            java.util.List<BaseEvent> eventList = new java.util.ArrayList<>();
            for (BaseEvent event : elements) {
                eventList.add(event);
            }

            // Emit each event to the side output for active user counting
            for (BaseEvent event : eventList) {
                context.output(ACTIVE_USER_TAG, event);
            }

            // Delegate to the core SessionWindowFunction
            delegate.process(sessionId, context, eventList, out);
        }
    }

    /**
     * Aggregate function that counts distinct user IDs within a window.
     */
    static class ActiveUserAggregator
            implements AggregateFunction<BaseEvent, Set<String>, Long> {

        @Override
        public Set<String> createAccumulator() {
            return new HashSet<>();
        }

        @Override
        public Set<String> add(BaseEvent event, Set<String> accumulator) {
            if (event.getUserId() != null) {
                accumulator.add(event.getUserId());
            }
            return accumulator;
        }

        @Override
        public Long getResult(Set<String> accumulator) {
            return (long) accumulator.size();
        }

        @Override
        public Set<String> merge(Set<String> a, Set<String> b) {
            a.addAll(b);
            return a;
        }
    }

    /**
     * Window function that attaches the tenant ID and window end time to the
     * active user count result.
     */
    static class ActiveUserWindowFunction
            extends ProcessWindowFunction<Long, ActiveUserCount, String, TimeWindow> {

        @Override
        public void process(
                String tenantId,
                ProcessWindowFunction<Long, ActiveUserCount, String, TimeWindow>.Context context,
                Iterable<Long> elements,
                Collector<ActiveUserCount> out) {

            Long count = elements.iterator().next();
            out.collect(new ActiveUserCount(tenantId, count, context.window().getEnd()));
        }
    }

    private static String envOrDefault(String key, String defaultValue) {
        String value = System.getenv(key);
        return value != null ? value : defaultValue;
    }
}
