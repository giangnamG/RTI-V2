package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kowgi/rti-v2/internal/repository"
)

// WPHandler — module con WordPress: list target WordPress + findings WPScan/WPProbe.
type WPHandler struct {
	repo *repository.WPRepo
}

func NewWPHandler(repo *repository.WPRepo) *WPHandler {
	return &WPHandler{repo: repo}
}

func parseWsID(c *fiber.Ctx) (uuid.UUID, error) {
	id, err := uuid.Parse(c.Params("wsid"))
	if err != nil {
		return uuid.UUID{}, fiber.NewError(fiber.StatusBadRequest, "workspace id không hợp lệ")
	}
	return id, nil
}

// ListTargets — toàn bộ host WordPress (technologies chứa 'wordpress').
func (h *WPHandler) ListTargets(c *fiber.Ctx) error {
	wsID, err := parseWsID(c)
	if err != nil {
		return err
	}
	items, err := h.repo.ListTargets(c.Context(), wsID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"data": items, "total": len(items)})
}

func (h *WPHandler) ListWPScan(c *fiber.Ctx) error {
	wsID, err := parseWsID(c)
	if err != nil {
		return err
	}
	items, err := h.repo.ListWPScan(c.Context(), wsID, c.Query("severity"), c.Query("target"))
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"data": items, "total": len(items)})
}

func (h *WPHandler) ListWPScanHistory(c *fiber.Ctx) error {
	wsID, err := parseWsID(c)
	if err != nil {
		return err
	}
	items, err := h.repo.ListWPScanHistory(c.Context(), wsID, c.Query("target"))
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"data": items, "total": len(items)})
}

func (h *WPHandler) ListWPProbe(c *fiber.Ctx) error {
	wsID, err := parseWsID(c)
	if err != nil {
		return err
	}
	items, err := h.repo.ListWPProbe(c.Context(), wsID, c.Query("severity"), c.Query("target"))
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"data": items, "total": len(items)})
}

func (h *WPHandler) ListWPProbeHistory(c *fiber.Ctx) error {
	wsID, err := parseWsID(c)
	if err != nil {
		return err
	}
	items, err := h.repo.ListWPProbeHistory(c.Context(), wsID, c.Query("target"))
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"data": items, "total": len(items)})
}
