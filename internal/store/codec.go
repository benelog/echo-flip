package store

// Bridges for alternative Store implementations (internal/litestore): expose
// the deck slug codec and the share slug generator so local-mode slugs behave
// exactly like production without duplicating the encoding.

func EncodeDeckSlug(seq int64) string { return encodeDeckSlug(seq) }

func DecodeDeckSlug(slug string) (int64, error) { return decodeDeckSlug(slug) }

func NewShareSlug() string { return newShareSlug() }
