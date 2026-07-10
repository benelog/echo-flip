"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { localMode, supabase } from "@/lib/supabase";

interface AuthState {
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  session: null,
  loading: true,
  signOut: async () => {},
});

// Local mode runs as a single always-signed-in user. Consumers only read the
// session's truthiness and `user.email`, so this stub — the one cast in the
// app — stands in for a real Supabase session.
const localSession = localMode
  ? ({ user: { email: "local@localhost" } } as Session)
  : null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(localSession);
  const [loading, setLoading] = useState(!localMode);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (localMode) return;
    const client = supabase();
    client.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = client.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setLoading(false);
      // Cached responses may be personalized for the previous identity
      // (e.g. the isMine flag on public shared-deck endpoints).
      if (event === "SIGNED_OUT") queryClient.clear();
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  const signOut = async () => {
    if (localMode) return;
    // The server revocation can fail (offline, 5xx) without clearing the
    // local session; fall back so the UI always ends up signed out.
    const { error } = await supabase().auth.signOut();
    if (error) await supabase().auth.signOut({ scope: "local" });
  };

  return (
    <AuthContext.Provider value={{ session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

/** Client-side auth gate for the static-export app shell. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, session, router]);

  if (loading || !session) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-neutral-400">
        불러오는 중…
      </div>
    );
  }
  return <>{children}</>;
}
