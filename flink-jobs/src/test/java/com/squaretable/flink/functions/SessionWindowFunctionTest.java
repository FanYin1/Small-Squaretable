package com.squaretable.flink.functions;

import com.squaretable.flink.models.SessionSummary;
import com.squaretable.flink.schemas.BaseEvent;
import org.apache.flink.util.Collector;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

class SessionWindowFunctionTest {

    private SessionWindowFunction function;
    private TestCollector<SessionSummary> collector;

    @BeforeEach
    void setUp() {
        function = new SessionWindowFunction();
        collector = new TestCollector<>();
    }

    @Test
    void shouldAggregateEventsIntoSessionSummary() throws Exception {
        List<BaseEvent> events = Arrays.asList(
                createEvent("s1", "u1", "t1", 1000L, "page.view", "/home", "desktop", "web"),
                createEvent("s1", "u1", "t1", 5000L, "chat.message", "/chat", "desktop", "web"),
                createEvent("s1", "u1", "t1", 10000L, "page.view", "/settings", "desktop", "web")
        );

        function.process("s1", null, events, collector);

        assertEquals(1, collector.results.size());
        SessionSummary summary = collector.results.get(0);

        assertEquals("s1", summary.getSessionId());
        assertEquals("u1", summary.getUserId());
        assertEquals("t1", summary.getTenantId());
        assertEquals(1000L, summary.getStartTime());
        assertEquals(10000L, summary.getEndTime());
        assertEquals(9, summary.getDurationSec()); // (10000 - 1000) / 1000
        assertEquals(3, summary.getEventCount());
        assertEquals(3, summary.getPageCount());
        assertEquals(Arrays.asList("/home", "/chat", "/settings"), summary.getPages());
        assertEquals("desktop", summary.getDeviceType());
        assertEquals("web", summary.getPlatform());
    }

    @Test
    void shouldDeduplicatePages() throws Exception {
        List<BaseEvent> events = Arrays.asList(
                createEvent("s1", "u1", "t1", 1000L, "page.view", "/home", "mobile", "ios"),
                createEvent("s1", "u1", "t1", 2000L, "page.view", "/home", "mobile", "ios"),
                createEvent("s1", "u1", "t1", 3000L, "page.view", "/chat", "mobile", "ios")
        );

        function.process("s1", null, events, collector);

        SessionSummary summary = collector.results.get(0);
        assertEquals(2, summary.getPageCount());
        assertEquals(Arrays.asList("/home", "/chat"), summary.getPages());
    }

    @Test
    void shouldHandleEventsWithoutPages() throws Exception {
        List<BaseEvent> events = Arrays.asList(
                createEvent("s1", "u1", "t1", 1000L, "click", null, "desktop", "web"),
                createEvent("s1", "u1", "t1", 2000L, "click", null, "desktop", "web")
        );

        function.process("s1", null, events, collector);

        SessionSummary summary = collector.results.get(0);
        assertEquals(0, summary.getPageCount());
        assertTrue(summary.getPages().isEmpty());
    }

    @Test
    void shouldHandleEventsWithNullContext() throws Exception {
        BaseEvent event = new BaseEvent();
        event.setSessionId("s1");
        event.setUserId("u1");
        event.setTenantId("t1");
        event.setTimestamp(1000L);
        event.setEventType("click");
        // No context or properties set

        function.process("s1", null, Collections.singletonList(event), collector);

        SessionSummary summary = collector.results.get(0);
        assertEquals("unknown", summary.getDeviceType());
        assertEquals("unknown", summary.getPlatform());
        assertEquals(0, summary.getPageCount());
    }

    @Test
    void shouldSortEventsByTimestamp() throws Exception {
        // Events provided out of order
        List<BaseEvent> events = Arrays.asList(
                createEvent("s1", "u1", "t1", 5000L, "page.view", "/chat", "desktop", "web"),
                createEvent("s1", "u1", "t1", 1000L, "page.view", "/home", "desktop", "web"),
                createEvent("s1", "u1", "t1", 10000L, "page.view", "/settings", "desktop", "web")
        );

        function.process("s1", null, events, collector);

        SessionSummary summary = collector.results.get(0);
        assertEquals(1000L, summary.getStartTime());
        assertEquals(10000L, summary.getEndTime());
        // Pages should be in timestamp order after sorting
        assertEquals(Arrays.asList("/home", "/chat", "/settings"), summary.getPages());
    }

    @Test
    void shouldHandleSingleEvent() throws Exception {
        List<BaseEvent> events = Collections.singletonList(
                createEvent("s1", "u1", "t1", 5000L, "page.view", "/home", "tablet", "android")
        );

        function.process("s1", null, events, collector);

        SessionSummary summary = collector.results.get(0);
        assertEquals(5000L, summary.getStartTime());
        assertEquals(5000L, summary.getEndTime());
        assertEquals(0, summary.getDurationSec());
        assertEquals(1, summary.getEventCount());
        assertEquals(1, summary.getPageCount());
        assertEquals("tablet", summary.getDeviceType());
        assertEquals("android", summary.getPlatform());
    }

    @Test
    void shouldNotEmitForEmptyInput() throws Exception {
        function.process("s1", null, Collections.emptyList(), collector);
        assertTrue(collector.results.isEmpty());
    }

    @Test
    void shouldExtractPageFromPageProperty() {
        BaseEvent event = new BaseEvent();
        Map<String, Object> props = new HashMap<>();
        props.put("page", "/dashboard");
        event.setProperties(props);

        assertEquals("/dashboard", SessionWindowFunction.extractPage(event));
    }

    @Test
    void shouldPreferPathOverPageProperty() {
        BaseEvent event = new BaseEvent();
        Map<String, Object> props = new HashMap<>();
        props.put("path", "/home");
        props.put("page", "/dashboard");
        event.setProperties(props);

        assertEquals("/home", SessionWindowFunction.extractPage(event));
    }

    @Test
    void shouldReturnDefaultForMissingContextField() {
        BaseEvent event = new BaseEvent();
        assertEquals("fallback",
                SessionWindowFunction.extractContextField(event, "missing", "fallback"));
    }

    // --- Helpers ---

    private BaseEvent createEvent(String sessionId, String userId, String tenantId,
                                  long timestamp, String eventType, String path,
                                  String deviceType, String platform) {
        BaseEvent event = new BaseEvent();
        event.setSessionId(sessionId);
        event.setUserId(userId);
        event.setTenantId(tenantId);
        event.setTimestamp(timestamp);
        event.setEventType(eventType);

        if (path != null) {
            Map<String, Object> props = new HashMap<>();
            props.put("path", path);
            event.setProperties(props);
        }

        Map<String, Object> ctx = new HashMap<>();
        ctx.put("deviceType", deviceType);
        ctx.put("platform", platform);
        event.setContext(ctx);

        return event;
    }

    /**
     * Simple test collector that captures emitted records.
     */
    private static class TestCollector<T> implements Collector<T> {
        final List<T> results = new ArrayList<>();

        @Override
        public void collect(T record) {
            results.add(record);
        }

        @Override
        public void close() {}
    }
}
