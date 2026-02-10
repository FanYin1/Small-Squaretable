package com.squaretable.flink.jobs;

import com.squaretable.flink.functions.ContentAnalyzerWindowFunction;
import com.squaretable.flink.models.CharacterStats;
import com.squaretable.flink.models.ChatEventRecord;
import com.squaretable.flink.schemas.BaseEvent;
import com.squaretable.flink.schemas.BaseEventDeserializer;
import com.squaretable.flink.sinks.ClickHouseSink;

import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.api.common.functions.MapFunction;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.datastream.SingleOutputStreamOperator;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.functions.sink.SinkFunction;
import org.apache.flink.streaming.api.windowing.assigners.TumblingEventTimeWindows;
import org.apache.flink.streaming.api.windowing.time.Time;

import redis.clients.jedis.Jedis;
import redis.clients.jedis.JedisPool;
import redis.clients.jedis.JedisPoolConfig;

import java.time.Duration;
import java.util.Map;

/**
 * Flink job that analyzes character and chat events from Kafka,
 * computes per-character interaction stats and trending scores using
 * 1-hour tumbling windows, and writes results to ClickHouse (dwd_chat_events)
 * and Redis feature store.
 *
 * <p>Kafka topics consumed: events.character, events.chat</p>
 *
 * <p>Outputs:</p>
 * <ul>
 *   <li>ClickHouse analytics.dwd_chat_events -- individual chat event records</li>
 *   <li>Redis fs:char:{characterId}:stats -- per-character stats hash</li>
 *   <li>Redis fs:global:trending -- sorted set of character trending scores</li>
 * </ul>
 */
public class ContentAnalyzerJob {

    private static final String DEFAULT_KAFKA_BROKERS = "localhost:9092";
    private static final String DEFAULT_CLICKHOUSE_URL = "jdbc:clickhouse://localhost:8123/analytics";
    private static final String DEFAULT_REDIS_HOST = "localhost";
    private static final int DEFAULT_REDIS_PORT = 6379;
    private static final String CONSUMER_GROUP = "content-analyzer";

    public static void main(String[] args) throws Exception {
        String kafkaBrokers = envOrDefault("KAFKA_BROKERS", DEFAULT_KAFKA_BROKERS);
        String clickhouseUrl = envOrDefault("CLICKHOUSE_URL", DEFAULT_CLICKHOUSE_URL);
        String redisHost = envOrDefault("REDIS_HOST", DEFAULT_REDIS_HOST);
        int redisPort = Integer.parseInt(envOrDefault("REDIS_PORT", String.valueOf(DEFAULT_REDIS_PORT)));

        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        env.enableCheckpointing(60_000); // checkpoint every 60 seconds

        // Build Kafka source consuming both character and chat event topics
        KafkaSource<BaseEvent> kafkaSource = KafkaSource.<BaseEvent>builder()
                .setBootstrapServers(kafkaBrokers)
                .setTopics("events.character", "events.chat")
                .setGroupId(CONSUMER_GROUP)
                .setStartingOffsets(OffsetsInitializer.latest())
                .setDeserializer(new BaseEventDeserializer())
                .build();

        // Assign watermarks based on event timestamp with 5-second tolerance
        WatermarkStrategy<BaseEvent> watermarkStrategy = WatermarkStrategy
                .<BaseEvent>forBoundedOutOfOrderness(Duration.ofSeconds(5))
                .withTimestampAssigner((event, recordTimestamp) -> event.getTimestamp());

        DataStream<BaseEvent> eventStream = env.fromSource(
                kafkaSource, watermarkStrategy, "kafka-character-chat-source");

        // --- Branch 1: Map each event to a ChatEventRecord and sink to ClickHouse ---
        SingleOutputStreamOperator<ChatEventRecord> chatEventRecords = eventStream
                .filter(event -> extractCharacterId(event) != null)
                .map(new ChatEventRecordMapper())
                .name("map-to-chat-event-record");

        chatEventRecords.addSink(ClickHouseSink.chatEventSink(clickhouseUrl))
                .name("clickhouse-dwd-chat-events-sink");

        // --- Branch 2: Window by characterId, compute stats, sink to Redis ---
        DataStream<CharacterStats> characterStats = eventStream
                .filter(event -> extractCharacterId(event) != null)
                .keyBy(event -> extractCharacterId(event))
                .window(TumblingEventTimeWindows.of(Time.hours(1)))
                .process(new ContentAnalyzerWindowFunction())
                .name("content-analyzer-window");

        characterStats.addSink(new RedisCharacterStatsSink(redisHost, redisPort))
                .name("redis-character-stats-sink");

        env.execute("ContentAnalyzerJob");
    }

    // ---- Helper methods ----

    /**
     * Extracts characterId from the event properties map.
     * Looks for "characterId" or "character_id" keys.
     */
    static String extractCharacterId(BaseEvent event) {
        Map<String, Object> props = event.getProperties();
        if (props == null) {
            return null;
        }
        Object id = props.get("characterId");
        if (id != null) {
            return id.toString();
        }
        id = props.get("character_id");
        if (id != null) {
            return id.toString();
        }
        return null;
    }

    /**
     * Extracts a string property from the event, returning a default if absent.
     */
    static String extractStringProp(BaseEvent event, String key, String defaultValue) {
        Map<String, Object> props = event.getProperties();
        if (props == null) {
            return defaultValue;
        }
        Object val = props.get(key);
        return val != null ? val.toString() : defaultValue;
    }

    /**
     * Extracts an integer property from the event, returning 0 if absent or unparseable.
     */
    static int extractIntProp(BaseEvent event, String key) {
        Map<String, Object> props = event.getProperties();
        if (props == null) {
            return 0;
        }
        Object val = props.get(key);
        if (val == null) {
            return 0;
        }
        try {
            return ((Number) val).intValue();
        } catch (ClassCastException e) {
            try {
                return Integer.parseInt(val.toString());
            } catch (NumberFormatException nfe) {
                return 0;
            }
        }
    }

    /**
     * Extracts a Float rating from the event properties, returning null if absent.
     */
    static Float extractRatingProp(BaseEvent event) {
        Map<String, Object> props = event.getProperties();
        if (props == null) {
            return null;
        }
        Object val = props.get("rating");
        if (val == null) {
            return null;
        }
        try {
            return ((Number) val).floatValue();
        } catch (ClassCastException e) {
            try {
                return Float.parseFloat(val.toString());
            } catch (NumberFormatException nfe) {
                return null;
            }
        }
    }

    static String envOrDefault(String key, String defaultValue) {
        String val = System.getenv(key);
        return val != null && !val.isEmpty() ? val : defaultValue;
    }

    // ---- Inner classes ----

    /**
     * Maps a BaseEvent to a ChatEventRecord for ClickHouse insertion.
     */
    static class ChatEventRecordMapper implements MapFunction<BaseEvent, ChatEventRecord> {
        @Override
        public ChatEventRecord map(BaseEvent event) {
            ChatEventRecord record = new ChatEventRecord();
            record.setEventId(event.getEventId());
            record.setUserId(event.getUserId());
            record.setTenantId(event.getTenantId());
            record.setCharacterId(extractCharacterId(event));
            record.setChatId(extractStringProp(event, "chatId",
                    extractStringProp(event, "chat_id", "")));
            record.setAction(event.getEventType() != null ? event.getEventType() : "unknown");
            record.setMessageRole(extractStringProp(event, "messageRole",
                    extractStringProp(event, "message_role", "")));
            record.setTokenCount(extractIntProp(event, "tokenCount") > 0
                    ? extractIntProp(event, "tokenCount")
                    : extractIntProp(event, "token_count"));
            record.setRating(extractRatingProp(event));
            record.setTimestamp(event.getTimestamp());
            return record;
        }
    }

    /**
     * Custom SinkFunction that writes CharacterStats to Redis.
     * Updates both per-character stats hashes and the global trending sorted set.
     */
    static class RedisCharacterStatsSink implements SinkFunction<CharacterStats> {
        private static final long serialVersionUID = 1L;

        private final String redisHost;
        private final int redisPort;
        private transient JedisPool jedisPool;

        /** Key prefix for per-character stats hash. */
        private static final String CHAR_STATS_PREFIX = "fs:char:";
        private static final String CHAR_STATS_SUFFIX = ":stats";

        /** Key for the global trending sorted set. */
        private static final String TRENDING_KEY = "fs:global:trending";

        /** TTL for per-character stats: 48 hours. */
        private static final int STATS_TTL_SECONDS = 48 * 3600;

        RedisCharacterStatsSink(String redisHost, int redisPort) {
            this.redisHost = redisHost;
            this.redisPort = redisPort;
        }

        private JedisPool getPool() {
            if (jedisPool == null || jedisPool.isClosed()) {
                JedisPoolConfig config = new JedisPoolConfig();
                config.setMaxTotal(8);
                config.setMaxIdle(4);
                jedisPool = new JedisPool(config, redisHost, redisPort);
            }
            return jedisPool;
        }

        @Override
        public void invoke(CharacterStats stats, Context context) {
            String charKey = CHAR_STATS_PREFIX + stats.getCharacterId() + CHAR_STATS_SUFFIX;

            try (Jedis jedis = getPool().getResource()) {
                // Update per-character stats hash using HINCRBY/HINCRBYFLOAT
                jedis.hincrBy(charKey, "chat_starts", stats.getChatStarts());
                jedis.hincrBy(charKey, "messages", stats.getMessages());
                jedis.hincrBy(charKey, "total_users", stats.getTotalUsers());

                if (stats.getRatingCount() > 0) {
                    jedis.hincrBy(charKey, "rating_count", stats.getRatingCount());
                    jedis.hincrByFloat(charKey, "rating_sum", stats.getRatingSum());
                    // Compute and store avg_rating
                    String rcStr = jedis.hget(charKey, "rating_count");
                    String rsStr = jedis.hget(charKey, "rating_sum");
                    if (rcStr != null && rsStr != null) {
                        long rc = Long.parseLong(rcStr);
                        double rs = Double.parseDouble(rsStr);
                        double avg = rc > 0 ? rs / rc : 0.0;
                        jedis.hset(charKey, "avg_rating",
                                String.format("%.4f", avg));
                    }
                }

                // Set TTL on the stats key
                jedis.expire(charKey, STATS_TTL_SECONDS);

                // Update global trending sorted set
                jedis.zadd(TRENDING_KEY, stats.getTrendingScore(),
                        stats.getCharacterId());
            }
        }
    }
}
