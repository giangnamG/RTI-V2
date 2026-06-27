package handlers

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/kowgi/rti-v2/internal/models"
	"github.com/kowgi/rti-v2/internal/repository"
)

type WorkspaceHandler struct {
	repo *repository.WorkspaceRepo
}

func NewWorkspaceHandler(repo *repository.WorkspaceRepo) *WorkspaceHandler {
	return &WorkspaceHandler{repo: repo}
}

func (h *WorkspaceHandler) List(c *fiber.Ctx) error {
	list, err := h.repo.List(c.Context())
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	if list == nil {
		list = []*models.Workspace{}
	}
	return c.JSON(fiber.Map{"data": list})
}

func (h *WorkspaceHandler) Get(c *fiber.Ctx) error {
	w, err := h.repo.GetByID(c.Context(), c.Params("id"))
	if err != nil {
		if strings.Contains(err.Error(), "no rows") {
			return fiber.NewError(fiber.StatusNotFound, "workspace không tồn tại")
		}
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"data": w})
}

func (h *WorkspaceHandler) Create(c *fiber.Ctx) error {
	req := new(models.CreateWorkspaceRequest)
	if err := c.BodyParser(req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "body không hợp lệ")
	}
	if strings.TrimSpace(req.Name) == "" {
		return fiber.NewError(fiber.StatusBadRequest, "name là bắt buộc")
	}
	w, err := h.repo.Create(c.Context(), req)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": w})
}

func (h *WorkspaceHandler) Update(c *fiber.Ctx) error {
	req := new(models.UpdateWorkspaceRequest)
	if err := c.BodyParser(req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "body không hợp lệ")
	}
	if strings.TrimSpace(req.Name) == "" {
		return fiber.NewError(fiber.StatusBadRequest, "name là bắt buộc")
	}
	w, err := h.repo.Update(c.Context(), c.Params("id"), req)
	if err != nil {
		if strings.Contains(err.Error(), "no rows") {
			return fiber.NewError(fiber.StatusNotFound, "workspace không tồn tại")
		}
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"data": w})
}

func (h *WorkspaceHandler) Delete(c *fiber.Ctx) error {
	if err := h.repo.Delete(c.Context(), c.Params("id")); err != nil {
		if strings.Contains(err.Error(), "not found") {
			return fiber.NewError(fiber.StatusNotFound, "workspace không tồn tại")
		}
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"message": "đã xóa workspace"})
}
