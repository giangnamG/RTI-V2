package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kowgi/rti-v2/internal/repository"
)

type NucleiFindingHandler struct {
	repo *repository.NucleiFindingRepo
}

func NewNucleiFindingHandler(repo *repository.NucleiFindingRepo) *NucleiFindingHandler {
	return &NucleiFindingHandler{repo: repo}
}

func (h *NucleiFindingHandler) List(c *fiber.Ctx) error {
	wsID, err := uuid.Parse(c.Params("wsid"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "workspace id không hợp lệ")
	}

	f := repository.NucleiFindingFilter{
		Severity: c.Query("severity"),
	}

	items, err := h.repo.List(c.Context(), wsID, f)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}

	return c.JSON(fiber.Map{"data": items, "total": len(items)})
}
