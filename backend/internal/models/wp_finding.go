package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// WPScanFinding — kết quả WPScan (bảng riêng wpscan_finding). Append-only.
type WPScanFinding struct {
	ID               uuid.UUID       `json:"id"`
	WorkspaceID      uuid.UUID       `json:"workspace_id"`
	TargetID         *uuid.UUID      `json:"target_id"`
	JobID            *uuid.UUID      `json:"job_id"`
	Host             *string         `json:"host"`
	URL              *string         `json:"url"`
	Port             *int            `json:"port"`
	Scheme           *string         `json:"scheme"`
	Component        *string         `json:"component"`         // core | plugin | theme | interesting
	ComponentName    *string         `json:"component_name"`
	ComponentVersion *string         `json:"component_version"`
	FixedIn          *string         `json:"fixed_in"`
	Title            string          `json:"title"`
	Severity         string          `json:"severity"`
	Type             string          `json:"type"`
	Status           string          `json:"status"`
	CVEID            *string         `json:"cve_id"`
	CVSSScore        *float64        `json:"cvss_score"`
	Refs             json.RawMessage `json:"refs"`
	Evidence         *string         `json:"evidence"`
	Remediation      *string         `json:"remediation"`
	Raw              json.RawMessage `json:"raw"`
	CreatedAt        time.Time       `json:"created_at"`
}

// WPProbeFinding — kết quả WPProbe (bảng riêng wpprobe_finding). Append-only.
type WPProbeFinding struct {
	ID          uuid.UUID       `json:"id"`
	WorkspaceID uuid.UUID       `json:"workspace_id"`
	TargetID    *uuid.UUID      `json:"target_id"`
	JobID       *uuid.UUID      `json:"job_id"`
	Host        *string         `json:"host"`
	URL         *string         `json:"url"`
	Port        *int            `json:"port"`
	Component   *string         `json:"component"` // plugin | theme
	Plugin      *string         `json:"plugin"`
	Version     *string         `json:"version"`
	Confidence  *string         `json:"confidence"`
	Title       string          `json:"title"`
	Severity    string          `json:"severity"`
	Type        string          `json:"type"`
	Status      string          `json:"status"`
	CVEID       *string         `json:"cve_id"`
	CVSSScore   *float64        `json:"cvss_score"`
	CVSSVector  *string         `json:"cvss_vector"`
	AuthType    *string         `json:"auth_type"`
	Refs        json.RawMessage `json:"refs"`
	Raw         json.RawMessage `json:"raw"`
	CreatedAt   time.Time       `json:"created_at"`
}

// WordPressTarget — host WordPress (web_probes có technologies chứa 'WordPress').
// Dùng cho module con WordPress: liệt kê toàn bộ domain target tag WordPress.
type WordPressTarget struct {
	Host         string     `json:"host"`
	Port         int        `json:"port"`
	URL          string     `json:"url"`
	Scheme       *string    `json:"scheme"`
	TargetID     *uuid.UUID `json:"target_id"`
	Title        *string    `json:"title"`
	Technologies []string   `json:"technologies"`
}
