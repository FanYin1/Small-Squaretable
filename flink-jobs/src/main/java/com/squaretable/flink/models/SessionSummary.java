package com.squaretable.flink.models;

import java.io.Serializable;
import java.util.List;

/**
 * Session summary record matching the ClickHouse analytics.ods_sessions schema.
 */
public class SessionSummary implements Serializable {
    private String sessionId;
    private String userId;
    private String tenantId;
    private long startTime;   // epoch millis
    private long endTime;     // epoch millis
    private int durationSec;
    private int eventCount;
    private int pageCount;
    private List<String> pages;
    private String deviceType;
    private String platform;

    public SessionSummary() {}

    // Getters and setters
    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }

    public long getStartTime() { return startTime; }
    public void setStartTime(long startTime) { this.startTime = startTime; }

    public long getEndTime() { return endTime; }
    public void setEndTime(long endTime) { this.endTime = endTime; }

    public int getDurationSec() { return durationSec; }
    public void setDurationSec(int durationSec) { this.durationSec = durationSec; }

    public int getEventCount() { return eventCount; }
    public void setEventCount(int eventCount) { this.eventCount = eventCount; }

    public int getPageCount() { return pageCount; }
    public void setPageCount(int pageCount) { this.pageCount = pageCount; }

    public List<String> getPages() { return pages; }
    public void setPages(List<String> pages) { this.pages = pages; }

    public String getDeviceType() { return deviceType; }
    public void setDeviceType(String deviceType) { this.deviceType = deviceType; }

    public String getPlatform() { return platform; }
    public void setPlatform(String platform) { this.platform = platform; }
}
