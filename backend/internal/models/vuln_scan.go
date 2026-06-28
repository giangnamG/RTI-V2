package models

import (
	"time"

	"github.com/google/uuid"
)

type VulnScanRun struct {
	ID            uuid.UUID  `json:"id"`
	WorkspaceID   uuid.UUID  `json:"workspace_id"`
	TargetID      *uuid.UUID `json:"target_id"`
	JobID         *uuid.UUID `json:"job_id"`
	Domain        string     `json:"domain"`
	Tool          string     `json:"tool"`
	TargetURL     string     `json:"target_url"`
	Status        string     `json:"status"`
	SkipReason    *string    `json:"skip_reason"`
	FindingsCount int        `json:"findings_count"`
	StartedAt     *time.Time `json:"started_at"`
	FinishedAt    *time.Time `json:"finished_at"`
	CreatedAt     time.Time  `json:"created_at"`
}
