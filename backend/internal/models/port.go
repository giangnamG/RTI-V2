package models

import (
	"time"

	"github.com/google/uuid"
)

type Port struct {
	ID              uuid.UUID  `json:"id"`
	WorkspaceID     uuid.UUID  `json:"workspace_id"`
	TargetID        *uuid.UUID `json:"target_id"`
	JobID           *uuid.UUID `json:"job_id"`
	Host            string     `json:"host"`
	IPAddress       *string    `json:"ip_address"`
	Port            int        `json:"port"`
	Protocol        string     `json:"protocol"`
	State           string     `json:"state"`
	ServiceName     *string    `json:"service_name"`
	ServiceCategory *string    `json:"service_category"`
	Banner          *string    `json:"banner"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}
