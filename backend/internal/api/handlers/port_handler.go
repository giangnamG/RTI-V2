package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kowgi/rti-v2/internal/models"
	"github.com/kowgi/rti-v2/internal/repository"
)

type PortHandler struct {
	repo *repository.PortRepo
}

func NewPortHandler(repo *repository.PortRepo) *PortHandler {
	return &PortHandler{repo: repo}
}

// GET /api/workspaces/:wsid/ports
func (h *PortHandler) List(c *fiber.Ctx) error {
	wsID, err := uuid.Parse(c.Params("wsid"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "workspace_id không hợp lệ")
	}

	ports, err := h.repo.ListByWorkspace(c.Context(), wsID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	if ports == nil {
		ports = []models.Port{}
	}

	return c.JSON(fiber.Map{"data": ports, "total": len(ports)})
}
