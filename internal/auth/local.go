package auth

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// LocalUserID is the fixed identity every request runs as in local mode.
var LocalUserID = uuid.MustParse("00000000-0000-0000-0000-000000000001")

// LocalMiddleware replaces token validation in local single-user mode: it
// signs every request in as LocalUserID, so no Authorization header (and no
// Supabase) is needed. It stands in for both the required and the optional
// middleware.
func LocalMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set(userIDKey, LocalUserID)
		c.Next()
	}
}
