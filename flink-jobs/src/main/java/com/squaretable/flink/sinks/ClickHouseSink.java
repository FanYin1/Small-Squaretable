package com.squaretable.flink.sinks;

import com.squaretable.flink.models.ChatEventRecord;
import com.squaretable.flink.models.SessionSummary;
import com.squaretable.flink.schemas.BaseEvent;
import com.google.gson.Gson;
import org.apache.flink.connector.jdbc.JdbcConnectionOptions;
import org.apache.flink.connector.jdbc.JdbcExecutionOptions;
import org.apache.flink.connector.jdbc.JdbcSink;
import org.apache.flink.streaming.api.functions.sink.SinkFunction;

import java.sql.Timestamp;
import java.sql.Types;
import java.util.Map;

/**
 * Factory for creating JDBC sinks that write to ClickHouse.
 * Provides typed sink factories for different ClickHouse tables.
 */
public class ClickHouseSink {

    private static final Gson GSON = new Gson();
    private static final String CH_DRIVER = "ru.yandex.clickhouse.ClickHouseDriver";

    private ClickHouseSink() {}

    /**
     * Creates a JDBC sink for writing SessionSummary records to the
     * analytics.ods_sessions ClickHouse table.
     *
     * @param jdbcUrl ClickHouse JDBC URL (e.g., jdbc:clickhouse://localhost:8123/analytics)
     * @return a SinkFunction for SessionSummary
     */
    public static SinkFunction<SessionSummary> sessionSink(String jdbcUrl) {
        String sql = "INSERT INTO analytics.ods_sessions "
                + "(session_id, user_id, tenant_id, start_time, end_time, "
                + "duration_sec, event_count, page_count, pages, device_type, platform) "
                + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

        return JdbcSink.sink(
                sql,
                (ps, summary) -> {
                    ps.setString(1, summary.getSessionId());
                    ps.setString(2, summary.getUserId());
                    ps.setString(3, summary.getTenantId());
                    ps.setTimestamp(4, new Timestamp(summary.getStartTime()));
                    ps.setTimestamp(5, new Timestamp(summary.getEndTime()));
                    ps.setInt(6, summary.getDurationSec());
                    ps.setInt(7, summary.getEventCount());
                    ps.setShort(8, (short) summary.getPageCount());
                    ps.setObject(9, summary.getPages() != null
                            ? summary.getPages().toArray(new String[0])
                            : new String[0]);
                    ps.setString(10, summary.getDeviceType());
                    ps.setString(11, summary.getPlatform());
                },
                JdbcExecutionOptions.builder()
                        .withBatchSize(500)
                        .withBatchIntervalMs(5000)
                        .withMaxRetries(3)
                        .build(),
                new JdbcConnectionOptions.JdbcConnectionOptionsBuilder()
                        .withUrl(jdbcUrl)
                        .withDriverName("ru.yandex.clickhouse.ClickHouseDriver")
                        .build()
        );
    }

    /**
     * Creates a JDBC sink for writing ChatEventRecord records to the
     * analytics.dwd_chat_events ClickHouse table.
     *
     * @param jdbcUrl ClickHouse JDBC URL (e.g., jdbc:clickhouse://localhost:8123/analytics)
     * @return a SinkFunction for ChatEventRecord
     */
    public static SinkFunction<ChatEventRecord> chatEventSink(String jdbcUrl) {
        String sql = "INSERT INTO analytics.dwd_chat_events "
                + "(event_id, user_id, tenant_id, character_id, chat_id, "
                + "action, message_role, token_count, rating, timestamp) "
                + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

        return JdbcSink.sink(
                sql,
                (ps, record) -> {
                    ps.setString(1, record.getEventId());
                    ps.setString(2, record.getUserId());
                    ps.setString(3, record.getTenantId());
                    ps.setString(4, record.getCharacterId());
                    ps.setString(5, record.getChatId());
                    ps.setString(6, record.getAction());
                    ps.setString(7, record.getMessageRole());
                    ps.setInt(8, record.getTokenCount());
                    if (record.getRating() != null) {
                        ps.setFloat(9, record.getRating());
                    } else {
                        ps.setNull(9, Types.FLOAT);
                    }
                    ps.setTimestamp(10, new Timestamp(record.getTimestamp()));
                },
                JdbcExecutionOptions.builder()
                        .withBatchSize(500)
                        .withBatchIntervalMs(5000)
                        .withMaxRetries(3)
                        .build(),
                new JdbcConnectionOptions.JdbcConnectionOptionsBuilder()
                        .withUrl(jdbcUrl)
                        .withDriverName(CH_DRIVER)
                        .build()
        );
    }

    /**
     * Creates a JDBC sink for writing raw BaseEvent records to the
     * analytics.ods_events ClickHouse table. Inserts feed the ClickHouse
     * materialized views (dws_user_hourly, dws_character_daily) automatically.
     *
     * @param jdbcUrl   ClickHouse JDBC URL
     * @param batchSize number of records per batch (default recommendation: 1000)
     * @return a SinkFunction for BaseEvent
     */
    public static SinkFunction<BaseEvent> eventSink(String jdbcUrl, int batchSize) {
        String sql = "INSERT INTO analytics.ods_events "
                + "(event_id, event_type, user_id, tenant_id, session_id, "
                + "timestamp, properties, context) "
                + "VALUES (?, ?, ?, ?, ?, ?, ?, ?)";

        return JdbcSink.sink(
                sql,
                (ps, event) -> {
                    ps.setString(1, event.getEventId());
                    ps.setString(2, event.getEventType());
                    ps.setString(3, event.getUserId());
                    ps.setString(4, event.getTenantId());
                    ps.setString(5, event.getSessionId());
                    ps.setTimestamp(6, new Timestamp(event.getTimestamp()));
                    ps.setString(7, serializeMap(event.getProperties()));
                    ps.setString(8, serializeMap(event.getContext()));
                },
                JdbcExecutionOptions.builder()
                        .withBatchSize(batchSize)
                        .withBatchIntervalMs(5000)
                        .withMaxRetries(3)
                        .build(),
                new JdbcConnectionOptions.JdbcConnectionOptionsBuilder()
                        .withUrl(jdbcUrl)
                        .withDriverName(CH_DRIVER)
                        .build()
        );
    }

    /**
     * Convenience overload with default batch size of 1000.
     */
    public static SinkFunction<BaseEvent> eventSink(String jdbcUrl) {
        return eventSink(jdbcUrl, 1000);
    }

    /**
     * Serializes a Map to a JSON string for ClickHouse String columns.
     */
    private static String serializeMap(Map<String, Object> map) {
        if (map == null) {
            return "{}";
        }
        return GSON.toJson(map);
    }
}
