package com.squaretable.flink.schemas;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class BaseEventDeserializerTest {
    @Test
    void shouldDeserializeValidJson() throws Exception {
        String json = "{\"eventId\":\"e1\",\"eventType\":\"page.view\",\"userId\":\"u1\",\"tenantId\":\"t1\",\"sessionId\":\"s1\",\"timestamp\":1234567890,\"properties\":{\"path\":\"/home\"},\"context\":{\"platform\":\"web\"}}";
        BaseEventDeserializer deserializer = new BaseEventDeserializer();
        BaseEvent event = deserializer.deserialize(json.getBytes());
        assertEquals("e1", event.getEventId());
        assertEquals("page.view", event.getEventType());
        assertEquals("u1", event.getUserId());
        assertEquals("t1", event.getTenantId());
        assertEquals("s1", event.getSessionId());
        assertEquals(1234567890L, event.getTimestamp());
        assertEquals("/home", event.getProperties().get("path"));
    }

    @Test
    void shouldReturnFalseForIsEndOfStream() {
        BaseEventDeserializer deserializer = new BaseEventDeserializer();
        assertFalse(deserializer.isEndOfStream(new BaseEvent()));
    }
}
