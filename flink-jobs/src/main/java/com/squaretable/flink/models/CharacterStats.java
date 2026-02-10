package com.squaretable.flink.models;

import java.io.Serializable;

/**
 * POJO carrying per-character aggregated stats produced by the
 * ContentAnalyzer window function. Used for both Redis feature store
 * updates and trending score computation.
 */
public class CharacterStats implements Serializable {
    private static final long serialVersionUID = 1L;

    private String characterId;
    private long windowStart;
    private long windowEnd;
    private long chatStarts;
    private long messages;
    private long ratingCount;
    private double ratingSum;
    private long totalUsers;
    private double trendingScore;

    public CharacterStats() {}

    // Getters and setters
    public String getCharacterId() { return characterId; }
    public void setCharacterId(String characterId) { this.characterId = characterId; }

    public long getWindowStart() { return windowStart; }
    public void setWindowStart(long windowStart) { this.windowStart = windowStart; }

    public long getWindowEnd() { return windowEnd; }
    public void setWindowEnd(long windowEnd) { this.windowEnd = windowEnd; }

    public long getChatStarts() { return chatStarts; }
    public void setChatStarts(long chatStarts) { this.chatStarts = chatStarts; }

    public long getMessages() { return messages; }
    public void setMessages(long messages) { this.messages = messages; }

    public long getRatingCount() { return ratingCount; }
    public void setRatingCount(long ratingCount) { this.ratingCount = ratingCount; }

    public double getRatingSum() { return ratingSum; }
    public void setRatingSum(double ratingSum) { this.ratingSum = ratingSum; }

    public long getTotalUsers() { return totalUsers; }
    public void setTotalUsers(long totalUsers) { this.totalUsers = totalUsers; }

    public double getTrendingScore() { return trendingScore; }
    public void setTrendingScore(double trendingScore) { this.trendingScore = trendingScore; }

    /**
     * Returns the average rating, or 0.0 if no ratings exist.
     */
    public double getAvgRating() {
        return ratingCount > 0 ? ratingSum / ratingCount : 0.0;
    }
}
