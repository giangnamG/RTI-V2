package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kowgi/rti-v2/internal/models"
	"github.com/kowgi/rti-v2/internal/repository"
)

type FindingHandler struct {
	repo *repository.FindingRepo
}

func NewFindingHandler(repo *repository.FindingRepo) *FindingHandler {
	return &FindingHandler{repo: repo}
}

// GET /api/workspaces/:wsid/findings?severity=&type=&status=
func (h *FindingHandler) List(c *fiber.Ctx) error {
	wsID, err := uuid.Parse(c.Params("wsid"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "workspace_id không hợp lệ")
	}

	filter := repository.FindingFilter{
		Severity: c.Query("severity"),
		Type:     c.Query("type"),
		Status:   c.Query("status"),
	}

	findings, err := h.repo.List(c.Context(), wsID, filter)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	if findings == nil {
		findings = []models.Finding{}
	}

	// Stats theo severity
	stats, _ := h.repo.Stats(c.Context(), wsID)

	return c.JSON(fiber.Map{
		"data":  findings,
		"total": len(findings),
		"stats": stats,
	})
}

// GET /api/workspaces/:wsid/findings/:id
func (h *FindingHandler) Get(c *fiber.Ctx) error {
	wsID, err := uuid.Parse(c.Params("wsid"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "workspace_id không hợp lệ")
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "finding_id không hợp lệ")
	}

	f, err := h.repo.Get(c.Context(), wsID, id)
	if err != nil {
		return fiber.NewError(fiber.StatusNotFound, "không tìm thấy finding")
	}
	return c.JSON(fiber.Map{"data": f})
}

// POST /api/workspaces/:wsid/findings
func (h *FindingHandler) Create(c *fiber.Ctx) error {
	wsID, err := uuid.Parse(c.Params("wsid"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "workspace_id không hợp lệ")
	}

	var body struct {
		TargetID    *string  `json:"target_id"`
		Title       string   `json:"title"`
		Severity    string   `json:"severity"`
		Type        string   `json:"type"`
		Status      string   `json:"status"`
		CVEID       *string  `json:"cve_id"`
		CVSSScore   *float64 `json:"cvss_score"`
		Host        *string  `json:"host"`
		URL         *string  `json:"url"`
		Port        *int     `json:"port"`
		Evidence    *string  `json:"evidence"`
		Source      *string  `json:"source"`
		Remediation *string  `json:"remediation"`
	}
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "body không hợp lệ")
	}
	if body.Title == "" {
		return fiber.NewError(fiber.StatusBadRequest, "title bắt buộc")
	}

	in := repository.FindingInput{
		Title:       body.Title,
		Severity:    orDefault(body.Severity, "medium"),
		Type:        orDefault(body.Type, "vulnerability"),
		Status:      orDefault(body.Status, "open"),
		CVEID:       body.CVEID,
		CVSSScore:   body.CVSSScore,
		Host:        body.Host,
		URL:         body.URL,
		Port:        body.Port,
		Evidence:    body.Evidence,
		Source:      body.Source,
		Remediation: body.Remediation,
	}

	if body.TargetID != nil && *body.TargetID != "" {
		tid, err := uuid.Parse(*body.TargetID)
		if err == nil {
			in.TargetID = &tid
		}
	}

	f, err := h.repo.Create(c.Context(), wsID, in)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": f})
}

// PUT /api/workspaces/:wsid/findings/:id
func (h *FindingHandler) Update(c *fiber.Ctx) error {
	wsID, err := uuid.Parse(c.Params("wsid"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "workspace_id không hợp lệ")
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "finding_id không hợp lệ")
	}

	var body struct {
		Title       string   `json:"title"`
		Severity    string   `json:"severity"`
		Type        string   `json:"type"`
		Status      string   `json:"status"`
		CVEID       *string  `json:"cve_id"`
		CVSSScore   *float64 `json:"cvss_score"`
		Host        *string  `json:"host"`
		URL         *string  `json:"url"`
		Port        *int     `json:"port"`
		Evidence    *string  `json:"evidence"`
		Source      *string  `json:"source"`
		Remediation *string  `json:"remediation"`
	}
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "body không hợp lệ")
	}

	in := repository.FindingInput{
		Title:       body.Title,
		Severity:    orDefault(body.Severity, "medium"),
		Type:        orDefault(body.Type, "vulnerability"),
		Status:      orDefault(body.Status, "open"),
		CVEID:       body.CVEID,
		CVSSScore:   body.CVSSScore,
		Host:        body.Host,
		URL:         body.URL,
		Port:        body.Port,
		Evidence:    body.Evidence,
		Source:      body.Source,
		Remediation: body.Remediation,
	}

	f, err := h.repo.Update(c.Context(), wsID, id, in)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"data": f})
}

// PATCH /api/workspaces/:wsid/findings/:id/status
func (h *FindingHandler) UpdateStatus(c *fiber.Ctx) error {
	wsID, err := uuid.Parse(c.Params("wsid"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "workspace_id không hợp lệ")
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "finding_id không hợp lệ")
	}

	var body struct {
		Status string `json:"status"`
	}
	if err := c.BodyParser(&body); err != nil || body.Status == "" {
		return fiber.NewError(fiber.StatusBadRequest, "status bắt buộc")
	}

	// Lấy finding hiện tại để giữ nguyên các field khác
	existing, err := h.repo.Get(c.Context(), wsID, id)
	if err != nil {
		return fiber.NewError(fiber.StatusNotFound, "không tìm thấy finding")
	}

	in := repository.FindingInput{
		TargetID:    existing.TargetID,
		JobID:       existing.JobID,
		Title:       existing.Title,
		Severity:    existing.Severity,
		Type:        existing.Type,
		Status:      body.Status,
		CVEID:       existing.CVEID,
		CVSSScore:   existing.CVSSScore,
		Host:        existing.Host,
		URL:         existing.URL,
		Port:        existing.Port,
		Evidence:    existing.Evidence,
		Source:      existing.Source,
		Remediation: existing.Remediation,
	}

	f, err := h.repo.Update(c.Context(), wsID, id, in)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"data": f})
}

// DELETE /api/workspaces/:wsid/findings/:id
func (h *FindingHandler) Delete(c *fiber.Ctx) error {
	wsID, err := uuid.Parse(c.Params("wsid"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "workspace_id không hợp lệ")
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "finding_id không hợp lệ")
	}

	if err := h.repo.Delete(c.Context(), wsID, id); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"message": "đã xoá finding"})
}

func orDefault(s, def string) string {
	if s == "" {
		return def
	}
	return s
}
