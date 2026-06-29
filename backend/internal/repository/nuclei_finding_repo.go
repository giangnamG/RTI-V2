package repository

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/kowgi/rti-v2/internal/models"
)

type NucleiFindingRepo struct {
	db *pgxpool.Pool
}

func NewNucleiFindingRepo(db *pgxpool.Pool) *NucleiFindingRepo {
	return &NucleiFindingRepo{db: db}
}

type NucleiFindingFilter struct {
	Severity string
}

const nucleiCols = `id, workspace_id, target_id, job_id,
	               template_id, matcher_name, protocol, title, severity, type, status,
	               host, url, port, extracted_results,
	               cve_id, cvss_score, evidence, remediation, created_at`

const nucleiSevOrder = `CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ` +
	`WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END, created_at DESC`

func scanNucleiFindings(rows pgx.Rows) ([]models.NucleiFinding, error) {
	var items []models.NucleiFinding
	for rows.Next() {
		var v models.NucleiFinding
		if err := rows.Scan(
			&v.ID, &v.WorkspaceID, &v.TargetID, &v.JobID,
			&v.TemplateID, &v.MatcherName, &v.Protocol,
			&v.Title, &v.Severity, &v.Type, &v.Status,
			&v.Host, &v.URL, &v.Port, &v.ExtractedResults,
			&v.CVEID, &v.CVSSScore, &v.Evidence, &v.Remediation,
			&v.CreatedAt,
		); err != nil {
			return nil, err
		}
		items = append(items, v)
	}
	if items == nil {
		items = []models.NucleiFinding{}
	}
	return items, nil
}

// List — Nuclei chạy workspace-level: bảng chính chỉ hiện RUN MỚI NHẤT (job_id gần nhất).
func (r *NucleiFindingRepo) List(ctx context.Context, wsID uuid.UUID, f NucleiFindingFilter) ([]models.NucleiFinding, error) {
	args := []any{wsID}
	outer := []string{"job_id IS NOT DISTINCT FROM latest_job"}
	if f.Severity != "" {
		args = append(args, f.Severity)
		outer = append(outer, fmt.Sprintf("severity = $%d", len(args)))
	}

	sql := `SELECT ` + nucleiCols + ` FROM (
	            SELECT ` + nucleiCols + `,
	                   first_value(job_id) OVER (ORDER BY created_at DESC, id DESC) AS latest_job
	            FROM findings_nuclei
	            WHERE workspace_id = $1
	        ) t
	        WHERE ` + strings.Join(outer, " AND ") + `
	        ORDER BY ` + nucleiSevOrder

	rows, err := r.db.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanNucleiFindings(rows)
}

// ListHistory — TẤT CẢ nuclei findings (mọi lần chạy) cho HistoryDrawer; frontend nhóm theo job_id.
func (r *NucleiFindingRepo) ListHistory(ctx context.Context, wsID uuid.UUID) ([]models.NucleiFinding, error) {
	sql := `SELECT ` + nucleiCols + ` FROM findings_nuclei
	        WHERE workspace_id = $1
	        ORDER BY created_at DESC`
	rows, err := r.db.Query(ctx, sql, wsID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanNucleiFindings(rows)
}
