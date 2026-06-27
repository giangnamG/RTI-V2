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
		       ip_address::TEXT, notes, is_active, created_at
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
			&t.IPAddress, &t.Notes, &t.IsActive, &t.CreatedAt); err != nil {
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
		       ip_address::TEXT, notes, is_active, created_at
		FROM targets
		WHERE id = $1 AND workspace_id = $2
	`, id, workspaceID).Scan(&t.ID, &t.WorkspaceID, &t.Domain,
		&t.IPAddress, &t.Notes, &t.IsActive, &t.CreatedAt)
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
	err := r.db.QueryRow(ctx, `
		INSERT INTO targets (workspace_id, domain, ip_address, notes)
		VALUES ($1, $2, $3::INET, $4)
		RETURNING id, workspace_id, domain, ip_address::TEXT, notes, is_active, created_at
	`, workspaceID, req.Domain, ip, req.Notes).Scan(
		&t.ID, &t.WorkspaceID, &t.Domain, &t.IPAddress, &t.Notes, &t.IsActive, &t.CreatedAt,
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
		err := r.db.QueryRow(ctx, `
			INSERT INTO targets (workspace_id, domain, notes)
			VALUES ($1, $2, $3)
			ON CONFLICT (workspace_id, domain) DO NOTHING
			RETURNING id, workspace_id, domain, ip_address::TEXT, notes, is_active, created_at
		`, workspaceID, domain, notes).Scan(
			&t.ID, &t.WorkspaceID, &t.Domain, &t.IPAddress, &t.Notes, &t.IsActive, &t.CreatedAt,
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
	err := r.db.QueryRow(ctx, `
		UPDATE targets
		SET domain = $3, ip_address = $4::INET, notes = $5, is_active = $6
		WHERE id = $1 AND workspace_id = $2
		RETURNING id, workspace_id, domain, ip_address::TEXT, notes, is_active, created_at
	`, id, workspaceID, req.Domain, ip, req.Notes, isActive).Scan(
		&t.ID, &t.WorkspaceID, &t.Domain, &t.IPAddress, &t.Notes, &t.IsActive, &t.CreatedAt,
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
