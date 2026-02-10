package com.squaretable.flink.functions;

import com.squaretable.flink.models.UserProfile;
import com.squaretable.flink.schemas.BaseEvent;
import org.junit.jupiter.api.Test;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Unit tests for UserProfileFunction computation logic.
 * Tests the static computation methods directly without requiring Redis.
 */
class UserProfileFunctionTest {

    private static BaseEvent createEvent(String eventType, long timestamp, String sessionId,
                                         Map<String, Object> properties) {
        BaseEvent event = new BaseEvent();
        event.setEventId(UUID.randomUUID().toString());
        event.setEventType(eventType);
        event.setUserId("user-1");
        event.setTenantId("tenant-1");
        event.setSessionId(sessionId);
        event.setTimestamp(timestamp);
        event.setProperties(properties);
        return event;
    }

    @Test
    void computeProfile_basicMetrics() {
        long baseTs = 1700000000000L;
        List<BaseEvent> events = Arrays.asList(
                createEvent("page.view", baseTs, "s1", null),
                createEvent("chat.message.sent", baseTs + 1000, "s1", null),
                createEvent("character.viewed", baseTs + 2000, "s2", null)
        );

        UserProfile profile = UserProfileFunction.computeProfile("user-1", events);

        assertEquals("user-1", profile.getUserId());
        assertEquals(3, profile.getTotalEvents());
        assertEquals(2, profile.getTotalSessions());
        assertEquals(baseTs + 2000, profile.getLastActive());
    }

    @Test
    void computeEngagementScore_increasesWithFrequencyAndDiversity() {
        double scoreLow = UserProfileFunction.computeEngagementScore(5, 2);
        double scoreHigh = UserProfileFunction.computeEngagementScore(50, 8);

        assertTrue(scoreLow > 0, "Score should be positive for non-zero events");
        assertTrue(scoreHigh > scoreLow, "Higher frequency and diversity should yield higher score");
        assertTrue(scoreHigh <= 100.0, "Score should be capped at 100");
    }

    @Test
    void computeEngagementScore_zeroEvents() {
        double score = UserProfileFunction.computeEngagementScore(0, 0);
        assertEquals(0.0, score, 0.01);
    }

    @Test
    void classifyActivityLevel_high() {
        assertEquals("high", UserProfileFunction.classifyActivityLevel(50));
        assertEquals("high", UserProfileFunction.classifyActivityLevel(100));
    }

    @Test
    void classifyActivityLevel_medium() {
        assertEquals("medium", UserProfileFunction.classifyActivityLevel(10));
        assertEquals("medium", UserProfileFunction.classifyActivityLevel(49));
    }

    @Test
    void classifyActivityLevel_low() {
        assertEquals("low", UserProfileFunction.classifyActivityLevel(0));
        assertEquals("low", UserProfileFunction.classifyActivityLevel(9));
    }

    @Test
    void extractInterestTags_fromCharacterProperties() {
        long baseTs = 1700000000000L;
        Map<String, Object> props1 = new HashMap<>();
        props1.put("characterName", "Alice");
        props1.put("category", "Fantasy");
        props1.put("tags", "adventure,magic");

        Map<String, Object> props2 = new HashMap<>();
        props2.put("characterName", "Bob");
        props2.put("category", "Fantasy");

        List<BaseEvent> events = Arrays.asList(
                createEvent("character.viewed", baseTs, "s1", props1),
                createEvent("character.viewed", baseTs + 60000, "s1", props2)
        );

        Map<String, Double> tags = UserProfileFunction.extractInterestTags(events);

        assertTrue(tags.containsKey("alice"), "Should contain character name tag");
        assertTrue(tags.containsKey("bob"), "Should contain character name tag");
        assertTrue(tags.containsKey("fantasy"), "Should contain category tag");
        assertTrue(tags.containsKey("adventure"), "Should contain parsed tag");
        assertTrue(tags.containsKey("magic"), "Should contain parsed tag");
        // Fantasy appears twice, so its score should be higher than alice (appears once)
        assertTrue(tags.get("fantasy") > tags.get("alice"),
                "Repeated tags should have higher scores");
    }

    @Test
    void extractInterestTags_recencyWeighting() {
        long baseTs = 1700000000000L;
        Map<String, Object> propsOld = new HashMap<>();
        propsOld.put("characterName", "OldChar");

        Map<String, Object> propsNew = new HashMap<>();
        propsNew.put("characterName", "NewChar");

        List<BaseEvent> events = Arrays.asList(
                createEvent("character.viewed", baseTs, "s1", propsOld),
                createEvent("character.viewed", baseTs + 3600000, "s1", propsNew)
        );

        Map<String, Double> tags = UserProfileFunction.extractInterestTags(events);

        // NewChar is the most recent event, so it should have weight 1.0
        // OldChar is the oldest event, so it should have weight 0.5
        assertTrue(tags.get("newchar") > tags.get("oldchar"),
                "More recent interactions should have higher weight");
    }

    @Test
    void extractRecentCharacters_deduplicatesAndOrdersByRecency() {
        long baseTs = 1700000000000L;
        Map<String, Object> props1 = new HashMap<>();
        props1.put("characterId", "char-A");

        Map<String, Object> props2 = new HashMap<>();
        props2.put("characterId", "char-B");

        Map<String, Object> props3 = new HashMap<>();
        props3.put("characterId", "char-A");

        List<BaseEvent> events = Arrays.asList(
                createEvent("character.viewed", baseTs, "s1", props1),
                createEvent("chat.message.sent", baseTs + 1000, "s1", props2),
                createEvent("character.viewed", baseTs + 2000, "s1", props3)
        );

        List<String> recent = UserProfileFunction.extractRecentCharacters(events);

        assertEquals(2, recent.size(), "Should deduplicate character IDs");
        assertEquals("char-A", recent.get(0), "Most recently seen character should be first");
        assertEquals("char-B", recent.get(1));
    }

    @Test
    void extractRecentCharacters_limitsToMax() {
        long baseTs = 1700000000000L;
        List<BaseEvent> events = new ArrayList<>();
        for (int i = 0; i < 30; i++) {
            Map<String, Object> props = new HashMap<>();
            props.put("characterId", "char-" + i);
            events.add(createEvent("character.viewed", baseTs + i * 1000, "s1", props));
        }

        List<String> recent = UserProfileFunction.extractRecentCharacters(events);

        assertEquals(UserProfileFunction.MAX_RECENT_CHARACTERS, recent.size(),
                "Should limit to MAX_RECENT_CHARACTERS");
    }

    @Test
    void extractInterestTags_emptyEvents() {
        Map<String, Double> tags = UserProfileFunction.extractInterestTags(Collections.emptyList());
        assertTrue(tags.isEmpty());
    }

    @Test
    void extractInterestTags_nullProperties() {
        long baseTs = 1700000000000L;
        List<BaseEvent> events = Collections.singletonList(
                createEvent("page.view", baseTs, "s1", null)
        );

        Map<String, Double> tags = UserProfileFunction.extractInterestTags(events);
        assertTrue(tags.isEmpty(), "Should handle null properties gracefully");
    }

    @Test
    void computeProfile_activityLevelMatchesEventCount() {
        long baseTs = 1700000000000L;
        List<BaseEvent> lowEvents = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            lowEvents.add(createEvent("page.view", baseTs + i * 1000, "s1", null));
        }

        List<BaseEvent> highEvents = new ArrayList<>();
        for (int i = 0; i < 60; i++) {
            highEvents.add(createEvent("page.view", baseTs + i * 1000, "s1", null));
        }

        UserProfile lowProfile = UserProfileFunction.computeProfile("user-1", lowEvents);
        UserProfile highProfile = UserProfileFunction.computeProfile("user-1", highEvents);

        assertEquals("low", lowProfile.getActivityLevel());
        assertEquals("high", highProfile.getActivityLevel());
    }
}
