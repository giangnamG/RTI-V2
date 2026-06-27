package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/kowgi/rti-v2/internal/models"
)

type PortRepo struct {
	pool *pgxpool.Pool
}

func NewPortRepo(pool *pgxpool.Pool) *PortRepo {
	return &PortRepo{pool: pool}
}

func (r *PortRepo) ListByWorkspace(ctx context.Context, wsID uuid.UUID) ([]models.Port, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, workspace_id, target_id, job_id,
		       host, ip_address, port, protocol, state, service_name, banner,
		       created_at, updated_at
		FROM ports
		WHERE workspace_id = $1
		ORDER BY host, port
	`, wsID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ports []models.Port
	for rows.Next() {
		var p models.Port
		if err := rows.Scan(
			&p.ID, &p.WorkspaceID, &p.TargetID, &p.JobID,
			&p.Host, &p.IPAddress, &p.Port, &p.Protocol, &p.State, &p.ServiceName, &p.Banner,
			&p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			return nil, err
		}
		ports = append(ports, p)
	}
	return ports, nil
}
