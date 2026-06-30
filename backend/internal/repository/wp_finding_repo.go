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

// WPRepo — 1 repo phục vụ cả 2 bảng riêng (wpscan_finding, wpprobe_finding)
// + danh sách host WordPress (web_probes). Giữ wiring tối thiểu.
type WPRepo struct {
	db *pgxpool.Pool
}

func NewWPRepo(db *pgxpool.Pool) *WPRepo {
	return &WPRepo{db: db}
}

// Latest-run PER target (rules/data-model.md R7): COALESCE(target_id, host) vì
// target_id có thể NULL khi không propagate qua pipeline.
const wpLatestPartition = `first_value(job_id) OVER (PARTITION BY COALESCE(target_id::text, host) ` +
	`ORDER BY created_at DESC, id DESC) AS latest_job`

const wpSevOrder = `CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ` +
	`WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END, created_at DESC`

// ── WPScan ───────────────────────────────────────────────────
const wpscanCols = `id, workspace_id, target_id, job_id,
	host, url, port, scheme,
	component, component_name, component_version, fixed_in,
	title, severity, type, status,
	cve_id, cvss_score, refs, evidence, remediation, raw, created_at`

func scanWPScan(rows pgx.Rows) ([]models.WPScanFinding, error) {
	items := []models.WPScanFinding{}
	for rows.Next() {
		var v models.WPScanFinding
		if err := rows.Scan(
			&v.ID, &v.WorkspaceID, &v.TargetID, &v.JobID,
			&v.Host, &v.URL, &v.Port, &v.Scheme,
			&v.Component, &v.ComponentName, &v.ComponentVersion, &v.FixedIn,
			&v.Title, &v.Severity, &v.Type, &v.Status,
			&v.CVEID, &v.CVSSScore, &v.Refs, &v.Evidence, &v.Remediation, &v.Raw, &v.CreatedAt,
		); err != nil {
			return nil, err
		}
		items = append(items, v)
	}
	return items, nil
}

// ListWPScan — RUN MỚI NHẤT per target. Lọc tùy chọn ?severity= và ?target=.
func (r *WPRepo) ListWPScan(ctx context.Context, wsID uuid.UUID, severity, target string) ([]models.WPScanFinding, error) {
	inner := []string{"workspace_id = $1"}
	args := []any{wsID}
	if target != "" {
		args = append(args, target)
		inner = append(inner, fmt.Sprintf("target_id = $%d", len(args)))
	}
	outer := []string{"job_id IS NOT DISTINCT FROM latest_job"}
	if severity != "" {
		args = append(args, severity)
		outer = append(outer, fmt.Sprintf("severity = $%d", len(args)))
	}
	sql := `SELECT ` + wpscanCols + ` FROM (
	            SELECT ` + wpscanCols + `, ` + wpLatestPartition + `
	            FROM wpscan_finding
	            WHERE ` + strings.Join(inner, " AND ") + `
	        ) t
	        WHERE ` + strings.Join(outer, " AND ") + `
	        ORDER BY ` + wpSevOrder
	rows, err := r.db.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanWPScan(rows)
}

// ListWPScanHistory — TẤT CẢ lần chạy (cho HistoryDrawer, nhóm theo job_id).
func (r *WPRepo) ListWPScanHistory(ctx context.Context, wsID uuid.UUID, target string) ([]models.WPScanFinding, error) {
	where := []string{"workspace_id = $1"}
	args := []any{wsID}
	if target != "" {
		args = append(args, target)
		where = append(where, fmt.Sprintf("target_id = $%d", len(args)))
	}
	sql := `SELECT ` + wpscanCols + ` FROM wpscan_finding
	        WHERE ` + strings.Join(where, " AND ") + `
	        ORDER BY created_at DESC, id DESC`
	rows, err := r.db.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanWPScan(rows)
}

// ── WPProbe ──────────────────────────────────────────────────
const wpprobeCols = `id, workspace_id, target_id, job_id,
	host, url, port, component, plugin, version, confidence,
	title, severity, type, status,
	cve_id, cvss_score, cvss_vector, auth_type, refs, raw, created_at`

func scanWPProbe(rows pgx.Rows) ([]models.WPProbeFinding, error) {
	items := []models.WPProbeFinding{}
	for rows.Next() {
		var v models.WPProbeFinding
		if err := rows.Scan(
			&v.ID, &v.WorkspaceID, &v.TargetID, &v.JobID,
			&v.Host, &v.URL, &v.Port, &v.Component, &v.Plugin, &v.Version, &v.Confidence,
			&v.Title, &v.Severity, &v.Type, &v.Status,
			&v.CVEID, &v.CVSSScore, &v.CVSSVector, &v.AuthType, &v.Refs, &v.Raw, &v.CreatedAt,
		); err != nil {
			return nil, err
		}
		items = append(items, v)
	}
	return items, nil
}

// ListWPProbe — RUN MỚI NHẤT per target. Lọc tùy chọn ?severity= và ?target=.
func (r *WPRepo) ListWPProbe(ctx context.Context, wsID uuid.UUID, severity, target string) ([]models.WPProbeFinding, error) {
	inner := []string{"workspace_id = $1"}
	args := []any{wsID}
	if target != "" {
		args = append(args, target)
		inner = append(inner, fmt.Sprintf("target_id = $%d", len(args)))
	}
	outer := []string{"job_id IS NOT DISTINCT FROM latest_job"}
	if severity != "" {
		args = append(args, severity)
		outer = append(outer, fmt.Sprintf("severity = $%d", len(args)))
	}
	sql := `SELECT ` + wpprobeCols + ` FROM (
	            SELECT ` + wpprobeCols + `, ` + wpLatestPartition + `
	            FROM wpprobe_finding
	            WHERE ` + strings.Join(inner, " AND ") + `
	        ) t
	        WHERE ` + strings.Join(outer, " AND ") + `
	        ORDER BY ` + wpSevOrder
	rows, err := r.db.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanWPProbe(rows)
}

// ListWPProbeHistory — TẤT CẢ lần chạy.
func (r *WPRepo) ListWPProbeHistory(ctx context.Context, wsID uuid.UUID, target string) ([]models.WPProbeFinding, error) {
	where := []string{"workspace_id = $1"}
	args := []any{wsID}
	if target != "" {
		args = append(args, target)
		where = append(where, fmt.Sprintf("target_id = $%d", len(args)))
	}
	sql := `SELECT ` + wpprobeCols + ` FROM wpprobe_finding
	        WHERE ` + strings.Join(where, " AND ") + `
	        ORDER BY created_at DESC, id DESC`
	rows, err := r.db.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanWPProbe(rows)
}

// ── WordPress targets ────────────────────────────────────────
// Host WordPress = web_probes LIVE có technologies chứa 'wordpress' (tag từ WhatWeb/httpx).
// DISTINCT ON (host, port) → endpoint mới nhất.
func (r *WPRepo) ListTargets(ctx context.Context, wsID uuid.UUID) ([]models.WordPressTarget, error) {
	// Canonical 1 row/host: ưu tiên https (port cao) — gộp http:80 + https:443 cùng host
	// thành 1 endpoint https (tránh hiển thị + quét trùng do 301 redirect).
	sql := `SELECT DISTINCT ON (host)
	            host, port, url, scheme, target_id, title, technologies
	        FROM (
	            SELECT DISTINCT ON (host, port)
	                   host, port, url, scheme, target_id, title, technologies, created_at
	            FROM web_probes
	            WHERE workspace_id = $1 AND is_alive = true
	              AND EXISTS (SELECT 1 FROM unnest(technologies) tech WHERE tech ILIKE '%wordpress%')
	            ORDER BY host, port, created_at DESC
	        ) p
	        ORDER BY host, (scheme = 'https') DESC, port DESC, created_at DESC`
	rows, err := r.db.Query(ctx, sql, wsID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []models.WordPressTarget{}
	for rows.Next() {
		var v models.WordPressTarget
		if err := rows.Scan(&v.Host, &v.Port, &v.URL, &v.Scheme, &v.TargetID, &v.Title, &v.Technologies); err != nil {
			return nil, err
		}
		items = append(items, v)
	}
	return items, nil
}
