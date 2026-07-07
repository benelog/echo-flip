package config

import (
	"fmt"
	"os"
	"strings"
)

type Config struct {
	DatabaseURL    string
	JWKSURL        string
	JWTSecret      string // legacy HS256 fallback; used when set
	AllowedOrigins []string
	Port           string
}

func Load() (*Config, error) {
	cfg := &Config{
		DatabaseURL: os.Getenv("DATABASE_URL"),
		JWKSURL:     os.Getenv("SUPABASE_JWKS_URL"),
		JWTSecret:   os.Getenv("SUPABASE_JWT_SECRET"),
		Port:        os.Getenv("PORT"),
	}
	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if cfg.JWKSURL == "" && cfg.JWTSecret == "" {
		return nil, fmt.Errorf("SUPABASE_JWKS_URL or SUPABASE_JWT_SECRET is required")
	}
	if cfg.Port == "" {
		cfg.Port = "8080"
	}
	for _, o := range strings.Split(os.Getenv("ALLOWED_ORIGINS"), ",") {
		if o = strings.TrimSpace(o); o != "" {
			cfg.AllowedOrigins = append(cfg.AllowedOrigins, o)
		}
	}
	return cfg, nil
}
