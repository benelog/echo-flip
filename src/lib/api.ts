"use client";

import { supabase } from "./supabase";

// Same origin in production (Vercel serves /api/* via the Go function);
// point at `go run ./cmd/server` in local dev.
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError(401, "로그인이 필요합니다");
  return { Authorization: `Bearer ${token}` };
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      ...(await authHeader()),
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
