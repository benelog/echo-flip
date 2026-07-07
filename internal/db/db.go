package db

import (
	"context"
	"fmt"
	"sync"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	pool     *pgxpool.Pool
	poolOnce sync.Once
	poolErr  error
)

// Pool returns a process-wide pgx pool. On Vercel each warm function instance
// reuses it across invocations, so keep it small: Supabase's pooled port
// (Supavisor transaction mode) also rules out prepared statements, hence
// simple protocol.
func Pool(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	poolOnce.Do(func() {
		cfg, err := pgxpool.ParseConfig(databaseURL)
		if err != nil {
			poolErr = fmt.Errorf("parse DATABASE_URL: %w", err)
			return
		}
		cfg.MaxConns = 4
		cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
		pool, poolErr = pgxpool.NewWithConfig(ctx, cfg)
	})
	return pool, poolErr
}
