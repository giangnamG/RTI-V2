package repository

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/kowgi/rti-v2/internal/models"
)

type FindingRepo struct {
	db *pgxpool.Pool
}

func NewFindingRepo(db *pgxpool.Pool) *FindingRepo {
	return &FindingRepo{db: db}
}

type FindingFilter struct {
	Severity string
	Type     string
	Status   string
}

func (r *FindingRepo) List(ctx context.Context, wsID uuid.UUID, f FindingFilter) ([]models.Finding, error) {
	where := []string{"workspace_id = $1"}
	args := []any{wsID}

	if f.Severity != "" {
		args = append(args, f.Severity)
		where = append(where, fmt.Sprintf("severity = $%d", len(args)))
	}
	if f.Type != "" {
		args = append(args, f.Type)
		where = append(where, fmt.Sprintf("type = $%d", len(args)))
	}
	if f.Status != "" {
		args = append(args, f.Status)
		where = append(where, fmt.Sprintf("status = $%d", len(args)))
	}

	sql := `SELECT id, workspace_id, target_id, job_id, title, severity, type, status,
	               cve_id, cvss_score, host, url, port, evidence, source, remediation,
	               created_at, updated_at
	        FROM findings
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

	var findings []models.Finding
	for rows.Next() {
		var f models.Finding
		err := rows.Scan(
			&f.ID, &f.WorkspaceID, &f.TargetID, &f.JobID,
			&f.Title, &f.Severity, &f.Type, &f.Status,
			&f.CVEID, &f.CVSSScore, &f.Host, &f.URL, &f.Port,
			&f.Evidence, &f.Source, &f.Remediation,
			&f.CreatedAt, &f.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		findings = append(findings, f)
	}
	return findings, nil
}

func (r *FindingRepo) Get(ctx context.Context, wsID, id uuid.UUID) (*models.Finding, error) {
	sql := `SELECT id, workspace_id, target_id, job_id, title, severity, type, status,
	               cve_id, cvss_score, host, url, port, evidence, source, remediation,
	               created_at, updated_at
	        FROM findings WHERE workspace_id = $1 AND id = $2`

	var f models.Finding
	err := r.db.QueryRow(ctx, sql, wsID, id).Scan(
		&f.ID, &f.WorkspaceID, &f.TargetID, &f.JobID,
		&f.Title, &f.Severity, &f.Type, &f.Status,
		&f.CVEID, &f.CVSSScore, &f.Host, &f.URL, &f.Port,
		&f.Evidence, &f.Source, &f.Remediation,
		&f.CreatedAt, &f.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &f, nil
}

type FindingInput struct {
	TargetID    *uuid.UUID
	JobID       *uuid.UUID
	Title       string
	Severity    string
	Type        string
	Status      string
	CVEID       *string
	CVSSScore   *float64
	Host        *string
	URL         *string
	Port        *int
	Evidence    *string
	Source      *string
	Remediation *string
}

func (r *FindingRepo) Create(ctx context.Context, wsID uuid.UUID, in FindingInput) (*models.Finding, error) {
	sql := `INSERT INTO findings
	          (workspace_id, target_id, job_id, title, severity, type, status,
	           cve_id, cvss_score, host, url, port, evidence, source, remediation)
	        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
	        RETURNING id, workspace_id, target_id, job_id, title, severity, type, status,
	                  cve_id, cvss_score, host, url, port, evidence, source, remediation,
	                  created_at, updated_at`

	var f models.Finding
	err := r.db.QueryRow(ctx, sql,
		wsID, in.TargetID, in.JobID, in.Title, in.Severity, in.Type, in.Status,
		in.CVEID, in.CVSSScore, in.Host, in.URL, in.Port,
		in.Evidence, in.Source, in.Remediation,
	).Scan(
		&f.ID, &f.WorkspaceID, &f.TargetID, &f.JobID,
		&f.Title, &f.Severity, &f.Type, &f.Status,
		&f.CVEID, &f.CVSSScore, &f.Host, &f.URL, &f.Port,
		&f.Evidence, &f.Source, &f.Remediation,
		&f.CreatedAt, &f.UpdatedAt,
	)
	return &f, err
}

func (r *FindingRepo) Update(ctx context.Context, wsID, id uuid.UUID, in FindingInput) (*models.Finding, error) {
	sql := `UPDATE findings SET
	          title=$3, severity=$4, type=$5, status=$6,
	          cve_id=$7, cvss_score=$8, host=$9, url=$10, port=$11,
	          evidence=$12, source=$13, remediation=$14,
	          updated_at=NOW()
	        WHERE workspace_id=$1 AND id=$2
	        RETURNING id, workspace_id, target_id, job_id, title, severity, type, status,
	                  cve_id, cvss_score, host, url, port, evidence, source, remediation,
	                  created_at, updated_at`

	var f models.Finding
	err := r.db.QueryRow(ctx, sql,
		wsID, id,
		in.Title, in.Severity, in.Type, in.Status,
		in.CVEID, in.CVSSScore, in.Host, in.URL, in.Port,
		in.Evidence, in.Source, in.Remediation,
	).Scan(
		&f.ID, &f.WorkspaceID, &f.TargetID, &f.JobID,
		&f.Title, &f.Severity, &f.Type, &f.Status,
		&f.CVEID, &f.CVSSScore, &f.Host, &f.URL, &f.Port,
		&f.Evidence, &f.Source, &f.Remediation,
		&f.CreatedAt, &f.UpdatedAt,
	)
	return &f, err
}

func (r *FindingRepo) Delete(ctx context.Context, wsID, id uuid.UUID) error {
	_, err := r.db.Exec(ctx,
		`DELETE FROM findings WHERE workspace_id = $1 AND id = $2`, wsID, id)
	return err
}

// Stats trả về số lượng findings theo severity để hiển thị trên dashboard
func (r *FindingRepo) Stats(ctx context.Context, wsID uuid.UUID) (map[string]int, error) {
	rows, err := r.db.Query(ctx,
		`SELECT severity, COUNT(*) FROM findings
		 WHERE workspace_id = $1 AND status != 'false_positive'
		 GROUP BY severity`, wsID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	stats := map[string]int{"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
	for rows.Next() {
		var sev string
		var cnt int
		if err := rows.Scan(&sev, &cnt); err != nil {
			return nil, err
		}
		stats[sev] = cnt
	}
	return stats, nil
}
