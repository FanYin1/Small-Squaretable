package com.squaretable.flink.functions;

import com.squaretable.flink.models.AggregatedMetrics;
import com.squaretable.flink.schemas.BaseEvent;
import org.apache.flink.streaming.api.windowing.windows.TimeWindow;
import org.apache.flink.util.Collector;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Unit tests for {@link MetricsWindowFunction}.
 * Uses a lightweight stub approach for the ProcessWindowFunction.Context
 * to avoid requiring a full Flink MiniCluster.
 */
class MetricsWindowFunctionTest {

    private MetricsWindowFunction function;
    private ListCollector collector;

    @BeforeEach
    void setUp() {
        function = new MetricsWindowFunction();
        collector = new ListCollector();
    }

    @Test
    void shouldCountTotalEvents() throws Exception {
        List<BaseEvent> events = Arrays.asList(
                createEvent("t1", "u1", "s1", "page.view", 1000L),
                createEvent("t1", "u2", "s2", "page.view", 2000L),
                createEvent("t1", "u3", "s3", "button.click", 3000L)
        );

        StubContext ctx = new StubContext(0L, 60000L);
        function.process("t1", ctx, events, collector);

        assertEquals(1, collector.results.size());
        AggregatedMetrics metrics = collector.results.get(0);
        assertEquals(3, metrics.getEventCount());
    }

    @Test
    void shouldCountUniqueUsers() throws Exception {
        List<BaseEvent> events = Arrays.asList(
                createEvent("t1", "u1", "s1", "page.view", 1000L),
                createEvent("t1", "u1", "s2", "page.view", 2000L),  // same user
                createEvent("t1", "u2", "s3", "page.view", 3000L)
        );

        StubContext ctx = new StubContext(0L, 60000L);
        function.process("t1", ctx, events, collector);

        AggregatedMetrics metrics = collector.results.get(0);
        assertEquals(2, metrics.getUniqueUsers());
    }

    @Test
    void shouldCountUniqueSessions() throws Exception {
        List<BaseEvent> events = Arrays.asList(
                createEvent("t1", "u1", "s1", "page.view", 1000L),
                createEvent("t1", "u1", "s1", "page.view", 2000L),  // same session
                createEvent("t1", "u2", "s2", "page.view", 3000L)
        );

        StubContext ctx = new StubContext(0L, 60000L);
        function.process("t1", ctx, events, collector);

        AggregatedMetrics metrics = collector.results.get(0);
        assertEquals(2, metrics.getSessionCount());
    }

    @Test
    void shouldCountMessages() throws Exception {
        List<BaseEvent> events = Arrays.asList(
                createEvent("t1", "u1", "s1", "chat.message.sent", 1000L),
                createEvent("t1", "u1", "s1", "page.view", 2000L),
                createEvent("t1", "u2", "s2", "chat.message.sent", 3000L)
        );

        StubContext ctx = new StubContext(0L, 60000L);
        function.process("t1", ctx, events, collector);

        AggregatedMetrics metrics = collector.results.get(0);
        assertEquals(2, metrics.getMessageCount());
    }

    @Test
    void shouldCountEventsByType() throws Exception {
        List<BaseEvent> events = Arrays.asList(
                createEvent("t1", "u1", "s1", "page.view", 1000L),
                createEvent("t1", "u2", "s2", "page.view", 2000L),
                createEvent("t1", "u3", "s3", "button.click", 3000L),
                createEvent("t1", "u4", "s4", "chat.message.sent", 4000L)
        );

        StubContext ctx = new StubContext(0L, 60000L);
        function.process("t1", ctx, events, collector);

        AggregatedMetrics metrics = collector.results.get(0);
        Map<String, Long> typeCounts = metrics.getEventTypeCounts();
        assertEquals(3, typeCounts.size());
        assertEquals(2L, typeCounts.get("page.view"));
        assertEquals(1L, typeCounts.get("button.click"));
        assertEquals(1L, typeCounts.get("chat.message.sent"));
    }

    @Test
    void shouldSetWindowTimestamps() throws Exception {
        List<BaseEvent> events = Collections.singletonList(
                createEvent("t1", "u1", "s1", "page.view", 1000L)
        );

        StubContext ctx = new StubContext(60000L, 120000L);
        function.process("t1", ctx, events, collector);

        AggregatedMetrics metrics = collector.results.get(0);
        assertEquals(60000L, metrics.getWindowStart());
        assertEquals(120000L, metrics.getWindowEnd());
    }

    @Test
    void shouldSetTenantId() throws Exception {
        List<BaseEvent> events = Collections.singletonList(
                createEvent("tenant-abc", "u1", "s1", "page.view", 1000L)
        );

        StubContext ctx = new StubContext(0L, 60000L);
        function.process("tenant-abc", ctx, events, collector);

        AggregatedMetrics metrics = collector.results.get(0);
        assertEquals("tenant-abc", metrics.getTenantId());
    }

    @Test
    void shouldHandleNullUserIdAndSessionId() throws Exception {
        BaseEvent event = new BaseEvent();
        event.setTenantId("t1");
        event.setEventType("page.view");
        event.setTimestamp(1000L);
        // userId and sessionId are null

        StubContext ctx = new StubContext(0L, 60000L);
        function.process("t1", ctx, Collections.singletonList(event), collector);

        AggregatedMetrics metrics = collector.results.get(0);
        assertEquals(1, metrics.getEventCount());
        assertEquals(0, metrics.getUniqueUsers());
        assertEquals(0, metrics.getSessionCount());
    }

    @Test
    void shouldHandleNullEventType() throws Exception {
        BaseEvent event = new BaseEvent();
        event.setTenantId("t1");
        event.setUserId("u1");
        event.setSessionId("s1");
        event.setTimestamp(1000L);
        // eventType is null

        StubContext ctx = new StubContext(0L, 60000L);
        function.process("t1", ctx, Collections.singletonList(event), collector);

        AggregatedMetrics metrics = collector.results.get(0);
        assertEquals(1, metrics.getEventCount());
        assertEquals(0, metrics.getMessageCount());
        assertTrue(metrics.getEventTypeCounts().isEmpty());
    }

    @Test
    void shouldHandleEmptyWindow() throws Exception {
        List<BaseEvent> events = Collections.emptyList();

        StubContext ctx = new StubContext(0L, 60000L);
        function.process("t1", ctx, events, collector);

        AggregatedMetrics metrics = collector.results.get(0);
        assertEquals(0, metrics.getEventCount());
        assertEquals(0, metrics.getUniqueUsers());
        assertEquals(0, metrics.getMessageCount());
        assertEquals(0, metrics.getSessionCount());
        assertTrue(metrics.getEventTypeCounts().isEmpty());
    }

    // --- Helper methods ---

    private static BaseEvent createEvent(
            String tenantId, String userId, String sessionId,
            String eventType, long timestamp) {
        BaseEvent event = new BaseEvent();
        event.setTenantId(tenantId);
        event.setUserId(userId);
        event.setSessionId(sessionId);
        event.setEventType(eventType);
        event.setTimestamp(timestamp);
        event.setEventId("evt-" + timestamp);
        return event;
    }

    /**
     * Simple Collector implementation that stores results in a list.
     */
    static class ListCollector implements Collector<AggregatedMetrics> {
        final List<AggregatedMetrics> results = new ArrayList<>();

        @Override
        public void collect(AggregatedMetrics record) {
            results.add(record);
        }

        @Override
        public void close() {}
    }

    /**
     * Stub implementation of ProcessWindowFunction.Context that provides
     * a TimeWindow without requiring a full Flink runtime.
     */
    static class StubContext
            extends ProcessWindowFunction<BaseEvent, AggregatedMetrics, String, TimeWindow>.Context {

        private final TimeWindow window;

        StubContext(long windowStart, long windowEnd) {
            // We need to create the enclosing instance for the inner class
            new MetricsWindowFunction().super();
            this.window = new TimeWindow(windowStart, windowEnd);
        }

        @Override
        public TimeWindow window() {
            return window;
        }

        @Override
        public long currentProcessingTime() {
            return System.currentTimeMillis();
        }

        @Override
        public long currentWatermark() {
            return Long.MIN_VALUE;
        }

        @Override
        public org.apache.flink.api.common.state.KeyedStateStore windowState() {
            return null;
        }

        @Override
        public org.apache.flink.api.common.state.KeyedStateStore globalState() {
            return null;
        }

        @Override
        public <X> void output(org.apache.flink.util.OutputTag<X> outputTag, X value) {
            // no-op for tests
        }
    }
}