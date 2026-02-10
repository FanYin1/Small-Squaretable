CREATE DATABASE IF NOT EXISTS analytics;

-- ODS: Raw events
CREATE TABLE IF NOT EXISTS analytics.ods_events (
    event_id       String,
    event_type     LowCardinality(String),
    user_id        String,
    tenant_id      String,
    session_id     String,
    timestamp      DateTime64(3),
    properties     String,
    context        String,
    _date          Date DEFAULT toDate(timestamp)
) ENGINE = MergeTree()
PARTITION BY _date
ORDER BY (tenant_id, event_type, timestamp)
TTL _date + INTERVAL 30 DAY;

-- ODS: Session summaries
CREATE TABLE IF NOT EXISTS analytics.ods_sessions (
    session_id     String,
    user_id        String,
    tenant_id      String,
    start_time     DateTime64(3),
    end_time       DateTime64(3),
    duration_sec   UInt32,
    event_count    UInt32,
    page_count     UInt16,
    pages          Array(String),
    device_type    LowCardinality(String),
    platform       LowCardinality(String),
    _date          Date DEFAULT toDate(start_time)
) ENGINE = MergeTree()
PARTITION BY _date
ORDER BY (tenant_id, user_id, start_time);

-- DWD: Chat event details
CREATE TABLE IF NOT EXISTS analytics.dwd_chat_events (
    event_id       String,
    user_id        String,
    tenant_id      String,
    character_id   String,
    chat_id        String,
    action         LowCardinality(String),
    message_role   LowCardinality(String),
    token_count    UInt32,
    rating         Nullable(Float32),
    timestamp      DateTime64(3),
    _date          Date DEFAULT toDate(timestamp)
) ENGINE = MergeTree()
PARTITION BY _date
ORDER BY (tenant_id, character_id, timestamp);

-- DWD: Recommendation event details
CREATE TABLE IF NOT EXISTS analytics.dwd_recommendation_events (
    event_id       String,
    user_id        String,
    experiment_id  String,
    variant        LowCardinality(String),
    scene          LowCardinality(String),
    character_id   String,
    action         LowCardinality(String),
    position       UInt8,
    timestamp      DateTime64(3),
    _date          Date DEFAULT toDate(timestamp)
) ENGINE = MergeTree()
PARTITION BY _date
ORDER BY (experiment_id, user_id, timestamp);

-- DWS: Hourly user activity (materialized view)
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.dws_user_hourly
ENGINE = SummingMergeTree()
PARTITION BY toDate(hour)
ORDER BY (tenant_id, user_id, hour)
AS SELECT
    tenant_id,
    user_id,
    toStartOfHour(timestamp) AS hour,
    count() AS event_count,
    uniqExact(session_id) AS session_count,
    countIf(event_type = 'chat.message.sent') AS message_count
FROM analytics.ods_events
GROUP BY tenant_id, user_id, hour;

-- DWS: Daily character stats (materialized view)
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.dws_character_daily
ENGINE = SummingMergeTree()
PARTITION BY _date
ORDER BY (tenant_id, character_id, _date)
AS SELECT
    tenant_id,
    character_id,
    toDate(timestamp) AS _date,
    countIf(action = 'start') AS chat_starts,
    countIf(action = 'message') AS messages,
    countIf(action = 'rate') AS ratings,
    avgIf(rating, isNotNull(rating)) AS avg_rating
FROM analytics.dwd_chat_events
GROUP BY tenant_id, character_id, _date;

-- DWS: Hourly recommendation stats (materialized view)
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.dws_recommendation_hourly
ENGINE = SummingMergeTree()
PARTITION BY toDate(hour)
ORDER BY (experiment_id, variant, scene, hour)
AS SELECT
    experiment_id,
    variant,
    scene,
    toStartOfHour(timestamp) AS hour,
    countIf(action = 'show') AS impressions,
    countIf(action = 'click') AS clicks,
    countIf(action = 'convert') AS conversions
FROM analytics.dwd_recommendation_events
GROUP BY experiment_id, variant, scene, hour;

-- ADS: North star metrics view
CREATE VIEW IF NOT EXISTS analytics.ads_north_star AS
SELECT
    toStartOfWeek(hour) AS week,
    tenant_id,
    uniqExact(user_id) AS weekly_active_users,
    sum(message_count) AS weekly_messages
FROM analytics.dws_user_hourly
GROUP BY week, tenant_id;
