package config

import (
	"fmt"
	"os"
	"strings"
)

// env reads a variable with surrounding whitespace stripped. A trailing
// newline pasted into a dashboard field otherwise survives into HTTP
// headers, where net/http rejects the value and requests never leave.
func env(name string) string {
	return strings.TrimSpace(os.Getenv(name))
}

type Config struct {
	Driver          string // "postgres" (production) or "sqlite" (local mode)
	DatabaseURL     string
	SQLitePath      string
	AuthMode        string // "supabase" (JWT validation) or "local" (fixed user)
	SupabaseURL     string // https://<ref>.supabase.co — web login (GoTrue) base URL
	SupabaseAnonKey string // GoTrue apikey for the server-side OAuth flow
	JWKSURL         string
	JWTSecret       string // legacy HS256 fallback; used when set
	AllowedOrigins  []string
	Port            string
}

func Load() (*Config, error) {
	cfg := &Config{
		DatabaseURL:     env("DATABASE_URL"),
		SupabaseURL:     strings.TrimRight(env("SUPABASE_URL"), "/"),
		SupabaseAnonKey: env("SUPABASE_ANON_KEY"),
		JWKSURL:         env("SUPABASE_JWKS_URL"),
		JWTSecret:       env("SUPABASE_JWT_SECRET"),
		Port:            env("PORT"),
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
		if cfg.SupabaseURL == "" || cfg.SupabaseAnonKey == "" {
			return nil, fmt.Errorf("SUPABASE_URL and SUPABASE_ANON_KEY are required")
		}
		if cfg.JWKSURL == "" && cfg.JWTSecret == "" {
			cfg.JWKSURL = cfg.SupabaseURL + "/auth/v1/.well-known/jwks.json"
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
	cfg.SQLitePath = env("SQLITE_PATH")
	if cfg.SQLitePath == "" {
		cfg.SQLitePath = "echo-flip.db"
	}
	return cfg, nil
}
