package main

import (
	"context"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/inspectuser/query/config"
	"github.com/inspectuser/query/internal/alerts"
	"github.com/inspectuser/query/internal/handler"
	"github.com/inspectuser/query/internal/mailer"
	"github.com/inspectuser/query/internal/middleware"
	"github.com/inspectuser/query/internal/perms"
	"github.com/inspectuser/query/internal/replay"
	"github.com/inspectuser/query/internal/warehouse"
	"github.com/gofiber/fiber/v3"
	fibercompress "github.com/gofiber/fiber/v3/middleware/compress"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/logger"
	"github.com/gofiber/fiber/v3/middleware/recover"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

func main() {
	log, _ := zap.NewProduction()
	defer log.Sync()

	cfg := config.Load()

	// Fail fast on a weak/placeholder JWT secret: it signs every tenant's
	// session, so a guessable value lets anyone forge an owner token for any
	// org. Refuse to boot unless it's a strong, non-default value.
	if reason := weakJWTSecret(cfg.JWTSecret); reason != "" {
		log.Fatal("insecure JWT_SECRET — refusing to start",
			zap.String("reason", reason),
			zap.String("fix", "set JWT_SECRET to a random value, e.g. `openssl rand -hex 32`"))
	}

	// ClickHouse
	chConn, err := clickhouse.Open(&clickhouse.Options{
		Addr: []string{cfg.ClickHouseAddr},
		Auth: clickhouse.Auth{
			Database: cfg.ClickHouseDB,
			Username: cfg.ClickHouseUser,
			Password: cfg.ClickHousePassword,
		},
		MaxOpenConns:    20,
		MaxIdleConns:    10,
		ConnMaxLifetime: time.Hour,
		Compression:     &clickhouse.Compression{Method: clickhouse.CompressionLZ4},
	})
	if err != nil {
		log.Fatal("failed to connect to clickhouse", zap.Error(err))
	}

	// PostgreSQL
	db, err := pgxpool.New(context.Background(), cfg.PostgresDSN)
	if err != nil {
		log.Fatal("failed to connect to postgres", zap.Error(err))
	}
	defer db.Close()

	// Ensure the smart-links table exists (works on existing DBs too).
	if _, err := db.Exec(context.Background(), `
		CREATE TABLE IF NOT EXISTS links (
			id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			project_id UUID,
			name       VARCHAR(255) NOT NULL,
			slug       VARCHAR(64) UNIQUE NOT NULL,
			config     JSONB NOT NULL DEFAULT '{}',
			created_at TIMESTAMPTZ DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_links_project ON links(project_id);
	`); err != nil {
		log.Warn("could not ensure links table", zap.Error(err))
	}

	// Ensure the chart annotations table exists.
	if _, err := db.Exec(context.Background(), `
		CREATE TABLE IF NOT EXISTS annotations (
			id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			project_id UUID,
			date       DATE NOT NULL,
			label      VARCHAR(255) NOT NULL,
			created_at TIMESTAMPTZ DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_annotations_project ON annotations(project_id);
	`); err != nil {
		log.Warn("could not ensure annotations table", zap.Error(err))
	}

	// Ensure the alert rule + notification tables exist.
	if _, err := db.Exec(context.Background(), `
		CREATE TABLE IF NOT EXISTS alerts (
			id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			project_id        UUID,
			name              VARCHAR(255) NOT NULL,
			event_type        VARCHAR(255) NOT NULL,
			metric            VARCHAR(32) NOT NULL DEFAULT 'count',
			window_minutes    INT NOT NULL DEFAULT 60,
			operator          VARCHAR(8) NOT NULL DEFAULT 'above',
			threshold         DOUBLE PRECISION NOT NULL DEFAULT 0,
			webhook_url       TEXT DEFAULT '',
			enabled           BOOLEAN DEFAULT true,
			is_triggered      BOOLEAN DEFAULT false,
			last_value        DOUBLE PRECISION DEFAULT 0,
			last_checked_at   TIMESTAMPTZ,
			last_triggered_at TIMESTAMPTZ,
			created_at        TIMESTAMPTZ DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_alerts_project ON alerts(project_id);
		CREATE TABLE IF NOT EXISTS alert_events (
			id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			alert_id   UUID,
			project_id UUID,
			value      DOUBLE PRECISION,
			threshold  DOUBLE PRECISION,
			message    TEXT,
			created_at TIMESTAMPTZ DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_alert_events_project ON alert_events(project_id);
	`); err != nil {
		log.Warn("could not ensure alerts tables", zap.Error(err))
	}

	// Ensure the feature-flag / experiment table exists.
	if _, err := db.Exec(context.Background(), `
		CREATE TABLE IF NOT EXISTS feature_flags (
			id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			project_id  UUID,
			key         VARCHAR(255) NOT NULL,
			name        VARCHAR(255) NOT NULL,
			description TEXT,
			enabled     BOOLEAN DEFAULT true,
			rollout     INT DEFAULT 100,
			holdout     INT DEFAULT 0,
			variants    JSONB NOT NULL DEFAULT '[{"key":"control","weight":50},{"key":"treatment","weight":50}]',
			goal_event  VARCHAR(255) DEFAULT '',
			created_at  TIMESTAMPTZ DEFAULT NOW(),
			updated_at  TIMESTAMPTZ DEFAULT NOW(),
			UNIQUE(project_id, key)
		);
		CREATE INDEX IF NOT EXISTS idx_feature_flags_project ON feature_flags(project_id);
		ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS holdout INT DEFAULT 0;
		ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS targeting JSONB DEFAULT '[]';
		ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS exclusion_group VARCHAR(255) DEFAULT '';
		ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS prereq_flag VARCHAR(255) DEFAULT '';
		ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS prereq_variant VARCHAR(255) DEFAULT '';
	`); err != nil {
		log.Warn("could not ensure feature_flags table", zap.Error(err))
	}

	// Ensure the derived-properties table exists.
	if _, err := db.Exec(context.Background(), `
		CREATE TABLE IF NOT EXISTS derived_properties (
			id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			project_id      UUID,
			name            VARCHAR(255) NOT NULL,
			source_property VARCHAR(255) NOT NULL,
			source_type     VARCHAR(32) DEFAULT 'event',
			transform       VARCHAR(64) NOT NULL,
			config          TEXT DEFAULT '',
			created_at      TIMESTAMPTZ DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_derived_props_project ON derived_properties(project_id);
	`); err != nil {
		log.Warn("could not ensure derived_properties table", zap.Error(err))
	}

	// Usage metering: per-project monthly event cap (0 = unlimited).
	if _, err := db.Exec(context.Background(),
		`ALTER TABLE projects ADD COLUMN IF NOT EXISTS event_limit BIGINT DEFAULT 0;`); err != nil {
		log.Warn("could not add projects.event_limit", zap.Error(err))
	}

	// Reporting timezone — day boundaries (DAU, daily trends) use this so metrics
	// align to the product's local day, not UTC. Default UTC.
	if _, err := db.Exec(context.Background(),
		`ALTER TABLE projects ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) DEFAULT 'UTC';`); err != nil {
		log.Warn("could not add projects.timezone", zap.Error(err))
	}

	// Web analytics goals (Plausible-style conversions: an event or a page path).
	if _, err := db.Exec(context.Background(), `
		CREATE TABLE IF NOT EXISTS web_goals (
			id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			project_id UUID NOT NULL,
			name       TEXT NOT NULL,
			type       VARCHAR(8) NOT NULL DEFAULT 'event',
			match      TEXT NOT NULL,
			created_at TIMESTAMPTZ DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_web_goals_project ON web_goals(project_id);
	`); err != nil {
		log.Warn("could not ensure web_goals table", zap.Error(err))
	}

	// SSO (OIDC) config per org.
	if _, err := db.Exec(context.Background(), `
		CREATE TABLE IF NOT EXISTS sso_configs (
			org_id        UUID PRIMARY KEY,
			issuer        TEXT NOT NULL,
			client_id     TEXT NOT NULL,
			client_secret TEXT,
			enabled       BOOLEAN DEFAULT true,
			updated_at    TIMESTAMPTZ DEFAULT NOW()
		);
	`); err != nil {
		log.Warn("could not ensure sso_configs table", zap.Error(err))
	}

	// Warehouse export destinations (incremental events → S3-compatible store).
	if _, err := db.Exec(context.Background(), `
		CREATE TABLE IF NOT EXISTS warehouse_exports (
			id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			project_id       UUID NOT NULL,
			endpoint         TEXT NOT NULL,
			bucket           TEXT NOT NULL,
			prefix           TEXT DEFAULT 'events',
			access_key       TEXT,
			secret_key       TEXT,
			interval_minutes INT DEFAULT 60,
			last_cursor      TIMESTAMPTZ DEFAULT '1970-01-01T00:00:00Z',
			last_run         TIMESTAMPTZ,
			last_status      TEXT DEFAULT '',
			rows_exported    BIGINT DEFAULT 0,
			enabled          BOOLEAN DEFAULT true,
			created_at       TIMESTAMPTZ DEFAULT NOW()
		);
	`); err != nil {
		log.Warn("could not ensure warehouse_exports table", zap.Error(err))
	}

	// Taxonomy: per-event expected-property schema (tracking-plan governance).
	if _, err := db.Exec(context.Background(),
		`ALTER TABLE event_definitions ADD COLUMN IF NOT EXISTS expected_properties TEXT DEFAULT '';`); err != nil {
		log.Warn("could not add event_definitions.expected_properties", zap.Error(err))
	}

	// Alerts: support a baseline "change vs prior period" mode (default threshold).
	if _, err := db.Exec(context.Background(),
		`ALTER TABLE alerts ADD COLUMN IF NOT EXISTS mode VARCHAR(16) DEFAULT 'threshold';`); err != nil {
		log.Warn("could not add alerts.mode", zap.Error(err))
	}

	// Audit log: every state-changing admin/config action (who/what/status/ip).
	if _, err := db.Exec(context.Background(), `
		CREATE TABLE IF NOT EXISTS audit_logs (
			id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			org_id     UUID NOT NULL,
			actor_id   UUID,
			method     VARCHAR(8),
			path       TEXT,
			status     INT,
			ip         VARCHAR(64),
			created_at TIMESTAMPTZ DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_logs(org_id, created_at DESC);
	`); err != nil {
		log.Warn("could not ensure audit_logs table", zap.Error(err))
	}

	// Feature definitions: a named "feature" = a set of events (Amplitude-style).
	if _, err := db.Exec(context.Background(), `
		CREATE TABLE IF NOT EXISTS feature_definitions (
			id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			project_id UUID NOT NULL,
			name       VARCHAR(255) NOT NULL,
			events     TEXT[] NOT NULL DEFAULT '{}',
			created_at TIMESTAMPTZ DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_feature_defs_project ON feature_definitions(project_id);
	`); err != nil {
		log.Warn("could not ensure feature_definitions table", zap.Error(err))
	}

	// Team permissions: per-member overrides on top of role defaults, plus a
	// pending-invite table for the email/link invite flow.
	if _, err := db.Exec(context.Background(), `
		ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB;
		CREATE TABLE IF NOT EXISTS invites (
			id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			org_id      UUID NOT NULL,
			email       VARCHAR(255) NOT NULL,
			name        VARCHAR(255) DEFAULT '',
			role        VARCHAR(50)  NOT NULL DEFAULT 'member',
			permissions JSONB,
			token       VARCHAR(255) UNIQUE NOT NULL,
			invited_by  UUID,
			status      VARCHAR(20)  NOT NULL DEFAULT 'pending',
			expires_at  TIMESTAMPTZ  NOT NULL,
			created_at  TIMESTAMPTZ  DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_invites_org ON invites(org_id);
		CREATE INDEX IF NOT EXISTS idx_invites_token ON invites(token);
	`); err != nil {
		log.Warn("could not ensure team-permission schema", zap.Error(err))
	}

	// Ensure the saved-queries table exists (SQL/Notebooks).
	if _, err := db.Exec(context.Background(), `
		CREATE TABLE IF NOT EXISTS saved_queries (
			id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			project_id UUID,
			name       VARCHAR(255) NOT NULL,
			query      TEXT NOT NULL,
			created_at TIMESTAMPTZ DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_saved_queries_project ON saved_queries(project_id);
	`); err != nil {
		log.Warn("could not ensure saved_queries table", zap.Error(err))
	}

	// Redis
	rdb := redis.NewClient(&redis.Options{Addr: cfg.RedisAddr})

	app := fiber.New(fiber.Config{
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		// Session-replay full snapshots of heavy pages can be large; default 4MB
		// would reject them. Allow up to 32MB per /replay batch.
		BodyLimit: 32 * 1024 * 1024,
	})

	app.Use(recover.New())
	app.Use(logger.New())
	app.Use(fibercompress.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "X-API-Key"},
		AllowCredentials: false,
		MaxAge:           86400,
	}))

	app.Get("/health", handler.Health)

	// Auth routes (public)
	mail := mailer.New(cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUser, cfg.SMTPPass, cfg.SMTPFrom)
	authHandler := handler.NewAuthHandler(db, rdb, cfg.JWTSecret, mail, cfg.AppURL, cfg.AdminEmail, log)
	authRoutes := app.Group("/v1/auth")
	authRoutes.Post("/signup", authHandler.Signup)
	authRoutes.Post("/login", authHandler.Login)
	authRoutes.Post("/forgot", authHandler.ForgotPassword)
	authRoutes.Post("/reset", authHandler.ResetPassword)

	// SSO (OIDC) — start + callback are public; config is admin-only (below).
	ssoHandler := handler.NewSSOHandler(db, rdb, cfg.JWTSecret, cfg.AppURL, cfg.APIURL, log)
	authRoutes.Get("/sso/start", ssoHandler.Start)
	authRoutes.Get("/sso/callback", ssoHandler.Callback)

	// Protected routes
	protected := app.Group("/v1", middleware.JWTAuth(cfg.JWTSecret), middleware.AuditLog(db), middleware.ProjectAuthz(db, rdb), middleware.QueryCache(rdb, 30*time.Second, log))

	protected.Get("/me", authHandler.Me)
	protected.Post("/auth/refresh", authHandler.Refresh)
	protected.Get("/orgs/sso", middleware.RequirePerm(db, rdb, perms.SettingsManage), ssoHandler.GetConfig)
	protected.Put("/orgs/sso", middleware.RequirePerm(db, rdb, perms.SettingsManage), ssoHandler.SetConfig)

	projectHandler := handler.NewProjectHandler(db, rdb, log)
	protected.Post("/orgs", projectHandler.CreateOrg)
	protected.Get("/projects", projectHandler.List)
	protected.Post("/projects", middleware.RequirePerm(db, rdb, perms.ProjectCreate), projectHandler.Create)
	protected.Get("/projects/:id", projectHandler.Get)
	protected.Put("/projects/:id/usage/limit", middleware.RequirePerm(db, rdb, perms.BillingManage), projectHandler.SetUsageLimit)
	protected.Put("/projects/:id/timezone", middleware.RequirePerm(db, rdb, perms.SettingsManage), projectHandler.SetTimezone)

	queryHandler := handler.NewQueryHandler(chConn, db, log)
	protected.Get("/projects/:id/usage", queryHandler.Usage)

	gdprHandler := handler.NewGDPRHandler(chConn, rdb, log)
	protected.Post("/projects/:id/gdpr/export", middleware.RequirePerm(db, rdb, perms.DataExport), gdprHandler.Export)
	protected.Post("/projects/:id/gdpr/delete", middleware.RequirePerm(db, rdb, perms.DataDelete), gdprHandler.Delete)
	protected.Post("/query/segmentation", queryHandler.Segmentation)
	protected.Post("/query/funnel", queryHandler.Funnel)
	protected.Post("/query/retention", queryHandler.Retention)
	protected.Post("/query/paths", queryHandler.Paths)
	protected.Post("/query/formula", queryHandler.Formula)
	protected.Post("/query/onboarding", queryHandler.Onboarding)
	protected.Get("/projects/:id/events/first", queryHandler.FirstEvent)
	protected.Get("/projects/:id/events/types", queryHandler.EventTypes)
	protected.Get("/projects/:id/properties", queryHandler.Properties)
	protected.Get("/projects/:id/properties/detail", queryHandler.PropertyDetail)

	derivedHandler := handler.NewDerivedHandler(db, log)
	protected.Get("/projects/:id/derived", derivedHandler.List)
	protected.Post("/projects/:id/derived", derivedHandler.Create)
	protected.Delete("/projects/:id/derived/:derivedId", derivedHandler.Delete)
	protected.Get("/projects/:id/overview", queryHandler.Overview)

	userHandler := handler.NewUserHandler(chConn, log)
	protected.Get("/projects/:id/users", userHandler.List)
	protected.Get("/projects/:id/users/:userId", userHandler.Profile)

	attributionHandler := handler.NewAttributionHandler(chConn, log)
	protected.Get("/projects/:id/attribution", attributionHandler.Attribution)

	productHandler := handler.NewProductHandler(chConn, db, log)
	protected.Get("/projects/:id/product-overview", productHandler.ProductOverview)
	protected.Get("/projects/:id/feature-engagement", productHandler.FeatureEngagement)
	protected.Get("/projects/:id/feature-retention", productHandler.FeatureRetention)
	protected.Get("/projects/:id/features", productHandler.ListFeatures)
	protected.Post("/projects/:id/features", middleware.RequirePerm(db, rdb, perms.SettingsManage), productHandler.CreateFeature)
	protected.Delete("/projects/:id/features/:featureId", middleware.RequirePerm(db, rdb, perms.SettingsManage), productHandler.DeleteFeature)
	protected.Get("/projects/:id/events/live", productHandler.LiveEvents)
	protected.Get("/projects/:id/lifecycle", productHandler.Lifecycle)
	protected.Get("/projects/:id/web-analytics", productHandler.WebAnalytics)
	protected.Get("/projects/:id/web/goals", productHandler.WebGoals)
	protected.Get("/projects/:id/web/vitals", productHandler.WebVitals)
	protected.Get("/projects/:id/web/engagement", productHandler.WebEngagement)
	protected.Post("/projects/:id/web/goals", middleware.RequirePerm(db, rdb, perms.SettingsManage), productHandler.CreateWebGoal)
	protected.Delete("/projects/:id/web/goals/:goalId", middleware.RequirePerm(db, rdb, perms.SettingsManage), productHandler.DeleteWebGoal)
	protected.Get("/projects/:id/revenue", productHandler.Revenue)

	// Ecommerce section — store KPIs, shopping funnel, product rankings.
	ecommerceHandler := handler.NewEcommerceHandler(chConn, log)
	protected.Get("/projects/:id/ecommerce/overview", ecommerceHandler.Overview)
	protected.Get("/projects/:id/ecommerce/products", ecommerceHandler.Products)

	cohortHandler := handler.NewCohortHandler(db, chConn, log)
	protected.Get("/projects/:id/cohorts", cohortHandler.List)
	protected.Post("/projects/:id/cohorts", cohortHandler.Create)
	protected.Delete("/projects/:id/cohorts/:cohortId", cohortHandler.Delete)

	dashboardHandler := handler.NewDashboardHandler(db, chConn, log)
	protected.Get("/projects/:id/dashboard", dashboardHandler.List)
	protected.Post("/projects/:id/dashboard/charts", dashboardHandler.SaveChart)
	protected.Delete("/projects/:id/dashboard/charts/:chartId", dashboardHandler.DeleteChart)
	protected.Get("/projects/:id/dashboard/share", dashboardHandler.GetShare)
	protected.Post("/projects/:id/dashboard/share", dashboardHandler.EnableShare)
	protected.Delete("/projects/:id/dashboard/share", dashboardHandler.DisableShare)

	linkHandler := handler.NewLinkHandler(db, rdb, log)
	protected.Get("/projects/:id/links", linkHandler.List)
	protected.Post("/projects/:id/links", linkHandler.Create)
	protected.Delete("/projects/:id/links/:linkId", linkHandler.Delete)

	teamHandler := handler.NewTeamHandler(db, rdb, log)
	protected.Get("/team", middleware.RequirePerm(db, rdb, perms.TeamView), teamHandler.List)
	protected.Post("/team", middleware.RequirePerm(db, rdb, perms.TeamManage), teamHandler.Create)
	protected.Put("/team/:userId", middleware.RequirePerm(db, rdb, perms.TeamManage), teamHandler.UpdateRole)
	protected.Put("/team/:userId/permissions", middleware.RequirePerm(db, rdb, perms.TeamManage), teamHandler.SetPermissions)
	protected.Delete("/team/:userId", middleware.RequirePerm(db, rdb, perms.TeamManage), teamHandler.Delete)

	auditHandler := handler.NewAuditHandler(db, log)
	protected.Get("/audit", middleware.RequirePerm(db, rdb, perms.TeamManage), auditHandler.List)

	inviteHandler := handler.NewInviteHandler(db, rdb, mail, cfg.JWTSecret, cfg.AppURL, log)
	protected.Post("/team/invite", middleware.RequirePerm(db, rdb, perms.TeamManage), inviteHandler.Create)
	protected.Get("/team/invites", middleware.RequirePerm(db, rdb, perms.TeamView), inviteHandler.List)
	protected.Delete("/team/invites/:id", middleware.RequirePerm(db, rdb, perms.TeamManage), inviteHandler.Revoke)
	// Public accept flow (no JWT) — kept off the /v1 prefix so the JWT group
	// middleware doesn't intercept it, mirroring /replay.
	app.Get("/invite/:token", inviteHandler.Lookup)
	app.Post("/invite/:token/accept", inviteHandler.Accept)

	taxonomyHandler := handler.NewTaxonomyHandler(chConn, db, rdb, log)
	protected.Get("/projects/:id/taxonomy", taxonomyHandler.List)
	protected.Put("/projects/:id/taxonomy", taxonomyHandler.Upsert)

	annotationHandler := handler.NewAnnotationHandler(db, log)
	protected.Get("/projects/:id/annotations", annotationHandler.List)
	protected.Post("/projects/:id/annotations", annotationHandler.Create)
	protected.Delete("/projects/:id/annotations/:annId", annotationHandler.Delete)

	alertHandler := handler.NewAlertHandler(db, log)
	protected.Get("/projects/:id/alerts", alertHandler.List)
	protected.Post("/projects/:id/alerts", alertHandler.Create)
	protected.Put("/projects/:id/alerts/:alertId", alertHandler.Update)
	protected.Delete("/projects/:id/alerts/:alertId", alertHandler.Delete)
	protected.Get("/projects/:id/alerts/events", alertHandler.Events)

	sqlHandler := handler.NewSQLHandler(chConn, db, log)
	protected.Post("/projects/:id/sql", middleware.RequirePerm(db, rdb, perms.SQLRun), sqlHandler.Run)
	protected.Get("/projects/:id/sql/saved", sqlHandler.ListSaved)
	protected.Post("/projects/:id/sql/saved", middleware.RequirePerm(db, rdb, perms.SQLRun), sqlHandler.Save)
	protected.Delete("/projects/:id/sql/saved/:queryId", middleware.RequirePerm(db, rdb, perms.SQLRun), sqlHandler.DeleteSaved)

	flagHandler := handler.NewFlagHandler(db, rdb, chConn, log)
	protected.Get("/projects/:id/flags", flagHandler.List)
	protected.Post("/projects/:id/flags", middleware.RequirePerm(db, rdb, perms.FlagsManage), flagHandler.Create)
	protected.Put("/projects/:id/flags/:flagId", middleware.RequirePerm(db, rdb, perms.FlagsManage), flagHandler.Update)
	protected.Delete("/projects/:id/flags/:flagId", middleware.RequirePerm(db, rdb, perms.FlagsManage), flagHandler.Delete)
	protected.Get("/projects/:id/flags/:flagId/results", flagHandler.Results)

	// Session replay: ClickHouse store for rrweb recordings.
	if err := chConn.Exec(context.Background(), `
		CREATE TABLE IF NOT EXISTS inspectuser.session_replays (
			project_id  String,
			session_id  String,
			distinct_id String,
			event_time  DateTime64(3, 'UTC') DEFAULT now64(),
			events      String
		) ENGINE = MergeTree ORDER BY (project_id, session_id, event_time)
	`); err != nil {
		log.Warn("could not ensure session_replays table", zap.Error(err))
	}
	replayStore := replay.New(chConn, cfg.R2Endpoint, cfg.R2AccessKey, cfg.R2SecretKey, cfg.R2Bucket, log)
	replayHandler := handler.NewReplayHandler(replayStore, rdb, log)
	app.Post("/replay", replayHandler.Ingest) // api-key auth, outside the /v1 JWT prefix
	app.Get("/public/dashboard/:token", dashboardHandler.PublicDashboard) // no-auth public read-only dashboard

	// Shopify App: OAuth install + auto-provision + Web Pixel + compliance webhooks.
	// Public routes (HMAC-verified), only mounted when app credentials are set.
	shopifyHandler := handler.NewShopifyHandler(db, rdb, cfg.JWTSecret, cfg.ShopifyAPIKey, cfg.ShopifyAPISecret, cfg.ShopifyScopes, cfg.AppURL, cfg.APIURL, cfg.IngestURL, log)
	if shopifyHandler.Configured() {
		app.Get("/shopify/install", shopifyHandler.Install)
		app.Get("/shopify/callback", shopifyHandler.Callback)
		// Reached via the Shopify App Proxy (storefront /apps/inspectuser/config);
		// Config verifies the proxy signature so the ingest key isn't enumerable.
		app.Get("/shopify/proxy/config", shopifyHandler.Config)
		app.Post("/shopify/webhooks/app/uninstalled", shopifyHandler.WebhookUninstalled)
		app.Post("/shopify/webhooks/customers/data_request", shopifyHandler.WebhookGDPR)
		app.Post("/shopify/webhooks/customers/redact", shopifyHandler.WebhookGDPR)
		app.Post("/shopify/webhooks/shop/redact", shopifyHandler.WebhookGDPR)
		log.Info("shopify app routes enabled")
	}
	// Dashboard "Integrations" UI — always available (degrade gracefully if the
	// app credentials aren't set).
	protected.Get("/shopify/connections", shopifyHandler.Connections)
	protected.Post("/shopify/connect", shopifyHandler.ConnectURL)
	protected.Get("/projects/:id/replays", replayHandler.List)
	protected.Get("/projects/:id/replays/:sessionId", replayHandler.Get)
	protected.Delete("/projects/:id/replays/:sessionId", middleware.RequirePerm(db, rdb, perms.ReplayManage), replayHandler.Delete)

	// Heatmaps: click-density + scroll reach, with a replay snapshot as the page
	// background (needs the replay store, created above).
	heatmapHandler := handler.NewHeatmapHandler(chConn, replayStore, log)
	protected.Get("/projects/:id/heatmap", heatmapHandler.Heatmap)
	protected.Get("/projects/:id/heatmap/snapshot", heatmapHandler.Snapshot)

	// Retention: purge recordings older than 30 days every 6 hours.
	go func() {
		t := time.NewTicker(6 * time.Hour)
		defer t.Stop()
		for range t.C {
			rctx, rcancel := context.WithTimeout(context.Background(), 2*time.Minute)
			if err := replayStore.Cleanup(rctx, time.Now().AddDate(0, 0, -30)); err != nil {
				log.Warn("replay retention cleanup failed", zap.Error(err))
			}
			rcancel()
		}
	}()

	// Background alert evaluator (ticks every minute).
	go alerts.NewEvaluator(db, chConn, log).Run(context.Background())

	// Warehouse export: incremental NDJSON → S3-compatible store, on a schedule.
	whExporter := warehouse.New(db, chConn, log)
	go whExporter.Run(context.Background())
	warehouseHandler := handler.NewWarehouseHandler(db, whExporter, log)
	protected.Get("/projects/:id/exports", middleware.RequirePerm(db, rdb, perms.SettingsManage), warehouseHandler.List)
	protected.Post("/projects/:id/exports", middleware.RequirePerm(db, rdb, perms.SettingsManage), warehouseHandler.Create)
	protected.Post("/projects/:id/exports/:exportId/run", middleware.RequirePerm(db, rdb, perms.SettingsManage), warehouseHandler.RunNow)
	protected.Delete("/projects/:id/exports/:exportId", middleware.RequirePerm(db, rdb, perms.SettingsManage), warehouseHandler.Delete)

	go func() {
		if err := app.Listen(":" + cfg.Port); err != nil {
			log.Fatal("server error", zap.Error(err))
		}
	}()

	log.Info("query service started", zap.String("port", cfg.Port))

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info("shutting down query service")
	app.Shutdown()
}

// knownWeakSecrets are placeholder values shipped in defaults/examples; a
// deployment that still uses one is effectively unauthenticated.
var knownWeakSecrets = map[string]bool{
	"change_me_in_production":                          true,
	"change_me_in_production_use_a_long_random_string": true,
	"secret":       true,
	"changeme":     true,
	"your-secret":  true,
	"jwt_secret":   true,
}

// weakJWTSecret returns a non-empty reason if the secret is unsafe to run with.
func weakJWTSecret(s string) string {
	if s == "" {
		return "JWT_SECRET is empty"
	}
	if knownWeakSecrets[strings.ToLower(strings.TrimSpace(s))] {
		return "JWT_SECRET is a known placeholder value"
	}
	if len(s) < 32 {
		return "JWT_SECRET is shorter than 32 bytes"
	}
	return ""
}
