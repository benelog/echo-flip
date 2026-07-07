"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { encodeRule, suggestionTitle } from "@/lib/rules";
import type { Suggestion } from "@/lib/types";

/** Home tiles proposing rule-based smart-deck sessions (e.g. high error rate). */
export function SuggestionTiles() {
  const { data } = useQuery({
    queryKey: ["suggestions"],
    queryFn: () => api<Suggestion[]>("/api/suggestions"),
  });

  if (!data?.length) return null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-neutral-500">추천 복습</h2>
      {data.map((s) => (
        <Link
          key={s.type}
          href={`/study?mode=smart&rule=${encodeRule(s.rule)}`}
          className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 dark:border-amber-900 dark:bg-amber-950/30"
        >
          <Sparkles size={20} className="shrink-0 text-amber-500" />
          <div className="min-w-0">
            <p className="font-medium">{suggestionTitle(s.rule, s.count)}</p>
            <p className="text-xs text-neutral-500">대상 카드 {s.count}장</p>
          </div>
        </Link>
      ))}
    </section>
  );
}
