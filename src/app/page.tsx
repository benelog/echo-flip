"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Flame, GraduationCap, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SuggestionTiles } from "@/components/SuggestionTiles";
import { api, endOfToday, localTimeZone } from "@/lib/api";
import type { Deck, StatsSummary } from "@/lib/types";

function Dashboard() {
  const { data: due } = useQuery({
    queryKey: ["due-count"],
    queryFn: () =>
      api<{ count: number }>(
        `/api/due-count?dueBefore=${encodeURIComponent(endOfToday())}`,
      ),
  });
  const { data: summary } = useQuery({
    queryKey: ["stats-summary"],
    queryFn: () => api<StatsSummary>(`/api/stats/summary?tz=${localTimeZone()}`),
  });
  const { data: decks } = useQuery({
    queryKey: ["decks"],
    queryFn: () => api<Deck[]>("/api/decks"),
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Echo Flip</h1>
        {(summary?.streak ?? 0) > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-orange-100 px-3 py-1 text-sm font-medium text-orange-600 dark:bg-orange-950 dark:text-orange-400">
            <Flame size={16} /> {summary!.streak}일 연속
          </span>
        )}
      </header>

      <section className="rounded-2xl bg-blue-600 p-5 text-white">
        <p className="text-sm opacity-80">오늘 복습할 카드</p>
        <p className="mt-1 text-3xl font-bold">{due?.count ?? 0}장</p>
        {(due?.count ?? 0) > 0 ? (
          <Link
            href="/study?mode=due"
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 font-semibold text-blue-600"
          >
            <GraduationCap size={20} /> 복습 시작
          </Link>
        ) : (
          <p className="mt-3 text-sm opacity-80">
            오늘 복습은 끝! 새 카드를 추가해보세요.
          </p>
        )}
      </section>

      <SuggestionTiles />

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-500">내 덱</h2>
          <Link href="/decks" className="text-sm text-blue-600">
            전체 보기
          </Link>
        </div>
        {decks?.slice(0, 3).map((deck) => (
          <Link
            key={deck.id}
            href={`/decks/${deck.slug}`}
            className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-3.5 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <span className="font-medium">{deck.name}</span>
            <span className="text-sm text-neutral-500">{deck.cardCount}장</span>
          </Link>
        ))}
        {decks && decks.length === 0 && (
          <Link
            href="/decks"
            className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 py-6 text-neutral-500 dark:border-neutral-700"
          >
            <Plus size={18} /> 첫 덱 만들기
          </Link>
        )}
      </section>
    </div>
  );
}

export default function HomePage() {
  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}
