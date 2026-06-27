package models

import (
	"time"

	"github.com/google/uuid"
)

type WebCrawlURL struct {
	ID          uuid.UUID  `json:"id"`
	WorkspaceID uuid.UUID  `json:"workspace_id"`
	TargetID    *uuid.UUID `json:"target_id"`
	JobID       *uuid.UUID `json:"job_id"`
	BaseURL     string     `json:"base_url"`
	URL         string     `json:"url"`
	Method      string     `json:"method"`
	StatusCode  *int       `json:"status_code"`
	ContentType *string    `json:"content_type"`
	SourceTag   *string    `json:"source_tag"`
	SourceAttr  *string    `json:"source_attr"`
	SourceURL   *string    `json:"source_url"`
	Depth       int        `json:"depth"`
	CreatedAt   time.Time  `json:"created_at"`
}

type WebCrawlStats struct {
	Total    int            `json:"total"`
	BySource map[string]int `json:"by_source"`
}
