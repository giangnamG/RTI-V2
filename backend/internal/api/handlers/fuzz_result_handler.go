package handlers

import (
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kowgi/rti-v2/internal/models"
	"github.com/kowgi/rti-v2/internal/repository"
)

// ── Fuzz Param Handler ─────────────────────────────────────────

type FuzzParamHandler struct {
	repo *repository.FuzzParamRepo
}

func NewFuzzParamHandler(repo *repository.FuzzParamRepo) *FuzzParamHandler {
	return &FuzzParamHandler{repo: repo}
}

func (h *FuzzParamHandler) List(c *fiber.Ctx) error {
	wsID, err := uuid.Parse(c.Params("wsid"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "workspace_id không hợp lệ")
	}

	method := c.Query("method")

	results, err := h.repo.List(c.Context(), wsID, method)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	if results == nil {
		results = []models.FuzzParamResult{}
	}

	stats, _ := h.repo.Stats(c.Context(), wsID)
	return c.JSON(fiber.Map{
		"data":  results,
		"total": len(results),
		"stats": stats,
	})
}

// ── Dir Fuzz Handler ───────────────────────────────────────────

type DirFuzzHandler struct {
	repo *repository.DirFuzzRepo
}

func NewDirFuzzHandler(repo *repository.DirFuzzRepo) *DirFuzzHandler {
	return &DirFuzzHandler{repo: repo}
}

func (h *DirFuzzHandler) List(c *fiber.Ctx) error {
	wsID, err := uuid.Parse(c.Params("wsid"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "workspace_id không hợp lệ")
	}

	statusCode := 0
	if sc := c.Query("status_code"); sc != "" {
		if v, err := strconv.Atoi(sc); err == nil {
			statusCode = v
		}
	}
	interestingOnly := c.Query("interesting_only") == "1" || c.Query("interesting_only") == "true"

	results, err := h.repo.List(c.Context(), wsID, statusCode, interestingOnly)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	if results == nil {
		results = []models.DirFuzzResult{}
	}

	stats, _ := h.repo.Stats(c.Context(), wsID)
	return c.JSON(fiber.Map{
		"data":  results,
		"total": len(results),
		"stats": stats,
	})
}
