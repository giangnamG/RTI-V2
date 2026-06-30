package api

import (
	"github.com/gofiber/fiber/v2"
	"github.com/kowgi/rti-v2/internal/api/handlers"
	"github.com/kowgi/rti-v2/internal/api/middleware"
	"github.com/kowgi/rti-v2/internal/repository"
	"github.com/kowgi/rti-v2/pkg/queue"
)

func SetupRoutes(
	app                *fiber.App,
	wsRepo             *repository.WorkspaceRepo,
	tRepo              *repository.TargetRepo,
	jRepo              *repository.JobRepo,
	subRepo            *repository.SubdomainRepo,
	portRepo           *repository.PortRepo,
	catRepo            *repository.ServiceCategoryRepo,
	webProbeRepo       *repository.WebProbeRepo,
	webCrawlRepo       *repository.WebCrawlRepo,
	findingRepo        *repository.FindingRepo,
	fuzzEndpointRepo   *repository.FuzzEndpointRepo,
	fuzzParamRepo      *repository.FuzzParamRepo,
	dirFuzzRepo        *repository.DirFuzzRepo,
	wordlistRepo       *repository.WordlistRepo,
	vulnScanRepo       *repository.VulnScanRepo,
	nucleiFindingRepo  *repository.NucleiFindingRepo,
	firestoreRepo      *repository.FirestoreRepo,
	wpRepo             *repository.WPRepo,
	producer           *queue.Producer,
) {
	app.Use(middleware.CORS())

	wsH             := handlers.NewWorkspaceHandler(wsRepo)
	tH              := handlers.NewTargetHandler(tRepo)
	jH              := handlers.NewJobHandler(jRepo, producer)
	subH            := handlers.NewSubdomainHandler(subRepo)
	portH           := handlers.NewPortHandler(portRepo)
	catH            := handlers.NewServiceCategoryHandler(catRepo)
	webProbeH       := handlers.NewWebProbeHandler(webProbeRepo)
	webCrawlH       := handlers.NewWebCrawlHandler(webCrawlRepo)
	findingH        := handlers.NewFindingHandler(findingRepo)
	fuzzEndpointH   := handlers.NewFuzzEndpointHandler(fuzzEndpointRepo)
	fuzzParamH      := handlers.NewFuzzParamHandler(fuzzParamRepo)
	dirFuzzH        := handlers.NewDirFuzzHandler(dirFuzzRepo)
	wordlistH       := handlers.NewWordlistHandler(wordlistRepo)
	vulnScanH          := handlers.NewVulnScanHandler(vulnScanRepo)
	nucleiFindingH     := handlers.NewNucleiFindingHandler(nucleiFindingRepo)
	firestoreH         := handlers.NewFirestoreHandler(firestoreRepo)
	wpH                := handlers.NewWPHandler(wpRepo)

	v1 := app.Group("/api")

	v1.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	// Wordlists — global catalog
	v1.Get("/wordlists", wordlistH.List)
	v1.Get("/wordlists/categories", wordlistH.Categories)

	// Service categories — global, không thuộc workspace nào
	v1.Get("/service-categories", catH.List)
	v1.Post("/service-categories", catH.Create)
	v1.Put("/service-categories/:id", catH.Update)
	v1.Delete("/service-categories/:id", catH.Delete)

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
	ws.Patch("/:wsid/ports/:port_id/service", portH.UpdateServiceInfo)
	ws.Get("/:wsid/web-probes", webProbeH.List)
	ws.Get("/:wsid/web-probes/history", webProbeH.History)

	// Web Crawl (append-only history)
	ws.Get("/:wsid/web-crawl", webCrawlH.List)
	ws.Get("/:wsid/web-crawl/history", webCrawlH.History)

	// Fuzz Endpoints (normalized GET params + POST forms)
	ws.Get("/:wsid/fuzz-endpoints", fuzzEndpointH.List)

	// Fuzzing results
	ws.Get("/:wsid/fuzz-params", fuzzParamH.List)
	ws.Get("/:wsid/dir-fuzz", dirFuzzH.List)

	// Vuln scan runs + findings by domain/tool
	ws.Get("/:wsid/vuln-runs", vulnScanH.ListRuns)
	ws.Get("/:wsid/vuln-findings", vulnScanH.ListFindings)
	ws.Get("/:wsid/vuln-findings/history", vulnScanH.ListFindingsHistory)
	ws.Get("/:wsid/vuln-summary", vulnScanH.DomainSummary)

	// Nuclei findings (dedicated table with extracted_results)
	ws.Get("/:wsid/nuclei-findings", nucleiFindingH.List)
	ws.Get("/:wsid/nuclei-findings/history", nucleiFindingH.ListHistory)

	// WordPress — danh sách host WordPress + findings WPScan/WPProbe (bảng riêng)
	ws.Get("/:wsid/wordpress-targets", wpH.ListTargets)
	ws.Get("/:wsid/wpscan-findings", wpH.ListWPScan)
	ws.Get("/:wsid/wpscan-findings/history", wpH.ListWPScanHistory)
	ws.Get("/:wsid/wpprobe-findings", wpH.ListWPProbe)
	ws.Get("/:wsid/wpprobe-findings/history", wpH.ListWPProbeHistory)

	// Firebase config trích từ target (1 row/target, run mới nhất)
	ws.Get("/:wsid/firebase-configs", firestoreH.ListConfigs)

	// Firestore enumeration (OpenFirebase) — collections + documents (latest-run)
	ws.Get("/:wsid/firestore-collections", firestoreH.ListCollections)
	ws.Get("/:wsid/firestore-collections/history", firestoreH.ListCollectionsHistory)
	ws.Get("/:wsid/firestore-documents", firestoreH.ListDocuments)
	// Firestore crawl — metadata (latest-run) + tải file JSON
	ws.Get("/:wsid/firestore-crawls", firestoreH.ListCrawls)
	ws.Get("/:wsid/firestore-crawls/download", firestoreH.DownloadCrawl)

	// Findings
	ws.Get("/:wsid/findings", findingH.List)
	ws.Post("/:wsid/findings", findingH.Create)
	ws.Get("/:wsid/findings/:id", findingH.Get)
	ws.Put("/:wsid/findings/:id", findingH.Update)
	ws.Patch("/:wsid/findings/:id/status", findingH.UpdateStatus)
	ws.Delete("/:wsid/findings/:id", findingH.Delete)

	app.Use(func(c *fiber.Ctx) error {
		return fiber.NewError(fiber.StatusNotFound, "endpoint không tồn tại")
	})
}
