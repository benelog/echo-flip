package auth

import (
	"context"
	"net/http"
	"strings"
	"sync"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const userIDKey = "auth.userID"

var (
	jwks     keyfunc.Keyfunc
	jwksOnce sync.Once
	jwksErr  error
)

func keyfuncFor(jwksURL, secret string) (jwt.Keyfunc, error) {
	if secret != "" {
		return func(t *jwt.Token) (any, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrTokenSignatureInvalid
			}
			return []byte(secret), nil
		}, nil
	}
	jwksOnce.Do(func() {
		jwks, jwksErr = keyfunc.NewDefaultCtx(context.Background(), []string{jwksURL})
	})
	if jwksErr != nil {
		return nil, jwksErr
	}
	return jwks.Keyfunc, nil
}

// Middleware validates the Supabase access token and stores the user id.
func Middleware(jwksURL, secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		raw := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
		if raw == "" || raw == c.GetHeader("Authorization") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing bearer token"})
			return
		}
		kf, err := keyfuncFor(jwksURL, secret)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "jwks unavailable"})
			return
		}
		claims := jwt.MapClaims{}
		_, err = jwt.ParseWithClaims(raw, claims, kf,
			jwt.WithValidMethods([]string{"HS256", "RS256", "ES256"}),
			jwt.WithAudience("authenticated"),
			jwt.WithExpirationRequired(),
		)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}
		sub, _ := claims["sub"].(string)
		userID, err := uuid.Parse(sub)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid subject"})
			return
		}
		c.Set(userIDKey, userID)
		c.Next()
	}
}

func UserID(c *gin.Context) uuid.UUID {
	return c.MustGet(userIDKey).(uuid.UUID)
}
