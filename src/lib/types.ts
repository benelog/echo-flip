export type CardType = "word" | "sentence" | "idiom";

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
  name: string;
  description: string | null;
  cardCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Card {
  id: string;
  deckId: string;
  frontText: string;
  backText: string;
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
  deckId?: string;
  frontText: string;
  backText: string;
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
