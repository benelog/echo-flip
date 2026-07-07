"use client";

import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { api, localTimeZone } from "@/lib/api";
import type { DailyStat, StatsSummary } from "@/lib/types";

function DailyChart({ stats }: { stats: DailyStat[] }) {
  // Fill the last 30 days so gaps render as empty bars.
  const byDate = new Map(stats.map((s) => [s.date, s]));
  const days: { date: string; total: number; correct: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    days.push({ date: key, ...{ total: 0, correct: 0 }, ...byDate.get(key) });
  }
  const max = Math.max(1, ...days.map((d) => d.total));

  return (
    <div className="flex h-32 items-end gap-[3px]">
      {days.map((d) => (
        <div
          key={d.date}
          title={`${d.date}: ${d.total}회 (정답 ${d.correct})`}
          className="flex flex-1 flex-col justify-end gap-px"
          style={{ height: "100%" }}
        >
          <div
            className="w-full rounded-t bg-blue-500/90"
            style={{ height: `${(d.correct / max) * 100}%` }}
          />
          <div
            className="w-full bg-red-400/80"
            style={{ height: `${((d.total - d.correct) / max) * 100}%` }}
          />
        </div>
      ))}
    </div>
  );
}

function Stats() {
  const tz = localTimeZone();
  const { data: daily } = useQuery({
    queryKey: ["stats-daily"],
    queryFn: () => api<DailyStat[]>(`/api/stats/daily?days=30&tz=${tz}`),
  });
  const { data: summary } = useQuery({
    queryKey: ["stats-summary"],
    queryFn: () => api<StatsSummary>(`/api/stats/summary?tz=${tz}`),
  });

  const accuracy =
    summary && summary.totalReviews > 0
      ? Math.round((summary.correctReviews / summary.totalReviews) * 100)
      : null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">통계</h1>

      <section className="grid grid-cols-3 gap-3 text-center">
        {[
          { label: "연속 학습", value: `${summary?.streak ?? 0}일` },
          { label: "총 복습", value: `${summary?.totalReviews ?? 0}회` },
          { label: "전체 정답률", value: accuracy === null ? "-" : `${accuracy}%` },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-neutral-200 bg-white py-4 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <p className="text-lg font-bold">{item.value}</p>
            <p className="mt-0.5 text-xs text-neutral-500">{item.label}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-neutral-500">
          최근 30일 학습량{" "}
          <span className="font-normal">
            (<span className="text-blue-500">정답</span> ·{" "}
            <span className="text-red-400">오답</span>)
          </span>
        </h2>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          {daily ? (
            <DailyChart stats={daily} />
          ) : (
            <p className="text-sm text-neutral-500">불러오는 중…</p>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-neutral-500">
          덱별 성취도{" "}
          <span className="font-normal">(3주 이상 간격에 도달한 카드 비율)</span>
        </h2>
        {summary?.decks.map((deck) => {
          const pct =
            deck.totalCards > 0
              ? Math.round((deck.matureCards / deck.totalCards) * 100)
              : 0;
          return (
            <div
              key={deck.deckId}
              className="rounded-xl border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="flex justify-between text-sm">
                <span className="font-medium">{deck.name}</span>
                <span className="text-neutral-500">
                  {deck.matureCards}/{deck.totalCards}장 · {pct}%
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                <div
                  className="h-full rounded-full bg-green-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
        {summary?.decks.length === 0 && (
          <p className="py-4 text-center text-sm text-neutral-500">
            아직 데이터가 없어요.
          </p>
        )}
      </section>
    </div>
  );
}

export default function StatsPage() {
  return (
    <AppShell>
      <Stats />
    </AppShell>
  );
}
