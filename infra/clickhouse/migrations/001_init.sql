CREATE DATABASE IF NOT EXISTS amplitude;

-- Events table (core analytics data)
CREATE TABLE IF NOT EXISTS amplitude.events
(
    id              UUID DEFAULT generateUUIDv4(),
    project_id      String,
    user_id         String,
    device_id       String,
    session_id      String,
    event_type      String,
    event_time      DateTime64(3, 'UTC'),
    insert_time     DateTime64(3, 'UTC') DEFAULT now64(),

    -- Event properties (arbitrary JSON)
    properties      String DEFAULT '{}',

    -- User properties at time of event
    user_properties String DEFAULT '{}',

    -- Device info
    platform        LowCardinality(String) DEFAULT '',
    os_name         LowCardinality(String) DEFAULT '',
    os_version      String DEFAULT '',
    device_type     LowCardinality(String) DEFAULT '',
    browser         LowCardinality(String) DEFAULT '',
    browser_version String DEFAULT '',

    -- Geo
    country         LowCardinality(String) DEFAULT '',
    region          LowCardinality(String) DEFAULT '',
    city            String DEFAULT '',

    -- Attribution
    utm_source      String DEFAULT '',
    utm_medium      String DEFAULT '',
    utm_campaign    String DEFAULT '',
    utm_term        String DEFAULT '',
    utm_content     String DEFAULT '',
    referrer        String DEFAULT '',

    -- SDK info
    sdk_version     String DEFAULT '',
    ip              String DEFAULT ''
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_time)
ORDER BY (project_id, event_type, event_time, user_id)
TTL toDateTime(event_time) + INTERVAL 2 YEAR
SETTINGS index_granularity = 8192;

-- User profiles table
CREATE TABLE IF NOT EXISTS amplitude.user_profiles
(
    project_id      String,
    user_id         String,
    properties      String DEFAULT '{}',
    first_seen      DateTime64(3, 'UTC'),
    last_seen       DateTime64(3, 'UTC'),
    updated_at      DateTime64(3, 'UTC') DEFAULT now64()
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (project_id, user_id)
SETTINGS index_granularity = 8192;

-- Sessions table
CREATE TABLE IF NOT EXISTS amplitude.sessions
(
    project_id      String,
    user_id         String,
    session_id      String,
    started_at      DateTime64(3, 'UTC'),
    ended_at        DateTime64(3, 'UTC'),
    duration_ms     UInt64,
    event_count     UInt32,
    updated_at      DateTime64(3, 'UTC') DEFAULT now64()
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (project_id, user_id, session_id)
SETTINGS index_granularity = 8192;

-- Materialized view: daily event counts per project (speeds up segmentation)
CREATE MATERIALIZED VIEW IF NOT EXISTS amplitude.mv_daily_event_counts
ENGINE = SummingMergeTree()
ORDER BY (project_id, event_type, date)
AS
SELECT
    project_id,
    event_type,
    toDate(event_time) AS date,
    count()            AS event_count,
    uniq(user_id)      AS unique_users
FROM amplitude.events
GROUP BY project_id, event_type, date;
