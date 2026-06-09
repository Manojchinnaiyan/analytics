package main

import (
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/inspectuser/ingestion/config"
	"github.com/inspectuser/ingestion/internal/geo"
	"github.com/inspectuser/ingestion/internal/handler"
	kafkapkg "github.com/inspectuser/ingestion/internal/kafka"
	"github.com/inspectuser/ingestion/internal/middleware"
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/compress"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/limiter"
	"github.com/gofiber/fiber/v3/middleware/logger"
	"github.com/gofiber/fiber/v3/middleware/recover"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

func main() {
	log, _ := zap.NewProduction()
	defer log.Sync()

	cfg := config.Load()

	rdb := redis.NewClient(&redis.Options{Addr: cfg.RedisAddr})

	producer, err := kafkapkg.NewProducer(cfg.KafkaBroker, cfg.KafkaTopic, log)
	if err != nil {
		log.Fatal("failed to create kafka producer", zap.Error(err))
	}
	defer producer.Close()

	app := fiber.New(fiber.Config{
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		BodyLimit:    10 * 1024 * 1024,
		// We sit behind Caddy, which sets X-Forwarded-For — so c.IP() returns the
		// real visitor IP (needed for accurate GeoIP), not Caddy's internal IP.
		ProxyHeader: fiber.HeaderXForwardedFor,
	})

	app.Use(recover.New())
	app.Use(logger.New())
	app.Use(compress.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "X-API-Key"},
		AllowCredentials: false,
		MaxAge:           86400,
	}))

	auth := middleware.NewAuth(rdb)

	geoResolver, gerr := geo.New(cfg.GeoIPDBPath)
	if gerr != nil {
		log.Warn("geoip db failed to load; geo enrichment disabled", zap.String("path", cfg.GeoIPDBPath), zap.Error(gerr))
		geoResolver, _ = geo.New("")
	} else if geoResolver.Enabled() {
		log.Info("geoip enrichment enabled", zap.String("db", cfg.GeoIPDBPath))
	}
	defer geoResolver.Close()

	eventHandler := handler.NewEventHandler(producer, rdb, geoResolver, log)
	redirectHandler := handler.NewRedirectHandler(rdb, log)
	flagEvalHandler := handler.NewFlagEvalHandler(rdb, producer, log)

	// Public
	app.Get("/health", handler.Health)
	app.Get("/go/:slug", redirectHandler.Go) // smart-link redirect (legacy path)
	app.Get("/:slug", redirectHandler.Go)     // clean root-level short link (go.<domain>/<slug>)

	// Per-IP rate limit on ingestion (SDKs batch, so this is generous for
	// legitimate use but caps abusive floods).
	ingestLimiter := limiter.New(limiter.Config{
		Max:        600,
		Expiration: time.Minute,
		KeyGenerator: func(c fiber.Ctx) string {
			if k := c.Get("X-API-Key"); k != "" {
				return k
			}
			return c.IP()
		},
		LimitReached: func(c fiber.Ctx) error {
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{"error": "rate limit exceeded"})
		},
	})

	// Protected — requires valid api_key
	tracked := app.Group("/", ingestLimiter, auth.ValidateAPIKey)
	tracked.Post("/v2/httpapi", eventHandler.BatchIngest)
	tracked.Post("/identify", eventHandler.Identify)
	tracked.Post("/v1/flags", flagEvalHandler.Evaluate)
	tracked.Get("/v1/flags/config", flagEvalHandler.Config)

	go func() {
		if err := app.Listen(":" + cfg.Port); err != nil {
			log.Fatal("server error", zap.Error(err))
		}
	}()

	log.Info("ingestion service started", zap.String("port", cfg.Port))

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info("shutting down ingestion service")
	app.Shutdown()
}
