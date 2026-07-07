"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Globe2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";
import type { SharedDeckSummary } from "@/lib/types";

function SharedGallery() {
  const { data: decks, isLoading } = useQuery({
    queryKey: ["shared-decks"],
    queryFn: () => api<SharedDeckSummary[]>("/api/shared-decks"),
  });

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-2">
        <Link href="/decks" aria-label="뒤로" className="p-1 text-neutral-500">
          <ChevronLeft size={22} />
        </Link>
        <h1 className="text-lg font-bold">공유 덱 둘러보기</h1>
      </header>

      <div className="flex flex-col gap-2">
        {decks?.map((deck) => (
          <Link
            key={deck.shareSlug}
            href={`/shared-deck?slug=${deck.shareSlug}`}
            className="rounded-xl border border-neutral-200 bg-white px-4 py-4 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2 font-medium">
                <Globe2 size={16} className="shrink-0 text-blue-500" />
                <span className="truncate">{deck.name}</span>
                {deck.isMine && (
                  <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800">
                    내 덱
                  </span>
                )}
              </span>
              <span className="shrink-0 text-sm text-neutral-500">
                {deck.cardCount}장
              </span>
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              {deck.ownerName || "익명"} ·{" "}
              {new Date(deck.sharedAt).toLocaleDateString("ko-KR")}
            </p>
            {deck.description && (
              <p className="mt-1 truncate text-sm text-neutral-500">
                {deck.description}
              </p>
            )}
          </Link>
        ))}
        {decks?.length === 0 && (
          <p className="py-12 text-center text-sm text-neutral-500">
            아직 공유된 덱이 없어요.
            <br />내 덱 상세 화면에서 "덱 공유하기"를 눌러 첫 공유 덱을
            만들어보세요.
          </p>
        )}
        {isLoading && (
          <p className="py-12 text-center text-sm text-neutral-500">
            불러오는 중…
          </p>
        )}
      </div>
    </div>
  );
}

export default function SharedPage() {
  return (
    <AppShell>
      <SharedGallery />
    </AppShell>
  );
}
