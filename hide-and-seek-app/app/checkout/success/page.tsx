"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Nav, api } from "@/components/ui";

type Result = { code: string; plan: { id: string; name: string; audience: string; maxPlayers: number } };

export default function CheckoutSuccess() {
  const [r, setR] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const id = new URLSearchParams(location.search).get("session_id") ?? "";
    let tries = 0, stop = false;
    const load = () => api<Result>(`/api/checkout/status?session_id=${encodeURIComponent(id)}`)
      .then((x) => { if (!stop) setR(x); })
      .catch((e) => { if (!stop && ++tries < 6) setTimeout(load, 2000); else if (!stop) setError((e as Error).message); });
    load();
    return () => { stop = true; };
  }, []);

  async function copy() {
    if (!r) return;
    try { await navigator.clipboard.writeText(r.code); setCopied(true); } catch {}
  }

  const team = r && (r.plan.audience === "group" || r.plan.audience === "corporate");
  return (
    <div className="wide" style={{ maxWidth: 560 }}>
      <Nav current="pricing" />
      <h1>Thank you for your purchase</h1>
      {error && <p className="error">{error} If you were charged, contact us with your receipt and we&apos;ll sort it out straight away.</p>}
      {!r && !error && <p className="muted">Confirming your payment…</p>}
      {r && (
        <div className="card">
          <span className="eyebrow">{r.plan.name}</span>
          <h3>Your access code</h3>
          <div className="secret" style={{ textAlign: "center", fontSize: 22, userSelect: "all" }}>{r.code}</div>
          <button className="btn ghost" onClick={copy}>{copied ? "Code copied" : "Copy code"}</button>
          <p className="muted">Keep this code safe. Stripe has also emailed you a receipt.</p>
          {team ? (
            <>
              <p>Next, set up your {r.plan.audience === "corporate" ? "company" : "group"}. You&apos;ll become its super user, able to add hosts and control settings.</p>
              <Link className="btn" href={`/team/new?code=${encodeURIComponent(r.code)}`}>Set up my team</Link>
            </>
          ) : (
            <>
              <p>Enter this code in the &quot;Access or host code&quot; box when you host a game to unlock every mode and up to {r.plan.maxPlayers} players.</p>
              <Link className="btn" href="/">Host a game</Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
