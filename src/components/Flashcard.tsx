"use client";

import type { Card } from "@/lib/types";
import { TtsButton } from "./TtsButton";

const TYPE_LABEL: Record<Card["cardType"], string> = {
  word: "단어",
  sentence: "문장",
  idiom: "숙어",
};

/** 3D flip card: front (English) → back (meaning). */
export function Flashcard({
  card,
  revealed,
  onReveal,
  ttsRate,
}: {
  card: Card;
  revealed: boolean;
  onReveal: () => void;
  ttsRate?: number;
}) {
  return (
    <div
      className="flip-scene min-h-72 w-full cursor-pointer select-none"
      onClick={() => !revealed && onReveal()}
    >
      <div className={`flip-inner ${revealed ? "flipped" : ""}`}>
        <div className="flip-face rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              {TYPE_LABEL[card.cardType]}
            </span>
            <TtsButton text={card.frontText} rate={ttsRate} />
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6">
            <p className="text-center text-2xl font-semibold leading-snug">
              {card.frontText}
            </p>
            {card.phonetic && (
              <p className="text-sm text-neutral-500">{card.phonetic}</p>
            )}
          </div>
          {!revealed && (
            <p className="text-center text-xs text-neutral-400">
              탭해서 정답 보기
            </p>
          )}
        </div>
        <div className="flip-face flip-back rounded-2xl border border-blue-200 bg-blue-50 p-6 shadow-sm dark:border-blue-900 dark:bg-blue-950/40">
          <div className="flex items-center justify-between">
            <span className="text-xs text-blue-600 dark:text-blue-300">정답</span>
            <TtsButton
              text={card.example ? `${card.frontText}. ${card.example}` : card.frontText}
              rate={ttsRate}
            />
          </div>
          <div className="flex flex-1 flex-col justify-center gap-3 py-4">
            <p className="whitespace-pre-line text-center text-lg font-medium leading-relaxed">
              {card.backText}
            </p>
            {card.example && (
              <p className="whitespace-pre-line text-center text-sm italic text-neutral-600 dark:text-neutral-300">
                {card.example}
              </p>
            )}
            {card.notes && (
              <p className="text-center text-xs text-neutral-500">{card.notes}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
