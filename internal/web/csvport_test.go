package web

import (
	"strings"
	"testing"
)

func TestParseCSVCards(t *testing.T) {
	csv := "text,meaning,type,tags,phonetic,example\n" +
		"serendipity,우연한 행운,word,토익|명사,/ˌserənˈdipəti/,It was pure serendipity.\n" +
		"hit the sack,자러 가다,idiom,,,\n" +
		"unknown-type,뜻,banana,,,\n" +
		",뜻만 있음,,,,\n"

	cards, invalid, err := parseCSVCards(strings.NewReader(csv))
	if err != nil {
		t.Fatal(err)
	}
	if invalid != 1 {
		t.Errorf("invalid = %d, want 1", invalid)
	}
	if len(cards) != 3 {
		t.Fatalf("len(cards) = %d, want 3", len(cards))
	}
	first := cards[0]
	if first.Text != "serendipity" || first.Meaning != "우연한 행운" {
		t.Errorf("unexpected first card: %+v", first)
	}
	if len(first.Tags) != 2 || first.Tags[0] != "토익" || first.Tags[1] != "명사" {
		t.Errorf("tags = %v, want [토익 명사]", first.Tags)
	}
	if first.Phonetic == nil || *first.Phonetic != "/ˌserənˈdipəti/" {
		t.Errorf("phonetic = %v", first.Phonetic)
	}
	// 모르는 type은 word로 정규화된다.
	if cards[2].CardType != "word" {
		t.Errorf("cardType = %q, want word", cards[2].CardType)
	}
}

func TestParseCSVCardsLegacyHeaders(t *testing.T) {
	// 옛 내보내기 형식(front,back)과 BOM이 있어도 읽힌다.
	csv := "\uFEFFfront,back\napple,사과\n"
	cards, invalid, err := parseCSVCards(strings.NewReader(csv))
	if err != nil {
		t.Fatal(err)
	}
	if invalid != 0 || len(cards) != 1 {
		t.Fatalf("cards=%d invalid=%d, want 1/0", len(cards), invalid)
	}
	if cards[0].Text != "apple" || cards[0].Meaning != "사과" {
		t.Errorf("unexpected card: %+v", cards[0])
	}
}

func TestParseCSVCardsNoUsableHeader(t *testing.T) {
	cards, _, err := parseCSVCards(strings.NewReader("a,b\n1,2\n"))
	if err != nil {
		t.Fatal(err)
	}
	if len(cards) != 0 {
		t.Errorf("len(cards) = %d, want 0", len(cards))
	}
}
