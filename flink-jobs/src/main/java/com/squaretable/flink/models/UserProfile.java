package com.squaretable.flink.models;

import java.io.Serializable;
import java.util.List;
import java.util.Map;

/**
 * POJO carrying computed user profile data produced by UserProfileFunction.
 * Contains engagement metrics, interest tags, and recent character interactions.
 */
public class UserProfile implements Serializable {
    private static final long serialVersionUID = 1L;

    private String userId;
    private double engagementScore;
    private String activityLevel;
    private long lastActive;
    private long totalEvents;
    private long totalSessions;
    private Map<String, Double> interestTags;
    private List<String> recentCharacterIds;

    public UserProfile() {}

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public double getEngagementScore() { return engagementScore; }
    public void setEngagementScore(double engagementScore) { this.engagementScore = engagementScore; }

    public String getActivityLevel() { return activityLevel; }
    public void setActivityLevel(String activityLevel) { this.activityLevel = activityLevel; }

    public long getLastActive() { return lastActive; }
    public void setLastActive(long lastActive) { this.lastActive = lastActive; }

    public long getTotalEvents() { return totalEvents; }
    public void setTotalEvents(long totalEvents) { this.totalEvents = totalEvents; }

    public long getTotalSessions() { return totalSessions; }
    public void setTotalSessions(long totalSessions) { this.totalSessions = totalSessions; }

    public Map<String, Double> getInterestTags() { return interestTags; }
    public void setInterestTags(Map<String, Double> interestTags) { this.interestTags = interestTags; }

    public List<String> getRecentCharacterIds() { return recentCharacterIds; }
    public void setRecentCharacterIds(List<String> recentCharacterIds) { this.recentCharacterIds = recentCharacterIds; }
}
