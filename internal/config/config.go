package config

import (
	"fmt"
	"os"
	"strings"
)

type Config struct {
	Driver         string // "postgres" (production) or "sqlite" (local mode)
	DatabaseURL    string
	SQLitePath     string
	AuthMode       string // "supabase" (JWT validation) or "local" (fixed user)
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
	if cfg.Port == "" {
		cfg.Port = "8080"
	}
	for _, o := range strings.Split(os.Getenv("ALLOWED_ORIGINS"), ",") {
		if o = strings.TrimSpace(o); o != "" {
			cfg.AllowedOrigins = append(cfg.AllowedOrigins, o)
		}
	}

	if cfg.DatabaseURL != "" {
		cfg.Driver = "postgres"
		cfg.AuthMode = "supabase"
		if cfg.JWKSURL == "" && cfg.JWTSecret == "" {
			return nil, fmt.Errorf("SUPABASE_JWKS_URL or SUPABASE_JWT_SECRET is required")
		}
		return cfg, nil
	}

	// No DATABASE_URL: run in local single-user mode on a SQLite file. On
	// Vercel that would silently write to the function's throwaway filesystem,
	// so a missing DATABASE_URL there is always a misconfiguration.
	if os.Getenv("VERCEL") != "" {
		return nil, fmt.Errorf("DATABASE_URL is required on Vercel")
	}
	cfg.Driver = "sqlite"
	cfg.AuthMode = "local"
	cfg.SQLitePath = os.Getenv("SQLITE_PATH")
	if cfg.SQLitePath == "" {
		cfg.SQLitePath = "echo-flip.db"
	}
	if len(cfg.AllowedOrigins) == 0 {
		cfg.AllowedOrigins = []string{"http://localhost:3000"}
	}
	return cfg, nil
}
