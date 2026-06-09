package config

import "github.com/spf13/viper"

type Config struct {
	Port               string
	ClickHouseAddr     string
	ClickHouseDB       string
	ClickHouseUser     string
	ClickHousePassword string
	PostgresDSN        string
	RedisAddr          string
	JWTSecret          string
	// Object storage for session replay (Cloudflare R2 / any S3-compatible).
	// Leave empty to use the free ClickHouse blob store instead.
	R2Endpoint  string
	R2AccessKey string
	R2SecretKey string
	R2Bucket    string
	// SMTP for team-invite emails. Leave SMTPHost empty to disable email —
	// invite endpoints then return a copyable link instead.
	SMTPHost string
	SMTPPort string
	SMTPUser string
	SMTPPass string
	SMTPFrom string
	// AppURL is the dashboard origin used to build invite links.
	AppURL string
	// APIURL is this service's public origin, used to build the SSO callback URL.
	APIURL string
}

func Load() *Config {
	viper.SetDefault("PORT", "4001")
	viper.SetDefault("CLICKHOUSE_ADDR", "localhost:9000")
	viper.SetDefault("CLICKHOUSE_DB", "amplitude")
	viper.SetDefault("CLICKHOUSE_USER", "amplitude")
	viper.SetDefault("CLICKHOUSE_PASSWORD", "change_me_in_production")
	viper.SetDefault("POSTGRES_DSN", "postgres://amplitude:change_me_in_production@localhost:5432/amplitude?sslmode=disable")
	viper.SetDefault("REDIS_ADDR", "localhost:6379")
	viper.SetDefault("JWT_SECRET", "change_me_in_production")
	viper.SetDefault("R2_ENDPOINT", "")
	viper.SetDefault("R2_ACCESS_KEY_ID", "")
	viper.SetDefault("R2_SECRET_ACCESS_KEY", "")
	viper.SetDefault("R2_BUCKET", "klyra-replays")
	viper.SetDefault("SMTP_HOST", "")
	viper.SetDefault("SMTP_PORT", "587")
	viper.SetDefault("SMTP_USER", "")
	viper.SetDefault("SMTP_PASS", "")
	viper.SetDefault("SMTP_FROM", "Klyra <no-reply@klyra.local>")
	viper.SetDefault("APP_URL", "http://localhost:3000")
	viper.SetDefault("API_URL", "http://localhost:4001")
	viper.AutomaticEnv()

	return &Config{
		Port:               viper.GetString("PORT"),
		ClickHouseAddr:     viper.GetString("CLICKHOUSE_ADDR"),
		ClickHouseDB:       viper.GetString("CLICKHOUSE_DB"),
		ClickHouseUser:     viper.GetString("CLICKHOUSE_USER"),
		ClickHousePassword: viper.GetString("CLICKHOUSE_PASSWORD"),
		PostgresDSN:        viper.GetString("POSTGRES_DSN"),
		RedisAddr:          viper.GetString("REDIS_ADDR"),
		JWTSecret:          viper.GetString("JWT_SECRET"),
		R2Endpoint:         viper.GetString("R2_ENDPOINT"),
		R2AccessKey:        viper.GetString("R2_ACCESS_KEY_ID"),
		R2SecretKey:        viper.GetString("R2_SECRET_ACCESS_KEY"),
		R2Bucket:           viper.GetString("R2_BUCKET"),
		SMTPHost:           viper.GetString("SMTP_HOST"),
		SMTPPort:           viper.GetString("SMTP_PORT"),
		SMTPUser:           viper.GetString("SMTP_USER"),
		SMTPPass:           viper.GetString("SMTP_PASS"),
		SMTPFrom:           viper.GetString("SMTP_FROM"),
		AppURL:             viper.GetString("APP_URL"),
		APIURL:             viper.GetString("API_URL"),
	}
}
