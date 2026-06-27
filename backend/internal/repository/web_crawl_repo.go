package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/kowgi/rti-v2/internal/models"
)

type WebCrawlRepo struct {
	pool *pgxpool.Pool
}

func NewWebCrawlRepo(pool *pgxpool.Pool) *WebCrawlRepo {
	return &WebCrawlRepo{pool: pool}
}

const webCrawlSelectCols = `
	id, workspace_id, target_id, job_id,
	base_url, url, method, status_code, content_type,
	source_tag, source_attr, source_url, depth, created_at`

func scanWebCrawlURL(row interface{ Scan(...any) error }) (models.WebCrawlURL, error) {
	var u models.WebCrawlURL
	err := row.Scan(
		&u.ID, &u.WorkspaceID, &u.TargetID, &u.JobID,
		&u.BaseURL, &u.URL, &u.Method, &u.StatusCode, &u.ContentType,
		&u.SourceTag, &u.SourceAttr, &u.SourceURL, &u.Depth, &u.CreatedAt,
	)
	return u, err
}

// List trả về trạng thái MỚI NHẤT mỗi URL (DISTINCT ON url) trong workspace.
// Nếu baseURL != "" thì filter theo base_url.
func (r *WebCrawlRepo) List(ctx context.Context, wsID uuid.UUID, baseURL string) ([]models.WebCrawlURL, error) {
	var rows interface {
		Next() bool
		Close()
		Scan(...any) error
	}
	var err error

	if baseURL != "" {
		rows, err = r.pool.Query(ctx, fmt.Sprintf(`
			SELECT DISTINCT ON (url) %s
			FROM web_crawl_urls
			WHERE workspace_id = $1 AND base_url = $2
			ORDER BY url, created_at DESC
		`, webCrawlSelectCols), wsID, baseURL)
	} else {
		rows, err = r.pool.Query(ctx, fmt.Sprintf(`
			SELECT DISTINCT ON (url) %s
			FROM web_crawl_urls
			WHERE workspace_id = $1
			ORDER BY url, created_at DESC
		`, webCrawlSelectCols), wsID)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.WebCrawlURL
	for rows.Next() {
		u, err := scanWebCrawlURL(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, u)
	}
	return result, nil
}

// ListByJob trả về TẤT CẢ URLs từ một job cụ thể (dùng cho history drawer).
func (r *WebCrawlRepo) ListByJob(ctx context.Context, wsID uuid.UUID, jobID uuid.UUID) ([]models.WebCrawlURL, error) {
	rows, err := r.pool.Query(ctx, fmt.Sprintf(`
		SELECT %s
		FROM web_crawl_urls
		WHERE workspace_id = $1 AND job_id = $2
		ORDER BY base_url, url
	`, webCrawlSelectCols), wsID, jobID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.WebCrawlURL
	for rows.Next() {
		u, err := scanWebCrawlURL(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, u)
	}
	return result, nil
}

// Stats trả về tổng count và breakdown theo source_tag.
func (r *WebCrawlRepo) Stats(ctx context.Context, wsID uuid.UUID) (models.WebCrawlStats, error) {
	stats := models.WebCrawlStats{BySource: map[string]int{}}

	// Total distinct URLs
	err := r.pool.QueryRow(ctx, `
		SELECT COUNT(DISTINCT url)
		FROM web_crawl_urls
		WHERE workspace_id = $1
	`, wsID).Scan(&stats.Total)
	if err != nil {
		return stats, err
	}

	// Breakdown by source_tag (latest per url)
	rows, err := r.pool.Query(ctx, `
		SELECT COALESCE(source_tag, 'other'), COUNT(*)
		FROM (
			SELECT DISTINCT ON (url) url, source_tag
			FROM web_crawl_urls
			WHERE workspace_id = $1
			ORDER BY url, created_at DESC
		) sub
		GROUP BY source_tag
	`, wsID)
	if err != nil {
		return stats, err
	}
	defer rows.Close()
	for rows.Next() {
		var tag string
		var cnt int
		if err := rows.Scan(&tag, &cnt); err != nil {
			continue
		}
		stats.BySource[tag] = cnt
	}
	return stats, nil
}
