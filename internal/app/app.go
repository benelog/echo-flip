// Package app builds the Gin engine shared by the local dev server
// (cmd/server) and the Vercel serverless entrypoint (api/index.go).
package app

import (
	"context"
	"sync"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"github.com/benelog/echo-flip/internal/auth"
	"github.com/benelog/echo-flip/internal/config"
	"github.com/benelog/echo-flip/internal/db"
	"github.com/benelog/echo-flip/internal/handlers"
	"github.com/benelog/echo-flip/internal/store"
)

var (
	engine     *gin.Engine
	engineOnce sync.Once
	engineErr  error
)

// Engine returns the process-wide router; warm serverless instances reuse it.
func Engine() (*gin.Engine, error) {
	engineOnce.Do(func() {
		engine, engineErr = build()
	})
	return engine, engineErr
}

func build() (*gin.Engine, error) {
	cfg, err := config.Load()
	if err != nil {
		return nil, err
	}
	pool, err := db.Pool(context.Background(), cfg.DatabaseURL)
	if err != nil {
		return nil, err
	}
	h := handlers.New(store.New(pool))

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())

	if len(cfg.AllowedOrigins) > 0 {
		r.Use(cors.New(cors.Config{
			AllowOrigins:     cfg.AllowedOrigins,
			AllowMethods:     []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
			AllowHeaders:     []string{"Authorization", "Content-Type"},
			MaxAge:           12 * time.Hour,
			AllowCredentials: false,
		}))
	}

	r.GET("/api/healthz", h.Healthz)

	api := r.Group("/api", auth.Middleware(cfg.JWKSURL, cfg.JWTSecret))
	{
		api.GET("/me", h.GetMe)
		api.PATCH("/me", h.UpdateMe)

		api.GET("/decks", h.ListDecks)
		api.POST("/decks", h.CreateDeck)
		api.GET("/decks/:id", h.GetDeck)
		api.PATCH("/decks/:id", h.UpdateDeck)
		api.DELETE("/decks/:id", h.DeleteDeck)
		api.GET("/decks/:id/cards", h.ListDeckCards)
		api.POST("/decks/:id/cards/bulk", h.BulkCreateCards)
		api.GET("/decks/:id/export", h.ExportDeck)
		api.POST("/decks/:id/share", h.ShareDeck)
		api.DELETE("/decks/:id/share", h.UnshareDeck)

		api.GET("/shared-decks", h.ListSharedDecks)
		api.GET("/shared-decks/:slug", h.GetSharedDeck)
		api.POST("/shared-decks/:slug/import", h.ImportSharedDeck)

		api.POST("/cards", h.CreateCard)
		api.GET("/cards/:id", h.GetCard)
		api.PATCH("/cards/:id", h.UpdateCard)
		api.DELETE("/cards/:id", h.DeleteCard)

		api.POST("/sessions", h.CreateSession)
		api.POST("/sessions/:id/reviews", h.RecordReview)
		api.POST("/sessions/:id/finish", h.FinishSession)
		api.GET("/due-count", h.DueCount)

		api.GET("/suggestions", h.Suggestions)
		api.GET("/smart-decks", h.ListSmartDecks)
		api.POST("/smart-decks", h.CreateSmartDeck)
		api.DELETE("/smart-decks/:id", h.DeleteSmartDeck)

		api.GET("/stats/daily", h.DailyStats)
		api.GET("/stats/summary", h.StatsSummary)
	}
	return r, nil
}
