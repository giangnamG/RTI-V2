package models

import (
	"time"

	"github.com/google/uuid"
)

type WebProbe struct {
	ID            uuid.UUID  `json:"id"`
	WorkspaceID   uuid.UUID  `json:"workspace_id"`
	TargetID      *uuid.UUID `json:"target_id"`
	JobID         *uuid.UUID `json:"job_id"`
	Host          string     `json:"host"`
	Port          int        `json:"port"`
	URL           string     `json:"url"`
	Scheme        *string    `json:"scheme"`
	StatusCode    *int       `json:"status_code"`
	Title         *string    `json:"title"`
	WebServer     *string    `json:"web_server"`
	Technologies  []string   `json:"technologies"`
	ContentType   *string    `json:"content_type"`
	ContentLength *int64     `json:"content_length"`
	ResponseTime  *string    `json:"response_time"`
	IPAddress     *string    `json:"ip_address"`
	IsAlive       bool       `json:"is_alive"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}
