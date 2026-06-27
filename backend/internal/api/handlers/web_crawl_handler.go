package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kowgi/rti-v2/internal/models"
	"github.com/kowgi/rti-v2/internal/repository"
)

type WebCrawlHandler struct {
	repo *repository.WebCrawlRepo
}

func NewWebCrawlHandler(repo *repository.WebCrawlRepo) *WebCrawlHandler {
	return &WebCrawlHandler{repo: repo}
}

// GET /api/workspaces/:wsid/web-crawl?base_url=
func (h *WebCrawlHandler) List(c *fiber.Ctx) error {
	wsID, err := uuid.Parse(c.Params("wsid"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "workspace_id không hợp lệ")
	}

	baseURL := c.Query("base_url")

	urls, err := h.repo.List(c.Context(), wsID, baseURL)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	if urls == nil {
		urls = []models.WebCrawlURL{}
	}

	stats, _ := h.repo.Stats(c.Context(), wsID)

	return c.JSON(fiber.Map{
		"data":  urls,
		"total": len(urls),
		"stats": stats,
	})
}

// GET /api/workspaces/:wsid/web-crawl/history?job_id=
func (h *WebCrawlHandler) History(c *fiber.Ctx) error {
	wsID, err := uuid.Parse(c.Params("wsid"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "workspace_id không hợp lệ")
	}

	jobIDStr := c.Query("job_id")
	if jobIDStr == "" {
		return fiber.NewError(fiber.StatusBadRequest, "job_id bắt buộc")
	}
	jobID, err := uuid.Parse(jobIDStr)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "job_id không hợp lệ")
	}

	urls, err := h.repo.ListByJob(c.Context(), wsID, jobID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	if urls == nil {
		urls = []models.WebCrawlURL{}
	}

	return c.JSON(fiber.Map{
		"data":  urls,
		"total": len(urls),
	})
}
