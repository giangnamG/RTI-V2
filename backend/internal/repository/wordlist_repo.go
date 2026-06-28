package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/kowgi/rti-v2/internal/models"
)

type WordlistRepo struct {
	pool *pgxpool.Pool
}

func NewWordlistRepo(pool *pgxpool.Pool) *WordlistRepo {
	return &WordlistRepo{pool: pool}
}

// List trả về tất cả wordlists, optional filter theo category.
func (r *WordlistRepo) List(ctx context.Context, category string) ([]models.Wordlist, error) {
	q := `
		SELECT id, name, description, category, path, line_count, file_size_kb, is_builtin, created_at
		FROM wordlists
	`
	args := []any{}
	if category != "" {
		q += " WHERE category = $1"
		args = append(args, category)
	}
	q += " ORDER BY is_builtin DESC, category, line_count NULLS LAST"

	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.Wordlist
	for rows.Next() {
		var w models.Wordlist
		if err := rows.Scan(
			&w.ID, &w.Name, &w.Description, &w.Category, &w.Path,
			&w.LineCount, &w.FileSizeKB, &w.IsBuiltin, &w.CreatedAt,
		); err != nil {
			return nil, err
		}
		result = append(result, w)
	}
	return result, nil
}

// Categories trả về danh sách distinct categories.
func (r *WordlistRepo) Categories(ctx context.Context) ([]string, error) {
	rows, err := r.pool.Query(ctx, `SELECT DISTINCT category FROM wordlists ORDER BY category`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cats []string
	for rows.Next() {
		var c string
		if err := rows.Scan(&c); err != nil {
			continue
		}
		cats = append(cats, c)
	}
	return cats, nil
}
