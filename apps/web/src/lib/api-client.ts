"use client";

export interface ApiErrorBody {
  code: string;
  messageKey: string;
  details?: unknown;
}

export class ApiError extends Error {
  constructor(public status: number, public body: ApiErrorBody) {
    super(body.messageKey);
  }
  /** Field → first issue, for inline form errors. */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    if (Array.isArray(this.body.details)) {
      for (const d of this.body.details as { path?: string; code?: string }[]) {
        if (d.path && !out[d.path]) out[d.path] = d.code ?? "invalid";
      }
    }
    return out;
  }
}

/** Same-origin JSON fetch. The session cookie is sent automatically; the browser sets Origin. */
export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: init.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
  });
  const data = res.headers.get("content-type")?.includes("application/json") ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/login")) window.location.href = "/login";
    throw new ApiError(res.status, data?.error ?? { code: "INTERNAL", messageKey: "errors.internal" });
  }
  return data as T;
}
