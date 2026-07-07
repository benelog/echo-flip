package store

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type DailyStat struct {
	Date    string `json:"date"`
	Total   int    `json:"total"`
	Correct int    `json:"correct"`
}

// DailyStats groups reviews by local date in the given (pre-validated) IANA
// timezone, covering the last `days` days including today.
func (s *Store) DailyStats(ctx context.Context, userID uuid.UUID, tz string, days int) ([]DailyStat, error) {
	rows, err := s.pool.Query(ctx,
		`select to_char(reviewed_at at time zone $2, 'YYYY-MM-DD') as day,
		        count(*)::int,
		        (count(*) filter (where result))::int
		 from review_logs
		 where user_id = $1
		   and reviewed_at >= ((now() at time zone $2)::date - ($3::int - 1)) at time zone $2
		 group by day
		 order by day`,
		userID, tz, days)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	stats := []DailyStat{}
	for rows.Next() {
		var d DailyStat
		if err := rows.Scan(&d.Date, &d.Total, &d.Correct); err != nil {
			return nil, err
		}
		stats = append(stats, d)
	}
	return stats, rows.Err()
}

type DeckMastery struct {
	DeckID      uuid.UUID `json:"deckId"`
	Name        string    `json:"name"`
	TotalCards  int       `json:"totalCards"`
	MatureCards int       `json:"matureCards"` // interval_days >= 21
}

type Summary struct {
	TotalReviews   int           `json:"totalReviews"`
	CorrectReviews int           `json:"correctReviews"`
	Streak         int           `json:"streak"`
	Decks          []DeckMastery `json:"decks"`
}

func (s *Store) StatsSummary(ctx context.Context, userID uuid.UUID, tz string, loc *time.Location) (Summary, error) {
	var sum Summary
	err := s.pool.QueryRow(ctx,
		`select count(*)::int, (count(*) filter (where result))::int
		 from review_logs where user_id = $1 and is_retry = false`, userID).
		Scan(&sum.TotalReviews, &sum.CorrectReviews)
	if err != nil {
		return sum, err
	}

	rows, err := s.pool.Query(ctx,
		`select distinct (reviewed_at at time zone $2)::date as day
		 from review_logs where user_id = $1
		 order by day desc limit 400`, userID, tz)
	if err != nil {
		return sum, err
	}
	days := []time.Time{}
	for rows.Next() {
		var d time.Time
		if err := rows.Scan(&d); err != nil {
			rows.Close()
			return sum, err
		}
		days = append(days, d)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return sum, err
	}
	sum.Streak = streak(days, time.Now().In(loc))

	rows, err = s.pool.Query(ctx,
		`select d.id, d.name,
		        count(cs.card_id)::int,
		        (count(cs.card_id) filter (where cs.interval_days >= 21))::int
		 from decks d
		 left join cards c on c.deck_id = d.id
		 left join card_srs cs on cs.card_id = c.id
		 where d.user_id = $1
		 group by d.id, d.name, d.created_at
		 order by d.created_at desc`, userID)
	if err != nil {
		return sum, err
	}
	defer rows.Close()
	sum.Decks = []DeckMastery{}
	for rows.Next() {
		var m DeckMastery
		if err := rows.Scan(&m.DeckID, &m.Name, &m.TotalCards, &m.MatureCards); err != nil {
			return sum, err
		}
		sum.Decks = append(sum.Decks, m)
	}
	return sum, rows.Err()
}

// streak counts consecutive study days ending today or yesterday. reviewDays
// must be distinct local dates in descending order.
func streak(reviewDays []time.Time, now time.Time) int {
	if len(reviewDays) == 0 {
		return 0
	}
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	first := reviewDays[0]
	first = time.Date(first.Year(), first.Month(), first.Day(), 0, 0, 0, 0, time.UTC)
	gap := int(today.Sub(first).Hours() / 24)
	if gap > 1 {
		return 0
	}
	count := 1
	prev := first
	for _, d := range reviewDays[1:] {
		d = time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, time.UTC)
		if int(prev.Sub(d).Hours()/24) != 1 {
			break
		}
		count++
		prev = d
	}
	return count
}
