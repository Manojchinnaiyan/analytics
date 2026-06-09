package config

import "github.com/spf13/viper"

type Config struct {
	KafkaBroker        string
	KafkaTopic         string
	KafkaGroupID       string
	ClickHouseAddr     string
	ClickHouseDB       string
	ClickHouseUser     string
	ClickHousePassword string
	BatchSize          int
	FlushIntervalMs    int
}

func Load() *Config {
	viper.SetDefault("KAFKA_BROKER", "localhost:9092")
	viper.SetDefault("KAFKA_TOPIC", "events")
	viper.SetDefault("KAFKA_GROUP_ID", "inspectuser-worker")
	viper.SetDefault("CLICKHOUSE_ADDR", "localhost:9000")
	viper.SetDefault("CLICKHOUSE_DB", "inspectuser")
	viper.SetDefault("CLICKHOUSE_USER", "inspectuser")
	viper.SetDefault("CLICKHOUSE_PASSWORD", "change_me_in_production")
	viper.SetDefault("BATCH_SIZE", 5000)
	viper.SetDefault("FLUSH_INTERVAL_MS", 1000)
	viper.AutomaticEnv()

	return &Config{
		KafkaBroker:        viper.GetString("KAFKA_BROKER"),
		KafkaTopic:         viper.GetString("KAFKA_TOPIC"),
		KafkaGroupID:       viper.GetString("KAFKA_GROUP_ID"),
		ClickHouseAddr:     viper.GetString("CLICKHOUSE_ADDR"),
		ClickHouseDB:       viper.GetString("CLICKHOUSE_DB"),
		ClickHouseUser:     viper.GetString("CLICKHOUSE_USER"),
		ClickHousePassword: viper.GetString("CLICKHOUSE_PASSWORD"),
		BatchSize:          viper.GetInt("BATCH_SIZE"),
		FlushIntervalMs:    viper.GetInt("FLUSH_INTERVAL_MS"),
	}
}
