package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kowgi/rti-v2/internal/models"
	"github.com/kowgi/rti-v2/internal/repository"
)

type FuzzEndpointHandler struct {
	repo *repository.FuzzEndpointRepo
}

func NewFuzzEndpointHandler(repo *repository.FuzzEndpointRepo) *FuzzEndpointHandler {
	return &FuzzEndpointHandler{repo: repo}
}

// GET /api/workspaces/:wsid/fuzz-endpoints?method=GET&source_type=crawl_form
func (h *FuzzEndpointHandler) List(c *fiber.Ctx) error {
	wsID, err := uuid.Parse(c.Params("wsid"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "workspace_id không hợp lệ")
	}

	method     := c.Query("method")
	sourceType := c.Query("source_type")

	endpoints, err := h.repo.List(c.Context(), wsID, method, sourceType)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	if endpoints == nil {
		endpoints = []models.FuzzEndpoint{}
	}

	stats, _ := h.repo.Stats(c.Context(), wsID)

	return c.JSON(fiber.Map{
		"data":  endpoints,
		"total": len(endpoints),
		"stats": stats,
	})
}
