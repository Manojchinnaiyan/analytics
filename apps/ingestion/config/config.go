package config

import "github.com/spf13/viper"

type Config struct {
	Port        string
	KafkaBroker string
	KafkaTopic  string
	RedisAddr   string
	PostgresDSN string
	GeoIPDBPath string // path to a MaxMind/DB-IP .mmdb; empty = geo enrichment off
}

func Load() *Config {
	viper.SetDefault("PORT", "4000")
	viper.SetDefault("KAFKA_BROKER", "localhost:9092")
	viper.SetDefault("KAFKA_TOPIC", "events")
	viper.SetDefault("REDIS_ADDR", "localhost:6379")
	viper.SetDefault("POSTGRES_DSN", "postgres://inspectuser:inspectuser_secret@localhost:5432/inspectuser?sslmode=disable")
	viper.SetDefault("GEOIP_DB_PATH", "")
	viper.AutomaticEnv()

	return &Config{
		Port:        viper.GetString("PORT"),
		KafkaBroker: viper.GetString("KAFKA_BROKER"),
		KafkaTopic:  viper.GetString("KAFKA_TOPIC"),
		RedisAddr:   viper.GetString("REDIS_ADDR"),
		PostgresDSN: viper.GetString("POSTGRES_DSN"),
		GeoIPDBPath: viper.GetString("GEOIP_DB_PATH"),
	}
}
