"use client";

import { useCallback, useReducer } from "react";
import { api } from "@/lib/api";
import type { Card } from "@/lib/types";

export type StudyPhase = "studying" | "roundBreak" | "finished";

interface State {
  round: number;
  queue: Card[];
  index: number;
  revealed: boolean;
  missed: Card[];
  firstPassTotal: number;
  firstPassCorrect: number;
  phase: StudyPhase;
}

type Action =
  | { type: "reveal" }
  | { type: "grade"; correct: boolean }
  | { type: "nextRound" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "reveal":
      return { ...state, revealed: true };
    case "grade": {
      const card = state.queue[state.index];
      const missed = action.correct ? state.missed : [...state.missed, card];
      const firstPassCorrect =
        state.round === 1 && action.correct
          ? state.firstPassCorrect + 1
          : state.firstPassCorrect;
      const index = state.index + 1;
      if (index < state.queue.length) {
        return { ...state, index, revealed: false, missed, firstPassCorrect };
      }
      // Round finished: retry missed cards until none remain.
      if (missed.length > 0) {
        return { ...state, index, missed, firstPassCorrect, phase: "roundBreak" };
      }
      return { ...state, index, missed, firstPassCorrect, phase: "finished" };
    }
    case "nextRound":
      return {
        ...state,
        round: state.round + 1,
        queue: state.missed,
        missed: [],
        index: 0,
        revealed: false,
        phase: "studying",
      };
  }
}

async function recordReview(
  sessionId: string,
  cardId: string,
  result: boolean,
  isRetry: boolean,
) {
  const body = JSON.stringify({ cardId, result, isRetry });
  const send = () =>
    api(`/api/sessions/${sessionId}/reviews`, { method: "POST", body });
  try {
    await send();
  } catch {
    try {
      await send(); // one retry, then give up silently
    } catch {
      /* the session continues; this grade is lost */
    }
  }
}

export function useStudySession(sessionId: string, cards: Card[]) {
  const [state, dispatch] = useReducer(reducer, cards, (initial) => ({
    round: 1,
    queue: initial,
    index: 0,
    revealed: false,
    missed: [],
    firstPassTotal: initial.length,
    firstPassCorrect: 0,
    phase: (initial.length === 0 ? "finished" : "studying") as StudyPhase,
  }));

  const current: Card | null =
    state.phase === "studying" ? (state.queue[state.index] ?? null) : null;

  const reveal = useCallback(() => dispatch({ type: "reveal" }), []);

  const grade = useCallback(
    (correct: boolean) => {
      const card = state.queue[state.index];
      if (!card || state.phase !== "studying") return;
      void recordReview(sessionId, card.id, correct, state.round > 1);
      const isLast = state.index + 1 >= state.queue.length;
      const remainingMissed = correct ? state.missed.length : state.missed.length + 1;
      if (isLast && remainingMissed === 0) {
        void api(`/api/sessions/${sessionId}/finish`, {
          method: "POST",
          body: JSON.stringify({ completed: true }),
        }).catch(() => {});
      }
      dispatch({ type: "grade", correct });
    },
    [sessionId, state.queue, state.index, state.missed.length, state.phase, state.round],
  );

  const startNextRound = useCallback(() => dispatch({ type: "nextRound" }), []);

  const quit = useCallback(() => {
    void api(`/api/sessions/${sessionId}/finish`, {
      method: "POST",
      body: JSON.stringify({ completed: false }),
    }).catch(() => {});
  }, [sessionId]);

  return { state, current, reveal, grade, startNextRound, quit };
}
