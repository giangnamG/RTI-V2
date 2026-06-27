package api

import (
	"github.com/gofiber/fiber/v2"
	"github.com/kowgi/rti-v2/internal/api/handlers"
	"github.com/kowgi/rti-v2/internal/api/middleware"
	"github.com/kowgi/rti-v2/internal/repository"
	"github.com/kowgi/rti-v2/pkg/queue"
)

func SetupRoutes(
	app *fiber.App,
	wsRepo  *repository.WorkspaceRepo,
	tRepo   *repository.TargetRepo,
	jRepo   *repository.JobRepo,
	subRepo *repository.SubdomainRepo,
	portRepo *repository.PortRepo,
	producer *queue.Producer,
) {
	app.Use(middleware.CORS())

	wsH   := handlers.NewWorkspaceHandler(wsRepo)
	tH    := handlers.NewTargetHandler(tRepo)
	jH    := handlers.NewJobHandler(jRepo, producer)
	subH  := handlers.NewSubdomainHandler(subRepo)
	portH := handlers.NewPortHandler(portRepo)

	v1 := app.Group("/api")

	v1.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	ws := v1.Group("/workspaces")
	ws.Get("/", wsH.List)
	ws.Post("/", wsH.Create)
	ws.Get("/:id", wsH.Get)
	ws.Put("/:id", wsH.Update)
	ws.Delete("/:id", wsH.Delete)

	// Targets
	ws.Get("/:wsid/targets", tH.List)
	ws.Post("/:wsid/targets", tH.Create)
	ws.Post("/:wsid/targets/bulk", tH.BulkCreate)
	ws.Get("/:wsid/targets/:id", tH.Get)
	ws.Put("/:wsid/targets/:id", tH.Update)
	ws.Delete("/:wsid/targets/:id", tH.Delete)

	// Jobs
	ws.Get("/:wsid/jobs", jH.List)
	ws.Post("/:wsid/jobs", jH.Create)
	ws.Get("/:wsid/jobs/:id", jH.Get)

	// Recon results — list (latest state) + history
	ws.Get("/:wsid/subdomains", subH.List)
	ws.Get("/:wsid/subdomains/history", subH.History)
	ws.Get("/:wsid/ports", portH.List)
	ws.Get("/:wsid/ports/history", portH.History)

	app.Use(func(c *fiber.Ctx) error {
		return fiber.NewError(fiber.StatusNotFound, "endpoint không tồn tại")
	})
}
