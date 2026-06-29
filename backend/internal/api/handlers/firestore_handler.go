package handlers

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kowgi/rti-v2/internal/repository"
)

type FirestoreHandler struct {
	repo *repository.FirestoreRepo
}

func NewFirestoreHandler(repo *repository.FirestoreRepo) *FirestoreHandler {
	return &FirestoreHandler{repo: repo}
}

// crawlDir — thư mục gốc chứa file crawl (cùng volume worker ghi: worker_data:/data).
func crawlDir() string {
	if d := os.Getenv("FIRESTORE_CRAWL_DIR"); d != "" {
		return d
	}
	return "/data/firestore_crawl"
}

func (h *FirestoreHandler) ListCollections(c *fiber.Ctx) error {
	wsID, err := uuid.Parse(c.Params("wsid"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "workspace id không hợp lệ")
	}
	items, err := h.repo.ListCollections(c.Context(), wsID, c.Query("target"))
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"data": items, "total": len(items)})
}

func (h *FirestoreHandler) ListConfigs(c *fiber.Ctx) error {
	wsID, err := uuid.Parse(c.Params("wsid"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "workspace id không hợp lệ")
	}
	items, err := h.repo.ListConfigs(c.Context(), wsID, c.Query("target"))
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"data": items, "total": len(items)})
}

func (h *FirestoreHandler) ListCollectionsHistory(c *fiber.Ctx) error {
	wsID, err := uuid.Parse(c.Params("wsid"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "workspace id không hợp lệ")
	}
	items, err := h.repo.ListCollectionsHistory(c.Context(), wsID, c.Query("target"))
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"data": items, "total": len(items)})
}

func (h *FirestoreHandler) ListDocuments(c *fiber.Ctx) error {
	wsID, err := uuid.Parse(c.Params("wsid"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "workspace id không hợp lệ")
	}
	limit := c.QueryInt("limit", 100)
	offset := c.QueryInt("offset", 0)
	items, total, err := h.repo.ListDocuments(c.Context(), wsID, c.Query("target"), c.Query("collection"), limit, offset)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"data": items, "total": total, "limit": limit, "offset": offset})
}

func (h *FirestoreHandler) ListCrawls(c *fiber.Ctx) error {
	wsID, err := uuid.Parse(c.Params("wsid"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "workspace id không hợp lệ")
	}
	items, err := h.repo.ListCrawls(c.Context(), wsID, c.Query("target"))
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"data": items, "total": len(items)})
}

// DownloadCrawl — tải file JSON crawl theo path tương đối (?path=). Chống path traversal:
// path phải nằm trong thư mục của CHÍNH workspace ({wsid}/...), không chứa "..", và sau khi
// resolve phải còn nằm trong crawlDir.
func (h *FirestoreHandler) DownloadCrawl(c *fiber.Ctx) error {
	wsID, err := uuid.Parse(c.Params("wsid"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "workspace id không hợp lệ")
	}
	rel := strings.TrimSpace(c.Query("path"))
	if rel == "" {
		return fiber.NewError(fiber.StatusBadRequest, "thiếu tham số path")
	}
	rel = filepath.ToSlash(rel)
	if strings.Contains(rel, "..") || strings.HasPrefix(rel, "/") {
		return fiber.NewError(fiber.StatusBadRequest, "path không hợp lệ")
	}
	// Workspace chỉ được đọc file của chính nó
	if !strings.HasPrefix(rel, wsID.String()+"/") {
		return fiber.NewError(fiber.StatusForbidden, "path ngoài phạm vi workspace")
	}

	base := crawlDir()
	abs := filepath.Join(base, filepath.FromSlash(rel))
	// Defense-in-depth: abs phải còn nằm trong base sau khi clean
	absClean, _ := filepath.Abs(abs)
	baseClean, _ := filepath.Abs(base)
	if !strings.HasPrefix(absClean, baseClean+string(os.PathSeparator)) {
		return fiber.NewError(fiber.StatusBadRequest, "path không hợp lệ")
	}
	if fi, err := os.Stat(absClean); err != nil || fi.IsDir() {
		return fiber.NewError(fiber.StatusNotFound, "file không tồn tại")
	}
	return c.Download(absClean, filepath.Base(absClean))
}
