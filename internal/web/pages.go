package web

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/benelog/echo-flip/internal/auth"
	"github.com/benelog/echo-flip/internal/smartrules"
	"github.com/benelog/echo-flip/internal/store"
)

// profileSettings mirrors the JSON blob stored in profiles.settings.
type profileSettings struct {
	TtsRate   float64 `json:"ttsRate,omitempty"`
	DailyGoal int     `json:"dailyGoal,omitempty"`
}

func parseSettings(p store.Profile) profileSettings {
	s := profileSettings{TtsRate: 0.9, DailyGoal: 50}
	_ = json.Unmarshal(p.Settings, &s)
	if s.TtsRate <= 0 {
		s.TtsRate = 0.9
	}
	if s.DailyGoal <= 0 {
		s.DailyGoal = 50
	}
	return s
}

// ---------- 홈 ----------

type suggestionView struct {
	Title string
	Count int
	// Rule is the raw rule JSON; the template's URL context escapes it into
	// the /study?rule= link.
	Rule string
}

func (w *Web) homePage(c *gin.Context) {
	userID := auth.UserID(c)
	ctx := c.Request.Context()
	tz, loc := clientTZ(c)

	due, err := w.store.DueCount(ctx, userID, endOfToday(loc))
	if err != nil {
		w.failPage(c, err)
		return
	}
	summary, err := w.store.StatsSummary(ctx, userID, tz, loc)
	if err != nil {
		w.failPage(c, err)
		return
	}
	decks, err := w.store.ListDecks(ctx, userID)
	if err != nil {
		w.failPage(c, err)
		return
	}
	if len(decks) > 3 {
		decks = decks[:3]
	}

	// 홈 화면 추천 타일: 지금 카드가 있는 고정 규칙만 노출한다.
	canned := []smartrules.Rule{
		{Type: smartrules.HighError, MinAttempts: 3, MinErrorRate: 0.4, Limit: 20},
		{Type: smartrules.Stale, NotReviewedDays: 7, Limit: 20},
	}
	var suggestions []suggestionView
	for _, rule := range canned {
		n, err := w.store.CountByRule(ctx, userID, rule)
		if err != nil {
			w.failPage(c, err)
			return
		}
		if n > 0 {
			raw, _ := json.Marshal(rule)
			suggestions = append(suggestions, suggestionView{
				Title: suggestionTitle(rule, n),
				Count: n,
				Rule:  string(raw),
			})
		}
	}

	w.render(c, http.StatusOK, "home", "Echo Flip", gin.H{
		"Due":         due,
		"Streak":      summary.Streak,
		"Decks":       decks,
		"Suggestions": suggestions,
	})
}

// ---------- 덱 목록 ----------

func (w *Web) decksPage(c *gin.Context) {
	userID := auth.UserID(c)
	ctx := c.Request.Context()
	decks, err := w.store.ListDecks(ctx, userID)
	if err != nil {
		w.failPage(c, err)
		return
	}
	smartDecks, err := w.store.ListSmartDecks(ctx, userID)
	if err != nil {
		w.failPage(c, err)
		return
	}
	w.render(c, http.StatusOK, "decks", "덱", gin.H{
		"Decks":      decks,
		"SmartDecks": smartDecks,
	})
}

func (w *Web) createDeck(c *gin.Context) {
	name := strings.TrimSpace(c.PostForm("name"))
	if name == "" {
		setFlash(c, "error", "덱 이름을 입력해주세요")
		c.Redirect(http.StatusSeeOther, "/decks")
		return
	}
	deck, err := w.store.CreateDeck(c.Request.Context(), auth.UserID(c), name, nil)
	if err != nil {
		w.failPage(c, err)
		return
	}
	c.Redirect(http.StatusSeeOther, "/decks/"+deck.Slug)
}

// ---------- 덱 상세 ----------

func (w *Web) deckPage(c *gin.Context) {
	userID := auth.UserID(c)
	ctx := c.Request.Context()
	deck, err := w.store.GetDeckBySlug(ctx, userID, c.Param("slug"))
	if err != nil {
		w.failPage(c, err)
		return
	}
	cards, err := w.store.ListCards(ctx, userID, deck.ID)
	if err != nil {
		w.failPage(c, err)
		return
	}
	w.render(c, http.StatusOK, "deck", deck.Name, gin.H{
		"Deck":     deck,
		"Cards":    cards,
		"ShareURL": w.shareURL(c, deck),
	})
}

func (w *Web) shareURL(c *gin.Context, deck store.Deck) string {
	if deck.ShareSlug == nil {
		return ""
	}
	return origin(c) + "/shared/" + *deck.ShareSlug
}

func (w *Web) deleteDeck(c *gin.Context) {
	userID := auth.UserID(c)
	deckID, err := w.store.DeckIDBySlug(c.Request.Context(), userID, c.Param("slug"))
	if err == nil {
		err = w.store.DeleteDeck(c.Request.Context(), userID, deckID)
	}
	if err != nil {
		w.failPage(c, err)
		return
	}
	setFlash(c, "info", "덱을 삭제했어요")
	// htmx 요청이면 HX-Redirect로, 일반 폼이면 303으로 이동한다.
	if c.GetHeader("HX-Request") != "" {
		c.Header("HX-Redirect", "/decks")
		c.Status(http.StatusOK)
		return
	}
	c.Redirect(http.StatusSeeOther, "/decks")
}

// ---------- 공유 ----------

func (w *Web) shareDeck(c *gin.Context) {
	userID := auth.UserID(c)
	ctx := c.Request.Context()
	deckID, err := w.store.DeckIDBySlug(ctx, userID, c.Param("slug"))
	if err == nil {
		_, err = w.store.ShareDeck(ctx, userID, deckID)
	}
	if err != nil {
		w.failPage(c, err)
		return
	}
	setFlash(c, "info", "덱을 공유했어요")
	c.Redirect(http.StatusSeeOther, "/decks/"+c.Param("slug"))
}

func (w *Web) unshareDeck(c *gin.Context) {
	userID := auth.UserID(c)
	ctx := c.Request.Context()
	deckID, err := w.store.DeckIDBySlug(ctx, userID, c.Param("slug"))
	if err == nil {
		err = w.store.UnshareDeck(ctx, userID, deckID)
	}
	if err != nil {
		w.failPage(c, err)
		return
	}
	setFlash(c, "info", "공유를 해제했어요")
	c.Redirect(http.StatusSeeOther, "/decks/"+c.Param("slug"))
}

func (w *Web) sharedGalleryPage(c *gin.Context) {
	decks, err := w.store.ListSharedDecks(c.Request.Context(), auth.OptionalUserID(c))
	if err != nil {
		w.failPage(c, err)
		return
	}
	w.render(c, http.StatusOK, "shared", "공유 덱 둘러보기", gin.H{"Decks": decks})
}

func (w *Web) sharedDeckPage(c *gin.Context) {
	slug := c.Param("slug")
	ctx := c.Request.Context()
	deck, err := w.store.GetSharedDeck(ctx, auth.OptionalUserID(c), slug)
	if err != nil {
		if isNotFound(err) {
			w.renderError(c, http.StatusNotFound, "공유가 해제되었거나 존재하지 않는 덱이에요.")
			return
		}
		w.failPage(c, err)
		return
	}
	cards, err := w.store.GetSharedDeckCards(ctx, slug)
	if err != nil {
		w.failPage(c, err)
		return
	}
	w.render(c, http.StatusOK, "shared_deck", deck.Name, gin.H{
		"Slug":  slug,
		"Deck":  deck,
		"Cards": cards,
	})
}

func (w *Web) importSharedDeck(c *gin.Context) {
	deck, err := w.store.ImportSharedDeck(c.Request.Context(), auth.UserID(c), c.Param("slug"))
	if err != nil {
		w.failPage(c, err)
		return
	}
	setFlash(c, "info", "'"+deck.Name+"' 덱을 가져왔어요")
	c.Redirect(http.StatusSeeOther, "/decks/"+deck.Slug)
}

// ---------- 카드 편집 ----------

// cardFormView carries the (re)rendered card form: current values plus the
// submit target, shared by the new-card page, the edit page and the
// dictionary-lookup fragment.
type cardFormView struct {
	Action   string
	BackURL  string
	Editing  bool
	Text     string
	Meaning  string
	CardType string
	Tags     string
	Phonetic string
	Example  string
	Notes    string
	Status   string // 사전 조회 결과 메시지
}

func (w *Web) newCardPage(c *gin.Context) {
	slug := c.Param("slug")
	// 존재하지 않는 덱이면 404를 먼저 낸다.
	if _, err := w.store.DeckIDBySlug(c.Request.Context(), auth.UserID(c), slug); err != nil {
		w.failPage(c, err)
		return
	}
	w.render(c, http.StatusOK, "card_form", "새 카드", cardFormView{
		Action:   "/decks/" + slug + "/cards",
		BackURL:  "/decks/" + slug,
		CardType: "word",
	})
}

func (w *Web) editCardPage(c *gin.Context) {
	cardID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		w.renderError(c, http.StatusNotFound, "찾을 수 없는 카드예요.")
		return
	}
	card, err := w.store.GetCard(c.Request.Context(), auth.UserID(c), cardID)
	if err != nil {
		w.failPage(c, err)
		return
	}
	w.render(c, http.StatusOK, "card_form", "카드 수정", cardFormView{
		Action:   "/cards/" + card.ID.String(),
		BackURL:  "/decks/" + card.DeckSlug,
		Editing:  true,
		Text:     card.Text,
		Meaning:  card.Meaning,
		CardType: card.CardType,
		Tags:     strings.Join(card.Tags, ", "),
		Phonetic: deref(card.Phonetic),
		Example:  deref(card.Example),
		Notes:    deref(card.Notes),
	})
}

// cardInputFromForm normalizes the posted card fields; empty text/meaning is
// the only rejection.
func cardInputFromForm(c *gin.Context) (store.CardInput, bool) {
	in := store.CardInput{
		Text:     strings.TrimSpace(c.PostForm("text")),
		Meaning:  strings.TrimSpace(c.PostForm("meaning")),
		CardType: c.PostForm("card_type"),
		Tags:     splitTags(c.PostForm("tags"), ","),
	}
	switch in.CardType {
	case "word", "sentence", "idiom", "concept":
	default:
		in.CardType = "word"
	}
	in.Phonetic = optField(c.PostForm("phonetic"))
	in.Example = optField(c.PostForm("example"))
	in.Notes = optField(c.PostForm("notes"))
	return in, in.Text != "" && in.Meaning != ""
}

func optField(v string) *string {
	v = strings.TrimSpace(v)
	if v == "" {
		return nil
	}
	return &v
}

func splitTags(raw, sep string) []string {
	tags := []string{}
	for _, t := range strings.Split(raw, sep) {
		if t = strings.TrimSpace(t); t != "" {
			tags = append(tags, t)
		}
	}
	return tags
}

func (w *Web) createCard(c *gin.Context) {
	slug := c.Param("slug")
	in, ok := cardInputFromForm(c)
	if !ok {
		setFlash(c, "error", "원문과 뜻을 모두 입력해주세요")
		c.Redirect(http.StatusSeeOther, "/decks/"+slug+"/cards/new")
		return
	}
	userID := auth.UserID(c)
	deckID, err := w.store.DeckIDBySlug(c.Request.Context(), userID, slug)
	if err != nil {
		w.failPage(c, err)
		return
	}
	in.DeckID = deckID
	if _, err := w.store.CreateCard(c.Request.Context(), userID, in); err != nil {
		w.failPage(c, err)
		return
	}
	setFlash(c, "info", "카드를 추가했어요")
	c.Redirect(http.StatusSeeOther, "/decks/"+slug)
}

func (w *Web) updateCard(c *gin.Context) {
	cardID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		w.renderError(c, http.StatusNotFound, "찾을 수 없는 카드예요.")
		return
	}
	in, ok := cardInputFromForm(c)
	if !ok {
		setFlash(c, "error", "원문과 뜻을 모두 입력해주세요")
		c.Redirect(http.StatusSeeOther, "/cards/"+cardID.String())
		return
	}
	card, err := w.store.UpdateCard(c.Request.Context(), auth.UserID(c), cardID, in)
	if err != nil {
		w.failPage(c, err)
		return
	}
	setFlash(c, "info", "카드를 수정했어요")
	c.Redirect(http.StatusSeeOther, "/decks/"+card.DeckSlug)
}

func (w *Web) deleteCard(c *gin.Context) {
	cardID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		w.renderError(c, http.StatusNotFound, "찾을 수 없는 카드예요.")
		return
	}
	if err := w.store.DeleteCard(c.Request.Context(), auth.UserID(c), cardID); err != nil {
		w.failPage(c, err)
		return
	}
	// htmx가 목록의 해당 <li>를 지우도록 빈 본문을 돌려준다.
	if c.GetHeader("HX-Request") != "" {
		c.Status(http.StatusOK)
		return
	}
	setFlash(c, "info", "카드를 삭제했어요")
	redirectBack(c, "/decks")
}

// ---------- 스마트 덱 ----------

func (w *Web) saveSmartDeck(c *gin.Context) {
	rule, err := smartrules.Parse([]byte(c.PostForm("rule")))
	if err != nil {
		setFlash(c, "error", "잘못된 규칙이에요")
		redirectBack(c, "/decks")
		return
	}
	name := strings.TrimSpace(c.PostForm("name"))
	if name == "" {
		name = ruleLabel(rule)
	}
	normalized, _ := json.Marshal(rule)
	if _, err := w.store.CreateSmartDeck(c.Request.Context(), auth.UserID(c), name, normalized); err != nil {
		w.failPage(c, err)
		return
	}
	// 학습 화면의 저장 버튼(htmx)은 배지로 바꿔치기만 한다.
	if c.GetHeader("HX-Request") != "" {
		w.renderPartial(c, "saved_badge", nil)
		return
	}
	setFlash(c, "info", "스마트 덱으로 저장했어요")
	redirectBack(c, "/decks")
}

func (w *Web) deleteSmartDeck(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		w.renderError(c, http.StatusNotFound, "찾을 수 없는 스마트 덱이에요.")
		return
	}
	if err := w.store.DeleteSmartDeck(c.Request.Context(), auth.UserID(c), id); err != nil {
		w.failPage(c, err)
		return
	}
	if c.GetHeader("HX-Request") != "" {
		c.Status(http.StatusOK)
		return
	}
	setFlash(c, "info", "스마트 덱을 삭제했어요")
	c.Redirect(http.StatusSeeOther, "/decks")
}

// ---------- 통계 ----------

type chartDay struct {
	Date       string
	Total      int
	CorrectPct int // 차트 막대 높이(%), 최대값 기준
	WrongPct   int
	Title      string
}

func (w *Web) statsPage(c *gin.Context) {
	userID := auth.UserID(c)
	ctx := c.Request.Context()
	tz, loc := clientTZ(c)

	daily, err := w.store.DailyStats(ctx, userID, tz, 30)
	if err != nil {
		w.failPage(c, err)
		return
	}
	summary, err := w.store.StatsSummary(ctx, userID, tz, loc)
	if err != nil {
		w.failPage(c, err)
		return
	}

	// 최근 30일을 빈 날 포함해 채운다. 막대 높이는 서버에서 %로 계산해
	// 템플릿은 그리기만 한다.
	byDate := map[string]store.DailyStat{}
	maxTotal := 1
	for _, d := range daily {
		byDate[d.Date] = d
		if d.Total > maxTotal {
			maxTotal = d.Total
		}
	}
	days := make([]chartDay, 0, 30)
	today := time.Now().In(loc)
	for i := 29; i >= 0; i-- {
		date := today.AddDate(0, 0, -i).Format("2006-01-02")
		d := byDate[date]
		days = append(days, chartDay{
			Date:       date,
			Total:      d.Total,
			CorrectPct: pct(d.Correct, maxTotal),
			WrongPct:   pct(d.Total-d.Correct, maxTotal),
			Title:      date + ": " + strconv.Itoa(d.Total) + "회 (정답 " + strconv.Itoa(d.Correct) + ")",
		})
	}

	accuracy := -1
	if summary.TotalReviews > 0 {
		accuracy = pct(summary.CorrectReviews, summary.TotalReviews)
	}

	w.render(c, http.StatusOK, "stats", "통계", gin.H{
		"Summary":  summary,
		"Accuracy": accuracy,
		"Days":     days,
	})
}

// ---------- 설정 ----------

func (w *Web) settingsPage(c *gin.Context) {
	profile, err := w.store.GetOrCreateProfile(c.Request.Context(), auth.UserID(c), "")
	if err != nil {
		w.failPage(c, err)
		return
	}
	w.render(c, http.StatusOK, "settings", "설정", gin.H{
		"Profile":  profile,
		"Settings": parseSettings(profile),
	})
}

func (w *Web) saveSettings(c *gin.Context) {
	name := strings.TrimSpace(c.PostForm("display_name"))
	settings := profileSettings{TtsRate: 0.9, DailyGoal: 50}
	if v, err := strconv.ParseFloat(c.PostForm("tts_rate"), 64); err == nil && v >= 0.5 && v <= 1.5 {
		settings.TtsRate = v
	}
	if v, err := strconv.Atoi(c.PostForm("daily_goal")); err == nil && v >= 5 && v <= 200 {
		settings.DailyGoal = v
	}
	raw, _ := json.Marshal(settings)
	if _, err := w.store.UpdateProfile(c.Request.Context(), auth.UserID(c), &name, raw); err != nil {
		w.failPage(c, err)
		return
	}
	setFlash(c, "info", "저장했어요")
	c.Redirect(http.StatusSeeOther, "/settings")
}
