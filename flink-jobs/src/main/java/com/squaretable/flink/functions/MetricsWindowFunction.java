package com.squaretable.flink.functions;

import com.squaretable.flink.models.AggregatedMetrics;
import com.squaretable.flink.schemas.BaseEvent;
import org.apache.flink.streaming.api.functions.windowing.ProcessWindowFunction;
import org.apache.flink.streaming.api.windowing.windows.TimeWindow;
import org.apache.flink.util.Collector;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * ProcessWindowFunction that aggregates BaseEvent records within a tumbling window.
 *
 * For each window keyed by tenantId it computes:
 * - Total event count
 * - Unique user count (uniqExact equivalent)
 * - Message count (events where eventType == "chat.message.sent")
 * - Unique session count
 * - Per-eventType counts
 */
public class MetricsWindowFunction
        extends ProcessWindowFunction<BaseEvent, AggregatedMetrics, String, TimeWindow> {

    private static final String MESSAGE_EVENT_TYPE = "chat.message.sent";

    @Override
    public void process(
            String tenantId,
            ProcessWindowFunction<BaseEvent, AggregatedMetrics, String, TimeWindow>.Context context,
            Iterable<BaseEvent> elements,
            Collector<AggregatedMetrics> out) {

        long eventCount = 0;
        long messageCount = 0;
        Set<String> uniqueUsers = new HashSet<>();
        Set<String> uniqueSessions = new HashSet<>();
        Map<String, Long> eventTypeCounts = new HashMap<>();

        for (BaseEvent event : elements) {
            eventCount++;

            if (event.getUserId() != null) {
                uniqueUsers.add(event.getUserId());
            }
            if (event.getSessionId() != null) {
                uniqueSessions.add(event.getSessionId());
            }
            if (MESSAGE_EVENT_TYPE.equals(event.getEventType())) {
                messageCount++;
            }

            String eventType = event.getEventType();
            if (eventType != null) {
                eventTypeCounts.merge(eventType, 1L, Long::sum);
            }
        }

        TimeWindow window = context.window();

        AggregatedMetrics metrics = new AggregatedMetrics();
        metrics.setTenantId(tenantId);
        metrics.setWindowStart(window.getStart());
        metrics.setWindowEnd(window.getEnd());
        metrics.setEventCount(eventCount);
        metrics.setUniqueUsers(uniqueUsers.size());
        metrics.setMessageCount(messageCount);
        metrics.setSessionCount(uniqueSessions.size());
        metrics.setEventTypeCounts(eventTypeCounts);

        out.collect(metrics);
    }
}
