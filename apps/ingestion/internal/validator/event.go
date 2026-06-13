package validator

import (
	"errors"
	"time"
)

type Event struct {
	UserID          string                 `json:"user_id"`
	DeviceID        string                 `json:"device_id"`
	SessionID       string                 `json:"session_id"`
	InsertID        string                 `json:"insert_id"` // for server-side dedup
	EventID         int64                  `json:"event_id"`  // per-device sequence
	EventType       string                 `json:"event_type"`
	EventTime       *int64                 `json:"time"` // unix ms, optional
	Properties      map[string]interface{} `json:"event_properties"`
	UserProperties  map[string]interface{} `json:"user_properties"`
	Platform        string                 `json:"platform"`
	OSName          string                 `json:"os_name"`
	OSVersion       string                 `json:"os_version"`
	DeviceType      string                 `json:"device_type"`
	Browser         string                 `json:"browser"`
	BrowserVersion  string                 `json:"browser_version"`
	Country         string                 `json:"country"`
	Region          string                 `json:"region"`
	City            string                 `json:"city"`
	UTMSource       string                 `json:"utm_source"`
	UTMMedium       string                 `json:"utm_medium"`
	UTMCampaign     string                 `json:"utm_campaign"`
	UTMTerm         string                 `json:"utm_term"`
	UTMContent      string                 `json:"utm_content"`
	Referrer        string                 `json:"referrer"`
	SDKVersion      string                 `json:"sdk_version"`
	IP              string                 `json:"ip"`
	// Branded short-link code (?il=<code>) — resolved server-side to utm_* so the
	// backend owns the code→source mapping and the link stays on the customer domain.
	LinkCode        string                 `json:"link_code"`
}

type BatchRequest struct {
	APIKey string  `json:"api_key"`
	Events []Event `json:"events"`
}

// Size caps — bound memory/storage and keep any single event well under Kafka's
// per-record limit. An attacker (or buggy SDK) can't blow up the worker/ClickHouse
// downstream with oversized fields, unbounded property maps, or huge values.
const (
	maxEvents       = 2000
	maxIDLen        = 256  // user_id, device_id, session_id, insert_id, link_code
	maxEventTypeLen = 512  // event_type / string identifiers
	maxProps        = 512  // entries in event_properties / user_properties
	maxStrValueLen  = 8192 // any single string property value
)

func (r *BatchRequest) Validate() error {
	if r.APIKey == "" {
		return errors.New("api_key is required")
	}
	if len(r.Events) == 0 {
		return errors.New("events array is empty")
	}
	if len(r.Events) > maxEvents {
		return errors.New("batch size exceeds 2000 events")
	}
	for i := range r.Events {
		if err := r.Events[i].validate(); err != nil {
			return err
		}
		// Clamp event time to ±7 days to avoid garbage timestamps
		if e := &r.Events[i]; e.EventTime != nil {
			t := time.UnixMilli(*e.EventTime)
			if t.After(time.Now().Add(7*24*time.Hour)) ||
				t.Before(time.Now().Add(-7*24*time.Hour)) {
				e.EventTime = nil
			}
		}
	}
	return nil
}

// ValidateIdentify bounds an identify batch. event_type is set server-side to
// "$identify", so it is not required here, but batch size, id lengths, and
// property caps are enforced exactly as for normal ingest.
func (r *BatchRequest) ValidateIdentify() error {
	if len(r.Events) == 0 {
		return errors.New("events array is empty")
	}
	if len(r.Events) > maxEvents {
		return errors.New("batch size exceeds 2000 events")
	}
	for i := range r.Events {
		e := &r.Events[i]
		if e.UserID == "" && e.DeviceID == "" {
			return errors.New("user_id or device_id required on every event")
		}
		if len(e.UserID) > maxIDLen || len(e.DeviceID) > maxIDLen ||
			len(e.SessionID) > maxIDLen || len(e.InsertID) > maxIDLen {
			return errors.New("id field too long")
		}
		if err := boundProps(e.Properties); err != nil {
			return err
		}
		if err := boundProps(e.UserProperties); err != nil {
			return err
		}
	}
	return nil
}

// validate enforces presence + size caps on a single event.
func (e *Event) validate() error {
	if e.EventType == "" {
		return errors.New("event_type is required on every event")
	}
	if e.UserID == "" && e.DeviceID == "" {
		return errors.New("user_id or device_id required on every event")
	}
	if len(e.EventType) > maxEventTypeLen {
		return errors.New("event_type too long")
	}
	if len(e.UserID) > maxIDLen || len(e.DeviceID) > maxIDLen ||
		len(e.SessionID) > maxIDLen || len(e.InsertID) > maxIDLen ||
		len(e.LinkCode) > maxIDLen {
		return errors.New("id field too long")
	}
	if err := boundProps(e.Properties); err != nil {
		return err
	}
	return boundProps(e.UserProperties)
}

// boundProps caps the number of property keys and the length of any string value.
func boundProps(p map[string]interface{}) error {
	if len(p) > maxProps {
		return errors.New("too many properties")
	}
	for _, v := range p {
		if s, ok := v.(string); ok && len(s) > maxStrValueLen {
			return errors.New("property value too large")
		}
	}
	return nil
}
