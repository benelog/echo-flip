"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, ArrowRight, BookmarkPlus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { StudyView } from "@/components/StudyView";
import { useToast } from "@/components/Toast";
import { api, endOfToday } from "@/lib/api";
import { decodeRule, ruleLabel } from "@/lib/rules";
import type { Profile, SessionStart, StudyDirection } from "@/lib/types";

const DIRECTION_KEY = "echo-flip:study-direction";

function lastDirection(): StudyDirection {
  if (typeof window !== "undefined" && localStorage.getItem(DIRECTION_KEY) === "b_to_a")
    return "b_to_a";
  return "a_to_b";
}

/** Pre-study screen: pick which side is the question. */
function DirectionChooser({ onPick }: { onPick: (d: StudyDirection) => void }) {
  const last = lastDirection();
  const options: { value: StudyDirection; title: string; desc: string }[] = [
    { value: "a_to_b", title: "A면 → B면", desc: "영어·용어를 보고 뜻을 떠올려요" },
    { value: "b_to_a", title: "B면 → A면", desc: "뜻·설명을 보고 영어·용어를 떠올려요" },
  ];
  return (
    <div className="flex flex-col gap-4 py-8">
      <div className="text-center">
        <ArrowLeftRight size={28} className="mx-auto text-blue-500" />
        <h2 className="mt-3 text-lg font-bold">어느 방향으로 학습할까요?</h2>
      </div>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onPick(o.value)}
          className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white px-5 py-4 text-left dark:border-neutral-800 dark:bg-neutral-900"
        >
          <span>
            <span className="flex items-center gap-2 font-semibold">
              {o.title}
              {o.value === last && (
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600 dark:bg-blue-950 dark:text-blue-300">
                  지난번
                </span>
              )}
            </span>
            <span className="mt-0.5 block text-sm text-neutral-500">{o.desc}</span>
          </span>
          <ArrowRight size={18} className="shrink-0 text-neutral-400" />
        </button>
      ))}
    </div>
  );
}

function Study() {
  const params = useSearchParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [savedRule, setSavedRule] = useState(false);
  const [direction, setDirection] = useState<StudyDirection | null>(null);

  const pickDirection = (d: StudyDirection) => {
    localStorage.setItem(DIRECTION_KEY, d);
    setDirection(d);
  };

  const mode = params.get("mode") ?? "due";
  const deckId = params.get("deckId");
  const rule = decodeRule(params.get("rule"));
  const title =
    params.get("title") ??
    (mode === "due" ? "오늘 복습" : mode === "smart" ? "스마트 학습" : "덱 학습");

  const { data: profile } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<Profile>("/api/me"),
  });

  // POST creates a session row; the query cache (plus disabled refetching)
  // keeps it to a single session per visit, StrictMode included. The query
  // stays idle until the user picks a study direction.
  const { data, error, isLoading } = useQuery<SessionStart>({
    queryKey: ["session-start", mode, deckId, params.get("rule"), direction],
    queryFn: () =>
      api<SessionStart>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          mode,
          direction,
          deckId: deckId || undefined,
          rule: rule ?? undefined,
          dueBefore: mode === "due" ? endOfToday() : undefined,
          limit: profile?.settings.dailyGoal ?? 50,
        }),
      }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: 0,
    enabled: direction !== null && (mode !== "due" || profile !== undefined),
  });

  const saveSmartDeck = useMutation({
    mutationFn: () =>
      api("/api/smart-decks", {
        method: "POST",
        body: JSON.stringify({ name: rule ? ruleLabel(rule) : "스마트 덱", rule }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["smart-decks"] });
      setSavedRule(true);
      toast("스마트 덱으로 저장했어요");
    },
    onError: (e) => toast(e.message, "error"),
  });

  if (direction === null) return <DirectionChooser onPick={pickDirection} />;
  if (error)
    return (
      <p className="py-16 text-center text-sm text-red-500">
        세션을 시작하지 못했어요: {error.message}
      </p>
    );
  if (isLoading || !data)
    return <p className="py-16 text-center text-neutral-500">준비 중…</p>;

  return (
    <div className="flex flex-col gap-4">
      {mode === "smart" && rule && !savedRule && data.cards.length > 0 && (
        <button
          onClick={() => saveSmartDeck.mutate()}
          className="flex items-center justify-center gap-1.5 self-end rounded-full bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300"
        >
          <BookmarkPlus size={14} /> 이 조건을 스마트 덱으로 저장
        </button>
      )}
      <StudyView
        key={data.session.id}
        sessionId={data.session.id}
        cards={data.cards}
        title={title}
        direction={direction}
        ttsRate={profile?.settings.ttsRate}
      />
    </div>
  );
}

export default function StudyPage() {
  return (
    <AppShell>
      <Suspense>
        <Study />
      </Suspense>
    </AppShell>
  );
}
