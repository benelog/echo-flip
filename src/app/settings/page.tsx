"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/Toast";
import { useTts } from "@/hooks/useTts";
import { api } from "@/lib/api";
import type { Profile, ProfileSettings } from "@/lib/types";

function Settings() {
  const { session, signOut } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<Profile>("/api/me"),
  });

  const [displayName, setDisplayName] = useState("");
  const [ttsRate, setTtsRate] = useState(0.9);
  const [dailyGoal, setDailyGoal] = useState(50);
  const { speak } = useTts(ttsRate);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName ?? "");
    setTtsRate(profile.settings.ttsRate ?? 0.9);
    setDailyGoal(profile.settings.dailyGoal ?? 50);
  }, [profile]);

  const save = useMutation({
    mutationFn: (body: { displayName: string; settings: ProfileSettings }) =>
      api<Profile>("/api/me", { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
      toast("저장했어요");
    },
    onError: (e) => toast(e.message, "error"),
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">설정</h1>

      <section className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="text-sm text-neutral-500">
          {session?.user.email ?? ""}
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">이름</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-950"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">
            읽기 속도: {ttsRate.toFixed(1)}x{" "}
            <button
              type="button"
              onClick={() => speak("The quick brown fox jumps over the lazy dog.")}
              className="ml-2 text-xs text-blue-600 underline"
            >
              들어보기
            </button>
          </span>
          <input
            type="range"
            min={0.5}
            max={1.5}
            step={0.1}
            value={ttsRate}
            onChange={(e) => setTtsRate(Number(e.target.value))}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">하루 복습 목표 (카드 수)</span>
          <input
            type="number"
            min={5}
            max={200}
            value={dailyGoal}
            onChange={(e) => setDailyGoal(Number(e.target.value))}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-950"
          />
        </label>
        <button
          onClick={() =>
            save.mutate({
              displayName: displayName.trim(),
              settings: { ttsRate, dailyGoal },
            })
          }
          disabled={save.isPending}
          className="rounded-xl bg-blue-600 py-3 font-semibold text-white disabled:opacity-50"
        >
          저장
        </button>
      </section>

      <button
        onClick={() => void signOut()}
        className="flex items-center justify-center gap-2 rounded-xl border border-red-200 py-3 font-medium text-red-600 dark:border-red-900"
      >
        <LogOut size={18} /> 로그아웃
      </button>

      <p className="text-center text-xs text-neutral-400">echo-flip v0.1.0</p>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <AppShell>
      <Settings />
    </AppShell>
  );
}
