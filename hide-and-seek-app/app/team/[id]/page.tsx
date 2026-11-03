"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Nav, Toggle, api, fmtDate } from "@/components/ui";
import { ReportView, type ReportData } from "@/components/report";

type Member = { id: string; name: string; email: string; role: "owner" | "admin" | "host"; host_code: string; active: boolean; games: number };
type Overview = {
  team: { id: string; name: string; createdAt: string };
  plan: { id: string; name: string; maxPlayers: number; eventsLeft: number | null; expiresAt: string; gamesHosted: number; accessCode: string };
  settings: Record<string, boolean>;
  members: Member[];
  games: { code: string; mode: string; status: string; created_at: string; players: number; host: string | null; winner: string | null }[];
  stats: { members: number; games: number; players: number };
};

const TEAM_SETTINGS: { key: string; label: string; help: string }[] = [
  { key: "membersHost", label: "Members can host games", help: "When off, only you and team admins can host." },
  { key: "infection", label: "Infection mode", help: "Found hiders join the seekers." },
  { key: "shadow", label: "Shadow Teams mode", help: "Two teams take turns hiding and seeking." },
  { key: "duel", label: "Decoy Duel mode", help: "Three decoys per hider and one reveal pulse per seeker." },
  { key: "indoor", label: "Indoor mode", help: "No GPS. Players find hiders by their chirps." },
  { key: "decoys", label: "Decoy signals", help: "Each hider can drop one decoy per round." },
  { key: "chirp", label: "Chirp sound", help: "Hiders' phones chirp every 2 minutes." },
  { key: "tagRange", label: "60 m tag range check", help: "Seekers must be close to tag. Turn off for indoor play where GPS is weak." },
  { key: "liveScores", label: "Live scores during games", help: "Players see the scoreboard while playing." },
];
const TABS = ["Members", "Report", "Settings", "Games", "Plan"] as const;
const MODE_LABEL: Record<string, string> = { classic: "Classic", infection: "Infection", shadow: "Shadow Teams", duel: "Decoy Duel", indoor: "Indoor" };

export default function TeamDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [key, setKey] = useState<string | null>(null);
  const [d, setD] = useState<Overview | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Members");
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", role: "host" });
  const [copied, setCopied] = useState("");

  useEffect(() => {
    const fromHash = new URLSearchParams(location.hash.slice(1)).get("key");
    let k = fromHash;
    try { k = fromHash || localStorage.getItem(`hs:team:${id}`); } catch {}
    if (fromHash) {
      try { localStorage.setItem(`hs:team:${id}`, fromHash); } catch {}
      history.replaceState(null, "", location.pathname);
    }
    setKey(k ?? "");
  }, [id]);

  const call = useCallback(async (path = "", init: { method?: string; body?: unknown } = {}) => {
    if (!key) return;
    setError("");
    try {
      const r = await api<Overview>(`/api/teams/${id}${path}`, { ...init, headers: { "x-team-key": key } });
      setD(r);
      try {
        const list: { id: string; name: string }[] = JSON.parse(localStorage.getItem("hs:teams") ?? "[]");
        if (!list.some((t) => t.id === id)) localStorage.setItem("hs:teams", JSON.stringify([...list, { id, name: r.team.name }]));
      } catch {}
    } catch (e) { setError((e as Error).message); }
  }, [id, key]);

  useEffect(() => { if (key) call(); }, [key, call]);

  async function copy(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); setCopied(label); setTimeout(() => setCopied(""), 2500); } catch {}
  }

  if (key === "") {
    return (
      <div className="wide" style={{ maxWidth: 560 }}>
        <Nav current="team" />
        <h1>Team dashboard</h1>
        <p className="error">Open this dashboard with the private link you saved when you set up your team.</p>
        <Link className="btn ghost" href="/team">Back</Link>
      </div>
    );
  }
  if (!d) return <div className="wide"><Nav current="team" />{error ? <p className="error">{error}</p> : <p className="muted">Loading your team…</p>}</div>;

  const expired = new Date(d.plan.expiresAt).getTime() < Date.now();
  const owner = d.members.find((m) => m.role === "owner");

  return (
    <div className="wide">
      <Nav current="team" />
      <div className="row between" style={{ flexWrap: "wrap" }}>
        <div className="section-title">
          <span className="eyebrow">Team dashboard · super user</span>
          <h1>{d.team.name}</h1>
        </div>
        <span className={`badge ${expired ? "warn" : "ok"}`}>{expired ? "Plan expired" : d.plan.name}</span>
      </div>
      {error && <div className="error" role="alert">{error}</div>}

      <div className="stats">
        <div className="stat"><b>{d.plan.eventsLeft ?? "∞"}</b><small>{d.plan.eventsLeft == null ? "Unlimited events" : "Events left"}</small></div>
        <div className="stat"><b>{d.plan.maxPlayers}</b><small>Players per game</small></div>
        <div className="stat"><b>{d.stats.members}</b><small>Active hosts</small></div>
        <div className="stat"><b>{d.stats.games}</b><small>Games played</small></div>
        <div className="stat"><b>{d.stats.players}</b><small>Total players</small></div>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((t) => <button key={t} role="tab" className="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {tab === "Members" && (
        <>
          <p className="muted">Each person gets their own host code. They enter it on the Play page when hosting, and the game uses your team&apos;s plan and settings. Players who only join games don&apos;t need a code.</p>
          <form className="card" onSubmit={(e) => { e.preventDefault(); call("/members", { body: form }).then(() => setForm({ name: "", email: "", role: "host" })); }}>
            <h3>Add a host</h3>
            <div className="inline">
              <label>Name<input id="m-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
              <label>Email (optional)<input id="m-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
              <label>Role
                <select id="m-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="host">Host: can run games</option>
                  <option value="admin">Admin: can run games even when hosting is limited</option>
                </select>
              </label>
              <button className="btn">Add</button>
            </div>
          </form>
          {copied && <p className="notice" role="status">{copied} copied.</p>}
          <div className="tbl"><table>
            <thead><tr><th>Name</th><th>Role</th><th>Host code</th><th>Games</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {d.members.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}{m.email && <div className="muted small">{m.email}</div>}</td>
                  <td>
                    {m.role === "owner" ? <span className="badge ok">Owner</span> : (
                      <select aria-label={`Role for ${m.name}`} value={m.role} onChange={(e) => call(`/members/${m.id}`, { method: "PATCH", body: { role: e.target.value } })} style={{ width: "auto" }}>
                        <option value="host">Host</option><option value="admin">Admin</option>
                      </select>
                    )}
                  </td>
                  <td><button className="btn ghost sm mono" onClick={() => copy(m.host_code, `${m.name}'s host code`)} title="Copy">{m.host_code}</button></td>
                  <td className="mono">{m.games}</td>
                  <td>
                    {m.role === "owner" ? <span className="badge ok">Active</span> : (
                      <button type="button" role="switch" className="switch" aria-checked={m.active} aria-label={`${m.name} can host`}
                        onClick={() => call(`/members/${m.id}`, { method: "PATCH", body: { active: !m.active } })} />
                    )}
                  </td>
                  <td>{m.role !== "owner" && <RemoveButton name={m.name} onConfirm={() => call(`/members/${m.id}`, { method: "PATCH", body: { remove: true } })} />}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {owner && <p className="muted">Your own host code is {owner.host_code}. Use it to host games yourself.</p>}
        </>
      )}

      {tab === "Report" && key && <ReportPanel id={id} teamKey={key} />}

      {tab === "Settings" && (
        <div className="card" style={{ maxWidth: 680 }}>
          <h3>Team settings</h3>
          <p className="muted">These apply to every new game hosted with your team&apos;s codes. A feature the app owner has switched off stays off.</p>
          <div className="toggles">
            {TEAM_SETTINGS.map((s) => (
              <Toggle key={s.key} id={`t-${s.key}`} label={s.label} help={s.help} checked={d.settings[s.key]}
                onChange={(v) => { setD({ ...d, settings: { ...d.settings, [s.key]: v } }); call("/settings", { method: "PATCH", body: { [s.key]: v } }); }} />
            ))}
          </div>
        </div>
      )}

      {tab === "Games" && (
        <div className="tbl"><table>
          <thead><tr><th>Date</th><th>Game</th><th>Host</th><th>Mode</th><th>Players</th><th>Winner</th><th>Status</th></tr></thead>
          <tbody>
            {d.games.length === 0 && <tr><td colSpan={7} className="muted">No games yet. Games appear here once a host uses their code.</td></tr>}
            {d.games.map((g) => (
              <tr key={g.code}>
                <td>{fmtDate(g.created_at)}</td><td className="mono">{g.code}</td><td>{g.host ?? "Owner"}</td>
                <td>{MODE_LABEL[g.mode] ?? g.mode}</td><td className="mono">{g.players}</td>
                <td>{g.winner ?? "—"}</td>
                <td><span className={`badge ${g.status === "ended" ? "" : "ok"}`}>{g.status === "ended" ? "Finished" : g.status === "live" ? "Live" : "Lobby"}</span></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}

      {tab === "Plan" && (
        <div className="card" style={{ maxWidth: 560 }}>
          <h3>{d.plan.name}</h3>
          <div className="kv">
            <div><b>{d.plan.eventsLeft ?? "Unlimited"}</b><small>Events left</small></div>
            <div><b>{d.plan.maxPlayers}</b><small>Players per game</small></div>
            <div><b>{fmtDate(d.plan.expiresAt)}</b><small>{expired ? "Expired on" : "Valid until"}</small></div>
            <div><b>{d.plan.gamesHosted}</b><small>Games hosted</small></div>
          </div>
          <p className="muted">Purchase code {d.plan.accessCode}. Need more events or players? <Link href="/pricing">See plans</Link>.</p>
        </div>
      )}
    </div>
  );
}

function RemoveButton({ name, onConfirm }: { name: string; onConfirm: () => void }) {
  const [ask, setAsk] = useState(false);
  if (!ask) return <button className="btn ghost sm" onClick={() => setAsk(true)}>Remove</button>;
  return (
    <span className="row">
      <button className="btn ember sm" onClick={() => { setAsk(false); onConfirm(); }}>Remove {name}</button>
      <button className="btn ghost sm" onClick={() => setAsk(false)}>Cancel</button>
    </span>
  );
}

function ReportPanel({ id, teamKey }: { id: string; teamKey: string }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [r, setR] = useState<ReportData | null>(null);
  const [error, setError] = useState("");
  const q = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();

  useEffect(() => {
    api<ReportData>(`/api/teams/${id}/report${q ? `?${q}` : ""}`, { headers: { "x-team-key": teamKey } }).then(setR).catch((e) => setError(e.message));
  }, [id, teamKey, q]);

  async function download() {
    setError("");
    try {
      const res = await fetch(`/api/teams/${id}/report?format=csv${q ? `&${q}` : ""}`, { headers: { "x-team-key": teamKey } });
      if (!res.ok) throw new Error("The report couldn't be downloaded. Try again.");
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement("a"), { href: url, download: "hide-and-seek-report.csv" });
      a.click(); URL.revokeObjectURL(url);
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <>
      <div className="card">
        <h3>Leadership report</h3>
        <p className="muted">Engagement across your team&apos;s games. Choose a period, then download a spreadsheet or open a printable version to save as PDF.</p>
        <div className="inline">
          <label>From<input id="r-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>To<input id="r-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <button className="btn ghost" type="button" onClick={download}>Download spreadsheet</button>
          <a className="btn" href={`/team/${id}/report${q ? `?${q}` : ""}`} target="_blank" rel="noreferrer">Printable report</a>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {r ? <ReportView r={r} /> : !error && <p className="muted">Building your report…</p>}
    </>
  );
}
