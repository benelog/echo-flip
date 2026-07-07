// Package handler is the Vercel serverless entrypoint. vercel.json rewrites
// every /api/* request here; the original path is preserved, so the Gin
// router dispatches normally.
package handler

import (
	"net/http"

	"github.com/benelog/echo-flip/pkg/app"
)

func Handler(w http.ResponseWriter, r *http.Request) {
	engine, err := app.Engine()
	if err != nil {
		http.Error(w, "server misconfigured: "+err.Error(), http.StatusInternalServerError)
		return
	}
	engine.ServeHTTP(w, r)
}
