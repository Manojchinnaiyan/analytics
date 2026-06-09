# Amplitude Clone — CLAUDE.md

> Self-hosted Amplitude analytics platform. Multi-tenant. Go backends + Next.js dashboard + TypeScript SDKs.

## Architecture

```
Browser/Node SDK → Ingestion API (Go:4000) → Kafka → Worker (Go) → ClickHouse
                                                                          ↑
Dashboard (Next.js:3000) ←→ Query API (Go:4001) ──────────────────────────┘
                                    ↕
                              PostgreSQL + Redis
```

## Services & Ports

| Service    | Port | Language | Role |
|------------|------|----------|------|
| ingestion  | 4000 | Go/Fiber | Receives events, validates API key, pushes to Kafka |
| query      | 4001 | Go/Fiber | JWT auth, analytics queries, project/org CRUD |
| worker     | —    | Go       | Kafka consumer → ClickHouse batch writer |
| dashboard  | 3000 | Next.js 15 | React UI (login, onboarding, charts) |
| clickhouse | 8123/9000 | — | Events OLAP storage |
| postgres   | 5432 | — | Users, orgs, projects, dashboards |
| kafka      | 9092 | — | Event stream buffer |
| redis      | 6379 | — | API key → project_id cache |
| kafka-ui   | 8080 | — | Kafka topic inspector |

## Key File Paths

```
apps/ingestion/cmd/main.go          ← Fiber server, CORS, routes
apps/ingestion/internal/
  handler/events.go                 ← BatchIngest, Identify handlers
  kafka/producer.go                 ← franz-go producer
  middleware/auth.go                ← API key validation via Redis
  validator/event.go                ← BatchRequest struct + validation

apps/query/cmd/main.go              ← Fiber server, JWT middleware, all routes
apps/query/internal/
  handler/auth.go                   ← Signup (creates org+user+project), Login
  handler/query.go                  ← Segmentation, Funnel, Retention, FirstEvent
  handler/projects.go               ← Project/org CRUD + Redis seeding
  analytics/segmentation.go         ← ClickHouse SQL
  analytics/funnel.go               ← windowFunnel query
  analytics/retention.go            ← Cohort retention SQL
  auth/jwt.go                       ← GenerateToken, ParseToken
  middleware/jwt.go                 ← JWTAuth fiber middleware

apps/worker/cmd/main.go             ← Consumer runner
apps/worker/internal/
  consumer/kafka.go                 ← franz-go consumer, batch flush
  writer/clickhouse.go              ← Batch INSERT to inspectuser.events

dashboard/src/
  app/(auth)/login/page.tsx         ← Login page
  app/(auth)/signup/page.tsx        ← Signup → redirects to /onboarding
  app/(dashboard)/charts/page.tsx   ← Segmentation UI
  app/(dashboard)/funnels/page.tsx  ← Funnel UI
  app/(dashboard)/retention/page.tsx← Retention heatmap
  app/onboarding/page.tsx           ← 3-step onboarding wizard
  lib/auth.ts                       ← authApi, saveToken, getToken
  lib/api.ts                        ← queryApi for analytics endpoints
  components/charts/                ← SegmentationChart, FunnelChart, RetentionChart

packages/sdk-browser/src/index.ts   ← init, track, identify, flush
packages/sdk-node/src/index.ts      ← Node.js SDK with auto-flush on exit

infra/
  docker-compose.yml                ← All services, reads from infra/.env
  .env                              ← Secrets (never committed)
  clickhouse/migrations/001_init.sql← events, user_profiles, sessions tables
  postgres/init.sql                 ← organizations, users, projects tables
```

## Common Commands

```bash
# Start all infra + services
cd infra && docker compose up -d

# Full rebuild (after code changes)
cd infra && docker compose up -d --build

# Rebuild specific service only
cd infra && docker compose up -d --build query

# View logs
docker logs inspectuser_query -f
docker logs inspectuser_ingestion -f
docker logs inspectuser_worker -f

# Run ClickHouse query
curl "http://localhost:8123/?query=SELECT+count(*)+FROM+inspectuser.events" \
  -u "amplitude:change_me_in_production"

# Test signup
curl -X POST http://localhost:4001/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"x@x.com","password":"pass1234","name":"X","org_name":"X Co","org_slug":"xco"}'
```

## API Routes

### Ingestion (port 4000)
```
GET  /health
POST /v2/httpapi      body: {api_key, events[]}   — batch ingest
POST /identify        body: {api_key, events[]}   — user identify
```

### Query (port 4001)
```
GET  /health
POST /v1/auth/signup                              — creates org+user+project, returns api_key
POST /v1/auth/login                               — returns token+api_key
POST /v1/orgs                    [JWT]            — create org
POST /v1/projects                [JWT]            — create project, seeds Redis
GET  /v1/projects/:id            [JWT]            — get project
GET  /v1/projects/:id/events/first [JWT]          — onboarding: poll for first event
POST /v1/query/segmentation      [JWT]            — event counts/uniques over time
POST /v1/query/funnel            [JWT]            — funnel conversion
POST /v1/query/retention         [JWT]            — cohort retention
```

## Env Vars (infra/.env)

```
CLICKHOUSE_USER / CLICKHOUSE_PASSWORD / CLICKHOUSE_DB
POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB
KAFKA_BROKER / KAFKA_TOPIC / KAFKA_GROUP_ID
JWT_SECRET
```

Services read these via `viper.AutomaticEnv()`.

## Multi-tenancy

Every event row has `project_id`. Every query is scoped to `project_id`.  
`api_key → project_id` mapping lives in Redis (`apikey:<key>` → `<uuid>`).  
Seeded on project create and on every login.

## Known Gotchas

- Fiber v3 timeouts are `time.Duration` — always use `30 * time.Second`, not `30`
- Fiber v3 CORS config uses `[]string`, not `string`
- ClickHouse TTL requires `toDateTime(event_time)` cast, not raw `DateTime64`
- `confluent-kafka-go` needs CGO — use `franz-go` for static binaries
- pnpm in Docker needs `.npmrc` with `shamefully-hoist=true` + `node-linker=hoisted`
- `NEXT_PUBLIC_*` vars are baked at build time in Next.js, not runtime
