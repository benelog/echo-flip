"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { BarChart3, Home, Layers, Settings } from "lucide-react";
import { RequireAuth, useAuth } from "./AuthProvider";
import { TopBar } from "./TopBar";

const TABS = [
  { href: "/", label: "홈", icon: Home },
  { href: "/decks", label: "덱", icon: Layers },
  { href: "/stats", label: "통계", icon: BarChart3 },
  { href: "/settings", label: "설정", icon: Settings },
];

function OfflineBanner() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  if (online) return null;
  return (
    <div className="bg-amber-500 px-4 py-1.5 text-center text-sm text-white">
      오프라인 상태예요. 학습 기록이 저장되지 않습니다.
    </div>
  );
}

function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white/95 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
      <div className="mx-auto flex max-w-lg justify-around">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 px-4 py-2.5 text-xs ${
                active
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-neutral-500"
              }`}
            >
              <Icon size={20} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * App frame: top login-status bar, offline banner, content, and the bottom tab
 * bar. `requireAuth` (default) gates the content behind sign-in; pass
 * `requireAuth={false}` for public pages such as shared-deck browsing. The
 * bottom nav only appears when the visitor is signed in.
 */
export function AppShell({
  children,
  requireAuth = true,
}: {
  children: ReactNode;
  requireAuth?: boolean;
}) {
  const { session } = useAuth();
  const showNav = !!session;
  const frame = (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
      <TopBar />
      <OfflineBanner />
      <main className={`flex-1 px-4 pt-6 ${showNav ? "pb-24" : "pb-10"}`}>
        {children}
      </main>
      {showNav && <BottomNav />}
    </div>
  );
  return requireAuth ? <RequireAuth>{frame}</RequireAuth> : frame;
}
