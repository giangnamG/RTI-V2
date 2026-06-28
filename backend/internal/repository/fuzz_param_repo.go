package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/kowgi/rti-v2/internal/models"
)

type FuzzParamRepo struct {
	pool *pgxpool.Pool
}

func NewFuzzParamRepo(pool *pgxpool.Pool) *FuzzParamRepo {
	return &FuzzParamRepo{pool: pool}
}

const fuzzParamSelectCols = `id, workspace_id, target_id, job_id, url, method, params, created_at`

func scanFuzzParamResult(row interface{ Scan(...any) error }) (models.FuzzParamResult, error) {
	var r models.FuzzParamResult
	err := row.Scan(&r.ID, &r.WorkspaceID, &r.TargetID, &r.JobID, &r.URL, &r.Method, &r.Params, &r.CreatedAt)
	return r, err
}

// List trả về kết quả mới nhất per (url, method).
func (r *FuzzParamRepo) List(
	ctx context.Context,
	wsID uuid.UUID,
	method string,
) ([]models.FuzzParamResult, error) {
	where := "WHERE workspace_id = $1"
	args := []any{wsID}
	i := 2

	if method != "" {
		where += fmt.Sprintf(" AND method = $%d", i)
		args = append(args, method)
	}

	q := fmt.Sprintf(`
		SELECT DISTINCT ON (url, method) %s
		FROM fuzz_param_results
		%s
		ORDER BY url, method, created_at DESC
	`, fuzzParamSelectCols, where)

	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.FuzzParamResult
	for rows.Next() {
		item, err := scanFuzzParamResult(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, nil
}

// Stats trả về thống kê tổng hợp.
func (r *FuzzParamRepo) Stats(ctx context.Context, wsID uuid.UUID) (models.FuzzParamStats, error) {
	var s models.FuzzParamStats
	err := r.pool.QueryRow(ctx, `
		SELECT
			COUNT(*)                                      AS total,
			COUNT(*) FILTER (WHERE jsonb_array_length(params) > 0) AS endpoints_with_params,
			COALESCE(SUM(jsonb_array_length(params)), 0)  AS total_params
		FROM (
			SELECT DISTINCT ON (url, method) params
			FROM fuzz_param_results
			WHERE workspace_id = $1
			ORDER BY url, method, created_at DESC
		) sub
	`, wsID).Scan(&s.Total, &s.EndpointsWithParams, &s.TotalParams)
	return s, err
}
