"use client";

import { useRouter } from "next/navigation";
import { Check, RotateCcw, X } from "lucide-react";
import { useStudySession } from "@/hooks/useStudySession";
import type { Card, StudyDirection } from "@/lib/types";
import { Flashcard } from "./Flashcard";

export function StudyView({
  sessionId,
  cards,
  title,
  direction,
  ttsRate,
}: {
  sessionId: string;
  cards: Card[];
  title: string;
  direction: StudyDirection;
  ttsRate?: number;
}) {
  const router = useRouter();
  const { state, current, reveal, grade, startNextRound, quit } =
    useStudySession(sessionId, cards);

  const leave = () => {
    if (state.phase !== "finished") quit();
    router.back();
  };

  if (state.firstPassTotal === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-neutral-500">학습할 카드가 없어요.</p>
        <button onClick={() => router.back()} className="text-blue-600 underline">
          돌아가기
        </button>
      </div>
    );
  }

  if (state.phase === "finished") {
    const accuracy = Math.round(
      (state.firstPassCorrect / state.firstPassTotal) * 100,
    );
    return (
      <div className="flex flex-col items-center gap-6 py-16 text-center">
        <p className="text-4xl">🎉</p>
        <h2 className="text-xl font-bold">학습 완료!</h2>
        <dl className="grid grid-cols-3 gap-4 text-center">
          <div>
            <dt className="text-xs text-neutral-500">카드</dt>
            <dd className="text-lg font-semibold">{state.firstPassTotal}장</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">1차 정답률</dt>
            <dd className="text-lg font-semibold">{accuracy}%</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">라운드</dt>
            <dd className="text-lg font-semibold">{state.round}</dd>
          </div>
        </dl>
        <button
          onClick={() => router.back()}
          className="rounded-xl bg-blue-600 px-6 py-3 font-medium text-white"
        >
          완료
        </button>
      </div>
    );
  }

  if (state.phase === "roundBreak") {
    return (
      <div className="flex flex-col items-center gap-6 py-16 text-center">
        <RotateCcw size={40} className="text-amber-500" />
        <h2 className="text-lg font-semibold">
          틀린 카드 {state.missed.length}장을 다시 풀어볼까요?
        </h2>
        <p className="text-sm text-neutral-500">
          전부 맞힐 때까지 반복해요. 재도전 결과는 오답률에 반영되지 않아요.
        </p>
        <button
          onClick={startNextRound}
          className="rounded-xl bg-amber-500 px-6 py-3 font-medium text-white"
        >
          다시 풀기
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-sm text-neutral-500">
        <button onClick={leave} aria-label="그만하기" className="p-1">
          <X size={20} />
        </button>
        <span className="font-medium text-neutral-700 dark:text-neutral-200">
          {title}
        </span>
        <span>
          {state.round > 1 && `${state.round}R · `}
          {state.index + 1}/{state.queue.length}
        </span>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
        <div
          className="h-full rounded-full bg-blue-500 transition-all"
          style={{ width: `${(state.index / state.queue.length) * 100}%` }}
        />
      </div>

      {current && (
        <Flashcard
          card={current}
          direction={direction}
          revealed={state.revealed}
          onReveal={reveal}
          ttsRate={ttsRate}
        />
      )}

      {state.revealed ? (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => grade(false)}
            className="flex items-center justify-center gap-2 rounded-xl bg-red-500 py-4 font-semibold text-white active:scale-[0.98]"
          >
            <X size={20} /> 틀렸어요
          </button>
          <button
            onClick={() => grade(true)}
            className="flex items-center justify-center gap-2 rounded-xl bg-green-600 py-4 font-semibold text-white active:scale-[0.98]"
          >
            <Check size={20} /> 맞았어요
          </button>
        </div>
      ) : (
        <button
          onClick={reveal}
          className="rounded-xl bg-blue-600 py-4 font-semibold text-white active:scale-[0.98]"
        >
          정답 보기
        </button>
      )}
    </div>
  );
}
