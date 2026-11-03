"use client";

import Link from "next/link";

export async function api<T = Record<string, unknown>>(url: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Something went wrong. Try again.");
  return json as T;
}

export function Toggle({ id, label, help, checked, disabled, note, onChange }: {
  id: string; label: string; help: string; checked: boolean; disabled?: boolean; note?: string; onChange: (v: boolean) => void;
}) {
  return (
    <div className="toggle">
      <div className="text">
        <b id={`${id}-label`}>{label}</b>
        <span className="muted">{help}{note ? ` ${note}` : ""}</span>
      </div>
      <button id={id} type="button" role="switch" className="switch" aria-checked={checked} aria-labelledby={`${id}-label`}
        disabled={disabled} onClick={() => onChange(!checked)} />
    </div>
  );
}

export function Nav({ current, signedIn }: { current?: "play" | "pricing" | "team" | "admin" | "account"; signedIn?: boolean }) {
  return (
    <nav className="nav" aria-label="Main">
      <Link href="/" aria-current={current === "play" ? "page" : undefined}>Play</Link>
      <Link href="/pricing" aria-current={current === "pricing" ? "page" : undefined}>Pricing</Link>
      <Link href="/team" aria-current={current === "team" ? "page" : undefined}>Team dashboard</Link>
      <Link href="/account" aria-current={current === "account" ? "page" : undefined}>{signedIn ? "My account" : "Sign in"}</Link>
    </nav>
  );
}

export const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" }) : "—";
