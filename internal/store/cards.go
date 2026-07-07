package store

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/benelog/echo-flip/internal/smartrules"
)

type Card struct {
	ID        uuid.UUID `json:"id"`
	DeckID    uuid.UUID `json:"deckId"`
	SideAText string    `json:"sideAText"`
	SideBText string    `json:"sideBText"`
	CardType  string    `json:"cardType"`
	Tags      []string  `json:"tags"`
	Phonetic  *string   `json:"phonetic"`
	Example   *string   `json:"example"`
	Notes     *string   `json:"notes"`
	CreatedAt time.Time `json:"createdAt"`

	// SRS summary from cards_with_stats.
	Attempts     int        `json:"attempts"`
	ErrorRate    float64    `json:"errorRate"`
	IntervalDays float64    `json:"intervalDays"`
	DueAt        time.Time  `json:"dueAt"`
	LastReviewed *time.Time `json:"lastReviewedAt"`
}

type CardInput struct {
	DeckID    uuid.UUID `json:"deckId"`
	SideAText string    `json:"sideAText"`
	SideBText string    `json:"sideBText"`
	CardType  string    `json:"cardType"`
	Tags      []string  `json:"tags"`
	Phonetic  *string   `json:"phonetic"`
	Example   *string   `json:"example"`
	Notes     *string   `json:"notes"`
}

const cardSelect = `
	select id, deck_id, side_a_text, side_b_text, card_type, tags, phonetic, example,
	       notes, created_at, attempts, error_rate, interval_days, due_at, last_reviewed_at
	from cards_with_stats`

func scanCard(row pgx.Row) (Card, error) {
	var c Card
	err := row.Scan(&c.ID, &c.DeckID, &c.SideAText, &c.SideBText, &c.CardType, &c.Tags,
		&c.Phonetic, &c.Example, &c.Notes, &c.CreatedAt,
		&c.Attempts, &c.ErrorRate, &c.IntervalDays, &c.DueAt, &c.LastReviewed)
	if errors.Is(err, pgx.ErrNoRows) {
		return c, ErrNotFound
	}
	return c, err
}

func (s *Store) collectCards(rows pgx.Rows) ([]Card, error) {
	defer rows.Close()
	cards := []Card{}
	for rows.Next() {
		c, err := scanCard(rows)
		if err != nil {
			return nil, err
		}
		cards = append(cards, c)
	}
	return cards, rows.Err()
}

func (s *Store) ListCards(ctx context.Context, userID, deckID uuid.UUID) ([]Card, error) {
	rows, err := s.pool.Query(ctx,
		cardSelect+` where user_id = $1 and deck_id = $2 order by created_at desc`, userID, deckID)
	if err != nil {
		return nil, err
	}
	return s.collectCards(rows)
}

func (s *Store) GetCard(ctx context.Context, userID, cardID uuid.UUID) (Card, error) {
	return scanCard(s.pool.QueryRow(ctx, cardSelect+` where user_id = $1 and id = $2`, userID, cardID))
}

// CreateCard inserts the card and its SRS row in one transaction; the deck
// ownership check doubles as the foreign-key guard.
func (s *Store) CreateCard(ctx context.Context, userID uuid.UUID, in CardInput) (Card, error) {
	if _, err := s.GetDeck(ctx, userID, in.DeckID); err != nil {
		return Card{}, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Card{}, err
	}
	defer tx.Rollback(ctx)

	var cardID uuid.UUID
	err = tx.QueryRow(ctx,
		`insert into cards (user_id, deck_id, side_a_text, side_b_text, card_type, tags, phonetic, example, notes)
		 values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
		userID, in.DeckID, in.SideAText, in.SideBText, in.CardType, in.Tags, in.Phonetic, in.Example, in.Notes).
		Scan(&cardID)
	if err != nil {
		return Card{}, err
	}
	if _, err := tx.Exec(ctx,
		`insert into card_srs (card_id, user_id) values ($1, $2)`, cardID, userID); err != nil {
		return Card{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Card{}, err
	}
	return s.GetCard(ctx, userID, cardID)
}

func (s *Store) UpdateCard(ctx context.Context, userID, cardID uuid.UUID, in CardInput) (Card, error) {
	tag, err := s.pool.Exec(ctx,
		`update cards set
		   side_a_text = $3, side_b_text = $4, card_type = $5, tags = $6,
		   phonetic = $7, example = $8, notes = $9, updated_at = now()
		 where user_id = $1 and id = $2`,
		userID, cardID, in.SideAText, in.SideBText, in.CardType, in.Tags, in.Phonetic, in.Example, in.Notes)
	if err != nil {
		return Card{}, err
	}
	if tag.RowsAffected() == 0 {
		return Card{}, ErrNotFound
	}
	return s.GetCard(ctx, userID, cardID)
}

func (s *Store) DeleteCard(ctx context.Context, userID, cardID uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `delete from cards where user_id = $1 and id = $2`, userID, cardID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

type BulkResult struct {
	Added   int `json:"added"`
	Skipped int `json:"skipped"`
}

// BulkCreateCards inserts many cards, skipping side-A texts that already exist
// in the deck (or repeat within the batch), compared case- and space-insensitively.
func (s *Store) BulkCreateCards(ctx context.Context, userID, deckID uuid.UUID, inputs []CardInput) (BulkResult, error) {
	var res BulkResult
	if _, err := s.GetDeck(ctx, userID, deckID); err != nil {
		return res, err
	}
	seen := map[string]bool{}
	rows, err := s.pool.Query(ctx,
		`select lower(trim(side_a_text)) from cards where user_id = $1 and deck_id = $2`, userID, deckID)
	if err != nil {
		return res, err
	}
	for rows.Next() {
		var f string
		if err := rows.Scan(&f); err != nil {
			rows.Close()
			return res, err
		}
		seen[f] = true
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return res, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return res, err
	}
	defer tx.Rollback(ctx)
	for _, in := range inputs {
		key := strings.ToLower(strings.TrimSpace(in.SideAText))
		if key == "" || seen[key] {
			res.Skipped++
			continue
		}
		seen[key] = true
		var cardID uuid.UUID
		err := tx.QueryRow(ctx,
			`insert into cards (user_id, deck_id, side_a_text, side_b_text, card_type, tags, phonetic, example, notes)
			 values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
			userID, deckID, strings.TrimSpace(in.SideAText), in.SideBText, in.CardType, in.Tags,
			in.Phonetic, in.Example, in.Notes).Scan(&cardID)
		if err != nil {
			return res, err
		}
		if _, err := tx.Exec(ctx,
			`insert into card_srs (card_id, user_id) values ($1, $2)`, cardID, userID); err != nil {
			return res, err
		}
		res.Added++
	}
	return res, tx.Commit(ctx)
}

func (s *Store) DueCards(ctx context.Context, userID uuid.UUID, dueBefore time.Time, limit int) ([]Card, error) {
	rows, err := s.pool.Query(ctx,
		cardSelect+` where user_id = $1 and due_at <= $2 order by due_at asc limit $3`,
		userID, dueBefore, limit)
	if err != nil {
		return nil, err
	}
	return s.collectCards(rows)
}

func (s *Store) DueCount(ctx context.Context, userID uuid.UUID, dueBefore time.Time) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx,
		`select count(*) from card_srs where user_id = $1 and due_at <= $2`, userID, dueBefore).Scan(&n)
	return n, err
}

// CardsByRule evaluates a smart rule and returns matching cards in rule order.
func (s *Store) CardsByRule(ctx context.Context, userID uuid.UUID, rule smartrules.Rule) ([]Card, error) {
	q, extra := rule.Query()
	args := append([]any{userID}, extra...)
	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	ids := []uuid.UUID{}
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return nil, err
		}
		ids = append(ids, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return []Card{}, nil
	}

	rows, err = s.pool.Query(ctx, cardSelect+` where user_id = $1 and id = any($2)`, userID, ids)
	if err != nil {
		return nil, err
	}
	cards, err := s.collectCards(rows)
	if err != nil {
		return nil, err
	}
	byID := make(map[uuid.UUID]Card, len(cards))
	for _, c := range cards {
		byID[c.ID] = c
	}
	ordered := make([]Card, 0, len(cards))
	for _, id := range ids {
		if c, ok := byID[id]; ok {
			ordered = append(ordered, c)
		}
	}
	return ordered, nil
}

func (s *Store) CountByRule(ctx context.Context, userID uuid.UUID, rule smartrules.Rule) (int, error) {
	q, extra := rule.CountQuery()
	args := append([]any{userID}, extra...)
	var n int
	err := s.pool.QueryRow(ctx, q, args...).Scan(&n)
	return n, err
}
