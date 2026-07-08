"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Download, LogIn } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/Toast";
import { api, apiPublic, ApiError } from "@/lib/api";
import type { Deck, SharedDeckDetail } from "@/lib/types";

const ctaClass =
  "flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 font-semibold text-white";

function SharedDeckPreview() {
  const params = useSearchParams();
  const slug = params.get("slug");
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { session } = useAuth();

  const { data, error, isLoading } = useQuery<SharedDeckDetail>({
    queryKey: ["shared-deck", slug],
    queryFn: () => apiPublic<SharedDeckDetail>(`/api/shared-decks/${slug}`),
    enabled: !!slug,
    retry: 0,
  });

  const importDeck = useMutation({
    mutationFn: () =>
      api<Deck>(`/api/shared-decks/${slug}/import`, { method: "POST" }),
    onSuccess: (deck) => {
      queryClient.invalidateQueries({ queryKey: ["decks"] });
      toast(`'${deck.name}' 덱을 가져왔어요`);
      router.replace(`/decks/${deck.slug}`);
    },
    onError: (e) => toast(e.message, "error"),
  });

  if (!slug)
    return <p className="py-12 text-center text-neutral-500">잘못된 링크예요.</p>;
  if (error)
    return (
      <p className="py-12 text-center text-sm text-neutral-500">
        {error instanceof ApiError && error.status === 404
          ? "공유가 해제되었거나 존재하지 않는 덱이에요."
          : `불러오지 못했어요: ${error.message}`}
      </p>
    );
  if (isLoading || !data)
    return <p className="py-12 text-center text-neutral-500">불러오는 중…</p>;

  const { deck, cards } = data;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-2">
        <Link href="/shared" aria-label="뒤로" className="p-1 text-neutral-500">
          <ChevronLeft size={22} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold">{deck.name}</h1>
          <p className="text-xs text-neutral-500">
            {deck.ownerName || "익명"} 님의 공유 덱 · {deck.cardCount}장
          </p>
        </div>
      </header>

      {deck.description && (
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          {deck.description}
        </p>
      )}

      {session ? (
        <button
          onClick={() => importDeck.mutate()}
          disabled={importDeck.isPending}
          className={`${ctaClass} disabled:opacity-50`}
        >
          <Download size={20} />
          {importDeck.isPending ? "가져오는 중…" : "내 덱으로 가져오기"}
        </button>
      ) : (
        <Link
          href={`/login?next=${encodeURIComponent(`/shared-deck?slug=${slug}`)}`}
          className={ctaClass}
        >
          <LogIn size={20} />
          로그인하고 내 덱으로 가져오기
        </Link>
      )}
      <p className="-mt-2 text-center text-xs text-neutral-400">
        {session
          ? "카드 전체가 내 계정으로 복사되고, 학습 기록은 새로 시작해요."
          : "로그인하면 이 덱을 내 계정으로 복사해 학습할 수 있어요."}
      </p>

      <ul className="flex flex-col gap-2">
        {cards.map((card, i) => (
          <li
            key={i}
            className="rounded-xl border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <p className="font-medium">{card.text}</p>
            <p className="text-sm text-neutral-500">{card.meaning}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SharedDeckPage() {
  return (
    <AppShell requireAuth={false}>
      <Suspense>
        <SharedDeckPreview />
      </Suspense>
    </AppShell>
  );
}
