package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// ── Fuzz Param Result (arjun output) ──────────────────────────

type FuzzParamResult struct {
	ID          uuid.UUID       `json:"id"`
	WorkspaceID uuid.UUID       `json:"workspace_id"`
	TargetID    *uuid.UUID      `json:"target_id"`
	JobID       *uuid.UUID      `json:"job_id"`
	URL         string          `json:"url"`
	Method      string          `json:"method"`
	Params      json.RawMessage `json:"params"` // []string
	CreatedAt   time.Time       `json:"created_at"`
}

type FuzzParamStats struct {
	Total             int `json:"total"`
	EndpointsWithParams int `json:"endpoints_with_params"`
	TotalParams       int `json:"total_params"`
}

// ── Dir Fuzz Result (ffuf output) ─────────────────────────────

type DirFuzzResult struct {
	ID            uuid.UUID  `json:"id"`
	WorkspaceID   uuid.UUID  `json:"workspace_id"`
	TargetID      *uuid.UUID `json:"target_id"`
	JobID         *uuid.UUID `json:"job_id"`
	BaseURL       string     `json:"base_url"`
	Path          string     `json:"path"`
	URL           string     `json:"url"`
	StatusCode    int        `json:"status_code"`
	ContentLength int        `json:"content_length"`
	ContentType   *string    `json:"content_type"`
	Words         int        `json:"words"`
	Lines         int        `json:"lines"`
	RedirectURL   *string    `json:"redirect_url"`
	IsInteresting bool       `json:"is_interesting"`
	CreatedAt     time.Time  `json:"created_at"`
}

type DirFuzzStats struct {
	Total       int            `json:"total"`
	Interesting int            `json:"interesting"`
	ByStatus    map[string]int `json:"by_status"`
}
