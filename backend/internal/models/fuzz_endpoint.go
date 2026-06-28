package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// FuzzParam — một tham số trong GET query string, path, hoặc POST body.
type FuzzParam struct {
	Name     string `json:"name"`
	Type     string `json:"type,omitempty"`    // text | password | hidden | select | ...
	Value    string `json:"value"`
	Dynamic  bool   `json:"dynamic,omitempty"` // true = cần fetch lại mỗi request (CSRF)
	Required bool   `json:"required,omitempty"`
	Source   string `json:"source"`            // query_string | path_param | form_html
}

type FuzzEndpoint struct {
	ID          uuid.UUID       `json:"id"`
	WorkspaceID uuid.UUID       `json:"workspace_id"`
	TargetID    *uuid.UUID      `json:"target_id"`
	JobID       *uuid.UUID      `json:"job_id"`
	URL         string          `json:"url"`
	Method      string          `json:"method"`
	ContentType *string         `json:"content_type"`
	Params      json.RawMessage `json:"params"`    // []FuzzParam — trả raw JSON về frontend
	HasCSRF     bool            `json:"has_csrf"`
	SourceURL   *string         `json:"source_url"`
	SourceType  string          `json:"source_type"` // crawl_url | crawl_form
	CreatedAt   time.Time       `json:"created_at"`
}

type FuzzEndpointStats struct {
	Total      int `json:"total"`
	GetCount   int `json:"get_count"`
	PostCount  int `json:"post_count"`
	WithParams int `json:"with_params"`
	WithCSRF   int `json:"with_csrf"`
}
