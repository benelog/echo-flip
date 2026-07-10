"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Local mode: without NEXT_PUBLIC_SUPABASE_URL the app runs sign-in free
// against a local server that ignores auth. Mirrors the Go server's rule.
export const localMode = !process.env.NEXT_PUBLIC_SUPABASE_URL;

let client: SupabaseClient | null = null;

// Browser-only Supabase client, used exclusively for Google/GitHub OAuth and
// session/token management. All data goes through the Go API. Never called
// in local mode.
export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return client;
}
