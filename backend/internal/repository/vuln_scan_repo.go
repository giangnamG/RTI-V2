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

type VulnScanRepo struct {
	db *pgxpool.Pool
}

func NewVulnScanRepo(db *pgxpool.Pool) *VulnScanRepo {
	return &VulnScanRepo{db: db}
}

type VulnRunFilter struct {
	Domain string
	Tool   string
	Status string
}

func (r *VulnScanRepo) ListRuns(ctx context.Context, wsID uuid.UUID, f VulnRunFilter) ([]models.VulnScanRun, error) {
	where := []string{"workspace_id = $1"}
	args := []any{wsID}

	if f.Domain != "" {
		args = append(args, f.Domain)
		where = append(where, fmt.Sprintf("domain = $%d", len(args)))
	}
	if f.Tool != "" {
		args = append(args, f.Tool)
		where = append(where, fmt.Sprintf("tool = $%d", len(args)))
	}
	if f.Status != "" {
		args = append(args, f.Status)
		where = append(where, fmt.Sprintf("status = $%d", len(args)))
	}

	sql := `SELECT id, workspace_id, target_id, job_id, domain, tool, target_url,
	               status, skip_reason, findings_count, started_at, finished_at, created_at
	        FROM vuln_scan_runs
	        WHERE ` + strings.Join(where, " AND ") + `
	        ORDER BY created_at DESC`

	rows, err := r.db.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []models.VulnScanRun
	for rows.Next() {
		var v models.VulnScanRun
		if err := rows.Scan(
			&v.ID, &v.WorkspaceID, &v.TargetID, &v.JobID,
			&v.Domain, &v.Tool, &v.TargetURL,
			&v.Status, &v.SkipReason, &v.FindingsCount,
			&v.StartedAt, &v.FinishedAt, &v.CreatedAt,
		); err != nil {
			return nil, err
		}
		items = append(items, v)
	}
	if items == nil {
		items = []models.VulnScanRun{}
	}
	return items, nil
}

type VulnFindingFilter struct {
	Domain   string
	Tool     string
	Severity string
}

const findingCols = `id, workspace_id, target_id, job_id, title, severity, type, status,
	               cve_id, cvss_score, host, url, port, evidence, source, remediation,
	               source_tool, source_domain, created_at, updated_at`

const findingSevOrder = `CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ` +
	`WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END, created_at DESC`

func scanFindings(rows pgx.Rows) ([]models.Finding, error) {
	var items []models.Finding
	for rows.Next() {
		var v models.Finding
		if err := rows.Scan(
			&v.ID, &v.WorkspaceID, &v.TargetID, &v.JobID,
			&v.Title, &v.Severity, &v.Type, &v.Status,
			&v.CVEID, &v.CVSSScore, &v.Host, &v.URL, &v.Port,
			&v.Evidence, &v.Source, &v.Remediation,
			&v.SourceTool, &v.SourceDomain,
			&v.CreatedAt, &v.UpdatedAt,
		); err != nil {
			return nil, err
		}
		items = append(items, v)
	}
	if items == nil {
		items = []models.Finding{}
	}
	return items, nil
}

// ListFindings — append-only: mỗi lần scan append rows mới. Bảng chính chỉ hiện
// findings của RUN MỚI NHẤT cho mỗi source_tool (lịch sử xem qua ListFindingsHistory).
func (r *VulnScanRepo) ListFindings(ctx context.Context, wsID uuid.UUID, f VulnFindingFilter) ([]models.Finding, error) {
	inner := []string{"workspace_id = $1", "source_tool IS NOT NULL"}
	args := []any{wsID}
	if f.Domain != "" {
		args = append(args, f.Domain)
		inner = append(inner, fmt.Sprintf("source_domain = $%d", len(args)))
	}
	if f.Tool != "" {
		args = append(args, f.Tool)
		inner = append(inner, fmt.Sprintf("source_tool = $%d", len(args)))
	}
	outer := []string{"job_id IS NOT DISTINCT FROM latest_job"}
	if f.Severity != "" {
		args = append(args, f.Severity)
		outer = append(outer, fmt.Sprintf("severity = $%d", len(args)))
	}

	sql := `SELECT ` + findingCols + ` FROM (
	            SELECT ` + findingCols + `,
	                   first_value(job_id) OVER (PARTITION BY source_tool ORDER BY created_at DESC, id DESC) AS latest_job
	            FROM findings
	            WHERE ` + strings.Join(inner, " AND ") + `
	        ) t
	        WHERE ` + strings.Join(outer, " AND ") + `
	        ORDER BY ` + findingSevOrder

	rows, err := r.db.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanFindings(rows)
}

// ListFindingsHistory — TẤT CẢ findings (mọi lần chạy) cho HistoryDrawer; frontend nhóm theo job_id.
func (r *VulnScanRepo) ListFindingsHistory(ctx context.Context, wsID uuid.UUID, domain, tool string) ([]models.Finding, error) {
	where := []string{"workspace_id = $1", "source_tool IS NOT NULL"}
	args := []any{wsID}
	if domain != "" {
		args = append(args, domain)
		where = append(where, fmt.Sprintf("source_domain = $%d", len(args)))
	}
	if tool != "" {
		args = append(args, tool)
		where = append(where, fmt.Sprintf("source_tool = $%d", len(args)))
	}
	sql := `SELECT ` + findingCols + ` FROM findings
	        WHERE ` + strings.Join(where, " AND ") + `
	        ORDER BY created_at DESC`
	rows, err := r.db.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanFindings(rows)
}

type VulnDomainSummary struct {
	Domain        string `json:"domain"`
	TotalRuns     int    `json:"total_runs"`
	CompletedRuns int    `json:"completed_runs"`
	SkippedRuns   int    `json:"skipped_runs"`
	FailedRuns    int    `json:"failed_runs"`
	TotalFindings int    `json:"total_findings"`
}

func (r *VulnScanRepo) DomainSummary(ctx context.Context, wsID uuid.UUID) ([]VulnDomainSummary, error) {
	sql := `SELECT
	            domain,
	            COUNT(*) AS total_runs,
	            COUNT(*) FILTER (WHERE status = 'completed') AS completed_runs,
	            COUNT(*) FILTER (WHERE status = 'skipped')   AS skipped_runs,
	            COUNT(*) FILTER (WHERE status = 'failed')    AS failed_runs,
	            COALESCE(SUM(findings_count), 0)             AS total_findings
	        FROM vuln_scan_runs
	        WHERE workspace_id = $1
	        GROUP BY domain
	        ORDER BY domain`

	rows, err := r.db.Query(ctx, sql, wsID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []VulnDomainSummary
	for rows.Next() {
		var v VulnDomainSummary
		if err := rows.Scan(&v.Domain, &v.TotalRuns, &v.CompletedRuns, &v.SkippedRuns, &v.FailedRuns, &v.TotalFindings); err != nil {
			return nil, err
		}
		items = append(items, v)
	}
	if items == nil {
		items = []VulnDomainSummary{}
	}
	return items, nil
}
