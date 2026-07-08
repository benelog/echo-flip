export type CardType = "word" | "sentence" | "idiom" | "concept";

/** Which side is shown as the question: text→meaning or meaning→text. */
export type StudyDirection = "text_to_meaning" | "meaning_to_text";

export interface Profile {
  id: string;
  displayName: string | null;
  settings: ProfileSettings;
  createdAt: string;
}

export interface ProfileSettings {
  ttsRate?: number;
  dailyGoal?: number;
}

export interface Deck {
  id: string;
  /** Short Base62 identifier used in URLs (/decks/{slug}) and deck API paths. */
  slug: string;
  name: string;
  description: string | null;
  cardCount: number;
  shareSlug: string | null;
  sharedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShareInfo {
  shareSlug: string;
  sharedAt: string;
}

export interface SharedDeckSummary {
  shareSlug: string;
  name: string;
  description: string | null;
  cardCount: number;
  ownerName: string | null;
  sharedAt: string;
  isMine: boolean;
}

export interface SharedCard {
  text: string;
  meaning: string;
  cardType: CardType;
  tags: string[];
  phonetic: string | null;
  example: string | null;
  notes: string | null;
}

export interface SharedDeckDetail {
  deck: SharedDeckSummary;
  cards: SharedCard[];
}

export interface Card {
  id: string;
  deckId: string;
  text: string;
  meaning: string;
  cardType: CardType;
  tags: string[];
  phonetic: string | null;
  example: string | null;
  notes: string | null;
  createdAt: string;
  attempts: number;
  errorRate: number;
  intervalDays: number;
  dueAt: string;
  lastReviewedAt: string | null;
}

export interface CardInput {
  text: string;
  meaning: string;
  cardType: CardType;
  tags: string[];
  phonetic?: string | null;
  example?: string | null;
  notes?: string | null;
}

export type SmartRuleType = "high_error" | "stale" | "tag" | "recent";

export interface SmartRule {
  type: SmartRuleType;
  minAttempts?: number;
  minErrorRate?: number;
  notReviewedDays?: number;
  tags?: string[];
  addedWithinDays?: number;
  limit?: number;
}

export interface SmartDeck {
  id: string;
  name: string;
  rule: SmartRule;
  createdAt: string;
}

export interface Suggestion {
  type: SmartRuleType;
  count: number;
  rule: SmartRule;
}

export interface StudySession {
  id: string;
  mode: "deck" | "due" | "smart";
  direction: StudyDirection;
  deckId: string | null;
  totalCards: number;
  startedAt: string;
}

export interface SessionStart {
  session: StudySession;
  cards: Card[];
}

export interface ReviewOutcome {
  dueAt: string;
  intervalDays: number;
}

export interface BulkResult {
  added: number;
  skipped: number;
  invalid: number;
}

export interface DailyStat {
  date: string;
  total: number;
  correct: number;
}

export interface DeckMastery {
  deckId: string;
  name: string;
  totalCards: number;
  matureCards: number;
}

export interface StatsSummary {
  totalReviews: number;
  correctReviews: number;
  streak: number;
  decks: DeckMastery[];
}
