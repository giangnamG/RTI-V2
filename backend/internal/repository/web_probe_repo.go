package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/kowgi/rti-v2/internal/models"
)

type WebProbeRepo struct {
	pool *pgxpool.Pool
}

func NewWebProbeRepo(pool *pgxpool.Pool) *WebProbeRepo {
	return &WebProbeRepo{pool: pool}
}

// ListByWorkspace trả về trạng thái MỚI NHẤT của mỗi (host, port).
func (r *WebProbeRepo) ListByWorkspace(ctx context.Context, wsID uuid.UUID) ([]models.WebProbe, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT DISTINCT ON (host, port)
		       id, workspace_id, target_id, job_id,
		       host, port, url, scheme, status_code, title, web_server,
		       technologies, content_type, content_length, response_time,
		       ip_address, is_alive, created_at, updated_at
		FROM web_probes
		WHERE workspace_id = $1
		ORDER BY host, port, created_at DESC
	`, wsID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var probes []models.WebProbe
	for rows.Next() {
		var p models.WebProbe
		if err := rows.Scan(
			&p.ID, &p.WorkspaceID, &p.TargetID, &p.JobID,
			&p.Host, &p.Port, &p.URL, &p.Scheme, &p.StatusCode, &p.Title, &p.WebServer,
			&p.Technologies, &p.ContentType, &p.ContentLength, &p.ResponseTime,
			&p.IPAddress, &p.IsAlive, &p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			return nil, err
		}
		probes = append(probes, p)
	}
	return probes, nil
}

// HistoryByHost trả về TOÀN BỘ lịch sử web probe của một host.
func (r *WebProbeRepo) HistoryByHost(ctx context.Context, wsID uuid.UUID, host string) ([]models.WebProbe, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, workspace_id, target_id, job_id,
		       host, port, url, scheme, status_code, title, web_server,
		       technologies, content_type, content_length, response_time,
		       ip_address, is_alive, created_at, updated_at
		FROM web_probes
		WHERE workspace_id = $1 AND host = $2
		ORDER BY created_at DESC, port ASC
	`, wsID, host)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var probes []models.WebProbe
	for rows.Next() {
		var p models.WebProbe
		if err := rows.Scan(
			&p.ID, &p.WorkspaceID, &p.TargetID, &p.JobID,
			&p.Host, &p.Port, &p.URL, &p.Scheme, &p.StatusCode, &p.Title, &p.WebServer,
			&p.Technologies, &p.ContentType, &p.ContentLength, &p.ResponseTime,
			&p.IPAddress, &p.IsAlive, &p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			return nil, err
		}
		probes = append(probes, p)
	}
	return probes, nil
}
