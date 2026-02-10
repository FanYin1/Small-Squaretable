package com.squaretable.flink.models;

import java.io.Serializable;

/**
 * POJO representing a recommendation event for the ClickHouse
 * analytics.dwd_recommendation_events table.
 *
 * <p>Fields are extracted from BaseEvent properties: experiment_id, variant,
 * scene, character_id, action (show/click/convert), and position.</p>
 */
public class RecommendationEvent implements Serializable {
    private static final long serialVersionUID = 1L;

    private String eventId;
    private String userId;
    private String experimentId;
    private String variant;
    private String scene;
    private String characterId;
    private String action;
    private int position;
    private long timestamp; // epoch millis

    public RecommendationEvent() {}

    // Getters and setters
    public String getEventId() { return eventId; }
    public void setEventId(String eventId) { this.eventId = eventId; }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public String getExperimentId() { return experimentId; }
    public void setExperimentId(String experimentId) { this.experimentId = experimentId; }

    public String getVariant() { return variant; }
    public void setVariant(String variant) { this.variant = variant; }

    public String getScene() { return scene; }
    public void setScene(String scene) { this.scene = scene; }

    public String getCharacterId() { return characterId; }
    public void setCharacterId(String characterId) { this.characterId = characterId; }

    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }

    public int getPosition() { return position; }
    public void setPosition(int position) { this.position = position; }

    public long getTimestamp() { return timestamp; }
    public void setTimestamp(long timestamp) { this.timestamp = timestamp; }
}
