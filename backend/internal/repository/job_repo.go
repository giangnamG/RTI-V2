package repository

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/kowgi/rti-v2/internal/models"
)

type JobRepo struct {
	db *pgxpool.Pool
}

func NewJobRepo(db *pgxpool.Pool) *JobRepo {
	return &JobRepo{db: db}
}

func (r *JobRepo) Create(ctx context.Context, wsID uuid.UUID, req models.CreateJobRequest) (*models.Job, error) {
	payload, err := json.Marshal(req.Payload)
	if err != nil {
		return nil, fmt.Errorf("marshal payload: %w", err)
	}

	var targetID *uuid.UUID
	if req.TargetID != nil {
		id, err := uuid.Parse(*req.TargetID)
		if err != nil {
			return nil, fmt.Errorf("invalid target_id: %w", err)
		}
		targetID = &id
	}

	row := r.db.QueryRow(ctx, `
		INSERT INTO jobs (workspace_id, target_id, job_type, payload)
		VALUES ($1, $2, $3, $4)
		RETURNING id, workspace_id, target_id, job_type, status,
		          payload, result, error_message,
		          started_at, finished_at, created_at, updated_at
	`, wsID, targetID, req.JobType, payload)

	return scanJob(row)
}

func (r *JobRepo) List(ctx context.Context, wsID uuid.UUID) ([]models.Job, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, workspace_id, target_id, job_type, status,
		       payload, result, error_message,
		       started_at, finished_at, created_at, updated_at
		FROM jobs
		WHERE workspace_id = $1
		ORDER BY created_at DESC
		LIMIT 100
	`, wsID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var jobs []models.Job
	for rows.Next() {
		j, err := scanJob(rows)
		if err != nil {
			return nil, err
		}
		jobs = append(jobs, *j)
	}
	return jobs, nil
}

func (r *JobRepo) GetByID(ctx context.Context, id uuid.UUID) (*models.Job, error) {
	row := r.db.QueryRow(ctx, `
		SELECT id, workspace_id, target_id, job_type, status,
		       payload, result, error_message,
		       started_at, finished_at, created_at, updated_at
		FROM jobs WHERE id = $1
	`, id)
	return scanJob(row)
}

type scanner interface {
	Scan(dest ...any) error
}

func scanJob(s scanner) (*models.Job, error) {
	var j models.Job
	err := s.Scan(
		&j.ID, &j.WorkspaceID, &j.TargetID, &j.JobType, &j.Status,
		&j.Payload, &j.Result, &j.ErrorMessage,
		&j.StartedAt, &j.FinishedAt, &j.CreatedAt, &j.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &j, nil
}
