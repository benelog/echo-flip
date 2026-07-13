// Applies embedded SQL migrations. Run with a DIRECT (non transaction-pooled)
// connection string, e.g.:
//
//	MIGRATE_DATABASE_URL=postgres://... go run ./cmd/migrate
//
// Falls back to DATABASE_URL when MIGRATE_DATABASE_URL is unset.
package main

import (
	"log"
	"os"

	"github.com/benelog/flashcard/internal/db"
)

func main() {
	url := os.Getenv("MIGRATE_DATABASE_URL")
	if url == "" {
		url = os.Getenv("DATABASE_URL")
	}
	if url == "" {
		log.Fatal("MIGRATE_DATABASE_URL or DATABASE_URL is required")
	}
	if err := db.Migrate(url); err != nil {
		log.Fatal(err)
	}
	log.Println("migrations applied")
}
