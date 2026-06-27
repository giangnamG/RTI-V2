package main

import (
	"context"
	"log"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/joho/godotenv"
	"github.com/kowgi/rti-v2/internal/api"
	"github.com/kowgi/rti-v2/internal/repository"
	"github.com/kowgi/rti-v2/pkg/config"
	"github.com/kowgi/rti-v2/pkg/database"
)

func main() {
	_ = godotenv.Load()

	cfg := config.Load()

	ctx := context.Background()
	pool, err := database.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Không thể kết nối DB: %v", err)
	}
	defer pool.Close()
	log.Println("✓ Kết nối PostgreSQL thành công")

	app := fiber.New(fiber.Config{
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			msg := "lỗi server"
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
				msg = e.Message
			}
			return c.Status(code).JSON(fiber.Map{"error": msg})
		},
	})

	app.Use(logger.New(logger.Config{
		Format: "[${time}] ${method} ${path} ${status} ${latency}\n",
	}))

	wsRepo := repository.NewWorkspaceRepo(pool)
	tRepo := repository.NewTargetRepo(pool)

	api.SetupRoutes(app, wsRepo, tRepo)

	log.Printf("🚀 RTI V2 backend khởi động tại :%s", cfg.Port)
	if err := app.Listen(":" + cfg.Port); err != nil {
		log.Fatalf("Lỗi khởi động server: %v", err)
	}
}
