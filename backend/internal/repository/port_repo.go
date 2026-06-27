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

// ListByWorkspace trả về trạng thái MỚI NHẤT của mỗi (host, port, protocol).
func (r *PortRepo) ListByWorkspace(ctx context.Context, wsID uuid.UUID) ([]models.Port, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT DISTINCT ON (host, port, protocol)
		       id, workspace_id, target_id, job_id,
		       host, ip_address, port, protocol, state, service_name, service_category, banner,
		       created_at, updated_at
		FROM ports
		WHERE workspace_id = $1
		ORDER BY host, port, protocol, created_at DESC
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
			&p.Host, &p.IPAddress, &p.Port, &p.Protocol, &p.State, &p.ServiceName, &p.ServiceCategory, &p.Banner,
			&p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			return nil, err
		}
		ports = append(ports, p)
	}
	return ports, nil
}

// HistoryByHost trả về TOÀN BỘ lịch sử port scan của một host, mới nhất trước.
func (r *PortRepo) HistoryByHost(ctx context.Context, wsID uuid.UUID, host string) ([]models.Port, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, workspace_id, target_id, job_id,
		       host, ip_address, port, protocol, state, service_name, service_category, banner,
		       created_at, updated_at
		FROM ports
		WHERE workspace_id = $1 AND host = $2
		ORDER BY created_at DESC, port ASC
	`, wsID, host)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ports []models.Port
	for rows.Next() {
		var p models.Port
		if err := rows.Scan(
			&p.ID, &p.WorkspaceID, &p.TargetID, &p.JobID,
			&p.Host, &p.IPAddress, &p.Port, &p.Protocol, &p.State, &p.ServiceName, &p.ServiceCategory, &p.Banner,
			&p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			return nil, err
		}
		ports = append(ports, p)
	}
	return ports, nil
}

// UpdateServiceInfo cho phép user override service_name và service_category của một port record.
func (r *PortRepo) UpdateServiceInfo(ctx context.Context, portID uuid.UUID, serviceName, serviceCategory string) error {
	var sn, sc *string
	if serviceName != "" {
		sn = &serviceName
	}
	if serviceCategory != "" {
		sc = &serviceCategory
	}
	_, err := r.pool.Exec(ctx, `
		UPDATE ports SET service_name=$1, service_category=$2, updated_at=NOW()
		WHERE id=$3
	`, sn, sc, portID)
	return err
}
