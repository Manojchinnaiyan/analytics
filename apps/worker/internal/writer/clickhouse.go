package writer

import (
	"context"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"go.uber.org/zap"
)

type EventRow struct {
	ProjectID      string
	UserID         string
	DeviceID       string
	SessionID      string
	EventType      string
	EventTime      time.Time
	Properties     string
	UserProperties string
	Platform       string
	OSName         string
	OSVersion      string
	DeviceType     string
	Browser        string
	BrowserVersion string
	Country        string
	Region         string
	City           string
	UTMSource      string
	UTMMedium      string
	UTMCampaign    string
	UTMTerm        string
	UTMContent     string
	Referrer       string
	SDKVersion     string
	IP             string
}

type ClickHouseWriter struct {
	conn clickhouse.Conn
	log  *zap.Logger
}

type ClickHouseConfig struct {
	Addr     string
	DB       string
	User     string
	Password string
}

func NewClickHouseWriter(cfg ClickHouseConfig, log *zap.Logger) (*ClickHouseWriter, error) {
	conn, err := clickhouse.Open(&clickhouse.Options{
		Addr: []string{cfg.Addr},
		Auth: clickhouse.Auth{
			Database: cfg.DB,
			Username: cfg.User,
			Password: cfg.Password,
		},
		MaxOpenConns:    10,
		MaxIdleConns:    5,
		ConnMaxLifetime: time.Hour,
		Compression:     &clickhouse.Compression{Method: clickhouse.CompressionLZ4},
	})
	if err != nil {
		return nil, err
	}
	return &ClickHouseWriter{conn: conn, log: log}, nil
}

func (w *ClickHouseWriter) WriteBatch(ctx context.Context, rows []EventRow) error {
	if len(rows) == 0 {
		return nil
	}

	batch, err := w.conn.PrepareBatch(ctx, `
		INSERT INTO amplitude.events (
			project_id, user_id, device_id, session_id, event_type, event_time,
			properties, user_properties, platform, os_name, os_version,
			device_type, browser, browser_version, country, region, city,
			utm_source, utm_medium, utm_campaign, utm_term, utm_content,
			referrer, sdk_version, ip
		)
	`)
	if err != nil {
		return err
	}

	for _, r := range rows {
		if err := batch.Append(
			r.ProjectID, r.UserID, r.DeviceID, r.SessionID, r.EventType, r.EventTime,
			r.Properties, r.UserProperties, r.Platform, r.OSName, r.OSVersion,
			r.DeviceType, r.Browser, r.BrowserVersion, r.Country, r.Region, r.City,
			r.UTMSource, r.UTMMedium, r.UTMCampaign, r.UTMTerm, r.UTMContent,
			r.Referrer, r.SDKVersion, r.IP,
		); err != nil {
			w.log.Error("failed to append row", zap.Error(err))
		}
	}

	if err := batch.Send(); err != nil {
		w.log.Error("clickhouse batch send failed", zap.Error(err), zap.Int("rows", len(rows)))
		return err
	}

	w.log.Info("batch written", zap.Int("rows", len(rows)))
	return nil
}
