package com.squaretable.flink.jobs;

import com.squaretable.flink.functions.ContentAnalyzerWindowFunction;
import com.squaretable.flink.models.CharacterStats;
import com.squaretable.flink.models.ChatEventRecord;
import com.squaretable.flink.schemas.BaseEvent;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Nested;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Unit tests for ContentAnalyzerJob helper methods, ChatEventRecordMapper,
 * and ContentAnalyzerWindowFunction scoring logic.
 */
class ContentAnalyzerJobTest {

    // ---- Helper: create a BaseEvent with properties ----

    private static BaseEvent createEvent(String eventType, Map<String, Object> properties) {
        BaseEvent event = new BaseEvent();
        event.setEventId("evt-1");
        event.setEventType(eventType);
        event.setUserId("user-1");
        event.setTenantId("tenant-1");
        event.setSessionId("session-1");
        event.setTimestamp(System.currentTimeMillis());
        event.setProperties(properties);
        return event;
    }

    // ---- Tests for extractCharacterId ----

    @Nested
    class ExtractCharacterIdTests {

        @Test
        void shouldExtractCharacterIdFromCamelCase() {
            Map<String, Object> props = new HashMap<>();
            props.put("characterId", "char-123");
            BaseEvent event = createEvent("chat.created", props);

            assertEquals("char-123", ContentAnalyzerJob.extractCharacterId(event));
        }

        @Test
        void shouldExtractCharacterIdFromSnakeCase() {
            Map<String, Object> props = new HashMap<>();
            props.put("character_id", "char-456");
            BaseEvent event = createEvent("chat.created", props);

            assertEquals("char-456", ContentAnalyzerJob.extractCharacterId(event));
        }

        @Test
        void shouldPreferCamelCaseOverSnakeCase() {
            Map<String, Object> props = new HashMap<>();
            props.put("characterId", "char-camel");
            props.put("character_id", "char-snake");
            BaseEvent event = createEvent("chat.created", props);

            assertEquals("char-camel", ContentAnalyzerJob.extractCharacterId(event));
        }

        @Test
        void shouldReturnNullWhenNoCharacterId() {
            Map<String, Object> props = new HashMap<>();
            props.put("otherKey", "value");
            BaseEvent event = createEvent("chat.created", props);

            assertNull(ContentAnalyzerJob.extractCharacterId(event));
        }

        @Test
        void shouldReturnNullWhenPropertiesNull() {
            BaseEvent event = createEvent("chat.created", null);

            assertNull(ContentAnalyzerJob.extractCharacterId(event));
        }
    }

    // ---- Tests for extractStringProp ----

    @Nested
    class ExtractStringPropTests {

        @Test
        void shouldExtractExistingStringProp() {
            Map<String, Object> props = new HashMap<>();
            props.put("chatId", "chat-99");
            BaseEvent event = createEvent("chat.created", props);

            assertEquals("chat-99", ContentAnalyzerJob.extractStringProp(event, "chatId", ""));
        }

        @Test
        void shouldReturnDefaultWhenPropMissing() {
            Map<String, Object> props = new HashMap<>();
            BaseEvent event = createEvent("chat.created", props);

            assertEquals("default-val", ContentAnalyzerJob.extractStringProp(event, "missing", "default-val"));
        }

        @Test
        void shouldReturnDefaultWhenPropertiesNull() {
            BaseEvent event = createEvent("chat.created", null);

            assertEquals("fallback", ContentAnalyzerJob.extractStringProp(event, "key", "fallback"));
        }
    }

    // ---- Tests for extractIntProp ----

    @Nested
    class ExtractIntPropTests {

        @Test
        void shouldExtractIntegerProp() {
            Map<String, Object> props = new HashMap<>();
            props.put("tokenCount", 150);
            BaseEvent event = createEvent("chat.message.sent", props);

            assertEquals(150, ContentAnalyzerJob.extractIntProp(event, "tokenCount"));
        }

        @Test
        void shouldExtractDoubleAsInt() {
            Map<String, Object> props = new HashMap<>();
            props.put("tokenCount", 42.7);
            BaseEvent event = createEvent("chat.message.sent", props);

            assertEquals(42, ContentAnalyzerJob.extractIntProp(event, "tokenCount"));
        }

        @Test
        void shouldParseStringAsInt() {
            Map<String, Object> props = new HashMap<>();
            props.put("tokenCount", "200");
            BaseEvent event = createEvent("chat.message.sent", props);

            assertEquals(200, ContentAnalyzerJob.extractIntProp(event, "tokenCount"));
        }

        @Test
        void shouldReturnZeroForMissingProp() {
            Map<String, Object> props = new HashMap<>();
            BaseEvent event = createEvent("chat.message.sent", props);

            assertEquals(0, ContentAnalyzerJob.extractIntProp(event, "tokenCount"));
        }

        @Test
        void shouldReturnZeroForUnparseableString() {
            Map<String, Object> props = new HashMap<>();
            props.put("tokenCount", "not-a-number");
            BaseEvent event = createEvent("chat.message.sent", props);

            assertEquals(0, ContentAnalyzerJob.extractIntProp(event, "tokenCount"));
        }
    }

    // ---- Tests for extractRatingProp ----

    @Nested
    class ExtractRatingPropTests {

        @Test
        void shouldExtractFloatRating() {
            Map<String, Object> props = new HashMap<>();
            props.put("rating", 4.5f);
            BaseEvent event = createEvent("chat.rated", props);

            assertEquals(4.5f, ContentAnalyzerJob.extractRatingProp(event), 0.001f);
        }

        @Test
        void shouldExtractDoubleRating() {
            Map<String, Object> props = new HashMap<>();
            props.put("rating", 3.8);
            BaseEvent event = createEvent("chat.rated", props);

            assertEquals(3.8f, ContentAnalyzerJob.extractRatingProp(event), 0.001f);
        }

        @Test
        void shouldParseStringRating() {
            Map<String, Object> props = new HashMap<>();
            props.put("rating", "4.2");
            BaseEvent event = createEvent("chat.rated", props);

            assertEquals(4.2f, ContentAnalyzerJob.extractRatingProp(event), 0.001f);
        }

        @Test
        void shouldReturnNullWhenNoRating() {
            Map<String, Object> props = new HashMap<>();
            BaseEvent event = createEvent("chat.rated", props);

            assertNull(ContentAnalyzerJob.extractRatingProp(event));
        }

        @Test
        void shouldReturnNullForUnparseableRating() {
            Map<String, Object> props = new HashMap<>();
            props.put("rating", "bad");
            BaseEvent event = createEvent("chat.rated", props);

            assertNull(ContentAnalyzerJob.extractRatingProp(event));
        }
    }

    // ---- Tests for ChatEventRecordMapper ----

    @Nested
    class ChatEventRecordMapperTests {

        @Test
        void shouldMapBaseEventToChatEventRecord() throws Exception {
            Map<String, Object> props = new HashMap<>();
            props.put("characterId", "char-1");
            props.put("chatId", "chat-1");
            props.put("messageRole", "assistant");
            props.put("tokenCount", 100);
            props.put("rating", 4.5);

            BaseEvent event = new BaseEvent();
            event.setEventId("evt-map-1");
            event.setEventType("chat.message.sent");
            event.setUserId("user-map");
            event.setTenantId("tenant-map");
            event.setSessionId("sess-map");
            event.setTimestamp(1700000000000L);
            event.setProperties(props);

            ContentAnalyzerJob.ChatEventRecordMapper mapper =
                    new ContentAnalyzerJob.ChatEventRecordMapper();
            ChatEventRecord record = mapper.map(event);

            assertEquals("evt-map-1", record.getEventId());
            assertEquals("user-map", record.getUserId());
            assertEquals("tenant-map", record.getTenantId());
            assertEquals("char-1", record.getCharacterId());
            assertEquals("chat-1", record.getChatId());
            assertEquals("chat.message.sent", record.getAction());
            assertEquals("assistant", record.getMessageRole());
            assertEquals(100, record.getTokenCount());
            assertNotNull(record.getRating());
            assertEquals(4.5f, record.getRating(), 0.001f);
            assertEquals(1700000000000L, record.getTimestamp());
        }

        @Test
        void shouldHandleMissingOptionalFields() throws Exception {
            Map<String, Object> props = new HashMap<>();
            props.put("characterId", "char-2");

            BaseEvent event = new BaseEvent();
            event.setEventId("evt-map-2");
            event.setEventType("chat.created");
            event.setUserId("user-2");
            event.setTenantId("tenant-2");
            event.setTimestamp(1700000000000L);
            event.setProperties(props);

            ContentAnalyzerJob.ChatEventRecordMapper mapper =
                    new ContentAnalyzerJob.ChatEventRecordMapper();
            ChatEventRecord record = mapper.map(event);

            assertEquals("char-2", record.getCharacterId());
            assertEquals("", record.getChatId());
            assertEquals("", record.getMessageRole());
            assertEquals(0, record.getTokenCount());
            assertNull(record.getRating());
        }

        @Test
        void shouldUseSnakeCaseFallbacks() throws Exception {
            Map<String, Object> props = new HashMap<>();
            props.put("character_id", "char-snake");
            props.put("chat_id", "chat-snake");
            props.put("message_role", "user");
            props.put("token_count", 50);

            BaseEvent event = new BaseEvent();
            event.setEventId("evt-map-3");
            event.setEventType("chat.message.sent");
            event.setUserId("user-3");
            event.setTenantId("tenant-3");
            event.setTimestamp(1700000000000L);
            event.setProperties(props);

            ContentAnalyzerJob.ChatEventRecordMapper mapper =
                    new ContentAnalyzerJob.ChatEventRecordMapper();
            ChatEventRecord record = mapper.map(event);

            assertEquals("char-snake", record.getCharacterId());
            assertEquals("chat-snake", record.getChatId());
            assertEquals("user", record.getMessageRole());
            assertEquals(50, record.getTokenCount());
        }
    }

    // ---- Tests for ContentAnalyzerWindowFunction scoring ----

    @Nested
    class TrendingScoreTests {

        @Test
        void shouldComputePositiveScoreForRecentWindow() {
            long now = System.currentTimeMillis();
            // Window that just ended
            double score = ContentAnalyzerWindowFunction.computeTrendingScore(
                    5, 100, 20, 10, 45.0, now, now);

            // volume = 5*3 + 100*1 + 20*5 + 4.5*2 = 15 + 100 + 100 + 9 = 224
            // recencyFactor = 1.0 (0 hours ago)
            assertEquals(224.0, score, 0.1);
        }

        @Test
        void shouldDecayScoreFor24HourOldWindow() {
            long now = System.currentTimeMillis();
            long oneDayAgo = now - 24 * 3600 * 1000L;

            double recentScore = ContentAnalyzerWindowFunction.computeTrendingScore(
                    5, 100, 20, 10, 45.0, now, now);
            double oldScore = ContentAnalyzerWindowFunction.computeTrendingScore(
                    5, 100, 20, 10, 45.0, oneDayAgo, now);

            // After 24 hours (one half-life), score should be ~half
            assertEquals(recentScore / 2.0, oldScore, 1.0);
        }

        @Test
        void shouldReturnZeroScoreForNoInteractions() {
            long now = System.currentTimeMillis();
            double score = ContentAnalyzerWindowFunction.computeTrendingScore(
                    0, 0, 0, 0, 0.0, now, now);

            assertEquals(0.0, score, 0.001);
        }

        @Test
        void shouldHandleZeroRatingsGracefully() {
            long now = System.currentTimeMillis();
            // No ratings but has messages and users
            double score = ContentAnalyzerWindowFunction.computeTrendingScore(
                    2, 50, 10, 0, 0.0, now, now);

            // volume = 2*3 + 50*1 + 10*5 + 0*2 = 6 + 50 + 50 + 0 = 106
            assertEquals(106.0, score, 0.1);
        }

        @Test
        void shouldWeightChatStartsAndUsersHigher() {
            long now = System.currentTimeMillis();

            // Scenario A: many messages, few users
            double scoreA = ContentAnalyzerWindowFunction.computeTrendingScore(
                    1, 200, 2, 0, 0.0, now, now);
            // volume = 3 + 200 + 10 = 213

            // Scenario B: fewer messages, many users
            double scoreB = ContentAnalyzerWindowFunction.computeTrendingScore(
                    1, 50, 40, 0, 0.0, now, now);
            // volume = 3 + 50 + 200 = 253

            assertTrue(scoreB > scoreA,
                    "More unique users should produce a higher trending score");
        }
    }

    // ---- Tests for ContentAnalyzerWindowFunction.extractRating ----

    @Nested
    class WindowFunctionExtractRatingTests {

        @Test
        void shouldExtractNumericRating() {
            Map<String, Object> props = new HashMap<>();
            props.put("rating", 4.0);
            BaseEvent event = createEvent("chat.rated", props);

            Float rating = ContentAnalyzerWindowFunction.extractRating(event);
            assertNotNull(rating);
            assertEquals(4.0f, rating, 0.001f);
        }

        @Test
        void shouldExtractStringRating() {
            Map<String, Object> props = new HashMap<>();
            props.put("rating", "3.5");
            BaseEvent event = createEvent("chat.rated", props);

            Float rating = ContentAnalyzerWindowFunction.extractRating(event);
            assertNotNull(rating);
            assertEquals(3.5f, rating, 0.001f);
        }

        @Test
        void shouldReturnNullForMissingRating() {
            Map<String, Object> props = new HashMap<>();
            BaseEvent event = createEvent("chat.rated", props);

            assertNull(ContentAnalyzerWindowFunction.extractRating(event));
        }

        @Test
        void shouldReturnNullForNullProperties() {
            BaseEvent event = createEvent("chat.rated", null);

            assertNull(ContentAnalyzerWindowFunction.extractRating(event));
        }
    }

    // ---- Tests for CharacterStats model ----

    @Nested
    class CharacterStatsTests {

        @Test
        void shouldComputeAvgRating() {
            CharacterStats stats = new CharacterStats();
            stats.setRatingCount(4);
            stats.setRatingSum(18.0);

            assertEquals(4.5, stats.getAvgRating(), 0.001);
        }

        @Test
        void shouldReturnZeroAvgRatingWhenNoRatings() {
            CharacterStats stats = new CharacterStats();
            stats.setRatingCount(0);
            stats.setRatingSum(0.0);

            assertEquals(0.0, stats.getAvgRating(), 0.001);
        }
    }
}
