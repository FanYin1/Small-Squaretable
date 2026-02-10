package com.squaretable.flink.functions;

import com.squaretable.flink.models.CharacterStats;
import com.squaretable.flink.schemas.BaseEvent;
import org.apache.flink.streaming.api.functions.windowing.ProcessWindowFunction;
import org.apache.flink.streaming.api.windowing.windows.TimeWindow;
import org.apache.flink.util.Collector;

import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * ProcessWindowFunction that aggregates BaseEvent records within a 1-hour
 * tumbling window keyed by characterId.
 *
 * <p>Computes per-character stats: chat_starts, messages, ratings,
 * avg_rating, unique users, and a trending score weighted by recency
 * and interaction volume.</p>
 */
public class ContentAnalyzerWindowFunction
        extends ProcessWindowFunction<BaseEvent, CharacterStats, String, TimeWindow> {

    /** Event types that indicate a new chat session was started. */
    private static final String CHAT_CREATED = "chat.created";

    /** Event types that indicate a message was sent. */
    private static final String MESSAGE_SENT = "chat.message.sent";
    private static final String MESSAGE_CREATED = "chat.message.created";

    /** Event types that indicate a rating was given. */
    private static final String CHAT_RATED = "chat.rated";
    private static final String CHARACTER_RATED = "character.rated";

    @Override
    public void process(
            String characterId,
            ProcessWindowFunction<BaseEvent, CharacterStats, String, TimeWindow>.Context context,
            Iterable<BaseEvent> elements,
            Collector<CharacterStats> out) {

        long chatStarts = 0;
        long messages = 0;
        long ratingCount = 0;
        double ratingSum = 0.0;
        Set<String> uniqueUsers = new HashSet<>();

        for (BaseEvent event : elements) {
            if (event.getUserId() != null) {
                uniqueUsers.add(event.getUserId());
            }

            String eventType = event.getEventType();
            if (eventType == null) {
                continue;
            }

            if (CHAT_CREATED.equals(eventType)) {
                chatStarts++;
            }

            if (MESSAGE_SENT.equals(eventType) || MESSAGE_CREATED.equals(eventType)) {
                messages++;
            }

            if (CHAT_RATED.equals(eventType) || CHARACTER_RATED.equals(eventType)) {
                Float rating = extractRating(event);
                if (rating != null) {
                    ratingCount++;
                    ratingSum += rating;
                }
            }
        }

        TimeWindow window = context.window();
        double trendingScore = computeTrendingScore(
                chatStarts, messages, uniqueUsers.size(), ratingCount, ratingSum, window.getEnd());

        CharacterStats stats = new CharacterStats();
        stats.setCharacterId(characterId);
        stats.setWindowStart(window.getStart());
        stats.setWindowEnd(window.getEnd());
        stats.setChatStarts(chatStarts);
        stats.setMessages(messages);
        stats.setRatingCount(ratingCount);
        stats.setRatingSum(ratingSum);
        stats.setTotalUsers(uniqueUsers.size());
        stats.setTrendingScore(trendingScore);

        out.collect(stats);
    }

    /**
     * Extracts a numeric rating from the event properties.
     * Looks for "rating" key in the properties map.
     */
    static Float extractRating(BaseEvent event) {
        Map<String, Object> props = event.getProperties();
        if (props == null) {
            return null;
        }
        Object ratingObj = props.get("rating");
        if (ratingObj == null) {
            return null;
        }
        try {
            return ((Number) ratingObj).floatValue();
        } catch (ClassCastException e) {
            try {
                return Float.parseFloat(ratingObj.toString());
            } catch (NumberFormatException nfe) {
                return null;
            }
        }
    }

    /**
     * Computes a trending score for a character based on interaction volume
     * and recency. The formula weights different interaction types and applies
     * a time-decay factor so more recent windows score higher.
     *
     * <p>Score = (chatStarts * 3 + messages * 1 + uniqueUsers * 5 + avgRating * 2) * recencyFactor</p>
     *
     * <p>Recency factor uses exponential decay with a 24-hour half-life based
     * on the window end time relative to the current epoch.</p>
     *
     * @param chatStarts   number of new chats started
     * @param messages     number of messages sent
     * @param uniqueUsers  number of unique users
     * @param ratingCount  number of ratings
     * @param ratingSum    sum of all ratings
     * @param windowEndMs  window end timestamp in epoch millis
     * @return trending score
     */
    static double computeTrendingScore(
            long chatStarts, long messages, long uniqueUsers,
            long ratingCount, double ratingSum, long windowEndMs) {

        double avgRating = ratingCount > 0 ? ratingSum / ratingCount : 0.0;

        // Weighted interaction volume
        double volume = chatStarts * 3.0
                + messages * 1.0
                + uniqueUsers * 5.0
                + avgRating * 2.0;

        // Recency decay: half-life of 24 hours
        long now = System.currentTimeMillis();
        double hoursAgo = Math.max(0, (now - windowEndMs) / 3_600_000.0);
        double halfLifeHours = 24.0;
        double recencyFactor = Math.pow(0.5, hoursAgo / halfLifeHours);

        return volume * recencyFactor;
    }

    /**
     * Testable version of computeTrendingScore that accepts a reference time
     * instead of using System.currentTimeMillis().
     */
    static double computeTrendingScore(
            long chatStarts, long messages, long uniqueUsers,
            long ratingCount, double ratingSum, long windowEndMs, long referenceTimeMs) {

        double avgRating = ratingCount > 0 ? ratingSum / ratingCount : 0.0;

        double volume = chatStarts * 3.0
                + messages * 1.0
                + uniqueUsers * 5.0
                + avgRating * 2.0;

        double hoursAgo = Math.max(0, (referenceTimeMs - windowEndMs) / 3_600_000.0);
        double halfLifeHours = 24.0;
        double recencyFactor = Math.pow(0.5, hoursAgo / halfLifeHours);

        return volume * recencyFactor;
    }
}
