"use client";

import { useCallback, useEffect, useState } from "react";
import { Nav, Toggle, api, fmtDate } from "@/components/ui";
import { PLANS, PLAN_IDS } from "@/lib/plans";

type Data = {
  settings: Record<string, boolean>;
  settingInfo: Record<string, { label: string; help: string; team: boolean }>;
  codes: { code: string; display: string; plan: keyof typeof PLANS; label: string; uses_left: number | null; expires_at: string; games_hosted: number; created_at: string; team: string | null }[];
  leads: { id: string; kind: string; plan: string | null; name: string; email: string; company: string | null; team_size: number | null; event_date: string | null; message: string | null; created_at: string }[];
  teams: { id: string; name: string; plan: keyof typeof PLANS; members: number; games: number; created_at: string }[];
  totals: { games: number; players: number; games_week: number };
};
const TABS = ["Settings", "Access codes", "Sign-ups", "Teams"] as const;

export default function Admin() {
  const [key, setKey] = useState("");
  const [entered, setEntered] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Settings");
  const [error, setError] = useState("");
  const [issued, setIssued] = useState<{ display: string; plan: string } | null>(null);
  const [form, setForm] = useState({ plan: "group10", label: "", days: "" });

  const load = useCallback(async (k: string) => {
    setError("");
    try {
      const d = await api<Data>("/api/admin", { headers: { "x-admin-key": k } });
      setData(d); setKey(k);
      try { localStorage.setItem("hs:admin", k); } catch {}
    } catch (e) {
      setData(null); setError((e as Error).message);
      try { localStorage.removeItem("hs:admin"); } catch {}
    }
  }, []);

  useEffect(() => { try { const k = localStorage.getItem("hs:admin"); if (k) load(k); } catch {} }, [load]);

  async function toggle(k: string, v: boolean) {
    if (!data) return;
    setData({ ...data, settings: { ...data.settings, [k]: v } });
    try {
      const r = await api<{ settings: Record<string, boolean> }>("/api/admin/settings", { method: "PATCH", body: { [k]: v }, headers: { "x-admin-key": key } });
      setData((d) => d && { ...d, settings: r.settings });
    } catch (e) { setError((e as Error).message); load(key); }
  }

  async function issue(e: React.FormEvent) {
    e.preventDefault(); setError(""); setIssued(null);
    try {
      const r = await api<{ display: string; plan: string }>("/api/admin/codes", { body: { ...form, days: form.days || undefined }, headers: { "x-admin-key": key } });
      setIssued(r); setForm({ ...form, label: "" }); load(key);
    } catch (err) { setError((err as Error).message); }
  }

  if (!data) {
    return (
      <div className="wide">
        <Nav />
        <h1>Owner console</h1>
        <form className="card" onSubmit={(e) => { e.preventDefault(); load(entered); }} style={{ maxWidth: 460 }}>
          <p className="muted">Enter your admin key. You&apos;ll find it in Vercel under the hide-and-seek project, Settings, Environment Variables, ADMIN_KEY.</p>
          {error && <div className="error" role="alert">{error}</div>}
          <input id="admin-key" type="password" value={entered} onChange={(e) => setEntered(e.target.value)} placeholder="Admin key" autoComplete="current-password" />
          <button className="btn">Open console</button>
        </form>
      </div>
    );
  }

  const signups = data.leads.filter((l) => l.kind === "signup").length;
  const enquiries = data.leads.length - signups;

  return (
    <div className="wide">
      <div className="row between">
        <Nav current="admin" />
        <button className="btn ghost sm" onClick={() => { try { localStorage.removeItem("hs:admin"); } catch {} setData(null); setKey(""); }}>Sign out</button>
      </div>
      <div className="section-title"><span className="eyebrow">Owner console</span><h1>Hide &amp; Seek control centre</h1></div>
      {error && <div className="error" role="alert">{error}</div>}

      <div className="stats">
        <div className="stat"><b>{data.totals.games}</b><small>Games hosted</small></div>
        <div className="stat"><b>{data.totals.games_week}</b><small>Games this week</small></div>
        <div className="stat"><b>{data.totals.players}</b><small>Players</small></div>
        <div className="stat"><b>{data.teams.length}</b><small>Teams</small></div>
        <div className="stat"><b>{signups}</b><small>Early-access sign-ups</small></div>
        <div className="stat"><b>{enquiries}</b><small>Corporate enquiries</small></div>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((t) => <button key={t} role="tab" className="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {tab === "Settings" && (
        <div className="split">
          <div className="card">
            <h3>App controls</h3>
            <p className="muted">These apply to everyone, straight away.</p>
            <div className="toggles">
              {Object.entries(data.settingInfo).filter(([, i]) => !i.team).map(([k, i]) => (
                <Toggle key={k} id={`s-${k}`} label={i.label} help={i.help} checked={data.settings[k]} onChange={(v) => toggle(k, v)} />
              ))}
            </div>
          </div>
          <div className="card">
            <h3>Game features</h3>
            <p className="muted">Applies to new games. Teams can also switch these off for their own games.</p>
            <div className="toggles">
              {Object.entries(data.settingInfo).filter(([, i]) => i.team).map(([k, i]) => (
                <Toggle key={k} id={`s-${k}`} label={i.label} help={i.help} checked={data.settings[k]} onChange={(v) => toggle(k, v)} />
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "Access codes" && (
        <>
          <form className="card" onSubmit={issue}>
            <h3>Issue an access code</h3>
            <p className="muted">Use this after a customer pays by invoice. Once Stripe is connected, codes are issued automatically at checkout.</p>
            <div className="inline">
              <label>Plan
                <select id="code-plan" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
                  {PLAN_IDS.filter((p) => p !== "free").map((p) => <option key={p} value={p}>{PLANS[p].name} ({PLANS[p].price} {PLANS[p].cadence})</option>)}
                </select>
              </label>
              <label>Customer or note<input id="code-label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Acme Corp, invoice 1042" /></label>
              <label>Valid for (days)<input id="code-days" inputMode="numeric" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value.replace(/\D/g, "") })} placeholder={String(PLANS[form.plan as keyof typeof PLANS].validDays)} /></label>
              <button className="btn">Issue code</button>
            </div>
            {issued && (
              <div className="notice">
                New {PLANS[issued.plan as keyof typeof PLANS].name} code: <span className="mono" style={{ fontWeight: 700 }}>{issued.display}</span>.{" "}
                {PLANS[issued.plan as keyof typeof PLANS].audience === "individual"
                  ? "Send it to the customer. They enter it when hosting a game."
                  : "Send it to the buyer. They set up their team at /team/new and become its super user."}
              </div>
            )}
          </form>
          <div className="tbl"><table>
            <thead><tr><th>Code</th><th>Plan</th><th>Customer</th><th>Team</th><th>Events left</th><th>Games</th><th>Expires</th></tr></thead>
            <tbody>
              {data.codes.length === 0 && <tr><td colSpan={7} className="muted">No access codes yet. Issue your first one above.</td></tr>}
              {data.codes.map((c) => (
                <tr key={c.code}>
                  <td className="mono">{c.display}</td><td>{PLANS[c.plan]?.name ?? c.plan}</td><td>{c.label || "—"}</td><td>{c.team ?? "—"}</td>
                  <td className="mono">{c.uses_left ?? "Unlimited"}</td><td className="mono">{c.games_hosted}</td>
                  <td>{new Date(c.expires_at).getTime() < Date.now() ? <span className="badge warn">Expired</span> : fmtDate(c.expires_at)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </>
      )}

      {tab === "Sign-ups" && (
        <div className="tbl"><table>
          <thead><tr><th>Date</th><th>Type</th><th>Plan</th><th>Name</th><th>Email</th><th>Company</th><th>Size</th><th>Event date</th><th>Message</th></tr></thead>
          <tbody>
            {data.leads.length === 0 && <tr><td colSpan={9} className="muted">No sign-ups yet. They appear here when people use the pricing page.</td></tr>}
            {data.leads.map((l) => (
              <tr key={l.id}>
                <td>{fmtDate(l.created_at)}</td>
                <td><span className={`badge ${l.kind === "corporate" ? "ok" : ""}`}>{l.kind === "corporate" ? "Enquiry" : "Sign-up"}</span></td>
                <td>{l.plan ? PLANS[l.plan as keyof typeof PLANS]?.name : "—"}</td><td>{l.name}</td>
                <td className="small" style={{ userSelect: "all" }}>{l.email}</td><td>{l.company ?? "—"}</td>
                <td className="mono">{l.team_size ?? "—"}</td><td>{l.event_date ?? "—"}</td><td className="small">{l.message ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}

      {tab === "Teams" && (
        <div className="tbl"><table>
          <thead><tr><th>Team</th><th>Plan</th><th>Members</th><th>Games</th><th>Created</th></tr></thead>
          <tbody>
            {data.teams.length === 0 && <tr><td colSpan={5} className="muted">No teams yet. A team appears once a Group or Corporate buyer sets it up.</td></tr>}
            {data.teams.map((t) => (
              <tr key={t.id}><td>{t.name}</td><td>{PLANS[t.plan]?.name}</td><td className="mono">{t.members}</td><td className="mono">{t.games}</td><td>{fmtDate(t.created_at)}</td></tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );
}
