"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Nav, api } from "@/components/ui";

export default function NewTeam() {
  const [f, setF] = useState({ accessCode: "", teamName: "", ownerName: "", ownerEmail: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ teamId: string; adminKey: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    const c = new URLSearchParams(location.search).get("code");
    if (c) setF((x) => ({ ...x, accessCode: c }));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      const r = await api<{ teamId: string; adminKey: string }>("/api/teams", { body: f });
      try {
        localStorage.setItem(`hs:team:${r.teamId}`, r.adminKey);
        const list = JSON.parse(localStorage.getItem("hs:teams") ?? "[]");
        localStorage.setItem("hs:teams", JSON.stringify([...list, { id: r.teamId, name: f.teamName }]));
      } catch {}
      setDone({ ...r, link: `${location.origin}/team/${r.teamId}#key=${r.adminKey}` });
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  async function copy() {
    if (!done) return;
    try { await navigator.clipboard.writeText(done.link); setCopied(true); } catch { setCopied(false); }
  }

  return (
    <div className="wide" style={{ maxWidth: 560 }}>
      <Nav current="team" />
      <h1>Set up your team</h1>
      {done ? (
        <div className="card">
          <h3>Your team is ready. You&apos;re its super user.</h3>
          <p className="muted">This private link opens your dashboard on any device. Save it somewhere safe, such as your password manager. Anyone with this link can manage your team.</p>
          <div className="secret" style={{ userSelect: "all" }}>{done.link}</div>
          <button className="btn ghost" onClick={copy}>{copied ? "Link copied" : "Copy dashboard link"}</button>
          <Link className="btn" href={`/team/${done.teamId}`}>Open my dashboard</Link>
        </div>
      ) : (
        <form className="card" onSubmit={submit}>
          <p className="muted">Enter the access code from your Group or Corporate purchase. You&apos;ll become the team owner, able to add hosts and control settings.</p>
          {error && <div className="error" role="alert">{error}</div>}
          <label>Access code<input id="t-code" className="code" value={f.accessCode} onChange={set("accessCode")} placeholder="ABCD-EFGH-JKLM" /></label>
          <label>Team or group name<input id="t-name" value={f.teamName} onChange={set("teamName")} placeholder="e.g. Acme People Team" /></label>
          <label>Your name<input id="t-owner" value={f.ownerName} onChange={set("ownerName")} autoComplete="name" /></label>
          <label>Your email<input id="t-email" type="email" value={f.ownerEmail} onChange={set("ownerEmail")} autoComplete="email" /></label>
          <button className="btn" disabled={busy}>Create team</button>
        </form>
      )}
    </div>
  );
}
