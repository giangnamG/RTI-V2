package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kowgi/rti-v2/internal/models"
	"github.com/kowgi/rti-v2/internal/repository"
)

type SubdomainHandler struct {
	repo *repository.SubdomainRepo
}

func NewSubdomainHandler(repo *repository.SubdomainRepo) *SubdomainHandler {
	return &SubdomainHandler{repo: repo}
}

// GET /api/workspaces/:wsid/subdomains
func (h *SubdomainHandler) List(c *fiber.Ctx) error {
	wsID, err := uuid.Parse(c.Params("wsid"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "workspace_id không hợp lệ")
	}

	subs, err := h.repo.ListByWorkspace(c.Context(), wsID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	if subs == nil {
		subs = []models.Subdomain{}
	}

	return c.JSON(fiber.Map{"data": subs, "total": len(subs)})
}
