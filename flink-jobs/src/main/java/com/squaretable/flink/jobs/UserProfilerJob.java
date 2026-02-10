package com.squaretable.flink.jobs;

import com.squaretable.flink.functions.UserProfileFunction;
import com.squaretable.flink.schemas.BaseEvent;
import com.squaretable.flink.schemas.BaseEventDeserializer;
import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.windowing.assigners.SlidingEventTimeWindows;
import org.apache.flink.streaming.api.windowing.time.Time;

import java.time.Duration;
import java.util.Arrays;

/**
 * Flink job that builds user profiles from events.user and events.character topics.
 *
 * <p>Uses a sliding event-time window (1 hour window, 5 minute slide) keyed by userId.
 * Computes engagement scores, activity levels, interest tags, and recent character
 * interactions, then writes results to the Redis Feature Store.</p>
 *
 * <p>Environment variables:</p>
 * <ul>
 *   <li>{@code KAFKA_BROKERS} - Kafka bootstrap servers (default: localhost:9092)</li>
 *   <li>{@code REDIS_URL} - Redis connection URL (default: redis://localhost:6379)</li>
 * </ul>
 */
public class UserProfilerJob {

    private static final String JOB_NAME = "user-profiler";
    private static final String CONSUMER_GROUP = "flink-user-profiler";

    public static void main(String[] args) throws Exception {
        String kafkaBrokers = getEnvOrDefault("KAFKA_BROKERS", "localhost:9092");
        String redisUrl = getEnvOrDefault("REDIS_URL", "redis://localhost:6379");

        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();

        // Kafka source consuming events.user and events.character topics
        KafkaSource<BaseEvent> kafkaSource = KafkaSource.<BaseEvent>builder()
                .setBootstrapServers(kafkaBrokers)
                .setTopics(Arrays.asList("events.user", "events.character"))
                .setGroupId(CONSUMER_GROUP)
                .setStartingOffsets(OffsetsInitializer.latest())
                .setValueOnlyDeserializer(new BaseEventDeserializer())
                .build();

        // Watermark strategy: use event timestamp with 30s allowed lateness
        WatermarkStrategy<BaseEvent> watermarkStrategy = WatermarkStrategy
                .<BaseEvent>forBoundedOutOfOrderness(Duration.ofSeconds(30))
                .withTimestampAssigner((event, recordTimestamp) -> event.getTimestamp());

        DataStream<BaseEvent> eventStream = env
                .fromSource(kafkaSource, watermarkStrategy, "kafka-user-character-events");

        // Key by userId, apply sliding window, compute profile
        eventStream
                .filter(event -> event.getUserId() != null)
                .keyBy(BaseEvent::getUserId)
                .window(SlidingEventTimeWindows.of(Time.hours(1), Time.minutes(5)))
                .process(new UserProfileFunction(redisUrl))
                .name("user-profile-computation");

        env.execute(JOB_NAME);
    }

    static String getEnvOrDefault(String key, String defaultValue) {
        String value = System.getenv(key);
        return (value != null && !value.isEmpty()) ? value : defaultValue;
    }
}
