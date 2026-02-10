package com.squaretable.flink.jobs;

import com.squaretable.flink.models.RecommendationEvent;
import com.squaretable.flink.schemas.BaseEvent;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Unit tests for the recommendation event extraction logic in
 * RecommendationTrackerJob.
 */
class RecommendationTrackerJobTest {

    @Test
    void shouldExtractValidShowEvent() {
        BaseEvent base = createBaseEvent("e1", "u1", 1700000000000L,
                "exp-001", "control", "homepage", "char-42", "show", 3);

        RecommendationEvent result = RecommendationTrackerJob.extractRecommendationEvent(base);

        assertNotNull(result);
        assertEquals("e1", result.getEventId());
        assertEquals("u1", result.getUserId());
        assertEquals("exp-001", result.getExperimentId());
        assertEquals("control", result.getVariant());
        assertEquals("homepage", result.getScene());
        assertEquals("char-42", result.getCharacterId());
        assertEquals("show", result.getAction());
        assertEquals(3, result.getPosition());
        assertEquals(1700000000000L, result.getTimestamp());
    }

    @Test
    void shouldExtractValidClickEvent() {
        BaseEvent base = createBaseEvent("e2", "u2", 1700000001000L,
                "exp-002", "variant_a", "search", "char-99", "click", 1);

        RecommendationEvent result = RecommendationTrackerJob.extractRecommendationEvent(base);

        assertNotNull(result);
        assertEquals("click", result.getAction());
        assertEquals("exp-002", result.getExperimentId());
        assertEquals("variant_a", result.getVariant());
    }

    @Test
    void shouldExtractValidConvertEvent() {
        BaseEvent base = createBaseEvent("e3", "u3", 1700000002000L,
                "exp-003", "variant_b", "detail", "char-7", "convert", 0);

        RecommendationEvent result = RecommendationTrackerJob.extractRecommendationEvent(base);

        assertNotNull(result);
        assertEquals("convert", result.getAction());
    }

    @Test
    void shouldReturnNullForNullBaseEvent() {
        assertNull(RecommendationTrackerJob.extractRecommendationEvent(null));
    }

    @Test
    void shouldReturnNullForNullProperties() {
        BaseEvent base = new BaseEvent();
        base.setEventId("e1");
        base.setProperties(null);

        assertNull(RecommendationTrackerJob.extractRecommendationEvent(base));
    }

    @Test
    void shouldReturnNullWhenExperimentIdMissing() {
        BaseEvent base = createBaseEvent("e1", "u1", 1700000000000L,
                null, "control", "homepage", "char-1", "show", 0);

        assertNull(RecommendationTrackerJob.extractRecommendationEvent(base));
    }

    @Test
    void shouldReturnNullWhenVariantMissing() {
        BaseEvent base = createBaseEvent("e1", "u1", 1700000000000L,
                "exp-001", null, "homepage", "char-1", "show", 0);

        assertNull(RecommendationTrackerJob.extractRecommendationEvent(base));
    }

    @Test
    void shouldReturnNullWhenSceneMissing() {
        BaseEvent base = createBaseEvent("e1", "u1", 1700000000000L,
                "exp-001", "control", null, "char-1", "show", 0);

        assertNull(RecommendationTrackerJob.extractRecommendationEvent(base));
    }

    @Test
    void shouldReturnNullWhenActionMissing() {
        BaseEvent base = createBaseEvent("e1", "u1", 1700000000000L,
                "exp-001", "control", "homepage", "char-1", null, 0);

        assertNull(RecommendationTrackerJob.extractRecommendationEvent(base));
    }

    @Test
    void shouldReturnNullForInvalidAction() {
        BaseEvent base = createBaseEvent("e1", "u1", 1700000000000L,
                "exp-001", "control", "homepage", "char-1", "hover", 0);

        assertNull(RecommendationTrackerJob.extractRecommendationEvent(base));
    }

    @Test
    void shouldDefaultCharacterIdToEmptyString() {
        BaseEvent base = createBaseEvent("e1", "u1", 1700000000000L,
                "exp-001", "control", "homepage", null, "show", 0);

        RecommendationEvent result = RecommendationTrackerJob.extractRecommendationEvent(base);

        assertNotNull(result);
        assertEquals("", result.getCharacterId());
    }

    @Test
    void shouldDefaultPositionToZero() {
        Map<String, Object> props = new HashMap<>();
        props.put("experiment_id", "exp-001");
        props.put("variant", "control");
        props.put("scene", "homepage");
        props.put("action", "show");
        // position not set

        BaseEvent base = new BaseEvent();
        base.setEventId("e1");
        base.setUserId("u1");
        base.setTimestamp(1700000000000L);
        base.setProperties(props);

        RecommendationEvent result = RecommendationTrackerJob.extractRecommendationEvent(base);

        assertNotNull(result);
        assertEquals(0, result.getPosition());
    }

    @Test
    void shouldHandleNumericPositionFromGson() {
        // Gson deserializes JSON numbers as Double by default
        Map<String, Object> props = new HashMap<>();
        props.put("experiment_id", "exp-001");
        props.put("variant", "control");
        props.put("scene", "homepage");
        props.put("action", "click");
        props.put("position", 5.0); // Gson double

        BaseEvent base = new BaseEvent();
        base.setEventId("e1");
        base.setUserId("u1");
        base.setTimestamp(1700000000000L);
        base.setProperties(props);

        RecommendationEvent result = RecommendationTrackerJob.extractRecommendationEvent(base);

        assertNotNull(result);
        assertEquals(5, result.getPosition());
    }

    @Test
    void shouldHandleStringPosition() {
        Map<String, Object> props = new HashMap<>();
        props.put("experiment_id", "exp-001");
        props.put("variant", "control");
        props.put("scene", "homepage");
        props.put("action", "show");
        props.put("position", "7");

        BaseEvent base = new BaseEvent();
        base.setEventId("e1");
        base.setUserId("u1");
        base.setTimestamp(1700000000000L);
        base.setProperties(props);

        RecommendationEvent result = RecommendationTrackerJob.extractRecommendationEvent(base);

        assertNotNull(result);
        assertEquals(7, result.getPosition());
    }

    @Test
    void shouldDefaultPositionForInvalidString() {
        Map<String, Object> props = new HashMap<>();
        props.put("experiment_id", "exp-001");
        props.put("variant", "control");
        props.put("scene", "homepage");
        props.put("action", "show");
        props.put("position", "not-a-number");

        BaseEvent base = new BaseEvent();
        base.setEventId("e1");
        base.setUserId("u1");
        base.setTimestamp(1700000000000L);
        base.setProperties(props);

        RecommendationEvent result = RecommendationTrackerJob.extractRecommendationEvent(base);

        assertNotNull(result);
        assertEquals(0, result.getPosition());
    }

    @Test
    void mapperShouldDelegateToExtract() {
        RecommendationTrackerJob.RecommendationEventMapper mapper =
                new RecommendationTrackerJob.RecommendationEventMapper();

        BaseEvent base = createBaseEvent("e1", "u1", 1700000000000L,
                "exp-001", "control", "homepage", "char-1", "show", 2);

        RecommendationEvent result = mapper.map(base);

        assertNotNull(result);
        assertEquals("exp-001", result.getExperimentId());
        assertEquals("show", result.getAction());
    }

    @Test
    void mapperShouldReturnNullForInvalidEvent() {
        RecommendationTrackerJob.RecommendationEventMapper mapper =
                new RecommendationTrackerJob.RecommendationEventMapper();

        assertNull(mapper.map(null));
    }

    // --- Helper ---

    private BaseEvent createBaseEvent(String eventId, String userId, long timestamp,
                                       String experimentId, String variant, String scene,
                                       String characterId, String action, Integer position) {
        Map<String, Object> props = new HashMap<>();
        if (experimentId != null) props.put("experiment_id", experimentId);
        if (variant != null) props.put("variant", variant);
        if (scene != null) props.put("scene", scene);
        if (characterId != null) props.put("character_id", characterId);
        if (action != null) props.put("action", action);
        if (position != null) props.put("position", position);

        BaseEvent event = new BaseEvent();
        event.setEventId(eventId);
        event.setUserId(userId);
        event.setTimestamp(timestamp);
        event.setProperties(props);
        return event;
    }
}
