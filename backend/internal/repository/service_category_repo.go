package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/kowgi/rti-v2/internal/models"
)

type ServiceCategoryRepo struct {
	pool *pgxpool.Pool
}

func NewServiceCategoryRepo(pool *pgxpool.Pool) *ServiceCategoryRepo {
	return &ServiceCategoryRepo{pool: pool}
}

func (r *ServiceCategoryRepo) List(ctx context.Context) ([]models.ServiceCategory, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, name, label, description, color, service_names, module_types, created_at, updated_at
		FROM service_categories
		ORDER BY name ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cats []models.ServiceCategory
	for rows.Next() {
		var c models.ServiceCategory
		if err := rows.Scan(
			&c.ID, &c.Name, &c.Label, &c.Description, &c.Color,
			&c.ServiceNames, &c.ModuleTypes, &c.CreatedAt, &c.UpdatedAt,
		); err != nil {
			return nil, err
		}
		cats = append(cats, c)
	}
	return cats, nil
}

func (r *ServiceCategoryRepo) Create(ctx context.Context, c *models.ServiceCategory) (*models.ServiceCategory, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO service_categories (name, label, description, color, service_names, module_types)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, name, label, description, color, service_names, module_types, created_at, updated_at
	`, c.Name, c.Label, c.Description, c.Color, c.ServiceNames, c.ModuleTypes)

	var result models.ServiceCategory
	if err := row.Scan(
		&result.ID, &result.Name, &result.Label, &result.Description, &result.Color,
		&result.ServiceNames, &result.ModuleTypes, &result.CreatedAt, &result.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return &result, nil
}

func (r *ServiceCategoryRepo) Update(ctx context.Context, id uuid.UUID, c *models.ServiceCategory) (*models.ServiceCategory, error) {
	row := r.pool.QueryRow(ctx, `
		UPDATE service_categories
		SET name=$1, label=$2, description=$3, color=$4, service_names=$5, module_types=$6, updated_at=NOW()
		WHERE id=$7
		RETURNING id, name, label, description, color, service_names, module_types, created_at, updated_at
	`, c.Name, c.Label, c.Description, c.Color, c.ServiceNames, c.ModuleTypes, id)

	var result models.ServiceCategory
	if err := row.Scan(
		&result.ID, &result.Name, &result.Label, &result.Description, &result.Color,
		&result.ServiceNames, &result.ModuleTypes, &result.CreatedAt, &result.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return &result, nil
}

func (r *ServiceCategoryRepo) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM service_categories WHERE id=$1`, id)
	return err
}
