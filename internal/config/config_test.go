package config

import "testing"

// A trailing newline pasted into a dashboard env field must not survive into
// config values: net/http rejects header values containing control characters,
// so an untrimmed key breaks every GoTrue request (2026-07-11 production
// incident, see fix-auth.md).
func TestLoadTrimsWhitespace(t *testing.T) {
	t.Setenv("DATABASE_URL", " postgres://example/db \n")
	t.Setenv("SUPABASE_URL", "https://ref.supabase.co/\n")
	t.Setenv("SUPABASE_ANON_KEY", "sb_publishable_key\n")
	t.Setenv("SUPABASE_JWKS_URL", "")
	t.Setenv("SUPABASE_JWT_SECRET", "")
	t.Setenv("PORT", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.DatabaseURL != "postgres://example/db" {
		t.Errorf("DatabaseURL = %q", cfg.DatabaseURL)
	}
	if cfg.SupabaseURL != "https://ref.supabase.co" {
		t.Errorf("SupabaseURL = %q", cfg.SupabaseURL)
	}
	if cfg.SupabaseAnonKey != "sb_publishable_key" {
		t.Errorf("SupabaseAnonKey = %q", cfg.SupabaseAnonKey)
	}
}
