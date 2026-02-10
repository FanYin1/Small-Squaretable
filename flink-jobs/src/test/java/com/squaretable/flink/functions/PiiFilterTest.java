package com.squaretable.flink.functions;

import com.squaretable.flink.schemas.BaseEvent;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class PiiFilterTest {

    private final PiiFilter filter = new PiiFilter();

    @Test
    void shouldHashEmailInProperties() throws Exception {
        BaseEvent event = new BaseEvent();
        Map<String, Object> props = new HashMap<>();
        props.put("email", "user@example.com");
        event.setProperties(props);

        BaseEvent filtered = filter.map(event);

        assertNotEquals("user@example.com", filtered.getProperties().get("email"));
        assertTrue(filtered.getProperties().get("email").toString().matches("[a-f0-9]{64}"));
        // Verify deterministic hashing (same input produces same hash)
        BaseEvent filtered2 = filter.map(event);
        assertEquals(filtered.getProperties().get("email"), filtered2.getProperties().get("email"));
    }

    @Test
    void shouldRemoveContentField() throws Exception {
        BaseEvent event = new BaseEvent();
        Map<String, Object> props = new HashMap<>();
        props.put("content", "Hello this is private chat");
        props.put("tokenCount", 5);
        event.setProperties(props);

        BaseEvent filtered = filter.map(event);

        assertNull(filtered.getProperties().get("content"));
        assertEquals(5, filtered.getProperties().get("tokenCount"));
    }

    @Test
    void shouldRemoveIpAddress() throws Exception {
        BaseEvent event = new BaseEvent();
        Map<String, Object> props = new HashMap<>();
        props.put("ip", "192.168.1.1");
        props.put("ipAddress", "10.0.0.1");
        props.put("page", "/home");
        event.setProperties(props);

        BaseEvent filtered = filter.map(event);

        assertNull(filtered.getProperties().get("ip"));
        assertNull(filtered.getProperties().get("ipAddress"));
        assertEquals("/home", filtered.getProperties().get("page"));
    }

    @Test
    void shouldRemovePhoneNumber() throws Exception {
        BaseEvent event = new BaseEvent();
        Map<String, Object> props = new HashMap<>();
        props.put("phone", "+1-555-123-4567");
        props.put("phoneNumber", "555-987-6543");
        props.put("action", "click");
        event.setProperties(props);

        BaseEvent filtered = filter.map(event);

        assertNull(filtered.getProperties().get("phone"));
        assertNull(filtered.getProperties().get("phoneNumber"));
        assertEquals("click", filtered.getProperties().get("action"));
    }

    @Test
    void shouldPreserveNonPiiFields() throws Exception {
        BaseEvent event = new BaseEvent();
        event.setEventId("evt-123");
        event.setEventType("page.view");
        event.setUserId("user-1");
        event.setTenantId("tenant-1");
        event.setSessionId("session-1");
        event.setTimestamp(1700000000L);

        Map<String, Object> props = new HashMap<>();
        props.put("path", "/dashboard");
        props.put("duration", 3500);
        props.put("referrer", "https://google.com");
        event.setProperties(props);

        Map<String, Object> ctx = new HashMap<>();
        ctx.put("platform", "web");
        ctx.put("deviceType", "desktop");
        event.setContext(ctx);

        BaseEvent filtered = filter.map(event);

        // Scalar fields preserved
        assertEquals("evt-123", filtered.getEventId());
        assertEquals("page.view", filtered.getEventType());
        assertEquals("user-1", filtered.getUserId());
        assertEquals("tenant-1", filtered.getTenantId());
        assertEquals("session-1", filtered.getSessionId());
        assertEquals(1700000000L, filtered.getTimestamp());

        // Non-PII properties preserved
        assertEquals("/dashboard", filtered.getProperties().get("path"));
        assertEquals(3500, filtered.getProperties().get("duration"));
        assertEquals("https://google.com", filtered.getProperties().get("referrer"));

        // Non-PII context preserved
        assertEquals("web", filtered.getContext().get("platform"));
        assertEquals("desktop", filtered.getContext().get("deviceType"));
    }

    @Test
    void shouldHandleNullProperties() throws Exception {
        BaseEvent event = new BaseEvent();
        event.setEventId("evt-456");
        event.setProperties(null);
        event.setContext(null);

        BaseEvent filtered = filter.map(event);

        assertEquals("evt-456", filtered.getEventId());
        assertNull(filtered.getProperties());
        assertNull(filtered.getContext());
    }

    @Test
    void shouldHashEmailPatternInAnyField() throws Exception {
        BaseEvent event = new BaseEvent();
        Map<String, Object> props = new HashMap<>();
        props.put("contactEmail", "admin@corp.io");
        props.put("notAnEmail", "just-a-string");
        props.put("anotherEmail", "test.user+tag@sub.domain.com");
        event.setProperties(props);

        BaseEvent filtered = filter.map(event);

        // Email-pattern values should be hashed
        assertTrue(filtered.getProperties().get("contactEmail").toString().matches("[a-f0-9]{64}"));
        assertTrue(filtered.getProperties().get("anotherEmail").toString().matches("[a-f0-9]{64}"));
        // Non-email values should be preserved
        assertEquals("just-a-string", filtered.getProperties().get("notAnEmail"));
    }

    @Test
    void shouldRemoveIpFromContext() throws Exception {
        BaseEvent event = new BaseEvent();
        event.setProperties(new HashMap<>());

        Map<String, Object> ctx = new HashMap<>();
        ctx.put("ip", "203.0.113.42");
        ctx.put("ipAddress", "2001:db8::1");
        ctx.put("userAgent", "Mozilla/5.0");
        event.setContext(ctx);

        BaseEvent filtered = filter.map(event);

        assertNull(filtered.getContext().get("ip"));
        assertNull(filtered.getContext().get("ipAddress"));
        assertEquals("Mozilla/5.0", filtered.getContext().get("userAgent"));
    }

    @Test
    void shouldNotMutateOriginalEvent() throws Exception {
        BaseEvent event = new BaseEvent();
        Map<String, Object> props = new HashMap<>();
        props.put("email", "user@example.com");
        props.put("content", "secret message");
        event.setProperties(props);

        Map<String, Object> ctx = new HashMap<>();
        ctx.put("ip", "1.2.3.4");
        event.setContext(ctx);

        filter.map(event);

        // Original event should be unchanged
        assertEquals("user@example.com", event.getProperties().get("email"));
        assertEquals("secret message", event.getProperties().get("content"));
        assertEquals("1.2.3.4", event.getContext().get("ip"));
    }
}
