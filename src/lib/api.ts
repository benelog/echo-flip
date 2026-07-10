"use client";

import { localMode, supabase } from "./supabase";

// Same origin in production (Vercel serves /api/* via the Go function);
// `next dev` defaults to the local `go run ./cmd/server` address so the
// zero-config local mode needs no env vars. NEXT_PUBLIC_API_URL overrides.
const BASE =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "development" ? "http://localhost:8080" : "");

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Sends the bearer token only when signed in — for endpoints that work
// anonymously but personalize the response for logged-in callers.
async function optionalAuthHeader(): Promise<Record<string, string>> {
  if (localMode) return {}; // the local-mode server ignores auth headers
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function authHeader(): Promise<Record<string, string>> {
  const header = await optionalAuthHeader();
  if (!localMode && !header.Authorization)
    throw new ApiError(401, "로그인이 필요합니다");
  return header;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  return request(path, await authHeader(), init);
}

/** Like `api`, but does not require a session (public endpoints). */
export async function apiPublic<T>(path: string, init?: RequestInit): Promise<T> {
  return request(path, await optionalAuthHeader(), init);
}

async function request<T>(
  path: string,
  auth: Record<string, string>,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      ...auth,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    let message = `요청 실패 (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function apiBlob(path: string): Promise<Blob> {
  const res = await fetch(BASE + path, { headers: await authHeader() });
  if (!res.ok) throw new ApiError(res.status, `다운로드 실패 (${res.status})`);
  return res.blob();
}

/** End of the local day, for the SRS due queue. */
export function endOfToday(): string {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
