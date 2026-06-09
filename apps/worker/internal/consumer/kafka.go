package consumer

import (
	"context"
	"errors"
	"time"

	"github.com/inspectuser/worker/internal/writer"
	"github.com/bytedance/sonic"
	"github.com/twmb/franz-go/pkg/kgo"
	"go.uber.org/zap"
)

type KafkaEvent struct {
	ProjectID string                 `json:"project_id"`
	Event     map[string]interface{} `json:"event"`
}

type Consumer struct {
	client    *kgo.Client
	writer    *writer.ClickHouseWriter
	batchSize int
	flushMs   int
	log       *zap.Logger
}

func NewConsumer(broker, topic, groupID string, w *writer.ClickHouseWriter, batchSize, flushMs int, log *zap.Logger) (*Consumer, error) {
	client, err := kgo.NewClient(
		kgo.SeedBrokers(broker),
		kgo.ConsumerGroup(groupID),
		kgo.ConsumeTopics(topic),
		kgo.DisableAutoCommit(),
	)
	if err != nil {
		return nil, err
	}

	return &Consumer{
		client:    client,
		writer:    w,
		batchSize: batchSize,
		flushMs:   flushMs,
		log:       log,
	}, nil
}

func (c *Consumer) Run(ctx context.Context) {
	batch := make([]writer.EventRow, 0, c.batchSize)
	ticker := time.NewTicker(time.Duration(c.flushMs) * time.Millisecond)
	defer ticker.Stop()
	defer c.client.Close()

	flush := func() {
		if len(batch) == 0 {
			return
		}
		if err := c.writer.WriteBatch(ctx, batch); err != nil {
			c.log.Error("batch write failed", zap.Error(err))
			return
		}
		if err := c.client.CommitUncommittedOffsets(ctx); err != nil {
			c.log.Error("commit failed", zap.Error(err))
		}
		batch = batch[:0]
	}

	for {
		select {
		case <-ctx.Done():
			flush()
			return
		case <-ticker.C:
			flush()
		default:
			fetches := c.client.PollRecords(ctx, c.batchSize)
			if fetches.IsClientClosed() {
				return
			}
			fetches.EachError(func(_ string, _ int32, err error) {
				// context.Canceled is expected on graceful shutdown — don't alarm on it.
				if errors.Is(err, context.Canceled) {
					return
				}
				c.log.Error("fetch error", zap.Error(err))
			})
			fetches.EachRecord(func(r *kgo.Record) {
				var ke KafkaEvent
				if err := sonic.Unmarshal(r.Value, &ke); err != nil {
					c.log.Warn("failed to unmarshal event", zap.Error(err))
					return
				}
				batch = append(batch, mapToRow(ke))
				if len(batch) >= c.batchSize {
					flush()
				}
			})
		}
	}
}

func mapToRow(ke KafkaEvent) writer.EventRow {
	e := ke.Event
	row := writer.EventRow{
		ProjectID:      ke.ProjectID,
		UserID:         getString(e, "user_id"),
		DeviceID:       getString(e, "device_id"),
		SessionID:      getString(e, "session_id"),
		EventType:      getString(e, "event_type"),
		Platform:       getString(e, "platform"),
		OSName:         getString(e, "os_name"),
		OSVersion:      getString(e, "os_version"),
		DeviceType:     getString(e, "device_type"),
		Browser:        getString(e, "browser"),
		BrowserVersion: getString(e, "browser_version"),
		Country:        getString(e, "country"),
		Region:         getString(e, "region"),
		City:           getString(e, "city"),
		UTMSource:      getString(e, "utm_source"),
		UTMMedium:      getString(e, "utm_medium"),
		UTMCampaign:    getString(e, "utm_campaign"),
		UTMTerm:        getString(e, "utm_term"),
		UTMContent:     getString(e, "utm_content"),
		Referrer:       getString(e, "referrer"),
		SDKVersion:     getString(e, "sdk_version"),
		IP:             getString(e, "ip"),
	}

	if ts, ok := e["time"].(float64); ok {
		row.EventTime = time.UnixMilli(int64(ts))
	} else {
		row.EventTime = time.Now()
	}

	if props, ok := e["event_properties"]; ok {
		if b, err := sonic.Marshal(props); err == nil {
			row.Properties = string(b)
		}
	}
	if uprops, ok := e["user_properties"]; ok {
		if b, err := sonic.Marshal(uprops); err == nil {
			row.UserProperties = string(b)
		}
	}

	return row
}

func getString(m map[string]interface{}, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}
