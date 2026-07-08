package store

import (
	"fmt"
	"strings"
)

// Deck URL slugs are the deck's seq column in Base62: short (4 chars cover
// ~14.7M decks), stable, and cheap to decode. The UUID id stays internal.
const slugAlphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

// 62^10 still fits in int64; longer input could overflow during decode.
const slugMaxLen = 10

func encodeDeckSlug(seq int64) string {
	if seq <= 0 {
		return ""
	}
	var buf [slugMaxLen]byte
	i := len(buf)
	for n := seq; n > 0; n /= 62 {
		i--
		buf[i] = slugAlphabet[n%62]
	}
	return string(buf[i:])
}

func decodeDeckSlug(s string) (int64, error) {
	if s == "" || len(s) > slugMaxLen {
		return 0, fmt.Errorf("invalid deck slug %q", s)
	}
	var n int64
	for i := 0; i < len(s); i++ {
		v := strings.IndexByte(slugAlphabet, s[i])
		if v < 0 {
			return 0, fmt.Errorf("invalid deck slug %q", s)
		}
		n = n*62 + int64(v)
	}
	return n, nil
}
