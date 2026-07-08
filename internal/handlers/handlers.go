package handlers

import (
	"errors"
	"log"
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/benelog/echo-flip/internal/auth"
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

// EnsureProfile lazily creates the caller's profile row so that any first
// write (deck create, import, …) satisfies the profiles(id) foreign keys.
// Runs once per user per warm instance.
func (h *Handlers) EnsureProfile() gin.HandlerFunc {
	var seen sync.Map
	return func(c *gin.Context) {
		userID := auth.UserID(c)
		if _, ok := seen.Load(userID); !ok {
			if _, err := h.Store.GetOrCreateProfile(c.Request.Context(), userID, ""); err != nil {
				fail(c, err)
				c.Abort()
				return
			}
			seen.Store(userID, struct{}{})
		}
		c.Next()
	}
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

// pathDeckID resolves the :slug path param (Base36 deck slug) to the caller's
// deck id; a malformed or foreign slug responds 404.
func (h *Handlers) pathDeckID(c *gin.Context) (uuid.UUID, bool) {
	id, err := h.Store.DeckIDBySlug(c.Request.Context(), auth.UserID(c), c.Param("slug"))
	if err != nil {
		fail(c, err)
		return uuid.Nil, false
	}
	return id, true
}

func validCardType(t string) bool {
	return t == "word" || t == "sentence" || t == "idiom" || t == "concept"
}
