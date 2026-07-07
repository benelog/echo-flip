package handlers

import (
	"errors"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/benelog/echo-flip/internal/store"
)

type Handlers struct {
	Store *store.Store
}

func New(s *store.Store) *Handlers {
	return &Handlers{Store: s}
}

func (h *Handlers) Healthz(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func fail(c *gin.Context, err error) {
	if errors.Is(err, store.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	log.Printf("internal error: %v", err)
	c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
}

func badRequest(c *gin.Context, msg string) {
	c.JSON(http.StatusBadRequest, gin.H{"error": msg})
}

func pathUUID(c *gin.Context, name string) (uuid.UUID, bool) {
	id, err := uuid.Parse(c.Param(name))
	if err != nil {
		badRequest(c, "invalid "+name)
		return uuid.Nil, false
	}
	return id, true
}

func validCardType(t string) bool {
	return t == "word" || t == "sentence" || t == "idiom"
}
