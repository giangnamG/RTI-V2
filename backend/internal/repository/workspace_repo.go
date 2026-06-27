package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/kowgi/rti-v2/internal/models"
)

type WorkspaceRepo struct {
	db *pgxpool.Pool
}

func NewWorkspaceRepo(db *pgxpool.Pool) *WorkspaceRepo {
	return &WorkspaceRepo{db: db}
}

func (r *WorkspaceRepo) List(ctx context.Context) ([]*models.Workspace, error) {
	rows, err := r.db.Query(ctx, `
		SELECT w.id, w.name, w.description, w.color, w.created_at, w.updated_at,
		       COUNT(t.id) AS target_count
		FROM workspaces w
		LEFT JOIN targets t ON t.workspace_id = w.id
		GROUP BY w.id
		ORDER BY w.created_at DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("list workspaces: %w", err)
	}
	defer rows.Close()

	var list []*models.Workspace
	for rows.Next() {
		w := &models.Workspace{}
		if err := rows.Scan(&w.ID, &w.Name, &w.Description, &w.Color,
			&w.CreatedAt, &w.UpdatedAt, &w.TargetCount); err != nil {
			return nil, err
		}
		list = append(list, w)
	}
	return list, nil
}

func (r *WorkspaceRepo) GetByID(ctx context.Context, id string) (*models.Workspace, error) {
	w := &models.Workspace{}
	err := r.db.QueryRow(ctx, `
		SELECT w.id, w.name, w.description, w.color, w.created_at, w.updated_at,
		       COUNT(t.id) AS target_count
		FROM workspaces w
		LEFT JOIN targets t ON t.workspace_id = w.id
		WHERE w.id = $1
		GROUP BY w.id
	`, id).Scan(&w.ID, &w.Name, &w.Description, &w.Color,
		&w.CreatedAt, &w.UpdatedAt, &w.TargetCount)
	if err != nil {
		return nil, fmt.Errorf("get workspace: %w", err)
	}
	return w, nil
}

func (r *WorkspaceRepo) Create(ctx context.Context, req *models.CreateWorkspaceRequest) (*models.Workspace, error) {
	color := req.Color
	if color == "" {
		color = "#7c3aed"
	}
	w := &models.Workspace{}
	err := r.db.QueryRow(ctx, `
		INSERT INTO workspaces (name, description, color)
		VALUES ($1, $2, $3)
		RETURNING id, name, description, color, created_at, updated_at
	`, req.Name, req.Description, color).Scan(
		&w.ID, &w.Name, &w.Description, &w.Color, &w.CreatedAt, &w.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create workspace: %w", err)
	}
	return w, nil
}

func (r *WorkspaceRepo) Update(ctx context.Context, id string, req *models.UpdateWorkspaceRequest) (*models.Workspace, error) {
	w := &models.Workspace{}
	err := r.db.QueryRow(ctx, `
		UPDATE workspaces
		SET name = $2, description = $3, color = $4
		WHERE id = $1
		RETURNING id, name, description, color, created_at, updated_at
	`, id, req.Name, req.Description, req.Color).Scan(
		&w.ID, &w.Name, &w.Description, &w.Color, &w.CreatedAt, &w.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("update workspace: %w", err)
	}
	return w, nil
}

func (r *WorkspaceRepo) Delete(ctx context.Context, id string) error {
	tag, err := r.db.Exec(ctx, `DELETE FROM workspaces WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete workspace: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("workspace not found")
	}
	return nil
}
