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

// GET /api/workspaces/:wsid/ports — trạng thái mới nhất mỗi (host, port, protocol)
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

// GET /api/workspaces/:wsid/ports/history?host=xxx — toàn bộ lịch sử của một host
func (h *PortHandler) History(c *fiber.Ctx) error {
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
		history = []models.Port{}
	}

	return c.JSON(fiber.Map{"data": history, "total": len(history)})
}

// PATCH /api/workspaces/:wsid/ports/:port_id/service — user override service_name và service_category
func (h *PortHandler) UpdateServiceInfo(c *fiber.Ctx) error {
	portID, err := uuid.Parse(c.Params("port_id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "port_id không hợp lệ")
	}

	var body struct {
		ServiceName     string `json:"service_name"`
		ServiceCategory string `json:"service_category"`
	}
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "body không hợp lệ")
	}

	if err := h.repo.UpdateServiceInfo(c.Context(), portID, body.ServiceName, body.ServiceCategory); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"message": "Đã cập nhật"})
}
