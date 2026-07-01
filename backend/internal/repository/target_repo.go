package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/kowgi/rti-v2/internal/models"
)

type TargetRepo struct {
	db *pgxpool.Pool
}

func NewTargetRepo(db *pgxpool.Pool) *TargetRepo {
	return &TargetRepo{db: db}
}

func (r *TargetRepo) List(ctx context.Context, workspaceID string) ([]*models.Target, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, workspace_id, domain,
		       ip_address::TEXT, notes, is_active, created_at,
		       scheme, host, port, is_ip
		FROM targets
		WHERE workspace_id = $1
		ORDER BY created_at DESC
	`, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list targets: %w", err)
	}
	defer rows.Close()

	var list []*models.Target
	for rows.Next() {
		t := &models.Target{}
		if err := rows.Scan(&t.ID, &t.WorkspaceID, &t.Domain,
			&t.IPAddress, &t.Notes, &t.IsActive, &t.CreatedAt,
			&t.Scheme, &t.Host, &t.Port, &t.IsIP); err != nil {
			return nil, err
		}
		list = append(list, t)
	}
	return list, nil
}

func (r *TargetRepo) GetByID(ctx context.Context, workspaceID, id string) (*models.Target, error) {
	t := &models.Target{}
	err := r.db.QueryRow(ctx, `
		SELECT id, workspace_id, domain,
		       ip_address::TEXT, notes, is_active, created_at,
		       scheme, host, port, is_ip
		FROM targets
		WHERE id = $1 AND workspace_id = $2
	`, id, workspaceID).Scan(&t.ID, &t.WorkspaceID, &t.Domain,
		&t.IPAddress, &t.Notes, &t.IsActive, &t.CreatedAt,
		&t.Scheme, &t.Host, &t.Port, &t.IsIP)
	if err != nil {
		return nil, fmt.Errorf("get target: %w", err)
	}
	return t, nil
}

func (r *TargetRepo) Create(ctx context.Context, workspaceID string, req *models.CreateTargetRequest) (*models.Target, error) {
	t := &models.Target{}
	var ip *string
	if req.IPAddress != "" {
		ip = &req.IPAddress
	}
	pt := models.ParseTarget(req.Domain)
	err := r.db.QueryRow(ctx, `
		INSERT INTO targets (workspace_id, domain, ip_address, notes, scheme, host, port, is_ip)
		VALUES ($1, $2, $3::INET, $4, $5, $6, $7, $8)
		RETURNING id, workspace_id, domain, ip_address::TEXT, notes, is_active, created_at,
		          scheme, host, port, is_ip
	`, workspaceID, req.Domain, ip, req.Notes, pt.Scheme, pt.Host, pt.Port, pt.IsIP).Scan(
		&t.ID, &t.WorkspaceID, &t.Domain, &t.IPAddress, &t.Notes, &t.IsActive, &t.CreatedAt,
		&t.Scheme, &t.Host, &t.Port, &t.IsIP,
	)
	if err != nil {
		return nil, fmt.Errorf("create target: %w", err)
	}
	return t, nil
}

// BulkCreate thêm nhiều domain, bỏ qua domain trùng (ON CONFLICT DO NOTHING)
func (r *TargetRepo) BulkCreate(ctx context.Context, workspaceID string, domains []string, notes string) ([]*models.Target, error) {
	var created []*models.Target
	for _, domain := range domains {
		t := &models.Target{}
		pt := models.ParseTarget(domain)
		err := r.db.QueryRow(ctx, `
			INSERT INTO targets (workspace_id, domain, notes, scheme, host, port, is_ip)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
			ON CONFLICT (workspace_id, domain) DO NOTHING
			RETURNING id, workspace_id, domain, ip_address::TEXT, notes, is_active, created_at,
			          scheme, host, port, is_ip
		`, workspaceID, domain, notes, pt.Scheme, pt.Host, pt.Port, pt.IsIP).Scan(
			&t.ID, &t.WorkspaceID, &t.Domain, &t.IPAddress, &t.Notes, &t.IsActive, &t.CreatedAt,
			&t.Scheme, &t.Host, &t.Port, &t.IsIP,
		)
		if err != nil {
			continue // bỏ qua domain trùng hoặc lỗi
		}
		created = append(created, t)
	}
	return created, nil
}

func (r *TargetRepo) Update(ctx context.Context, workspaceID, id string, req *models.UpdateTargetRequest) (*models.Target, error) {
	t := &models.Target{}
	var ip *string
	if req.IPAddress != "" {
		ip = &req.IPAddress
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}
	pt := models.ParseTarget(req.Domain)
	err := r.db.QueryRow(ctx, `
		UPDATE targets
		SET domain = $3, ip_address = $4::INET, notes = $5, is_active = $6,
		    scheme = $7, host = $8, port = $9, is_ip = $10
		WHERE id = $1 AND workspace_id = $2
		RETURNING id, workspace_id, domain, ip_address::TEXT, notes, is_active, created_at,
		          scheme, host, port, is_ip
	`, id, workspaceID, req.Domain, ip, req.Notes, isActive,
		pt.Scheme, pt.Host, pt.Port, pt.IsIP).Scan(
		&t.ID, &t.WorkspaceID, &t.Domain, &t.IPAddress, &t.Notes, &t.IsActive, &t.CreatedAt,
		&t.Scheme, &t.Host, &t.Port, &t.IsIP,
	)
	if err != nil {
		return nil, fmt.Errorf("update target: %w", err)
	}
	return t, nil
}

func (r *TargetRepo) Delete(ctx context.Context, workspaceID, id string) error {
	tag, err := r.db.Exec(ctx, `
		DELETE FROM targets WHERE id = $1 AND workspace_id = $2
	`, id, workspaceID)
	if err != nil {
		return fmt.Errorf("delete target: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("target not found")
	}
	return nil
}
