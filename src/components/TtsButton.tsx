"use client";

import { Volume2 } from "lucide-react";
import { useTts } from "@/hooks/useTts";

export function TtsButton({ text, rate }: { text: string; rate?: number }) {
  const { speak, supported } = useTts(rate);
  if (!supported) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        speak(text);
      }}
      aria-label="영어 읽어주기"
      className="rounded-full p-2 text-blue-600 transition hover:bg-blue-50 active:scale-95 dark:text-blue-400 dark:hover:bg-neutral-800"
    >
      <Volume2 size={22} />
    </button>
  );
}
