"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Nav, api, fmtDate } from "@/components/ui";

type Profile = {
  user: { id: string; name: string; email: string; since: string } | null;
  stats?: { games: number; wins: number; tags: number; points: number; best: number };
  history?: { code: string; mode: string; created_at: string; score: number; tags: number; was_hider: boolean; found: boolean; team: string | null; players: number; rank: number; finished: boolean }[];
  plans?: { code: string; name: string; maxPlayers: number; audience: string; eventsLeft: number | null; expiresAt: string; team: string | null; usable: boolean; status: string }[];
};
const MODE_LABEL: Record<string, string> = { classic: "Classic", infection: "Infection", shadow: "Shadow Teams", duel: "Decoy Duel", indoor: "Indoor" };

export default function Account() {
  const router = useRouter();
  const [p, setP] = useState<Profile | null>(null);
  const [tab, setTab] = useState<"in" | "up">("in");
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [claim, setClaim] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const load = () => api<Profile>("/api/me").then(setP).catch(() => setP({ user: null }));
  useEffect(() => { load(); }, []);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      await api(tab === "in" ? "/api/auth/login" : "/api/auth/signup", { body: f });
      setF({ ...f, password: "" });
      await load();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  async function addCode(e: React.FormEvent) {
    e.preventDefault(); setError(""); setNote("");
    try { setP(await api<Profile>("/api/me/claim", { body: { code: claim } })); setClaim(""); setNote("Plan added to your account."); }
    catch (err) { setError((err as Error).message); }
  }

  function useForHosting(code: string) {
    try { localStorage.setItem("hs:access", code); } catch {}
    router.push("/");
  }

  if (!p) return <div className="wide"><Nav current="account" /><p className="muted">Loading…</p></div>;

  if (!p.user) {
    return (
      <div className="wide" style={{ maxWidth: 520 }}>
        <Nav current="account" />
        <h1>{tab === "in" ? "Sign in" : "Create your account"}</h1>
        <p className="lede">Keep your scores and game history, and save your plans so you never need to retype a code.</p>
        <div className="tabs" role="tablist">
          <button role="tab" className="tab" aria-selected={tab === "in"} onClick={() => { setTab("in"); setError(""); }}>Sign in</button>
          <button role="tab" className="tab" aria-selected={tab === "up"} onClick={() => { setTab("up"); setError(""); }}>Create account</button>
        </div>
        <form className="card" onSubmit={submit}>
          {error && <div className="error" role="alert">{error}</div>}
          {tab === "up" && <label>Your name (shown to other players)<input id="a-name" value={f.name} onChange={set("name")} maxLength={24} autoComplete="nickname" /></label>}
          <label>Email<input id="a-email" type="email" value={f.email} onChange={set("email")} autoComplete="email" /></label>
          <label>Password<input id="a-pass" type="password" value={f.password} onChange={set("password")} autoComplete={tab === "in" ? "current-password" : "new-password"} minLength={8} /></label>
          {tab === "up" && <p className="muted">At least 8 characters. Plans already bought with this email are added automatically.</p>}
          <button className="btn" disabled={busy}>{tab === "in" ? "Sign in" : "Create account"}</button>
          {tab === "in" && <Link href="/account/forgot" className="small">Forgot your password?</Link>}
        </form>
      </div>
    );
  }

  const s = p.stats!;
  return (
    <div className="wide">
      <div className="row between" style={{ flexWrap: "wrap" }}>
        <Nav current="account" signedIn />
        <button className="btn ghost sm" onClick={async () => { await api("/api/auth/logout", { body: {} }); setP({ user: null }); }}>Sign out</button>
      </div>
      <div className="section-title">
        <span className="eyebrow">My account</span>
        <h1>{p.user.name}</h1>
        <p className="muted">{p.user.email} · playing since {fmtDate(p.user.since)}</p>
      </div>
      {error && <div className="error" role="alert">{error}</div>}
      {note && <div className="notice" role="status">{note}</div>}

      <div className="stats">
        <div className="stat"><b>{s.games}</b><small>Games played</small></div>
        <div className="stat"><b>{s.wins}</b><small>Wins</small></div>
        <div className="stat"><b>{s.tags}</b><small>Hiders found</small></div>
        <div className="stat"><b>{s.points}</b><small>Total points</small></div>
        <div className="stat"><b>{s.best}</b><small>Best score</small></div>
      </div>

      <div className="split">
        <div className="card">
          <h3>My plans</h3>
          {p.plans!.length === 0 && <p className="muted">No plans yet. Buy one on the <Link href="/pricing">pricing page</Link>, or add a code you were given.</p>}
          <div className="list">
            {p.plans!.map((x) => (
              <div className="item" key={x.code}>
                <span>
                  <b>{x.name}</b>{x.team ? ` · ${x.team}` : ""}
                  <span className="muted small" style={{ display: "block" }}>
                    <span className="mono">{x.code}</span> · {x.eventsLeft != null ? `${x.eventsLeft} event${x.eventsLeft === 1 ? "" : "s"} left · ` : ""}
                    {x.status === "Active" ? `valid until ${fmtDate(x.expiresAt)}` : x.status}
                  </span>
                </span>
                {x.usable && x.audience !== "corporate" && x.audience !== "group"
                  ? <button className="btn sm" onClick={() => useForHosting(x.code)}>Host with it</button>
                  : x.usable ? <Link className="btn ghost sm" href={x.team ? "/team" : `/team/new?code=${encodeURIComponent(x.code)}`}>{x.team ? "Team" : "Set up team"}</Link>
                  : <span className="badge warn">{x.status}</span>}
              </div>
            ))}
          </div>
          <form className="inline" onSubmit={addCode}>
            <label>Add a code to my account<input id="claim" className="code" value={claim} onChange={(e) => setClaim(e.target.value.toUpperCase())} placeholder="ABCD-EFGH-JKLM" /></label>
            <button className="btn ghost">Add</button>
          </form>
        </div>
        <div className="card">
          <h3>Recent games</h3>
          {p.history!.length === 0 && <p className="muted">Your games appear here once you play while signed in. <Link href="/">Play now</Link>.</p>}
          <div className="list">
            {p.history!.map((h) => (
              <div className="item" key={h.code}>
                <span>
                  {MODE_LABEL[h.mode] ?? h.mode} · {fmtDate(h.created_at)}
                  <span className="muted small" style={{ display: "block" }}>
                    {h.finished ? `Finished ${h.rank} of ${h.players}` : "In progress"}{h.tags ? ` · ${h.tags} tagged` : ""}{h.team ? ` · ${h.team} team` : ""}
                  </span>
                </span>
                <span className="num">{h.score}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
