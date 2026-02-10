package com.squaretable.flink.models;

import java.io.Serializable;

/**
 * POJO representing a single chat event record for the ClickHouse
 * analytics.dwd_chat_events table.
 */
public class ChatEventRecord implements Serializable {
    private static final long serialVersionUID = 1L;

    private String eventId;
    private String userId;
    private String tenantId;
    private String characterId;
    private String chatId;
    private String action;
    private String messageRole;
    private int tokenCount;
    private Float rating;
    private long timestamp; // epoch millis

    public ChatEventRecord() {}

    // Getters and setters
    public String getEventId() { return eventId; }
    public void setEventId(String eventId) { this.eventId = eventId; }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }

    public String getCharacterId() { return characterId; }
    public void setCharacterId(String characterId) { this.characterId = characterId; }

    public String getChatId() { return chatId; }
    public void setChatId(String chatId) { this.chatId = chatId; }

    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }

    public String getMessageRole() { return messageRole; }
    public void setMessageRole(String messageRole) { this.messageRole = messageRole; }

    public int getTokenCount() { return tokenCount; }
    public void setTokenCount(int tokenCount) { this.tokenCount = tokenCount; }

    public Float getRating() { return rating; }
    public void setRating(Float rating) { this.rating = rating; }

    public long getTimestamp() { return timestamp; }
    public void setTimestamp(long timestamp) { this.timestamp = timestamp; }
}
