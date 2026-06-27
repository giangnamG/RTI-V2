package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kowgi/rti-v2/internal/models"
	"github.com/kowgi/rti-v2/internal/repository"
)

type ServiceCategoryHandler struct {
	repo *repository.ServiceCategoryRepo
}

func NewServiceCategoryHandler(repo *repository.ServiceCategoryRepo) *ServiceCategoryHandler {
	return &ServiceCategoryHandler{repo: repo}
}

// GET /api/service-categories
func (h *ServiceCategoryHandler) List(c *fiber.Ctx) error {
	cats, err := h.repo.List(c.Context())
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	if cats == nil {
		cats = []models.ServiceCategory{}
	}
	return c.JSON(fiber.Map{"data": cats, "total": len(cats)})
}

// POST /api/service-categories
func (h *ServiceCategoryHandler) Create(c *fiber.Ctx) error {
	var body models.ServiceCategory
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "body không hợp lệ")
	}
	if body.Name == "" || body.Label == "" {
		return fiber.NewError(fiber.StatusBadRequest, "name và label bắt buộc")
	}
	if body.ServiceNames == nil {
		body.ServiceNames = []string{}
	}
	if body.ModuleTypes == nil {
		body.ModuleTypes = []string{}
	}
	if body.Color == "" {
		body.Color = "#718096"
	}

	result, err := h.repo.Create(c.Context(), &body)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": result})
}

// PUT /api/service-categories/:id
func (h *ServiceCategoryHandler) Update(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "id không hợp lệ")
	}

	var body models.ServiceCategory
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "body không hợp lệ")
	}
	if body.Name == "" || body.Label == "" {
		return fiber.NewError(fiber.StatusBadRequest, "name và label bắt buộc")
	}
	if body.ServiceNames == nil {
		body.ServiceNames = []string{}
	}
	if body.ModuleTypes == nil {
		body.ModuleTypes = []string{}
	}

	result, err := h.repo.Update(c.Context(), id, &body)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"data": result})
}

// DELETE /api/service-categories/:id
func (h *ServiceCategoryHandler) Delete(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "id không hợp lệ")
	}

	if err := h.repo.Delete(c.Context(), id); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"message": "Đã xóa"})
}
