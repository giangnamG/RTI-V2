package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kowgi/rti-v2/internal/models"
	"github.com/kowgi/rti-v2/internal/repository"
	"github.com/kowgi/rti-v2/pkg/queue"
)

type JobHandler struct {
	repo     *repository.JobRepo
	producer *queue.Producer
}

func NewJobHandler(repo *repository.JobRepo, producer *queue.Producer) *JobHandler {
	return &JobHandler{repo: repo, producer: producer}
}

// POST /api/workspaces/:wsid/jobs
func (h *JobHandler) Create(c *fiber.Ctx) error {
	wsID, err := uuid.Parse(c.Params("wsid"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "workspace_id không hợp lệ")
	}

	var req models.CreateJobRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "body không hợp lệ")
	}
	if req.JobType == "" || !models.ValidJobTypes[req.JobType] {
		return fiber.NewError(fiber.StatusBadRequest, "job_type không hợp lệ")
	}
	if req.Payload == nil {
		req.Payload = map[string]any{}
	}

	job, err := h.repo.Create(c.Context(), wsID, req)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}

	// Đẩy vào Redis Streams
	if err := h.producer.Enqueue(c.Context(), job.ID.String(), job.JobType, req.Payload); err != nil {
		// Job đã lưu DB, nhưng queue fail → ghi log, không block response
		c.Locals("queue_error", err.Error())
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": job})
}

// GET /api/workspaces/:wsid/jobs
func (h *JobHandler) List(c *fiber.Ctx) error {
	wsID, err := uuid.Parse(c.Params("wsid"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "workspace_id không hợp lệ")
	}

	jobs, err := h.repo.List(c.Context(), wsID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	if jobs == nil {
		jobs = []models.Job{}
	}

	return c.JSON(fiber.Map{"data": jobs})
}

// GET /api/workspaces/:wsid/jobs/:id
func (h *JobHandler) Get(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "job_id không hợp lệ")
	}

	job, err := h.repo.GetByID(c.Context(), id)
	if err != nil {
		return fiber.NewError(fiber.StatusNotFound, "job không tồn tại")
	}

	return c.JSON(fiber.Map{"data": job})
}
