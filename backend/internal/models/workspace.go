package models

import "time"

type Workspace struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Color       string    `json:"color"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	// computed
	TargetCount int `json:"target_count,omitempty"`
}

type CreateWorkspaceRequest struct {
	Name        string `json:"name"        validate:"required,min=1,max=255"`
	Description string `json:"description"`
	Color       string `json:"color"`
}

type UpdateWorkspaceRequest struct {
	Name        string `json:"name"        validate:"required,min=1,max=255"`
	Description string `json:"description"`
	Color       string `json:"color"`
}
