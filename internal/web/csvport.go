package web

import (
	"encoding/csv"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/benelog/flashcard/internal/auth"
	"github.com/benelog/flashcard/internal/store"
)

// parseCSVCards reads an uploaded deck CSV. The header row names the columns
// (text,meaning,type,tags,phonetic,example — 옛 내보내기의 front,back 헤더도
// 인식한다); 태그는 | 로 구분한다.
func parseCSVCards(r io.Reader) (cards []store.CardInput, invalid int, err error) {
	reader := csv.NewReader(r)
	reader.FieldsPerRecord = -1 // 행마다 열 수가 달라도 허용
	reader.LazyQuotes = true

	header, err := reader.Read()
	if err != nil {
		return nil, 0, fmt.Errorf("CSV 헤더를 읽지 못했어요: %w", err)
	}
	col := map[string]int{}
	for i, name := range header {
		name = strings.ToLower(strings.TrimSpace(strings.TrimPrefix(name, "\uFEFF")))
		col[name] = i
	}
	pick := func(row []string, names ...string) string {
		for _, n := range names {
			if i, ok := col[n]; ok && i < len(row) {
				if v := strings.TrimSpace(row[i]); v != "" {
					return v
				}
			}
		}
		return ""
	}

	for {
		row, rerr := reader.Read()
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			invalid++
			continue
		}
		text := pick(row, "text", "front")
		meaning := pick(row, "meaning", "back")
		if text == "" || meaning == "" {
			invalid++
			continue
		}
		cardType := strings.ToLower(pick(row, "type"))
		switch cardType {
		case "word", "sentence", "idiom", "concept":
		default:
			cardType = "word"
		}
		cards = append(cards, store.CardInput{
			Text:     text,
			Meaning:  meaning,
			CardType: cardType,
			Tags:     splitTags(pick(row, "tags"), "|"),
			Phonetic: optField(pick(row, "phonetic")),
			Example:  optField(pick(row, "example")),
		})
	}
	return cards, invalid, nil
}

// importCSV handles the deck page's file-upload form.
func (w *Web) importCSV(c *gin.Context) {
	slug := c.Param("slug")
	back := "/decks/" + slug

	file, _, err := c.Request.FormFile("file")
	if err != nil {
		setFlash(c, "error", "CSV 파일을 선택해주세요")
		c.Redirect(http.StatusSeeOther, back)
		return
	}
	defer file.Close()

	cards, invalid, err := parseCSVCards(file)
	if err != nil {
		setFlash(c, "error", "CSV 파일을 읽지 못했어요")
		c.Redirect(http.StatusSeeOther, back)
		return
	}
	if len(cards) == 0 {
		msg := "가져올 카드가 없어요. text,meaning (또는 front,back) 헤더가 있는 CSV인지 확인해주세요"
		if invalid > 0 {
			msg += fmt.Sprintf(" (%d행 오류)", invalid)
		}
		setFlash(c, "error", msg)
		c.Redirect(http.StatusSeeOther, back)
		return
	}
	if len(cards) > 2000 {
		setFlash(c, "error", "한 번에 2000장까지만 가져올 수 있어요")
		c.Redirect(http.StatusSeeOther, back)
		return
	}

	userID := auth.UserID(c)
	deckID, err := w.store.DeckIDBySlug(c.Request.Context(), userID, slug)
	if err != nil {
		w.failPage(c, err)
		return
	}
	res, err := w.store.BulkCreateCards(c.Request.Context(), userID, deckID, cards)
	if err != nil {
		w.failPage(c, err)
		return
	}
	msg := fmt.Sprintf("%d개 추가, %d개 중복 건너뜀", res.Added, res.Skipped)
	if invalid > 0 {
		msg += fmt.Sprintf(", %d개 오류", invalid)
	}
	setFlash(c, "info", msg)
	c.Redirect(http.StatusSeeOther, back)
}

// exportCSV streams the deck as CSV, same format as the API's /export.
func (w *Web) exportCSV(c *gin.Context) {
	userID := auth.UserID(c)
	deck, err := w.store.GetDeckBySlug(c.Request.Context(), userID, c.Param("slug"))
	if err != nil {
		w.failPage(c, err)
		return
	}
	cards, err := w.store.ListCards(c.Request.Context(), userID, deck.ID)
	if err != nil {
		w.failPage(c, err)
		return
	}

	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%q", "deck-"+deck.Slug+".csv"))
	c.Writer.Write([]byte{0xEF, 0xBB, 0xBF}) // UTF-8 BOM (Excel 호환)
	cw := csv.NewWriter(c.Writer)
	cw.Write([]string{"text", "meaning", "type", "tags", "phonetic", "example"})
	for _, card := range cards {
		cw.Write([]string{
			card.Text, card.Meaning, card.CardType,
			strings.Join(card.Tags, "|"), deref(card.Phonetic), deref(card.Example),
		})
	}
	cw.Flush()
}
