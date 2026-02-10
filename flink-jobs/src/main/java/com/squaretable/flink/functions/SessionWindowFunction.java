package com.squaretable.flink.functions;

import com.squaretable.flink.models.SessionSummary;
import com.squaretable.flink.schemas.BaseEvent;
import org.apache.flink.streaming.api.functions.windowing.ProcessWindowFunction;
import org.apache.flink.streaming.api.windowing.windows.TimeWindow;
import org.apache.flink.util.Collector;

import java.util.*;

/**
 * ProcessWindowFunction that aggregates BaseEvent records within a session window
 * into a single SessionSummary record for the ClickHouse ods_sessions table.
 *
 * <p>Computes: start_time, end_time, duration_sec, event_count, page_count,
 * pages list, device_type, and platform from the events in the window.</p>
 */
public class SessionWindowFunction
        extends ProcessWindowFunction<BaseEvent, SessionSummary, String, TimeWindow> {

    @Override
    public void process(
            String sessionId,
            ProcessWindowFunction<BaseEvent, SessionSummary, String, TimeWindow>.Context context,
            Iterable<BaseEvent> elements,
            Collector<SessionSummary> out) {

        List<BaseEvent> events = new ArrayList<>();
        for (BaseEvent event : elements) {
            events.add(event);
        }

        if (events.isEmpty()) {
            return;
        }

        // Sort events by timestamp for deterministic processing
        events.sort(Comparator.comparingLong(BaseEvent::getTimestamp));

        long startTime = events.get(0).getTimestamp();
        long endTime = events.get(events.size() - 1).getTimestamp();
        int durationSec = (int) ((endTime - startTime) / 1000);
        int eventCount = events.size();

        // Collect unique pages in order of first appearance
        LinkedHashSet<String> pageSet = new LinkedHashSet<>();
        for (BaseEvent event : events) {
            String page = extractPage(event);
            if (page != null) {
                pageSet.add(page);
            }
        }
        List<String> pages = new ArrayList<>(pageSet);
        int pageCount = pages.size();

        // Extract device_type and platform from the first event's context
        String deviceType = extractContextField(events.get(0), "deviceType", "unknown");
        String platform = extractContextField(events.get(0), "platform", "unknown");

        // Use userId and tenantId from the first event (earliest by timestamp)
        String userId = events.get(0).getUserId();
        String tenantId = events.get(0).getTenantId();

        SessionSummary summary = new SessionSummary();
        summary.setSessionId(sessionId);
        summary.setUserId(userId);
        summary.setTenantId(tenantId);
        summary.setStartTime(startTime);
        summary.setEndTime(endTime);
        summary.setDurationSec(durationSec);
        summary.setEventCount(eventCount);
        summary.setPageCount(pageCount);
        summary.setPages(pages);
        summary.setDeviceType(deviceType);
        summary.setPlatform(platform);

        out.collect(summary);
    }

    /**
     * Extracts the page path from an event's properties.
     * Looks for "path" or "page" keys in the properties map.
     */
    static String extractPage(BaseEvent event) {
        Map<String, Object> props = event.getProperties();
        if (props == null) {
            return null;
        }
        Object path = props.get("path");
        if (path != null) {
            return path.toString();
        }
        Object page = props.get("page");
        if (page != null) {
            return page.toString();
        }
        return null;
    }

    /**
     * Extracts a string field from the event's context map with a default fallback.
     */
    static String extractContextField(BaseEvent event, String field, String defaultValue) {
        Map<String, Object> ctx = event.getContext();
        if (ctx == null) {
            return defaultValue;
        }
        Object value = ctx.get(field);
        if (value == null) {
            return defaultValue;
        }
        return value.toString();
    }
}
