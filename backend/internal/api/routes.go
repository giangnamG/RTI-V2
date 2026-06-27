package api

import (
	"github.com/gofiber/fiber/v2"
	"github.com/kowgi/rti-v2/internal/api/handlers"
	"github.com/kowgi/rti-v2/internal/api/middleware"
	"github.com/kowgi/rti-v2/internal/repository"
)

func SetupRoutes(app *fiber.App, wsRepo *repository.WorkspaceRepo, tRepo *repository.TargetRepo) {
	app.Use(middleware.CORS())

	wsH := handlers.NewWorkspaceHandler(wsRepo)
	tH := handlers.NewTargetHandler(tRepo)

	api := app.Group("/api")

	// Health check
	api.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	// Workspaces
	ws := api.Group("/workspaces")
	ws.Get("/", wsH.List)
	ws.Post("/", wsH.Create)
	ws.Get("/:id", wsH.Get)
	ws.Put("/:id", wsH.Update)
	ws.Delete("/:id", wsH.Delete)

	// Targets (nested under workspace)
	ws.Get("/:wsid/targets", tH.List)
	ws.Post("/:wsid/targets", tH.Create)
	ws.Post("/:wsid/targets/bulk", tH.BulkCreate)
	ws.Get("/:wsid/targets/:id", tH.Get)
	ws.Put("/:wsid/targets/:id", tH.Update)
	ws.Delete("/:wsid/targets/:id", tH.Delete)

	// 404 handler
	app.Use(func(c *fiber.Ctx) error {
		return fiber.NewError(fiber.StatusNotFound, "endpoint không tồn tại")
	})
}
