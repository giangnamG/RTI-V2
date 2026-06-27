package models

import (
	"time"

	"github.com/google/uuid"
)

type ServiceCategory struct {
	ID           uuid.UUID `json:"id"`
	Name         string    `json:"name"`
	Label        string    `json:"label"`
	Description  string    `json:"description"`
	Color        string    `json:"color"`
	ServiceNames []string  `json:"service_names"`
	ModuleTypes  []string  `json:"module_types"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}
