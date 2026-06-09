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
}

type BatchRequest struct {
	APIKey string  `json:"api_key"`
	Events []Event `json:"events"`
}

func (r *BatchRequest) Validate() error {
	if r.APIKey == "" {
		return errors.New("api_key is required")
	}
	if len(r.Events) == 0 {
		return errors.New("events array is empty")
	}
	if len(r.Events) > 2000 {
		return errors.New("batch size exceeds 2000 events")
	}
	for i, e := range r.Events {
		if e.EventType == "" {
			return errors.New("event_type is required on every event")
		}
		if e.UserID == "" && e.DeviceID == "" {
			return errors.New("user_id or device_id required on every event")
		}
		// Clamp event time to ±7 days to avoid garbage timestamps
		if e.EventTime != nil {
			t := time.UnixMilli(*e.EventTime)
			if t.After(time.Now().Add(7 * 24 * time.Hour)) ||
				t.Before(time.Now().Add(-7 * 24 * time.Hour)) {
				r.Events[i].EventTime = nil
			}
		}
	}
	return nil
}
