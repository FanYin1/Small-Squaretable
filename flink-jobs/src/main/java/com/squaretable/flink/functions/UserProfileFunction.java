package com.squaretable.flink.functions;

import com.squaretable.flink.models.UserProfile;
import com.squaretable.flink.schemas.BaseEvent;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.streaming.api.functions.windowing.ProcessWindowFunction;
import org.apache.flink.streaming.api.windowing.windows.TimeWindow;
import org.apache.flink.util.Collector;
import redis.clients.jedis.Jedis;
import redis.clients.jedis.JedisPool;
import redis.clients.jedis.JedisPoolConfig;
import redis.clients.jedis.Pipeline;

import java.net.URI;
import java.util.*;

/**
 * ProcessWindowFunction that computes user profile features from a sliding window
 * of events (1h window, 5min slide). Writes results to Redis Feature Store.
 *
 * <p>Redis keys written:</p>
 * <ul>
 *   <li>{@code fs:user:{userId}:profile} - Hash with engagement_score, activity_level, last_active, total_events, total_sessions</li>
 *   <li>{@code fs:user:{userId}:interests} - Sorted set of interest tags with scores</li>
 *   <li>{@code fs:user:{userId}:recent} - List of recently interacted character IDs</li>
 * </ul>
 */
public class UserProfileFunction
        extends ProcessWindowFunction<BaseEvent, UserProfile, String, TimeWindow> {

    private static final long serialVersionUID = 1L;

    /** TTL for feature store keys: 24 hours in seconds. */
    static final int KEY_TTL_SECONDS = 86400;

    /** Maximum number of recent character IDs to keep. */
    static final int MAX_RECENT_CHARACTERS = 20;

    /** Activity level thresholds based on event count in the 1h window. */
    static final int HIGH_ACTIVITY_THRESHOLD = 50;
    static final int MEDIUM_ACTIVITY_THRESHOLD = 10;

    private final String redisUrl;
    private transient JedisPool jedisPool;

    public UserProfileFunction(String redisUrl) {
        this.redisUrl = redisUrl;
    }

    @Override
    public void open(Configuration parameters) throws Exception {
        super.open(parameters);
        JedisPoolConfig poolConfig = new JedisPoolConfig();
        poolConfig.setMaxTotal(8);
        poolConfig.setMaxIdle(4);
        jedisPool = new JedisPool(poolConfig, URI.create(redisUrl));
    }

    @Override
    public void close() throws Exception {
        if (jedisPool != null && !jedisPool.isClosed()) {
            jedisPool.close();
        }
        super.close();
    }

    @Override
    public void process(
            String userId,
            ProcessWindowFunction<BaseEvent, UserProfile, String, TimeWindow>.Context context,
            Iterable<BaseEvent> elements,
            Collector<UserProfile> out) {

        List<BaseEvent> events = new ArrayList<>();
        for (BaseEvent event : elements) {
            events.add(event);
        }

        if (events.isEmpty()) {
            return;
        }

        UserProfile profile = computeProfile(userId, events);
        writeToRedis(profile);
        out.collect(profile);
    }

    /**
     * Computes a UserProfile from a list of events within the window.
     * Package-private for testability.
     */
    static UserProfile computeProfile(String userId, List<BaseEvent> events) {
        events.sort(Comparator.comparingLong(BaseEvent::getTimestamp));

        long totalEvents = events.size();
        long lastActive = events.get(events.size() - 1).getTimestamp();

        // Count unique sessions
        Set<String> sessions = new HashSet<>();
        for (BaseEvent event : events) {
            if (event.getSessionId() != null) {
                sessions.add(event.getSessionId());
            }
        }
        long totalSessions = sessions.size();

        // Compute engagement score: combines event frequency and event type diversity
        Set<String> uniqueEventTypes = new HashSet<>();
        for (BaseEvent event : events) {
            if (event.getEventType() != null) {
                uniqueEventTypes.add(event.getEventType());
            }
        }
        double engagementScore = computeEngagementScore(totalEvents, uniqueEventTypes.size());

        // Determine activity level
        String activityLevel = classifyActivityLevel(totalEvents);

        // Extract interest tags from character interactions, weighted by recency
        Map<String, Double> interestTags = extractInterestTags(events);

        // Extract recent character IDs (most recent first, deduplicated)
        List<String> recentCharacterIds = extractRecentCharacters(events);

        UserProfile profile = new UserProfile();
        profile.setUserId(userId);
        profile.setEngagementScore(engagementScore);
        profile.setActivityLevel(activityLevel);
        profile.setLastActive(lastActive);
        profile.setTotalEvents(totalEvents);
        profile.setTotalSessions(totalSessions);
        profile.setInterestTags(interestTags);
        profile.setRecentCharacterIds(recentCharacterIds);

        return profile;
    }

    /**
     * Computes engagement score from event frequency and type diversity.
     * Score = log2(1 + eventCount) * (1 + 0.5 * log2(1 + typeCount))
     * Capped at 100.
     */
    static double computeEngagementScore(long eventCount, int typeCount) {
        double frequencyComponent = Math.log(1 + eventCount) / Math.log(2);
        double diversityMultiplier = 1.0 + 0.5 * (Math.log(1 + typeCount) / Math.log(2));
        double score = frequencyComponent * diversityMultiplier;
        return Math.min(Math.round(score * 100.0) / 100.0, 100.0);
    }

    /**
     * Classifies activity level based on event count thresholds.
     */
    static String classifyActivityLevel(long eventCount) {
        if (eventCount >= HIGH_ACTIVITY_THRESHOLD) {
            return "high";
        } else if (eventCount >= MEDIUM_ACTIVITY_THRESHOLD) {
            return "medium";
        } else {
            return "low";
        }
    }

    /**
     * Extracts interest tags from character-related events.
     * Tags are derived from event properties (character name, tags, category).
     * Scores are weighted by recency: more recent events contribute higher weight.
     */
    static Map<String, Double> extractInterestTags(List<BaseEvent> events) {
        Map<String, Double> tagScores = new HashMap<>();

        if (events.isEmpty()) {
            return tagScores;
        }

        long minTs = events.get(0).getTimestamp();
        long maxTs = events.get(events.size() - 1).getTimestamp();
        long range = Math.max(maxTs - minTs, 1);

        for (BaseEvent event : events) {
            Map<String, Object> props = event.getProperties();
            if (props == null) {
                continue;
            }

            // Recency weight: 0.5 (oldest) to 1.0 (newest)
            double recencyWeight = 0.5 + 0.5 * ((double)(event.getTimestamp() - minTs) / range);

            // Extract tags from properties
            collectTag(tagScores, props, "characterName", recencyWeight);
            collectTag(tagScores, props, "category", recencyWeight);
            collectTags(tagScores, props, "tags", recencyWeight);
        }

        return tagScores;
    }

    /**
     * Adds a single tag value from properties to the score map.
     */
    private static void collectTag(Map<String, Double> tagScores, Map<String, Object> props,
                                   String key, double weight) {
        Object value = props.get(key);
        if (value instanceof String && !((String) value).isEmpty()) {
            String tag = ((String) value).toLowerCase().trim();
            tagScores.merge(tag, weight, Double::sum);
        }
    }

    /**
     * Adds multiple tags from a comma-separated string or list in properties.
     */
    @SuppressWarnings("unchecked")
    private static void collectTags(Map<String, Double> tagScores, Map<String, Object> props,
                                    String key, double weight) {
        Object value = props.get(key);
        if (value instanceof String) {
            for (String tag : ((String) value).split(",")) {
                String trimmed = tag.toLowerCase().trim();
                if (!trimmed.isEmpty()) {
                    tagScores.merge(trimmed, weight, Double::sum);
                }
            }
        } else if (value instanceof List) {
            for (Object item : (List<Object>) value) {
                if (item != null) {
                    String tag = item.toString().toLowerCase().trim();
                    if (!tag.isEmpty()) {
                        tagScores.merge(tag, weight, Double::sum);
                    }
                }
            }
        }
    }

    /**
     * Extracts recently interacted character IDs from events, most recent first.
     * Deduplicates and limits to MAX_RECENT_CHARACTERS.
     */
    static List<String> extractRecentCharacters(List<BaseEvent> events) {
        // Iterate in reverse (most recent first) to preserve recency order
        LinkedHashSet<String> seen = new LinkedHashSet<>();
        for (int i = events.size() - 1; i >= 0; i--) {
            BaseEvent event = events.get(i);
            Map<String, Object> props = event.getProperties();
            if (props == null) {
                continue;
            }
            Object charId = props.get("characterId");
            if (charId instanceof String && !((String) charId).isEmpty()) {
                seen.add((String) charId);
            }
            if (seen.size() >= MAX_RECENT_CHARACTERS) {
                break;
            }
        }
        return new ArrayList<>(seen);
    }

    /**
     * Writes the computed user profile to Redis Feature Store using pipelined commands.
     */
    private void writeToRedis(UserProfile profile) {
        String userId = profile.getUserId();
        String profileKey = "fs:user:" + userId + ":profile";
        String interestsKey = "fs:user:" + userId + ":interests";
        String recentKey = "fs:user:" + userId + ":recent";

        try (Jedis jedis = jedisPool.getResource()) {
            Pipeline pipe = jedis.pipelined();

            // Write profile hash
            Map<String, String> profileMap = new HashMap<>();
            profileMap.put("engagement_score", String.valueOf(profile.getEngagementScore()));
            profileMap.put("activity_level", profile.getActivityLevel());
            profileMap.put("last_active", String.valueOf(profile.getLastActive()));
            profileMap.put("total_events", String.valueOf(profile.getTotalEvents()));
            profileMap.put("total_sessions", String.valueOf(profile.getTotalSessions()));
            pipe.hset(profileKey, profileMap);
            pipe.expire(profileKey, KEY_TTL_SECONDS);

            // Write interest tags as sorted set (replace existing)
            pipe.del(interestsKey);
            Map<String, Double> interests = profile.getInterestTags();
            if (interests != null && !interests.isEmpty()) {
                for (Map.Entry<String, Double> entry : interests.entrySet()) {
                    pipe.zadd(interestsKey, entry.getValue(), entry.getKey());
                }
                pipe.expire(interestsKey, KEY_TTL_SECONDS);
            }

            // Write recent character IDs as list (replace existing)
            pipe.del(recentKey);
            List<String> recentChars = profile.getRecentCharacterIds();
            if (recentChars != null && !recentChars.isEmpty()) {
                for (String charId : recentChars) {
                    pipe.rpush(recentKey, charId);
                }
                pipe.expire(recentKey, KEY_TTL_SECONDS);
            }

            pipe.sync();
        }
    }
}
