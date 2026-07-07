// Local dev server: go run ./cmd/server (reads .env vars from the shell).
package main

import (
	"log"
	"os"

	"github.com/benelog/echo-flip/internal/app"
)

func main() {
	engine, err := app.Engine()
	if err != nil {
		log.Fatal(err)
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("echo-flip api listening on :%s", port)
	if err := engine.Run(":" + port); err != nil {
		log.Fatal(err)
	}
}
