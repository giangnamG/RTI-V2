package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type NucleiFinding struct {
	ID               uuid.UUID       `json:"id"`
	WorkspaceID      uuid.UUID       `json:"workspace_id"`
	TargetID         *uuid.UUID      `json:"target_id"`
	JobID            *uuid.UUID      `json:"job_id"`
	TemplateID       *string         `json:"template_id"`
	MatcherName      *string         `json:"matcher_name"`
	Protocol         *string         `json:"protocol"`
	Title            string          `json:"title"`
	Severity         string          `json:"severity"`
	Type             string          `json:"type"`
	Status           string          `json:"status"`
	Host             *string         `json:"host"`
	URL              *string         `json:"url"`
	Port             *int            `json:"port"`
	ExtractedResults json.RawMessage `json:"extracted_results"`
	CVEID            *string         `json:"cve_id"`
	CVSSScore        *float64        `json:"cvss_score"`
	Evidence         *string         `json:"evidence"`
	Remediation      *string         `json:"remediation"`
	CreatedAt        time.Time       `json:"created_at"`
}
