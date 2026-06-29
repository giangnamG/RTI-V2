package repository

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/kowgi/rti-v2/internal/models"
)

type FirestoreRepo struct {
	db *pgxpool.Pool
}

func NewFirestoreRepo(db *pgxpool.Pool) *FirestoreRepo {
	return &FirestoreRepo{db: db}
}

// ListCollections — chỉ RUN MỚI NHẤT (latest job_id), append-only như rules/data-model.md.
func (r *FirestoreRepo) ListCollections(ctx context.Context, wsID uuid.UUID, targetID string) ([]models.FirestoreCollection, error) {
	inner := []string{"workspace_id = $1"}
	args := []any{wsID}
	if targetID != "" {
		args = append(args, targetID)
		inner = append(inner, fmt.Sprintf("target_id = $%d", len(args)))
	}
	sql := `SELECT id, workspace_id, target_id, job_id, project_id, api_key, collection, url, doc_count, created_at FROM (
	            SELECT id, workspace_id, target_id, job_id, project_id, api_key, collection, url, doc_count, created_at,
	                   first_value(job_id) OVER (PARTITION BY target_id ORDER BY created_at DESC, id DESC) AS latest_job
	            FROM firestore_collections
	            WHERE ` + strings.Join(inner, " AND ") + `
	        ) t
	        WHERE job_id IS NOT DISTINCT FROM latest_job
	        ORDER BY doc_count DESC, collection`

	rows, err := r.db.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []models.FirestoreCollection{}
	for rows.Next() {
		var v models.FirestoreCollection
		if err := rows.Scan(&v.ID, &v.WorkspaceID, &v.TargetID, &v.JobID, &v.ProjectID,
			&v.APIKey, &v.Collection, &v.URL, &v.DocCount, &v.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, v)
	}
	return items, nil
}

// ListConfigs — Firebase config: 1 row/target (config mới nhất). NULL target → 1 row/host.
func (r *FirestoreRepo) ListConfigs(ctx context.Context, wsID uuid.UUID, targetID string) ([]models.ExtractedFirebaseConfig, error) {
	where := []string{"workspace_id = $1"}
	args := []any{wsID}
	if targetID != "" {
		args = append(args, targetID)
		where = append(where, fmt.Sprintf("target_id = $%d", len(args)))
	}
	sql := `SELECT DISTINCT ON (COALESCE(target_id::text, host))
	               id, workspace_id, target_id, job_id, host, api_key, auth_domain,
	               project_id, storage_bucket, messaging_sender_id, app_id, created_at
	        FROM extracted_firebase_config
	        WHERE ` + strings.Join(where, " AND ") + `
	        ORDER BY COALESCE(target_id::text, host), created_at DESC, id DESC`

	rows, err := r.db.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []models.ExtractedFirebaseConfig{}
	for rows.Next() {
		var v models.ExtractedFirebaseConfig
		if err := rows.Scan(&v.ID, &v.WorkspaceID, &v.TargetID, &v.JobID, &v.Host, &v.APIKey,
			&v.AuthDomain, &v.ProjectID, &v.StorageBucket, &v.MessagingSenderID, &v.AppID, &v.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, v)
	}
	return items, nil
}

// ListCollectionsHistory — TẤT CẢ lần chạy (append-only), không lọc latest-run (rules/data-model.md R3).
// Dùng cho drawer "Lịch sử chạy" (per-run group by job_id) + timeline per-collection.
func (r *FirestoreRepo) ListCollectionsHistory(ctx context.Context, wsID uuid.UUID, targetID string) ([]models.FirestoreCollection, error) {
	where := []string{"workspace_id = $1"}
	args := []any{wsID}
	if targetID != "" {
		args = append(args, targetID)
		where = append(where, fmt.Sprintf("target_id = $%d", len(args)))
	}
	sql := `SELECT id, workspace_id, target_id, job_id, project_id, api_key, collection, url, doc_count, created_at
	        FROM firestore_collections
	        WHERE ` + strings.Join(where, " AND ") + `
	        ORDER BY created_at DESC, id DESC`

	rows, err := r.db.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []models.FirestoreCollection{}
	for rows.Next() {
		var v models.FirestoreCollection
		if err := rows.Scan(&v.ID, &v.WorkspaceID, &v.TargetID, &v.JobID, &v.ProjectID,
			&v.APIKey, &v.Collection, &v.URL, &v.DocCount, &v.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, v)
	}
	return items, nil
}

// ListDocuments — RUN MỚI NHẤT per target, PHÂN TRANG (limit/offset), trả total.
func (r *FirestoreRepo) ListDocuments(ctx context.Context, wsID uuid.UUID, targetID, collection string, limit, offset int) ([]models.FirestoreDocument, int, error) {
	inner := []string{"workspace_id = $1"}
	args := []any{wsID}
	if targetID != "" {
		args = append(args, targetID)
		inner = append(inner, fmt.Sprintf("target_id = $%d", len(args)))
	}
	outer := []string{"job_id IS NOT DISTINCT FROM latest_job"}
	if collection != "" {
		args = append(args, collection)
		outer = append(outer, fmt.Sprintf("collection = $%d", len(args)))
	}
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}
	args = append(args, limit)
	limPos := len(args)
	args = append(args, offset)
	offPos := len(args)

	sql := `SELECT id, workspace_id, target_id, job_id, project_id, api_key, collection, doc_path, url, created_at,
	               count(*) OVER () AS total FROM (
	            SELECT id, workspace_id, target_id, job_id, project_id, api_key, collection, doc_path, url, created_at,
	                   first_value(job_id) OVER (PARTITION BY target_id ORDER BY created_at DESC, id DESC) AS latest_job
	            FROM firestore_documents
	            WHERE ` + strings.Join(inner, " AND ") + `
	        ) t
	        WHERE ` + strings.Join(outer, " AND ") + `
	        ORDER BY collection, created_at DESC
	        LIMIT $` + fmt.Sprint(limPos) + ` OFFSET $` + fmt.Sprint(offPos)

	rows, err := r.db.Query(ctx, sql, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	items := []models.FirestoreDocument{}
	total := 0
	for rows.Next() {
		var v models.FirestoreDocument
		if err := rows.Scan(&v.ID, &v.WorkspaceID, &v.TargetID, &v.JobID, &v.ProjectID,
			&v.APIKey, &v.Collection, &v.DocPath, &v.URL, &v.CreatedAt, &total); err != nil {
			return nil, 0, err
		}
		items = append(items, v)
	}
	return items, total, nil
}

// ListCrawls — metadata crawl, chỉ RUN MỚI NHẤT per target (như ListCollections).
func (r *FirestoreRepo) ListCrawls(ctx context.Context, wsID uuid.UUID, targetID string) ([]models.FirestoreCrawl, error) {
	inner := []string{"workspace_id = $1"}
	args := []any{wsID}
	if targetID != "" {
		args = append(args, targetID)
		inner = append(inner, fmt.Sprintf("target_id = $%d", len(args)))
	}
	sql := `SELECT id, workspace_id, target_id, job_id, project_id, collection,
	               doc_count, byte_size, file_path, status, error, truncated, created_at FROM (
	            SELECT id, workspace_id, target_id, job_id, project_id, collection,
	                   doc_count, byte_size, file_path, status, error, truncated, created_at,
	                   first_value(job_id) OVER (PARTITION BY target_id ORDER BY created_at DESC, id DESC) AS latest_job
	            FROM firestore_crawls
	            WHERE ` + strings.Join(inner, " AND ") + `
	        ) t
	        WHERE job_id IS NOT DISTINCT FROM latest_job
	        ORDER BY doc_count DESC, collection`

	rows, err := r.db.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []models.FirestoreCrawl{}
	for rows.Next() {
		var v models.FirestoreCrawl
		if err := rows.Scan(&v.ID, &v.WorkspaceID, &v.TargetID, &v.JobID, &v.ProjectID,
			&v.Collection, &v.DocCount, &v.ByteSize, &v.FilePath, &v.Status, &v.Error,
			&v.Truncated, &v.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, v)
	}
	return items, nil
}
