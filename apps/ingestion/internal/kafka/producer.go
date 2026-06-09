package kafka

import (
	"context"

	"github.com/bytedance/sonic"
	"github.com/twmb/franz-go/pkg/kgo"
	"go.uber.org/zap"
)

type Producer struct {
	client *kgo.Client
	topic  string
	log    *zap.Logger
}

func NewProducer(broker, topic string, log *zap.Logger) (*Producer, error) {
	client, err := kgo.NewClient(
		kgo.SeedBrokers(broker),
		kgo.DefaultProduceTopic(topic),
		kgo.RecordPartitioner(kgo.StickyKeyPartitioner(nil)),
		kgo.ProducerBatchMaxBytes(1_000_000),
		kgo.ProducerLinger(5),
		kgo.AllowAutoTopicCreation(), // create the topic on first produce if missing
	)
	if err != nil {
		return nil, err
	}
	return &Producer{client: client, topic: topic, log: log}, nil
}

type KafkaEvent struct {
	ProjectID string      `json:"project_id"`
	Event     interface{} `json:"event"`
}

func (p *Producer) SendBatch(ctx context.Context, projectID string, events []interface{}) error {
	records := make([]*kgo.Record, 0, len(events))
	for _, e := range events {
		payload, err := sonic.Marshal(KafkaEvent{ProjectID: projectID, Event: e})
		if err != nil {
			continue
		}
		records = append(records, &kgo.Record{
			Topic: p.topic,
			Value: payload,
		})
	}

	results := p.client.ProduceSync(ctx, records...)
	for _, r := range results {
		if r.Err != nil {
			p.log.Error("kafka produce failed", zap.Error(r.Err))
		}
	}
	return nil
}

func (p *Producer) Close() {
	p.client.Close()
}
