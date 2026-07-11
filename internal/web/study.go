package web

import (
	"encoding/json"
	"math/rand"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/benelog/echo-flip/internal/auth"
	"github.com/benelog/echo-flip/internal/smartrules"
	"github.com/benelog/echo-flip/internal/store"
)

// 학습 세션의 진행 상태는 서버에 저장하지 않는다. 카드 ID 큐·라운드·점수를
// hidden 필드로 폼에 실어 보내고, 채점(POST)마다 서버가 다음 상태를 계산해
// 다음 카드 조각(fragment)을 돌려준다. 서버리스(무상태)와 잘 맞는 구조다.
type studyState struct {
	SessionID string
	Direction string // text_to_meaning | meaning_to_text
	Title     string
	ReturnURL string
	Queue     []string // 이번 라운드에 남은 카드 ID (첫 번째가 현재 카드)
	Missed    []string // 이번 라운드에서 틀린 카드 ID
	Round     int
	RoundLen  int // 이번 라운드 전체 카드 수 (진행률 표시용)
	FPTotal   int // 1라운드 카드 수
	FPCorrect int // 1라운드 정답 수
	TtsRate   float64
}

// studyBodyView is what the study_body partial renders: exactly one of the
// phases, mirroring the old React state machine.
type studyBodyView struct {
	Phase   string // studying | break | finished | empty
	State   studyState
	Card    *store.Card
	Index   int // 이번 라운드에서 몇 번째 카드인지 (0부터)
	TextTTS string
	BackTTS string
}

func (v studyBodyView) QueueJoined() string  { return strings.Join(v.State.Queue, ",") }
func (v studyBodyView) MissedJoined() string { return strings.Join(v.State.Missed, ",") }

// Accuracy is the first-pass percentage shown on the finish screen.
func (v studyBodyView) Accuracy() int { return pct(v.State.FPCorrect, v.State.FPTotal) }

// ProgressPct fills the progress bar.
func (v studyBodyView) ProgressPct() int { return pct(v.Index, v.State.RoundLen) }

// studyPage starts a session. Without ?direction= it renders the direction
// chooser first, keeping every other query parameter.
func (w *Web) studyPage(c *gin.Context) {
	direction := c.Query("direction")
	if direction == "" {
		last := cookieValue(c, dirCookie)
		if last != "meaning_to_text" {
			last = "text_to_meaning"
		}
		base := c.Request.URL.Query()
		w.render(c, http.StatusOK, "study_direction", "학습", gin.H{
			"Last":      last,
			"TextFirst": "/study?" + withParam(base, "direction", "text_to_meaning"),
			"TextLast":  "/study?" + withParam(base, "direction", "meaning_to_text"),
		})
		return
	}
	if direction != "text_to_meaning" && direction != "meaning_to_text" {
		direction = "text_to_meaning"
	}
	setCookie(c, dirCookie, direction, 180*24*60*60)

	userID := auth.UserID(c)
	ctx := c.Request.Context()
	_, loc := clientTZ(c)

	profile, err := w.store.GetOrCreateProfile(ctx, userID, "")
	if err != nil {
		w.failPage(c, err)
		return
	}
	settings := parseSettings(profile)

	mode := c.Query("mode")
	if mode == "" {
		mode = "due"
	}
	title := c.Query("title")
	if title == "" {
		switch mode {
		case "due":
			title = "오늘 복습"
		case "smart":
			title = "스마트 학습"
		default:
			title = "덱 학습"
		}
	}

	var cards []store.Card
	var deckID *uuid.UUID
	var ruleJSON json.RawMessage
	returnURL := "/"

	switch mode {
	case "deck":
		id, perr := uuid.Parse(c.Query("deckId"))
		if perr != nil {
			w.renderError(c, http.StatusNotFound, "찾을 수 없는 덱이에요.")
			return
		}
		deckID = &id
		cards, err = w.store.ListCards(ctx, userID, id)
		if err == nil {
			rand.Shuffle(len(cards), func(i, j int) { cards[i], cards[j] = cards[j], cards[i] })
		}
		returnURL = "/decks"
	case "due":
		cards, err = w.store.DueCards(ctx, userID, endOfToday(loc), settings.DailyGoal)
	case "smart":
		rule, perr := smartrules.Parse([]byte(c.Query("rule")))
		if perr != nil {
			w.renderError(c, http.StatusNotFound, "잘못된 학습 규칙이에요.")
			return
		}
		ruleJSON, _ = json.Marshal(rule)
		cards, err = w.store.CardsByRule(ctx, userID, rule)
	default:
		w.renderError(c, http.StatusNotFound, "잘못된 학습 모드예요.")
		return
	}
	if err != nil {
		w.failPage(c, err)
		return
	}

	sess, err := w.store.CreateSession(ctx, userID, mode, direction, deckID, ruleJSON, len(cards))
	if err != nil {
		w.failPage(c, err)
		return
	}

	state := studyState{
		SessionID: sess.ID.String(),
		Direction: direction,
		Title:     title,
		ReturnURL: returnURL,
		Round:     1,
		RoundLen:  len(cards),
		FPTotal:   len(cards),
		TtsRate:   settings.TtsRate,
	}
	for _, card := range cards {
		state.Queue = append(state.Queue, card.ID.String())
	}

	body := w.bodyView(c, state)
	// 스마트 학습이면 "이 조건을 스마트 덱으로 저장" 버튼에 쓸 규칙을 넘긴다.
	saveRule := ""
	if mode == "smart" && len(cards) > 0 && c.Query("saved") == "" {
		saveRule = string(ruleJSON)
	}
	w.render(c, http.StatusOK, "study", title, gin.H{
		"Body":     body,
		"SaveRule": saveRule,
	})
}

func withParam(q url.Values, key, value string) string {
	copied := url.Values{}
	for k, v := range q {
		copied[k] = v
	}
	copied.Set(key, value)
	return copied.Encode()
}

// bodyView builds the fragment for the state's current phase, loading the
// current card when studying.
func (w *Web) bodyView(c *gin.Context, state studyState) studyBodyView {
	v := studyBodyView{State: state}
	switch {
	case state.FPTotal == 0:
		v.Phase = "empty"
	case len(state.Queue) > 0:
		v.Phase = "studying"
		v.Index = state.RoundLen - len(state.Queue)
		cardID, err := uuid.Parse(state.Queue[0])
		if err == nil {
			card, cerr := w.store.GetCard(c.Request.Context(), auth.UserID(c), cardID)
			err = cerr
			if cerr == nil {
				v.Card = &card
				v.TextTTS = card.Text
				v.BackTTS = card.Text
				if card.Example != nil {
					v.BackTTS = card.Text + ". " + *card.Example
				}
			}
		}
		if v.Card == nil {
			// 카드가 그 사이 삭제된 극단적 경우: 남은 큐로 계속한다.
			state.Queue = state.Queue[1:]
			return w.bodyView(c, state)
		}
	case len(state.Missed) > 0:
		v.Phase = "break"
	default:
		v.Phase = "finished"
	}
	return v
}

// stateFromForm rebuilds the study state posted by the previous fragment.
func stateFromForm(c *gin.Context) studyState {
	round, _ := strconv.Atoi(c.PostForm("round"))
	if round < 1 {
		round = 1
	}
	roundLen, _ := strconv.Atoi(c.PostForm("round_len"))
	fpTotal, _ := strconv.Atoi(c.PostForm("fp_total"))
	fpCorrect, _ := strconv.Atoi(c.PostForm("fp_correct"))
	rate, _ := strconv.ParseFloat(c.PostForm("tts_rate"), 64)
	if rate <= 0 {
		rate = 0.9
	}
	direction := c.PostForm("direction")
	if direction != "meaning_to_text" {
		direction = "text_to_meaning"
	}
	return studyState{
		SessionID: c.PostForm("session"),
		Direction: direction,
		Title:     c.PostForm("title"),
		ReturnURL: safeNext(c.PostForm("return_url")),
		Queue:     splitTags(c.PostForm("queue"), ","),
		Missed:    splitTags(c.PostForm("missed"), ","),
		Round:     round,
		RoundLen:  roundLen,
		FPTotal:   fpTotal,
		FPCorrect: fpCorrect,
		TtsRate:   rate,
	}
}

// gradeCard: 채점 한 번 = 리뷰 기록 + 다음 상태 계산 + 다음 화면 조각 응답.
func (w *Web) gradeCard(c *gin.Context) {
	state := stateFromForm(c)
	correct := c.PostForm("correct") == "true"
	if len(state.Queue) == 0 {
		w.renderPartial(c, "study_body", w.bodyView(c, state))
		return
	}

	current := state.Queue[0]
	state.Queue = state.Queue[1:]

	sessionID, err1 := uuid.Parse(state.SessionID)
	cardID, err2 := uuid.Parse(current)
	if err1 == nil && err2 == nil {
		// 채점 기록 실패는 학습 흐름을 끊을 만큼 치명적이지 않다: 이번
		// 판정 하나가 통계에서 빠질 뿐이므로 세션은 계속 진행한다.
		if _, err := w.store.RecordReview(c.Request.Context(), auth.UserID(c),
			sessionID, cardID, correct, state.Round > 1); err != nil && !isNotFound(err) {
			_ = c.Error(err)
		}
	}

	if correct {
		if state.Round == 1 {
			state.FPCorrect++
		}
	} else {
		state.Missed = append(state.Missed, current)
	}

	// 마지막 카드까지 전부 맞혔으면 세션 완료를 기록한다.
	if len(state.Queue) == 0 && len(state.Missed) == 0 && err1 == nil {
		_ = w.store.FinishSession(c.Request.Context(), auth.UserID(c), sessionID, true)
	}

	w.renderPartial(c, "study_body", w.bodyView(c, state))
}

// nextRound restarts with the missed cards only.
func (w *Web) nextRound(c *gin.Context) {
	state := stateFromForm(c)
	state.Queue = state.Missed
	state.Missed = nil
	state.Round++
	state.RoundLen = len(state.Queue)
	w.renderPartial(c, "study_body", w.bodyView(c, state))
}

// quitStudy marks the session unfinished and leaves the page.
func (w *Web) quitStudy(c *gin.Context) {
	state := stateFromForm(c)
	if sessionID, err := uuid.Parse(state.SessionID); err == nil {
		_ = w.store.FinishSession(c.Request.Context(), auth.UserID(c), sessionID, false)
	}
	c.Redirect(http.StatusSeeOther, state.ReturnURL)
}
