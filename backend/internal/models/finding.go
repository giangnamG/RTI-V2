package models

import (
	"time"

	"github.com/google/uuid"
)

type Finding struct {
	ID          uuid.UUID  `json:"id"`
	WorkspaceID uuid.UUID  `json:"workspace_id"`
	TargetID    *uuid.UUID `json:"target_id"`
	JobID       *uuid.UUID `json:"job_id"`
	Title       string     `json:"title"`
	Severity    string     `json:"severity"`    // critical / high / medium / low / info
	Type        string     `json:"type"`        // vulnerability / misconfiguration / exposure / credential / informational
	Status      string     `json:"status"`      // open / confirmed / false_positive / fixed
	CVEID       *string    `json:"cve_id"`
	CVSSScore   *float64   `json:"cvss_score"`
	Host        *string    `json:"host"`
	URL         *string    `json:"url"`
	Port        *int       `json:"port"`
	Evidence    *string    `json:"evidence"`
	Source      *string    `json:"source"`
	Remediation *string    `json:"remediation"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}
