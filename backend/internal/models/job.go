package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type Job struct {
	ID           uuid.UUID        `json:"id"`
	WorkspaceID  uuid.UUID        `json:"workspace_id"`
	TargetID     *uuid.UUID       `json:"target_id"`
	JobType      string           `json:"job_type"`
	Status       string           `json:"status"`
	Payload      json.RawMessage  `json:"payload"`
	Result       json.RawMessage  `json:"result"`
	ErrorMessage *string          `json:"error_message"`
	StartedAt    *time.Time       `json:"started_at"`
	FinishedAt   *time.Time       `json:"finished_at"`
	CreatedAt    time.Time        `json:"created_at"`
	UpdatedAt    time.Time        `json:"updated_at"`
}

type CreateJobRequest struct {
	TargetID *string        `json:"target_id"`
	JobType  string         `json:"job_type"`
	Payload  map[string]any `json:"payload"`
}

// Các job type hợp lệ
var ValidJobTypes = map[string]bool{
	"RECON_SUBDOMAIN":           true,
	"RECON_WEB_CRAWL":           true,
	"RECON_ENDPOINT_NORMALIZE":  true,
	"SCAN_PORT":                 true,
	"SCAN_SERVICE":     true,
	"SCAN_WEB_INFO":    true,
	"SCAN_CVE":        true,
	"FUZZ_DIR":        true,
	"FUZZ_FILE":       true,
	"FUZZ_VHOST":      true,
	"FUZZ_PARAM":      true,
	"FUZZ_BACKUP":     true,
	"FUZZ_API":        true,
	"PENTEST_WEB":     true,
	"PENTEST_NETWORK": true,
}
