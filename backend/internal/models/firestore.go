package models

import (
	"time"

	"github.com/google/uuid"
)

// FirestoreCollection — collection có dữ liệu (OpenFirebase read/fuzz). Append-only.
type FirestoreCollection struct {
	ID          uuid.UUID  `json:"id"`
	WorkspaceID uuid.UUID  `json:"workspace_id"`
	TargetID    *uuid.UUID `json:"target_id"`
	JobID       *uuid.UUID `json:"job_id"`
	ProjectID   string     `json:"project_id"`
	APIKey      *string    `json:"api_key"`
	Collection  string     `json:"collection"`
	URL         *string    `json:"url"`
	DocCount    int        `json:"doc_count"`
	CreatedAt   time.Time  `json:"created_at"`
}

// FirestoreDocument — document tool tìm được trong collection public. Append-only.
type FirestoreDocument struct {
	ID          uuid.UUID  `json:"id"`
	WorkspaceID uuid.UUID  `json:"workspace_id"`
	TargetID    *uuid.UUID `json:"target_id"`
	JobID       *uuid.UUID `json:"job_id"`
	ProjectID   string     `json:"project_id"`
	APIKey      *string    `json:"api_key"`
	Collection  *string    `json:"collection"`
	DocPath     string     `json:"doc_path"`
	URL         *string    `json:"url"`
	CreatedAt   time.Time  `json:"created_at"`
}

// ExtractedFirebaseConfig — Firebase web config trích từ target (1 row/target = run mới nhất).
type ExtractedFirebaseConfig struct {
	ID                uuid.UUID  `json:"id"`
	WorkspaceID       uuid.UUID  `json:"workspace_id"`
	TargetID          *uuid.UUID `json:"target_id"`
	JobID             *uuid.UUID `json:"job_id"`
	Host              *string    `json:"host"`
	APIKey            *string    `json:"api_key"`
	AuthDomain        *string    `json:"auth_domain"`
	ProjectID         *string    `json:"project_id"`
	StorageBucket     *string    `json:"storage_bucket"`
	MessagingSenderID *string    `json:"messaging_sender_id"`
	AppID             *string    `json:"app_id"`
	CreatedAt         time.Time  `json:"created_at"`
}

// FirestoreCrawl — metadata 1 collection của 1 lần crawl (raw data ở file_path). Append-only.
type FirestoreCrawl struct {
	ID          uuid.UUID  `json:"id"`
	WorkspaceID uuid.UUID  `json:"workspace_id"`
	TargetID    *uuid.UUID `json:"target_id"`
	JobID       *uuid.UUID `json:"job_id"`
	ProjectID   string     `json:"project_id"`
	Collection  string     `json:"collection"`
	DocCount    int        `json:"doc_count"`
	ByteSize    int64      `json:"byte_size"`
	FilePath    string     `json:"file_path"`
	Status      string     `json:"status"`
	Error       *string    `json:"error"`
	Truncated   bool       `json:"truncated"`
	CreatedAt   time.Time  `json:"created_at"`
}
