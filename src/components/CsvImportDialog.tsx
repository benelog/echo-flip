"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { api } from "@/lib/api";
import { parseCsv } from "@/lib/csv";
import type { BulkResult } from "@/lib/types";
import { useToast } from "./Toast";

export function CsvImportButton({ deckId }: { deckId: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const upload = useMutation({
    mutationFn: (cards: unknown[]) =>
      api<BulkResult>(`/api/decks/${deckId}/cards/bulk`, {
        method: "POST",
        body: JSON.stringify({ cards }),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["cards", deckId] });
      queryClient.invalidateQueries({ queryKey: ["decks"] });
      toast(
        `${res.added}개 추가, ${res.skipped}개 중복 건너뜀` +
          (res.invalid ? `, ${res.invalid}개 오류` : ""),
      );
    },
    onError: (e) => toast(e.message, "error"),
  });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const { cards, invalid } = await parseCsv(file);
      if (cards.length === 0) {
        toast(
          `가져올 카드가 없어요. front,back 헤더가 있는 CSV인지 확인해주세요` +
            (invalid ? ` (${invalid}행 오류)` : ""),
          "error",
        );
        return;
      }
      await upload.mutateAsync(cards);
    } catch {
      toast("CSV 파일을 읽지 못했어요", "error");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-neutral-700"
      >
        <Upload size={16} />
        {busy ? "가져오는 중…" : "CSV 가져오기"}
      </button>
    </>
  );
}
