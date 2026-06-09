spec_version: "1.0"
name: inspectuser
description: Self-hosted product analytics platform (Amplitude clone). Multi-tenant. Go + Next.js + TypeScript SDKs.

services:
  - id: ingestion
    path: apps/ingestion
    lang: go
    port: 4000
    entry: cmd/main.go
    role: Receives events via HTTP, validates API key via Redis, publishes to Kafka
    routes:
      - POST /v2/httpapi
      - POST /identify
    key_files:
      - internal/handler/events.go
      - internal/kafka/producer.go
      - internal/middleware/auth.go
      - internal/validator/event.go

  - id: query
    path: apps/query
    lang: go
    port: 4001
    entry: cmd/main.go
    role: JWT auth, org/project CRUD, analytics queries against ClickHouse
    routes:
      - POST /v1/auth/signup
      - POST /v1/auth/login
      - POST /v1/projects
      - GET  /v1/projects/:id/events/first
      - POST /v1/query/segmentation
      - POST /v1/query/funnel
      - POST /v1/query/retention
    key_files:
      - internal/handler/auth.go
      - internal/handler/query.go
      - internal/handler/projects.go
      - internal/analytics/segmentation.go
      - internal/analytics/funnel.go
      - internal/analytics/retention.go
      - internal/auth/jwt.go
      - internal/middleware/jwt.go

  - id: worker
    path: apps/worker
    lang: go
    role: Kafka consumer, batches events, writes to ClickHouse (5000 events/flush)
    key_files:
      - internal/consumer/kafka.go
      - internal/writer/clickhouse.go

  - id: dashboard
    path: dashboard
    lang: typescript/nextjs
    port: 3000
    framework: Next.js 15 + TanStack Query + Recharts + Tailwind v4
    key_files:
      - src/app/(auth)/signup/page.tsx
      - src/app/onboarding/page.tsx
      - src/app/(dashboard)/charts/page.tsx
      - src/app/(dashboard)/funnels/page.tsx
      - src/app/(dashboard)/retention/page.tsx
      - src/lib/auth.ts
      - src/lib/api.ts

  - id: sdk-browser
    path: packages/sdk-browser
    lang: typescript
    exports: [init, track, identify, flush, reset]
    features: [auto-pageview, session-management, utm-capture, batch+retry]

  - id: sdk-node
    path: packages/sdk-node
    lang: typescript
    exports: [init, track, identify, flush, shutdown]
    features: [batch+retry, auto-flush-on-exit]

storage:
  - id: clickhouse
    port: 8123
    tables:
      - inspectuser.events          # main events table, MergeTree, partitioned by month
      - inspectuser.user_profiles   # ReplacingMergeTree
      - inspectuser.sessions        # ReplacingMergeTree
      - inspectuser.mv_daily_event_counts  # materialized view
    key_columns: [project_id, event_type, event_time, user_id]
    schema_file: infra/clickhouse/migrations/001_init.sql

  - id: postgres
    port: 5432
    tables:
      - organizations   # id, name, slug
      - users           # id, org_id, email, password_hash, role
      - projects        # id, org_id, name, api_key, secret_key
      - charts          # saved chart configs
      - dashboards      # dashboard layouts
      - cohorts         # cohort definitions
      - event_definitions  # taxonomy governance
    schema_file: infra/postgres/init.sql

  - id: kafka
    port: 9092
    topics:
      - events   # raw events from ingestion → worker
    library: franz-go (pure Go, no CGO)

  - id: redis
    port: 6379
    usage: API key cache — key: "apikey:<api_key>" → value: project_id

infra:
  compose: infra/docker-compose.yml
  env_file: infra/.env
  env_vars:
    - CLICKHOUSE_USER / CLICKHOUSE_PASSWORD / CLICKHOUSE_DB
    - POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB
    - KAFKA_BROKER / KAFKA_TOPIC / KAFKA_GROUP_ID
    - JWT_SECRET

multi_tenancy:
  model: every event row tagged with project_id
  auth_flow: api_key → Redis lookup → project_id → scoped writes/queries
  user_auth: JWT (HS256, 24h expiry)

known_issues:
  - Fiber v3 timeouts need time.Duration (e.g. 30*time.Second not 30)
  - Fiber v3 CORS config uses []string not string
  - ClickHouse TTL needs toDateTime(event_time) cast for DateTime64 columns
  - confluent-kafka-go requires CGO — use franz-go for static binaries
  - pnpm Docker builds need shamefully-hoist=true in .npmrc
  - NEXT_PUBLIC_* vars baked at build time in Next.js
