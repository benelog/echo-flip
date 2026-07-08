"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Globe2, Plus, Sparkles, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";
import { encodeRule, ruleLabel } from "@/lib/rules";
import type { Deck, SmartDeck } from "@/lib/types";

function DeckList() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const { data: decks } = useQuery({
    queryKey: ["decks"],
    queryFn: () => api<Deck[]>("/api/decks"),
  });
  const { data: smartDecks } = useQuery({
    queryKey: ["smart-decks"],
    queryFn: () => api<SmartDeck[]>("/api/smart-decks"),
  });

  const createDeck = useMutation({
    mutationFn: (deckName: string) =>
      api<Deck>("/api/decks", {
        method: "POST",
        body: JSON.stringify({ name: deckName }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["decks"] });
      setName("");
      setCreating(false);
    },
    onError: (e) => toast(e.message, "error"),
  });

  const deleteSmartDeck = useMutation({
    mutationFn: (id: string) =>
      api(`/api/smart-decks/${id}`, { method: "DELETE" }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["smart-decks"] }),
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">덱</h1>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white"
        >
          <Plus size={16} /> 새 덱
        </button>
      </header>

      {creating && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) createDeck.mutate(name.trim());
          }}
          className="flex gap-2"
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="덱 이름 (예: 토익 필수 단어)"
            className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button
            type="submit"
            disabled={createDeck.isPending}
            className="rounded-lg bg-blue-600 px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            만들기
          </button>
        </form>
      )}

      <Link
        href="/shared"
        className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-4 py-3.5 dark:border-blue-900 dark:bg-blue-950/30"
      >
        <span className="flex items-center gap-2 font-medium">
          <Globe2 size={18} className="text-blue-500" /> 공유 덱 둘러보기
        </span>
        <ChevronRight size={18} className="text-neutral-400" />
      </Link>

      <section className="flex flex-col gap-2">
        {decks?.map((deck) => (
          <Link
            key={deck.id}
            href={`/decks/${deck.slug}`}
            className="rounded-xl border border-neutral-200 bg-white px-4 py-4 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{deck.name}</span>
              <span className="text-sm text-neutral-500">
                {deck.cardCount}장
              </span>
            </div>
            {deck.description && (
              <p className="mt-1 text-sm text-neutral-500">{deck.description}</p>
            )}
          </Link>
        ))}
        {decks?.length === 0 && !creating && (
          <p className="py-8 text-center text-sm text-neutral-500">
            아직 덱이 없어요. 첫 덱을 만들어보세요!
          </p>
        )}
      </section>

      {(smartDecks?.length ?? 0) > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-neutral-500">스마트 덱</h2>
          {smartDecks!.map((deck) => (
            <div
              key={deck.id}
              className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 dark:border-amber-900 dark:bg-amber-950/30"
            >
              <Link
                href={`/study?mode=smart&rule=${encodeRule(deck.rule)}&title=${encodeURIComponent(deck.name)}`}
                className="flex min-w-0 flex-1 items-center gap-2"
              >
                <Sparkles size={18} className="shrink-0 text-amber-500" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{deck.name}</p>
                  <p className="text-xs text-neutral-500">
                    {ruleLabel(deck.rule)}
                  </p>
                </div>
              </Link>
              <button
                onClick={() => deleteSmartDeck.mutate(deck.id)}
                aria-label="스마트 덱 삭제"
                className="p-1.5 text-neutral-400"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

export default function DecksPage() {
  return (
    <AppShell>
      <DeckList />
    </AppShell>
  );
}
