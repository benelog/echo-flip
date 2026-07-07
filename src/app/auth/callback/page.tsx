"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

// supabase-js (detectSessionInUrl) exchanges the OAuth code automatically on
// load; this page just waits for the session and moves on.
export default function AuthCallbackPage() {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (session) router.replace("/");
    else if (!loading) {
      const timeout = setTimeout(() => router.replace("/login"), 4000);
      return () => clearTimeout(timeout);
    }
  }, [session, loading, router]);

  return (
    <div className="flex min-h-dvh items-center justify-center text-neutral-500">
      로그인 처리 중…
    </div>
  );
}
