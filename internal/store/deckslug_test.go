package store

import (
	"strings"
	"testing"
)

func TestDeckSlugRoundTrip(t *testing.T) {
	for _, seq := range []int64{1, 2, 35, 36, 1295, 1296, 46656, 1_000_000, 1_679_615} {
		slug := encodeDeckSlug(seq)
		if len(slug) != slugLen {
			t.Fatalf("encodeDeckSlug(%d) = %q, want %d chars", seq, slug, slugLen)
		}
		got, err := decodeDeckSlug(slug)
		if err != nil {
			t.Fatalf("decodeDeckSlug(%q): %v", slug, err)
		}
		if got != seq {
			t.Errorf("round trip %d -> %q -> %d", seq, slug, got)
		}
	}
}

// A broad round trip guards against an arithmetic slip in the permutation or
// its inverse, and confirms slugs are always 4 chars and never collide.
func TestDeckSlugBijective(t *testing.T) {
	seen := make(map[string]int64)
	for seq := int64(1); seq < 20000; seq++ {
		slug := encodeDeckSlug(seq)
		if len(slug) != slugLen {
			t.Fatalf("encodeDeckSlug(%d) = %q, want %d chars", seq, slug, slugLen)
		}
		if prev, dup := seen[slug]; dup {
			t.Fatalf("slug %q collides: seq %d and %d", slug, prev, seq)
		}
		seen[slug] = seq
		if got, err := decodeDeckSlug(slug); err != nil || got != seq {
			t.Fatalf("round trip %d -> %q -> %d (err %v)", seq, slug, got, err)
		}
	}
}

// Slugs must not read as a sequence: adjacent seq values encode to unrelated slugs.
func TestDeckSlugNotSequential(t *testing.T) {
	if a, b := encodeDeckSlug(1), encodeDeckSlug(2); a == "0001" || b == "0002" {
		t.Errorf("slugs look sequential: 1 -> %q, 2 -> %q", a, b)
	}
}

// Base36 slugs are case-insensitive: an uppercased slug resolves to the same deck.
func TestDeckSlugCaseInsensitive(t *testing.T) {
	for _, seq := range []int64{1, 42, 1_000_000} {
		slug := encodeDeckSlug(seq)
		got, err := decodeDeckSlug(strings.ToUpper(slug))
		if err != nil || got != seq {
			t.Errorf("decodeDeckSlug(%q) = %d, %v; want %d", strings.ToUpper(slug), got, err, seq)
		}
	}
}

func TestEncodeDeckSlugOutOfRange(t *testing.T) {
	for _, seq := range []int64{0, -5, slugSpace, slugSpace + 1} {
		if got := encodeDeckSlug(seq); got != "" {
			t.Errorf("encodeDeckSlug(%d) = %q, want empty", seq, got)
		}
	}
}

func TestDecodeDeckSlugInvalid(t *testing.T) {
	// Wrong length, non-Base36 byte, multibyte input, and the zero slug (which
	// maps back to seq 0) must all be rejected.
	for _, s := range []string{"", "abc", "abcde", "abc!", "한글", "0000"} {
		if _, err := decodeDeckSlug(s); err == nil {
			t.Errorf("decodeDeckSlug(%q) expected error", s)
		}
	}
}
