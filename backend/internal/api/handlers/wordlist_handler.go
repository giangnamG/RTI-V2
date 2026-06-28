package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/kowgi/rti-v2/internal/models"
	"github.com/kowgi/rti-v2/internal/repository"
)

type WordlistHandler struct {
	repo *repository.WordlistRepo
}

func NewWordlistHandler(repo *repository.WordlistRepo) *WordlistHandler {
	return &WordlistHandler{repo: repo}
}

// List godoc
// GET /api/wordlists?category=directories|parameters|subdomains|passwords|fuzzing
// Trả về tất cả wordlists (available field không được tính ở đây — frontend xử lý).
func (h *WordlistHandler) List(c *fiber.Ctx) error {
	category := c.Query("category", "")

	items, err := h.repo.List(c.Context(), category)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}

	if items == nil {
		items = []models.Wordlist{}
	}

	return c.JSON(fiber.Map{
		"data":  items,
		"total": len(items),
	})
}

// Categories godoc
// GET /api/wordlists/categories
func (h *WordlistHandler) Categories(c *fiber.Ctx) error {
	cats, err := h.repo.Categories(c.Context())
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	if cats == nil {
		cats = []string{}
	}
	return c.JSON(cats)
}
