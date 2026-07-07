"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CardForm } from "@/components/CardForm";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";
import type { Card, CardInput } from "@/lib/types";

function CardEditor() {
  const params = useSearchParams();
  const deckId = params.get("deckId");
  const cardId = params.get("id");
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: existing, isLoading } = useQuery({
    queryKey: ["card", cardId],
    queryFn: () => api<Card>(`/api/cards/${cardId}`),
    enabled: !!cardId,
  });

  const save = useMutation({
    mutationFn: (input: CardInput) =>
      cardId
        ? api<Card>(`/api/cards/${cardId}`, {
            method: "PATCH",
            body: JSON.stringify({ ...input, deckId }),
          })
        : api<Card>("/api/cards", {
            method: "POST",
            body: JSON.stringify({ ...input, deckId }),
          }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cards", deckId] });
      queryClient.invalidateQueries({ queryKey: ["card", cardId] });
      queryClient.invalidateQueries({ queryKey: ["decks"] });
      if (cardId) {
        toast("카드를 수정했어요");
        router.back();
      } else {
        toast("카드를 추가했어요");
        router.replace(`/deck?id=${deckId}`);
      }
    },
    onError: (e) => toast(e.message, "error"),
  });

  if (!deckId) return <p className="text-neutral-500">덱을 찾을 수 없어요.</p>;
  if (cardId && isLoading)
    return <p className="text-neutral-500">불러오는 중…</p>;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-2">
        <Link
          href={`/deck?id=${deckId}`}
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
      <Suspense>
        <CardEditor />
      </Suspense>
    </AppShell>
  );
}
