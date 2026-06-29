package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kowgi/rti-v2/internal/repository"
)

type VulnScanHandler struct {
	repo *repository.VulnScanRepo
}

func NewVulnScanHandler(repo *repository.VulnScanRepo) *VulnScanHandler {
	return &VulnScanHandler{repo: repo}
}

func (h *VulnScanHandler) ListRuns(c *fiber.Ctx) error {
	wsID, err := uuid.Parse(c.Params("wsid"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "workspace id không hợp lệ")
	}

	f := repository.VulnRunFilter{
		Domain: c.Query("domain"),
		Tool:   c.Query("tool"),
		Status: c.Query("status"),
	}

	items, err := h.repo.ListRuns(c.Context(), wsID, f)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}

	return c.JSON(fiber.Map{"data": items, "total": len(items)})
}

func (h *VulnScanHandler) ListFindings(c *fiber.Ctx) error {
	wsID, err := uuid.Parse(c.Params("wsid"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "workspace id không hợp lệ")
	}

	f := repository.VulnFindingFilter{
		Domain:   c.Query("domain"),
		Tool:     c.Query("tool"),
		Severity: c.Query("severity"),
	}

	items, err := h.repo.ListFindings(c.Context(), wsID, f)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}

	return c.JSON(fiber.Map{"data": items, "total": len(items)})
}

// ListFindingsHistory — tất cả findings mọi lần chạy (cho HistoryDrawer), lọc theo domain/tool.
func (h *VulnScanHandler) ListFindingsHistory(c *fiber.Ctx) error {
	wsID, err := uuid.Parse(c.Params("wsid"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "workspace id không hợp lệ")
	}

	items, err := h.repo.ListFindingsHistory(c.Context(), wsID, c.Query("domain"), c.Query("tool"))
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}

	return c.JSON(fiber.Map{"data": items, "total": len(items)})
}

func (h *VulnScanHandler) DomainSummary(c *fiber.Ctx) error {
	wsID, err := uuid.Parse(c.Params("wsid"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "workspace id không hợp lệ")
	}

	items, err := h.repo.DomainSummary(c.Context(), wsID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}

	return c.JSON(fiber.Map{"data": items})
}
