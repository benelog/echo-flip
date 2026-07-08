package handlers

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/benelog/echo-flip/internal/auth"
	"github.com/benelog/echo-flip/internal/store"
)

type cardBody struct {
	DeckSlug string   `json:"deckSlug"`
	Text     string   `json:"text"`
	Meaning  string   `json:"meaning"`
	CardType string   `json:"cardType"`
	Tags     []string `json:"tags"`
	Phonetic *string  `json:"phonetic"`
	Example  *string  `json:"example"`
	Notes    *string  `json:"notes"`
}

func (b *cardBody) toInput() (store.CardInput, string) {
	b.Text = strings.TrimSpace(b.Text)
	b.Meaning = strings.TrimSpace(b.Meaning)
	if b.Text == "" || b.Meaning == "" {
		return store.CardInput{}, "text and meaning are required"
	}
	if b.CardType == "" {
		b.CardType = "word"
	}
	if !validCardType(b.CardType) {
		return store.CardInput{}, "cardType must be word, sentence, idiom or concept"
	}
	if b.Tags == nil {
		b.Tags = []string{}
	}
	return store.CardInput{
		Text: b.Text, Meaning: b.Meaning,
		CardType: b.CardType, Tags: b.Tags,
		Phonetic: b.Phonetic, Example: b.Example, Notes: b.Notes,
	}, ""
}

// resolveDeck fills in.DeckID from the body's deck slug.
func (h *Handlers) resolveDeck(c *gin.Context, b *cardBody, in *store.CardInput) bool {
	deckID, err := h.Store.DeckIDBySlug(c.Request.Context(), auth.UserID(c), b.DeckSlug)
	if err != nil {
		fail(c, err)
		return false
	}
	in.DeckID = deckID
	return true
}

func (h *Handlers) ListDeckCards(c *gin.Context) {
	deckID, ok := h.pathDeckID(c)
	if !ok {
		return
	}
	cards, err := h.Store.ListCards(c.Request.Context(), auth.UserID(c), deckID)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, cards)
}

func (h *Handlers) CreateCard(c *gin.Context) {
	var body cardBody
	if err := c.ShouldBindJSON(&body); err != nil {
		badRequest(c, "invalid body")
		return
	}
	in, msg := body.toInput()
	if msg != "" {
		badRequest(c, msg)
		return
	}
	if !h.resolveDeck(c, &body, &in) {
		return
	}
	card, err := h.Store.CreateCard(c.Request.Context(), auth.UserID(c), in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, card)
}

func (h *Handlers) GetCard(c *gin.Context) {
	cardID, ok := pathUUID(c, "id")
	if !ok {
		return
	}
	card, err := h.Store.GetCard(c.Request.Context(), auth.UserID(c), cardID)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, card)
}

func (h *Handlers) UpdateCard(c *gin.Context) {
	cardID, ok := pathUUID(c, "id")
	if !ok {
		return
	}
	var body cardBody
	if err := c.ShouldBindJSON(&body); err != nil {
		badRequest(c, "invalid body")
		return
	}
	in, msg := body.toInput()
	if msg != "" {
		badRequest(c, msg)
		return
	}
	if !h.resolveDeck(c, &body, &in) {
		return
	}
	card, err := h.Store.UpdateCard(c.Request.Context(), auth.UserID(c), cardID, in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, card)
}

func (h *Handlers) DeleteCard(c *gin.Context) {
	cardID, ok := pathUUID(c, "id")
	if !ok {
		return
	}
	if err := h.Store.DeleteCard(c.Request.Context(), auth.UserID(c), cardID); err != nil {
		fail(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// BulkCreateCards imports rows the client parsed from CSV.
func (h *Handlers) BulkCreateCards(c *gin.Context) {
	deckID, ok := h.pathDeckID(c)
	if !ok {
		return
	}
	var body struct {
		Cards []cardBody `json:"cards"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		badRequest(c, "invalid body")
		return
	}
	if len(body.Cards) == 0 || len(body.Cards) > 2000 {
		badRequest(c, "cards must contain 1-2000 rows")
		return
	}
	inputs := make([]store.CardInput, 0, len(body.Cards))
	invalid := 0
	for _, cb := range body.Cards {
		in, msg := cb.toInput()
		if msg != "" {
			invalid++
			continue
		}
		inputs = append(inputs, in)
	}
	res, err := h.Store.BulkCreateCards(c.Request.Context(), auth.UserID(c), deckID, inputs)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"added": res.Added, "skipped": res.Skipped, "invalid": invalid})
}

// ExportDeck streams the deck as CSV (UTF-8 BOM for Excel compatibility).
func (h *Handlers) ExportDeck(c *gin.Context) {
	userID := auth.UserID(c)
	deck, err := h.Store.GetDeckBySlug(c.Request.Context(), userID, c.Param("slug"))
	if err != nil {
		fail(c, err)
		return
	}
	cards, err := h.Store.ListCards(c.Request.Context(), userID, deck.ID)
	if err != nil {
		fail(c, err)
		return
	}

	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%q", "deck-"+deck.ID.String()+".csv"))
	c.Writer.Write([]byte{0xEF, 0xBB, 0xBF}) // UTF-8 BOM
	w := csv.NewWriter(c.Writer)
	w.Write([]string{"text", "meaning", "type", "tags", "phonetic", "example"})
	deref := func(s *string) string {
		if s == nil {
			return ""
		}
		return *s
	}
	for _, card := range cards {
		w.Write([]string{
			card.Text, card.Meaning, card.CardType,
			strings.Join(card.Tags, "|"), deref(card.Phonetic), deref(card.Example),
		})
	}
	w.Flush()
}
