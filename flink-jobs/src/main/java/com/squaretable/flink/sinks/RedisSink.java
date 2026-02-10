package com.squaretable.flink.sinks;

import org.apache.flink.configuration.Configuration;
import org.apache.flink.streaming.api.functions.sink.RichSinkFunction;
import redis.clients.jedis.Jedis;
import redis.clients.jedis.JedisPool;
import redis.clients.jedis.JedisPoolConfig;

/**
 * Generic Redis sink that writes key-value pairs with an optional TTL.
 *
 * @param <T> input element type
 */
public class RedisSink<T> extends RichSinkFunction<T> {

    private final String redisUrl;
    private final KeyValueMapper<T> mapper;
    private transient JedisPool jedisPool;

    /**
     * Functional interface for extracting Redis key, value, and TTL from an element.
     */
    public interface KeyValueMapper<T> extends java.io.Serializable {
        /**
         * Map an element to a Redis command.
         *
         * @param element the input element
         * @return a RedisCommand describing the key, value, and TTL
         */
        RedisCommand map(T element);
    }

    /**
     * Describes a single Redis SET command with optional TTL.
     */
    public static class RedisCommand implements java.io.Serializable {
        private final String key;
        private final String value;
        private final int ttlSeconds;

        public RedisCommand(String key, String value, int ttlSeconds) {
            this.key = key;
            this.value = value;
            this.ttlSeconds = ttlSeconds;
        }

        public String getKey() { return key; }
        public String getValue() { return value; }
        public int getTtlSeconds() { return ttlSeconds; }
    }

    public RedisSink(String redisUrl, KeyValueMapper<T> mapper) {
        this.redisUrl = redisUrl;
        this.mapper = mapper;
    }

    @Override
    public void open(Configuration parameters) throws Exception {
        super.open(parameters);
        JedisPoolConfig poolConfig = new JedisPoolConfig();
        poolConfig.setMaxTotal(8);
        poolConfig.setMaxIdle(4);
        jedisPool = new JedisPool(poolConfig, java.net.URI.create(redisUrl));
    }

    @Override
    public void invoke(T value, Context context) throws Exception {
        RedisCommand cmd = mapper.map(value);
        try (Jedis jedis = jedisPool.getResource()) {
            if (cmd.getTtlSeconds() > 0) {
                jedis.setex(cmd.getKey(), cmd.getTtlSeconds(), cmd.getValue());
            } else {
                jedis.set(cmd.getKey(), cmd.getValue());
            }
        }
    }

    @Override
    public void close() throws Exception {
        if (jedisPool != null && !jedisPool.isClosed()) {
            jedisPool.close();
        }
        super.close();
    }
}
