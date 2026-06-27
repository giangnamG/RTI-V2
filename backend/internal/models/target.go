package models

import (
	"strings"
	"time"
)

type Target struct {
	ID          string    `json:"id"`
	WorkspaceID string    `json:"workspace_id"`
	Domain      string    `json:"domain"`
	IPAddress   *string   `json:"ip_address"`
	Notes       string    `json:"notes"`
	IsActive    bool      `json:"is_active"`
	CreatedAt   time.Time `json:"created_at"`
}

type CreateTargetRequest struct {
	Domain    string `json:"domain"     validate:"required"`
	IPAddress string `json:"ip_address"`
	Notes     string `json:"notes"`
}

type CreateTargetsBulkRequest struct {
	// Cho phép paste nhiều domain, cách nhau bởi newline hoặc dấu phẩy
	Domains string `json:"domains" validate:"required"`
	Notes   string `json:"notes"`
}

func (r *CreateTargetsBulkRequest) ParseDomains() []string {
	raw := strings.ReplaceAll(r.Domains, ",", "\n")
	lines := strings.Split(raw, "\n")
	var result []string
	for _, l := range lines {
		d := strings.TrimSpace(l)
		if d != "" {
			result = append(result, d)
		}
	}
	return result
}

type UpdateTargetRequest struct {
	Domain    string `json:"domain"     validate:"required"`
	IPAddress string `json:"ip_address"`
	Notes     string `json:"notes"`
	IsActive  *bool  `json:"is_active"`
}
