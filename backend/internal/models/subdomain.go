package models

import (
	"time"

	"github.com/google/uuid"
)

type Subdomain struct {
	ID          uuid.UUID  `json:"id"`
	WorkspaceID uuid.UUID  `json:"workspace_id"`
	TargetID    uuid.UUID  `json:"target_id"`
	JobID       *uuid.UUID `json:"job_id"`
	Domain      string     `json:"domain"`
	IPAddresses []string   `json:"ip_addresses"`
	Sources     []string   `json:"sources"`
	IsAlive     *bool      `json:"is_alive"`
	HTTPStatus  *int       `json:"http_status"`
	Title       *string    `json:"title"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}
