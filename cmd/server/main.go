// Local dev server: go run ./cmd/server (reads .env vars from the shell).
// Without DATABASE_URL it runs in local mode on a SQLite file, no env needed.
package main

import (
	"log"

	"github.com/gin-gonic/gin"

	"github.com/benelog/echo-flip/internal/config"
	"github.com/benelog/echo-flip/internal/litestore"
	"github.com/benelog/echo-flip/pkg/app"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}

	var engine *gin.Engine
	if cfg.Driver == "sqlite" {
		s, err := litestore.Open(cfg.SQLitePath)
		if err != nil {
			log.Fatal(err)
		}
		engine = app.New(cfg, s)
		log.Printf("echo-flip api listening on :%s (local mode, sqlite: %s)", cfg.Port, cfg.SQLitePath)
	} else {
		engine, err = app.Engine()
		if err != nil {
			log.Fatal(err)
		}
		log.Printf("echo-flip api listening on :%s (postgres)", cfg.Port)
	}
	if err := engine.Run(":" + cfg.Port); err != nil {
		log.Fatal(err)
	}
}
