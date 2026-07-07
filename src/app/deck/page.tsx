"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  Download,
  GraduationCap,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CsvImportButton } from "@/components/CsvImportDialog";
import { useToast } from "@/components/Toast";
import { api, apiBlob } from "@/lib/api";
import { downloadBlob } from "@/lib/csv";
import type { Card, Deck } from "@/lib/types";

function DeckDetail() {
  const params = useSearchParams();
  const deckId = params.get("id");
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: deck } = useQuery({
    queryKey: ["deck", deckId],
    queryFn: () => api<Deck>(`/api/decks/${deckId}`),
    enabled: !!deckId,
  });
  const { data: cards } = useQuery({
    queryKey: ["cards", deckId],
    queryFn: () => api<Card[]>(`/api/decks/${deckId}/cards`),
    enabled: !!deckId,
  });

  const deleteCard = useMutation({
    mutationFn: (cardId: string) => api(`/api/cards/${cardId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cards", deckId] });
      queryClient.invalidateQueries({ queryKey: ["decks"] });
    },
    onError: (e) => toast(e.message, "error"),
  });

  const deleteDeck = useMutation({
    mutationFn: () => api(`/api/decks/${deckId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["decks"] });
      router.replace("/decks");
    },
    onError: (e) => toast(e.message, "error"),
  });

  const exportCsv = async () => {
    try {
      const blob = await apiBlob(`/api/decks/${deckId}/export`);
      downloadBlob(blob, `${deck?.name ?? "deck"}.csv`);
    } catch {
      toast("내보내기에 실패했어요", "error");
    }
  };

  if (!deckId) return <p className="text-neutral-500">덱을 찾을 수 없어요.</p>;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-2">
        <Link href="/decks" aria-label="뒤로" className="p-1 text-neutral-500">
          <ChevronLeft size={22} />
        </Link>
        <h1 className="flex-1 truncate text-lg font-bold">{deck?.name ?? "…"}</h1>
        <button
          onClick={() => {
            if (confirm(`'${deck?.name}' 덱과 카드를 모두 삭제할까요?`))
              deleteDeck.mutate();
          }}
          aria-label="덱 삭제"
          className="p-1.5 text-neutral-400"
        >
          <Trash2 size={18} />
        </button>
      </header>

      {(cards?.length ?? 0) > 0 && (
        <Link
          href={`/study?mode=deck&deckId=${deckId}&title=${encodeURIComponent(deck?.name ?? "")}`}
          className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 font-semibold text-white"
        >
          <GraduationCap size={20} /> 이 덱 학습하기 ({cards!.length}장)
        </Link>
      )}

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/card?deckId=${deckId}`}
          className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
        >
          <Plus size={16} /> 카드 추가
        </Link>
        <CsvImportButton deckId={deckId} />
        <button
          onClick={exportCsv}
          className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
        >
          <Download size={16} /> CSV 내보내기
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {cards?.map((card) => (
          <li
            key={card.id}
            className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{card.frontText}</p>
              <p className="truncate text-sm text-neutral-500">{card.backText}</p>
              {card.attempts > 0 && (
                <p className="mt-0.5 text-xs text-neutral-400">
                  시도 {card.attempts}회 · 오답률 {Math.round(card.errorRate * 100)}%
                </p>
              )}
            </div>
            <Link
              href={`/card?deckId=${deckId}&id=${card.id}`}
              aria-label="카드 수정"
              className="p-1.5 text-neutral-400"
            >
              <Pencil size={16} />
            </Link>
            <button
              onClick={() => deleteCard.mutate(card.id)}
              aria-label="카드 삭제"
              className="p-1.5 text-neutral-400"
            >
              <Trash2 size={16} />
            </button>
          </li>
        ))}
        {cards?.length === 0 && (
          <p className="py-8 text-center text-sm text-neutral-500">
            카드가 없어요. 직접 추가하거나 CSV로 가져와보세요.
          </p>
        )}
      </ul>
    </div>
  );
}

export default function DeckPage() {
  return (
    <AppShell>
      <Suspense>
        <DeckDetail />
      </Suspense>
    </AppShell>
  );
}
