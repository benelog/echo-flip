"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookmarkPlus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { StudyView } from "@/components/StudyView";
import { useToast } from "@/components/Toast";
import { api, endOfToday } from "@/lib/api";
import { decodeRule, ruleLabel } from "@/lib/rules";
import type { Profile, SessionStart } from "@/lib/types";

function Study() {
  const params = useSearchParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [savedRule, setSavedRule] = useState(false);

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
  // keeps it to a single session per visit, StrictMode included.
  const { data, error, isLoading } = useQuery<SessionStart>({
    queryKey: ["session-start", mode, deckId, params.get("rule")],
    queryFn: () =>
      api<SessionStart>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          mode,
          deckId: deckId || undefined,
          rule: rule ?? undefined,
          dueBefore: mode === "due" ? endOfToday() : undefined,
          limit: profile?.settings.dailyGoal ?? 50,
        }),
      }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: 0,
    enabled: mode !== "due" || profile !== undefined,
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
