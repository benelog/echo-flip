package store

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type Profile struct {
	ID          uuid.UUID       `json:"id"`
	DisplayName *string         `json:"displayName"`
	Settings    json.RawMessage `json:"settings"`
	CreatedAt   time.Time       `json:"createdAt"`
}

// GetOrCreateProfile lazily creates the profile row on first API contact,
// so no Supabase-side trigger on auth.users is needed.
func (s *Store) GetOrCreateProfile(ctx context.Context, userID uuid.UUID, displayName string) (Profile, error) {
	var p Profile
	_, err := s.pool.Exec(ctx,
		`insert into profiles (id, display_name) values ($1, nullif($2, '')) on conflict (id) do nothing`,
		userID, displayName)
	if err != nil {
		return p, err
	}
	err = s.pool.QueryRow(ctx,
		`select id, display_name, settings, created_at from profiles where id = $1`, userID).
		Scan(&p.ID, &p.DisplayName, &p.Settings, &p.CreatedAt)
	return p, err
}

func (s *Store) UpdateProfile(ctx context.Context, userID uuid.UUID, displayName *string, settings json.RawMessage) (Profile, error) {
	var p Profile
	err := s.pool.QueryRow(ctx,
		`update profiles set
		   display_name = coalesce($2, display_name),
		   settings = coalesce($3, settings)
		 where id = $1
		 returning id, display_name, settings, created_at`,
		userID, displayName, settings).
		Scan(&p.ID, &p.DisplayName, &p.Settings, &p.CreatedAt)
	return p, err
}
