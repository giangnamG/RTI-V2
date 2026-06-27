package handlers

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/kowgi/rti-v2/internal/models"
	"github.com/kowgi/rti-v2/internal/repository"
)

type TargetHandler struct {
	repo *repository.TargetRepo
}

func NewTargetHandler(repo *repository.TargetRepo) *TargetHandler {
	return &TargetHandler{repo: repo}
}

func (h *TargetHandler) List(c *fiber.Ctx) error {
	list, err := h.repo.List(c.Context(), c.Params("wsid"))
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	if list == nil {
		list = []*models.Target{}
	}
	return c.JSON(fiber.Map{"data": list})
}

func (h *TargetHandler) Get(c *fiber.Ctx) error {
	t, err := h.repo.GetByID(c.Context(), c.Params("wsid"), c.Params("id"))
	if err != nil {
		if strings.Contains(err.Error(), "no rows") {
			return fiber.NewError(fiber.StatusNotFound, "target không tồn tại")
		}
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"data": t})
}

func (h *TargetHandler) Create(c *fiber.Ctx) error {
	req := new(models.CreateTargetRequest)
	if err := c.BodyParser(req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "body không hợp lệ")
	}
	if strings.TrimSpace(req.Domain) == "" {
		return fiber.NewError(fiber.StatusBadRequest, "domain là bắt buộc")
	}
	t, err := h.repo.Create(c.Context(), c.Params("wsid"), req)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			return fiber.NewError(fiber.StatusConflict, "domain đã tồn tại trong workspace")
		}
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": t})
}

// BulkCreate — nhận nhiều domain cùng lúc (paste từ text)
func (h *TargetHandler) BulkCreate(c *fiber.Ctx) error {
	req := new(models.CreateTargetsBulkRequest)
	if err := c.BodyParser(req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "body không hợp lệ")
	}
	domains := req.ParseDomains()
	if len(domains) == 0 {
		return fiber.NewError(fiber.StatusBadRequest, "không có domain hợp lệ")
	}
	created, err := h.repo.BulkCreate(c.Context(), c.Params("wsid"), domains, req.Notes)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"data":    created,
		"total":   len(domains),
		"created": len(created),
		"skipped": len(domains) - len(created),
	})
}

func (h *TargetHandler) Update(c *fiber.Ctx) error {
	req := new(models.UpdateTargetRequest)
	if err := c.BodyParser(req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "body không hợp lệ")
	}
	if strings.TrimSpace(req.Domain) == "" {
		return fiber.NewError(fiber.StatusBadRequest, "domain là bắt buộc")
	}
	t, err := h.repo.Update(c.Context(), c.Params("wsid"), c.Params("id"), req)
	if err != nil {
		if strings.Contains(err.Error(), "no rows") {
			return fiber.NewError(fiber.StatusNotFound, "target không tồn tại")
		}
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"data": t})
}

func (h *TargetHandler) Delete(c *fiber.Ctx) error {
	if err := h.repo.Delete(c.Context(), c.Params("wsid"), c.Params("id")); err != nil {
		if strings.Contains(err.Error(), "not found") {
			return fiber.NewError(fiber.StatusNotFound, "target không tồn tại")
		}
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"message": "đã xóa target"})
}
