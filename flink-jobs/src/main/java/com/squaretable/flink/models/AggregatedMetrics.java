package com.squaretable.flink.models;

import java.io.Serializable;
import java.util.Map;

/**
 * POJO carrying aggregated metrics produced by MetricsWindowFunction.
 * Used as the output type for both Redis (1-min) and ClickHouse (1-hour) sinks.
 */
public class AggregatedMetrics implements Serializable {
    private static final long serialVersionUID = 1L;

    private String tenantId;
    private long windowStart;
    private long windowEnd;
    private long eventCount;
    private long uniqueUsers;
    private long messageCount;
    private long sessionCount;
    private Map<String, Long> eventTypeCounts;

    public AggregatedMetrics() {}

    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }

    public long getWindowStart() { return windowStart; }
    public void setWindowStart(long windowStart) { this.windowStart = windowStart; }

    public long getWindowEnd() { return windowEnd; }
    public void setWindowEnd(long windowEnd) { this.windowEnd = windowEnd; }

    public long getEventCount() { return eventCount; }
    public void setEventCount(long eventCount) { this.eventCount = eventCount; }

    public long getUniqueUsers() { return uniqueUsers; }
    public void setUniqueUsers(long uniqueUsers) { this.uniqueUsers = uniqueUsers; }

    public long getMessageCount() { return messageCount; }
    public void setMessageCount(long messageCount) { this.messageCount = messageCount; }

    public long getSessionCount() { return sessionCount; }
    public void setSessionCount(long sessionCount) { this.sessionCount = sessionCount; }

    public Map<String, Long> getEventTypeCounts() { return eventTypeCounts; }
    public void setEventTypeCounts(Map<String, Long> eventTypeCounts) { this.eventTypeCounts = eventTypeCounts; }
}
