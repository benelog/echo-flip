"use client";

import Link from "next/link";
import { LogIn, LogOut } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { Logo } from "./Logo";

/** App-wide header strip showing login status and a logout / login action. */
export function TopBar() {
  const { session, loading, signOut } = useAuth();

  return (
    <header className="flex h-12 items-center justify-between border-b border-neutral-200 px-4 dark:border-neutral-800">
      {/* "/" is auth-gated; send anonymous visitors to the public gallery. */}
      <Link
        href={session ? "/" : "/shared"}
        className="flex items-center gap-1.5 text-sm font-bold"
      >
        <Logo size={18} /> Echo Flip
      </Link>
      {loading ? (
        <span className="text-xs text-neutral-400">…</span>
      ) : session ? (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-xs text-neutral-500">
            {session.user.email}
          </span>
          <button
            onClick={() => void signOut()}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
          >
            <LogOut size={14} /> 로그아웃
          </button>
        </div>
      ) : (
        <Link
          href="/login"
          className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white"
        >
          <LogIn size={14} /> 로그인
        </Link>
      )}
    </header>
  );
}
