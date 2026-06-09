package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"

	"github.com/inspectuser/worker/config"
	"github.com/inspectuser/worker/internal/consumer"
	"github.com/inspectuser/worker/internal/writer"
	"go.uber.org/zap"
)

func main() {
	log, _ := zap.NewProduction()
	defer log.Sync()

	cfg := config.Load()

	chWriter, err := writer.NewClickHouseWriter(writer.ClickHouseConfig{
		Addr:     cfg.ClickHouseAddr,
		DB:       cfg.ClickHouseDB,
		User:     cfg.ClickHouseUser,
		Password: cfg.ClickHousePassword,
	}, log)
	if err != nil {
		log.Fatal("failed to connect to clickhouse", zap.Error(err))
	}

	c, err := consumer.NewConsumer(
		cfg.KafkaBroker,
		cfg.KafkaTopic,
		cfg.KafkaGroupID,
		chWriter,
		cfg.BatchSize,
		cfg.FlushIntervalMs,
		log,
	)
	if err != nil {
		log.Fatal("failed to create consumer", zap.Error(err))
	}

	ctx, cancel := context.WithCancel(context.Background())

	go func() {
		quit := make(chan os.Signal, 1)
		signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
		<-quit
		log.Info("shutting down worker")
		cancel()
	}()

	log.Info("worker started", zap.String("topic", cfg.KafkaTopic))
	c.Run(ctx)
}
