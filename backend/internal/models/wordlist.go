package models

import "time"

type Wordlist struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Category    string    `json:"category"`
	Path        string    `json:"path"`
	LineCount   *int      `json:"line_count"`
	FileSizeKB  *int      `json:"file_size_kb"`
	IsBuiltin   bool      `json:"is_builtin"`
	CreatedAt   time.Time `json:"created_at"`
	// Available: resolved at query time — true nếu file tồn tại trong container
	Available bool `json:"available"`
}
