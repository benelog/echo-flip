package store

import "testing"

func TestDeckSlugRoundTrip(t *testing.T) {
	for _, seq := range []int64{1, 61, 62, 3843, 238328, 1_000_000, 14_776_336} {
		slug := encodeDeckSlug(seq)
		if slug == "" {
			t.Fatalf("encodeDeckSlug(%d) returned empty", seq)
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

func TestEncodeDeckSlug(t *testing.T) {
	cases := map[int64]string{1: "1", 61: "z", 62: "10", 0: "", -5: ""}
	for seq, want := range cases {
		if got := encodeDeckSlug(seq); got != want {
			t.Errorf("encodeDeckSlug(%d) = %q, want %q", seq, got, want)
		}
	}
}

func TestDecodeDeckSlugInvalid(t *testing.T) {
	for _, s := range []string{"", "abc!", "한글", "aaaaaaaaaaa"} {
		if _, err := decodeDeckSlug(s); err == nil {
			t.Errorf("decodeDeckSlug(%q) expected error", s)
		}
	}
}
