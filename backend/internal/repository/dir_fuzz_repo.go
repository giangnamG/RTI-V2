package repository

import (
	"context"
	"fmt"
	"strconv"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/kowgi/rti-v2/internal/models"
)

type DirFuzzRepo struct {
	pool *pgxpool.Pool
}

func NewDirFuzzRepo(pool *pgxpool.Pool) *DirFuzzRepo {
	return &DirFuzzRepo{pool: pool}
}

const dirFuzzSelectCols = `
	id, workspace_id, target_id, job_id,
	base_url, path, url, status_code, content_length,
	content_type, words, lines, redirect_url, is_interesting, created_at`

func scanDirFuzzResult(row interface{ Scan(...any) error }) (models.DirFuzzResult, error) {
	var r models.DirFuzzResult
	err := row.Scan(
		&r.ID, &r.WorkspaceID, &r.TargetID, &r.JobID,
		&r.BaseURL, &r.Path, &r.URL, &r.StatusCode, &r.ContentLength,
		&r.ContentType, &r.Words, &r.Lines, &r.RedirectURL, &r.IsInteresting, &r.CreatedAt,
	)
	return r, err
}

// List trả về dir fuzz results với optional filters.
func (r *DirFuzzRepo) List(
	ctx context.Context,
	wsID uuid.UUID,
	statusCode int,
	interestingOnly bool,
) ([]models.DirFuzzResult, error) {
	where := "WHERE workspace_id = $1"
	args := []any{wsID}
	i := 2

	if statusCode > 0 {
		where += fmt.Sprintf(" AND status_code = $%d", i)
		args = append(args, statusCode)
		i++
	}
	if interestingOnly {
		where += " AND is_interesting = TRUE"
	}

	q := fmt.Sprintf(`
		SELECT %s
		FROM dir_fuzz_results
		%s
		ORDER BY is_interesting DESC, status_code, created_at DESC
		LIMIT 2000
	`, dirFuzzSelectCols, where)

	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.DirFuzzResult
	for rows.Next() {
		item, err := scanDirFuzzResult(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, nil
}

// Stats trả về thống kê tổng hợp.
func (r *DirFuzzRepo) Stats(ctx context.Context, wsID uuid.UUID) (models.DirFuzzStats, error) {
	var s models.DirFuzzStats
	s.ByStatus = make(map[string]int)

	var total, interesting int
	err := r.pool.QueryRow(ctx, `
		SELECT
			COUNT(*)                                          AS total,
			COUNT(*) FILTER (WHERE is_interesting = TRUE)    AS interesting
		FROM dir_fuzz_results
		WHERE workspace_id = $1
	`, wsID).Scan(&total, &interesting)
	if err != nil {
		return s, err
	}
	s.Total = total
	s.Interesting = interesting

	rows, err := r.pool.Query(ctx, `
		SELECT status_code, COUNT(*) AS cnt
		FROM dir_fuzz_results
		WHERE workspace_id = $1
		GROUP BY status_code
		ORDER BY cnt DESC
	`, wsID)
	if err != nil {
		return s, err
	}
	defer rows.Close()

	for rows.Next() {
		var code, cnt int
		if err := rows.Scan(&code, &cnt); err != nil {
			continue
		}
		s.ByStatus[strconv.Itoa(code)] = cnt
	}
	return s, nil
}
