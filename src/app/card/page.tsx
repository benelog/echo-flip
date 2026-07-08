"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CardForm } from "@/components/CardForm";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";
import type { Card, CardInput } from "@/lib/types";

function CardEditor() {
  // Two routes rewrite to this page, and the target lives only in the browser
  // URL path (undefined until mounted, null when the path fits neither):
  //   /cards/{id}              → edit an existing card (its deck comes from the API)
  //   /decks/{slug}/cards/new  → create a card in that deck
  const [route, setRoute] = useState<
    { cardId?: string; deckSlug?: string } | null | undefined
  >(undefined);
  useEffect(() => {
    const p = window.location.pathname.split("/");
    if (p[1] === "cards" && p[2]) setRoute({ cardId: p[2] });
    else if (p[1] === "decks" && p[2]) setRoute({ deckSlug: p[2] });
    else setRoute(null);
  }, []);

  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();

  const cardId = route?.cardId ?? null;
  const { data: existing, isLoading } = useQuery({
    queryKey: ["card", cardId],
    queryFn: () => api<Card>(`/api/cards/${cardId}`),
    enabled: !!cardId,
  });

  // A new card carries its deck in the URL; an edit gets it from the fetched card.
  const deckSlug = route?.deckSlug ?? existing?.deckSlug ?? null;

  const save = useMutation({
    mutationFn: (input: CardInput) =>
      cardId
        ? api<Card>(`/api/cards/${cardId}`, {
            method: "PATCH",
            body: JSON.stringify(input),
          })
        : api<Card>("/api/cards", {
            method: "POST",
            body: JSON.stringify({ ...input, deckSlug }),
          }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cards", deckSlug] });
      queryClient.invalidateQueries({ queryKey: ["card", cardId] });
      queryClient.invalidateQueries({ queryKey: ["decks"] });
      if (cardId) {
        toast("카드를 수정했어요");
        router.back();
      } else {
        toast("카드를 추가했어요");
        router.replace(`/decks/${deckSlug}`);
      }
    },
    onError: (e) => toast(e.message, "error"),
  });

  if (route === undefined || (cardId && isLoading))
    return <p className="text-neutral-500">불러오는 중…</p>;
  if (route === null)
    return <p className="text-neutral-500">덱을 찾을 수 없어요.</p>;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-2">
        <Link
          href={deckSlug ? `/decks/${deckSlug}` : "/decks"}
          aria-label="뒤로"
          className="p-1 text-neutral-500"
        >
          <ChevronLeft size={22} />
        </Link>
        <h1 className="text-lg font-bold">{cardId ? "카드 수정" : "새 카드"}</h1>
      </header>
      <CardForm
        initial={existing}
        onSubmit={(input) => save.mutate(input)}
        submitting={save.isPending}
      />
    </div>
  );
}

export default function CardPage() {
  return (
    <AppShell>
      <CardEditor />
    </AppShell>
  );
}
