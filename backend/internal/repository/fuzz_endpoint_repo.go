package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/kowgi/rti-v2/internal/models"
)

type FuzzEndpointRepo struct {
	pool *pgxpool.Pool
}

func NewFuzzEndpointRepo(pool *pgxpool.Pool) *FuzzEndpointRepo {
	return &FuzzEndpointRepo{pool: pool}
}

const fuzzEndpointSelectCols = `
	id, workspace_id, target_id, job_id,
	url, method, content_type, params, has_csrf,
	source_url, source_type, created_at`

func scanFuzzEndpoint(row interface{ Scan(...any) error }) (models.FuzzEndpoint, error) {
	var e models.FuzzEndpoint
	err := row.Scan(
		&e.ID, &e.WorkspaceID, &e.TargetID, &e.JobID,
		&e.URL, &e.Method, &e.ContentType, &e.Params, &e.HasCSRF,
		&e.SourceURL, &e.SourceType, &e.CreatedAt,
	)
	return e, err
}

// List trả về endpoints mới nhất (DISTINCT ON url+method).
// Filter tùy chọn: method ("GET"|"POST"), source_type ("crawl_url"|"crawl_form").
func (r *FuzzEndpointRepo) List(
	ctx context.Context,
	wsID uuid.UUID,
	method string,
	sourceType string,
) ([]models.FuzzEndpoint, error) {
	where := "WHERE workspace_id = $1"
	args := []any{wsID}
	i := 2

	if method != "" {
		where += fmt.Sprintf(" AND method = $%d", i)
		args = append(args, method)
		i++
	}
	if sourceType != "" {
		where += fmt.Sprintf(" AND source_type = $%d", i)
		args = append(args, sourceType)
	}

	q := fmt.Sprintf(`
		SELECT DISTINCT ON (url, method) %s
		FROM fuzz_endpoints
		%s
		ORDER BY url, method, created_at DESC
	`, fuzzEndpointSelectCols, where)

	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.FuzzEndpoint
	for rows.Next() {
		e, err := scanFuzzEndpoint(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, e)
	}
	return result, nil
}

// Stats trả về thống kê tổng hợp cho workspace.
func (r *FuzzEndpointRepo) Stats(ctx context.Context, wsID uuid.UUID) (models.FuzzEndpointStats, error) {
	var s models.FuzzEndpointStats
	err := r.pool.QueryRow(ctx, `
		SELECT
			COUNT(*)                                             AS total,
			COUNT(*) FILTER (WHERE method = 'GET')              AS get_count,
			COUNT(*) FILTER (WHERE method = 'POST')             AS post_count,
			COUNT(*) FILTER (WHERE jsonb_array_length(params) > 0) AS with_params,
			COUNT(*) FILTER (WHERE has_csrf = true)             AS with_csrf
		FROM (
			SELECT DISTINCT ON (url, method)
				method, params, has_csrf
			FROM fuzz_endpoints
			WHERE workspace_id = $1
			ORDER BY url, method, created_at DESC
		) sub
	`, wsID).Scan(&s.Total, &s.GetCount, &s.PostCount, &s.WithParams, &s.WithCSRF)
	return s, err
}
