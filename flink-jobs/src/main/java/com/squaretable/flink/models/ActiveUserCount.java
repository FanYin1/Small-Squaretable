package com.squaretable.flink.models;

import java.io.Serializable;

/**
 * Represents the count of active users for a given tenant within a time window.
 * Used as the output of the 1-minute tumbling window side output.
 */
public class ActiveUserCount implements Serializable {
    private String tenantId;
    private long count;
    private long windowEnd;

    public ActiveUserCount() {}

    public ActiveUserCount(String tenantId, long count, long windowEnd) {
        this.tenantId = tenantId;
        this.count = count;
        this.windowEnd = windowEnd;
    }

    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }

    public long getCount() { return count; }
    public void setCount(long count) { this.count = count; }

    public long getWindowEnd() { return windowEnd; }
    public void setWindowEnd(long windowEnd) { this.windowEnd = windowEnd; }
}
