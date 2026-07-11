// Package web renders the HTML pages of Echo Flip. It sits on the same
// handlers.Store the JSON API uses; templates live in templates/ and are
// embedded into the binary, so one Go binary (or one Vercel function) serves
// pages, fragments and static assets alike.
package web

import (
	"embed"
	"fmt"
	"html/template"
	"io/fs"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/benelog/echo-flip/internal/auth"
	"github.com/benelog/echo-flip/internal/config"
	"github.com/benelog/echo-flip/internal/handlers"
)

//go:embed templates
var templateFS embed.FS

//go:embed static
var staticFS embed.FS

var nilUUID = uuid.Nil

type Web struct {
	store handlers.Store
	cfg   *config.Config
	gt    *goTrue
	pages map[string]*template.Template
	// partials holds the shared fragments (study body, form fields, …) that
	// htmx endpoints render standalone.
	partials *template.Template
}

func New(cfg *config.Config, s handlers.Store) *Web {
	w := &Web{store: s, cfg: cfg}
	if cfg.AuthMode != "local" {
		w.gt = newGoTrue(cfg.SupabaseURL, cfg.SupabaseAnonKey)
	}
	w.parseTemplates()
	return w
}

func (w *Web) parseTemplates() {
	base := template.Must(template.New("").Funcs(funcMap).
		ParseFS(templateFS, "templates/layout.html", "templates/partials/*.html"))
	w.partials = base

	pageFiles, err := fs.Glob(templateFS, "templates/pages/*.html")
	if err != nil {
		panic(err)
	}
	w.pages = make(map[string]*template.Template, len(pageFiles))
	for _, f := range pageFiles {
		name := strings.TrimSuffix(f[strings.LastIndex(f, "/")+1:], ".html")
		w.pages[name] = template.Must(template.Must(base.Clone()).ParseFS(templateFS, f))
	}
}

// view is the root object every template executes against.
type view struct {
	Title     string
	Path      string // request path, for the active tab in the bottom nav
	LoggedIn  bool
	LocalMode bool
	Email     string
	Flash     string
	FlashKind string
	Data      any
}

func (w *Web) newView(c *gin.Context, title string, data any) view {
	kind, msg := takeFlash(c)
	return view{
		Title:     title,
		Path:      c.Request.URL.Path,
		LoggedIn:  auth.OptionalUserID(c) != nilUUID,
		LocalMode: w.cfg.AuthMode == "local",
		Email:     userEmail(c),
		Flash:     msg,
		FlashKind: kind,
		Data:      data,
	}
}

func (w *Web) render(c *gin.Context, status int, page, title string, data any) {
	tpl, ok := w.pages[page]
	if !ok {
		panic("unknown page template: " + page)
	}
	c.Status(status)
	c.Header("Content-Type", "text/html; charset=utf-8")
	c.Header("Cache-Control", "no-store") // pages are per-user; never share
	if err := tpl.ExecuteTemplate(c.Writer, "layout", w.newView(c, title, data)); err != nil {
		_ = c.Error(err)
	}
}

// renderPartial writes a single fragment — the response to an htmx request.
func (w *Web) renderPartial(c *gin.Context, name string, data any) {
	c.Header("Content-Type", "text/html; charset=utf-8")
	if err := w.partials.ExecuteTemplate(c.Writer, name, data); err != nil {
		_ = c.Error(err)
	}
}

func (w *Web) renderError(c *gin.Context, status int, message string) {
	w.render(c, status, "error", "문제가 생겼어요", message)
}

// failPage is the page-handler counterpart of the API's fail(): 404 for
// missing rows, 500 otherwise.
func (w *Web) failPage(c *gin.Context, err error) {
	if isNotFound(err) {
		w.renderError(c, http.StatusNotFound, "찾을 수 없는 페이지예요.")
		return
	}
	fmt.Println("web internal error:", err)
	w.renderError(c, http.StatusInternalServerError, "일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요.")
}

// Register wires every HTML route into the shared Gin engine. The JSON API
// under /api is registered separately and stays untouched.
func (w *Web) Register(r *gin.Engine) {
	w.registerStatic(r)

	h := handlers.New(w.store)

	// Public pages: shared-deck browsing and the login flow.
	pub := r.Group("/", w.withUser())
	{
		pub.GET("/login", w.loginPage)
		pub.GET("/auth/login/:provider", w.startOAuth)
		pub.GET("/auth/callback", w.oauthCallback)
		pub.POST("/logout", w.logout)
		pub.GET("/shared", w.sharedGalleryPage)
		pub.GET("/shared/:slug", w.sharedDeckPage)
	}

	// Signed-in pages and their form/htmx endpoints.
	app := r.Group("/", w.withUser(), w.requireUser(), h.EnsureProfile())
	{
		app.GET("/", w.homePage)

		app.GET("/decks", w.decksPage)
		app.POST("/decks", w.createDeck)
		app.GET("/decks/:slug", w.deckPage)
		app.POST("/decks/:slug/delete", w.deleteDeck)
		app.GET("/decks/:slug/cards/new", w.newCardPage)
		app.POST("/decks/:slug/cards", w.createCard)
		app.POST("/decks/:slug/import", w.importCSV)
		app.GET("/decks/:slug/export", w.exportCSV)
		app.POST("/decks/:slug/share", w.shareDeck)
		app.POST("/decks/:slug/unshare", w.unshareDeck)

		app.GET("/cards/:id", w.editCardPage)
		app.POST("/cards/:id", w.updateCard)
		app.POST("/cards/:id/delete", w.deleteCard)
		app.POST("/cards/lookup", w.dictionaryLookup)

		app.POST("/shared/:slug/import", w.importSharedDeck)

		app.GET("/study", w.studyPage)
		app.POST("/study/grade", w.gradeCard)
		app.POST("/study/next-round", w.nextRound)
		app.POST("/study/quit", w.quitStudy)

		app.POST("/smart-decks", w.saveSmartDeck)
		app.POST("/smart-decks/:id/delete", w.deleteSmartDeck)

		app.GET("/stats", w.statsPage)
		app.GET("/settings", w.settingsPage)
		app.POST("/settings", w.saveSettings)
	}

	r.NoRoute(func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		w.withUser()(c)
		w.renderError(c, http.StatusNotFound, "찾을 수 없는 페이지예요.")
	})
}

// registerStatic serves the embedded assets. Everything is fingerprint-free,
// so cache briefly; the service worker adds stale-while-revalidate on top.
func (w *Web) registerStatic(r *gin.Engine) {
	static, err := fs.Sub(staticFS, "static")
	if err != nil {
		panic(err)
	}
	server := http.FileServer(http.FS(static))
	cached := func(path string) gin.HandlerFunc {
		return func(c *gin.Context) {
			c.Header("Cache-Control", "public, max-age=3600")
			c.Request.URL.Path = path
			server.ServeHTTP(c.Writer, c.Request)
		}
	}
	r.GET("/static/*filepath", func(c *gin.Context) {
		c.Header("Cache-Control", "public, max-age=3600")
		c.Request.URL.Path = "/" + strings.TrimPrefix(c.Param("filepath"), "/")
		server.ServeHTTP(c.Writer, c.Request)
	})
	r.GET("/icons/*filepath", func(c *gin.Context) {
		c.Header("Cache-Control", "public, max-age=86400")
		c.Request.URL.Path = "/icons/" + strings.TrimPrefix(c.Param("filepath"), "/")
		server.ServeHTTP(c.Writer, c.Request)
	})
	// The service worker must load from the root scope it controls.
	r.GET("/sw.js", cached("/sw.js"))
	r.GET("/manifest.webmanifest", cached("/manifest.webmanifest"))
	r.GET("/favicon.ico", cached("/favicon.ico"))
}

// clientTZ returns the visitor's IANA timezone, reported by app.js in a
// cookie. Before the first page load (or with JS off) it falls back to UTC.
func clientTZ(c *gin.Context) (string, *time.Location) {
	tz := cookieValue(c, tzCookie)
	if tz == "" {
		return "UTC", time.UTC
	}
	loc, err := time.LoadLocation(tz)
	if err != nil {
		return "UTC", time.UTC
	}
	return tz, loc
}

// endOfToday bounds the due-card queue, in the visitor's local day.
func endOfToday(loc *time.Location) time.Time {
	now := time.Now().In(loc)
	return time.Date(now.Year(), now.Month(), now.Day(), 23, 59, 59, 0, loc)
}
