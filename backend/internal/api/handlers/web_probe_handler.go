package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kowgi/rti-v2/internal/models"
	"github.com/kowgi/rti-v2/internal/repository"
)

type WebProbeHandler struct {
	repo *repository.WebProbeRepo
}

func NewWebProbeHandler(repo *repository.WebProbeRepo) *WebProbeHandler {
	return &WebProbeHandler{repo: repo}
}

// GET /api/workspaces/:wsid/web-probes
func (h *WebProbeHandler) List(c *fiber.Ctx) error {
	wsID, err := uuid.Parse(c.Params("wsid"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "workspace_id không hợp lệ")
	}

	probes, err := h.repo.ListByWorkspace(c.Context(), wsID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	if probes == nil {
		probes = []models.WebProbe{}
	}

	return c.JSON(fiber.Map{"data": probes, "total": len(probes)})
}

// GET /api/workspaces/:wsid/web-probes/history?host=xxx
func (h *WebProbeHandler) History(c *fiber.Ctx) error {
	wsID, err := uuid.Parse(c.Params("wsid"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "workspace_id không hợp lệ")
	}

	host := c.Query("host")
	if host == "" {
		return fiber.NewError(fiber.StatusBadRequest, "query param 'host' bắt buộc")
	}

	history, err := h.repo.HistoryByHost(c.Context(), wsID, host)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	if history == nil {
		history = []models.WebProbe{}
	}

	return c.JSON(fiber.Map{"data": history, "total": len(history)})
}
