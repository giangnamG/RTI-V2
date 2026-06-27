package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/kowgi/rti-v2/internal/models"
)

type SubdomainRepo struct {
	db *pgxpool.Pool
}

func NewSubdomainRepo(db *pgxpool.Pool) *SubdomainRepo {
	return &SubdomainRepo{db: db}
}

// ListByWorkspace trả về trạng thái MỚI NHẤT của mỗi domain (DISTINCT ON).
func (r *SubdomainRepo) ListByWorkspace(ctx context.Context, wsID uuid.UUID) ([]models.Subdomain, error) {
	rows, err := r.db.Query(ctx, `
		SELECT DISTINCT ON (domain)
		       id, workspace_id, target_id, job_id,
		       domain, ip_addresses, sources, is_alive, http_status, title,
		       created_at, updated_at
		FROM subdomains
		WHERE workspace_id = $1
		ORDER BY domain, created_at DESC
	`, wsID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.Subdomain
	for rows.Next() {
		var s models.Subdomain
		if err := rows.Scan(
			&s.ID, &s.WorkspaceID, &s.TargetID, &s.JobID,
			&s.Domain, &s.IPAddresses, &s.Sources, &s.IsAlive, &s.HTTPStatus, &s.Title,
			&s.CreatedAt, &s.UpdatedAt,
		); err != nil {
			return nil, err
		}
		result = append(result, s)
	}
	return result, nil
}

// HistoryByDomain trả về TOÀN BỘ lịch sử thu thập của một domain, mới nhất trước.
func (r *SubdomainRepo) HistoryByDomain(ctx context.Context, wsID uuid.UUID, domain string) ([]models.Subdomain, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, workspace_id, target_id, job_id,
		       domain, ip_addresses, sources, is_alive, http_status, title,
		       created_at, updated_at
		FROM subdomains
		WHERE workspace_id = $1 AND domain = $2
		ORDER BY created_at DESC
	`, wsID, domain)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.Subdomain
	for rows.Next() {
		var s models.Subdomain
		if err := rows.Scan(
			&s.ID, &s.WorkspaceID, &s.TargetID, &s.JobID,
			&s.Domain, &s.IPAddresses, &s.Sources, &s.IsAlive, &s.HTTPStatus, &s.Title,
			&s.CreatedAt, &s.UpdatedAt,
		); err != nil {
			return nil, err
		}
		result = append(result, s)
	}
	return result, nil
}
