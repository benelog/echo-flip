"use client";

import { useState } from "react";
import { BookOpen } from "lucide-react";
import { lookupWord, WordNotFoundError } from "@/lib/dictionary";
import type { Card, CardInput, CardType } from "@/lib/types";
import { useToast } from "./Toast";
import { TtsButton } from "./TtsButton";

const TYPES: { value: CardType; label: string }[] = [
  { value: "word", label: "단어" },
  { value: "sentence", label: "문장" },
  { value: "idiom", label: "숙어" },
  { value: "concept", label: "개념" },
];

const inputCls =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-900";

export function CardForm({
  initial,
  onSubmit,
  submitting,
}: {
  initial?: Card;
  onSubmit: (input: CardInput) => void;
  submitting: boolean;
}) {
  const toast = useToast();
  const [sideA, setSideA] = useState(initial?.sideAText ?? "");
  const [sideB, setSideB] = useState(initial?.sideBText ?? "");
  const [cardType, setCardType] = useState<CardType>(initial?.cardType ?? "word");
  const [tags, setTags] = useState(initial?.tags.join(", ") ?? "");
  const [phonetic, setPhonetic] = useState(initial?.phonetic ?? "");
  const [example, setExample] = useState(initial?.example ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [looking, setLooking] = useState(false);

  const canLookup = cardType === "word" && sideA.trim().split(/\s+/).length === 1;

  const fillFromDictionary = async () => {
    setLooking(true);
    try {
      const entry = await lookupWord(sideA);
      // Fill only fields the user hasn't typed yet.
      if (entry.phonetic && !phonetic) setPhonetic(entry.phonetic);
      if (entry.definition && !sideB) setSideB(entry.definition);
      if (entry.example && !example) setExample(entry.example);
      toast("사전에서 채웠어요");
    } catch (e) {
      toast(
        e instanceof WordNotFoundError
          ? "사전에서 찾을 수 없어요"
          : "사전 조회에 실패했어요",
        "error",
      );
    } finally {
      setLooking(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sideA.trim() || !sideB.trim()) {
      toast("A면과 B면을 모두 입력해주세요", "error");
      return;
    }
    onSubmit({
      sideAText: sideA.trim(),
      sideBText: sideB.trim(),
      cardType,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      phonetic: phonetic.trim() || null,
      example: example.trim() || null,
      notes: notes.trim() || null,
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex gap-2">
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setCardType(t.value)}
            className={`rounded-full px-4 py-1.5 text-sm ${
              cardType === t.value
                ? "bg-blue-600 text-white"
                : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="flex items-center justify-between text-sm font-medium">
          A면 (영어 · 용어)
          <span className="flex items-center gap-1">
            {sideA.trim() && <TtsButton text={sideA} />}
            {canLookup && (
              <button
                type="button"
                onClick={fillFromDictionary}
                disabled={looking}
                className="flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 disabled:opacity-50 dark:bg-blue-950 dark:text-blue-300"
              >
                <BookOpen size={14} />
                {looking ? "조회 중…" : "사전에서 채우기"}
              </button>
            )}
          </span>
        </span>
        <textarea
          value={sideA}
          onChange={(e) => setSideA(e.target.value)}
          rows={2}
          placeholder="serendipity / hit the sack / idempotency"
          className={inputCls}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">B면 (뜻 · 설명)</span>
        <textarea
          value={sideB}
          onChange={(e) => setSideB(e.target.value)}
          rows={3}
          placeholder="우연한 행운, 뜻밖의 발견"
          className={inputCls}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">발음 기호</span>
        <input
          value={phonetic}
          onChange={(e) => setPhonetic(e.target.value)}
          placeholder="/ˌserənˈdipəti/"
          className={inputCls}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">예문</span>
        <textarea
          value={example}
          onChange={(e) => setExample(e.target.value)}
          rows={2}
          className={inputCls}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">태그 (쉼표로 구분)</span>
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="토익, 동사"
          className={inputCls}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">메모</span>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={inputCls}
        />
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="rounded-xl bg-blue-600 py-3.5 font-semibold text-white disabled:opacity-50"
      >
        {submitting ? "저장 중…" : initial ? "수정하기" : "카드 추가"}
      </button>
    </form>
  );
}
