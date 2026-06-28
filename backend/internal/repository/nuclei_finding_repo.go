package repository

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
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

func (r *NucleiFindingRepo) List(ctx context.Context, wsID uuid.UUID, f NucleiFindingFilter) ([]models.NucleiFinding, error) {
	where := []string{"workspace_id = $1"}
	args := []any{wsID}

	if f.Severity != "" {
		args = append(args, f.Severity)
		where = append(where, fmt.Sprintf("severity = $%d", len(args)))
	}

	sql := `SELECT id, workspace_id, target_id, job_id,
	               template_id, matcher_name, protocol, title, severity, type, status,
	               host, url, port, extracted_results,
	               cve_id, cvss_score, evidence, remediation, created_at
	        FROM findings_nuclei
	        WHERE ` + strings.Join(where, " AND ") + `
	        ORDER BY
	          CASE severity
	            WHEN 'critical' THEN 1
	            WHEN 'high'     THEN 2
	            WHEN 'medium'   THEN 3
	            WHEN 'low'      THEN 4
	            ELSE 5
	          END,
	          created_at DESC`

	rows, err := r.db.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

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
