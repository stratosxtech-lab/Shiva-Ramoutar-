"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Nav } from "@/components/ui";
import { InstallPrompt } from "@/components/pwa";

const MODES = [
  { id: "classic", label: "Classic", note: "One seeker. Found hiders sit out." },
  { id: "infection", label: "Infection", note: "Found hiders join the seekers." },
  { id: "shadow", label: "Shadow Teams", note: "Two teams. Red hides while Blue seeks, then they swap. Needs 4 or more players." },
  { id: "duel", label: "Decoy Duel", note: "Hiders get 3 decoys. Each seeker gets one 20-second reveal that cuts through them." },
  { id: "indoor", label: "Indoor", note: "For homes and offices. No GPS needed: find hiders by their chirps." },
];

type Config = { newGames: boolean; freeHosting: boolean } & Record<string, boolean>;
type Me = { user: { name: string } | null; plans?: { code: string; name: string; maxPlayers: number; usable: boolean; team: string | null }[] };

async function post(url: string, data: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Something went wrong. Try again.");
  return json;
}

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [mode, setMode] = useState("classic");
  const [minutes, setMinutes] = useState(15);
  const [headStart, setHeadStart] = useState(60);
  const [radius, setRadius] = useState(200);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [access, setAccess] = useState("");
  const [accessInfo, setAccessInfo] = useState<{ valid: boolean; plan?: string; message: string } | null>(null);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let saved = "";
    try { saved = localStorage.getItem("hs:name") ?? ""; } catch {}
    setName(saved);
    const c = new URLSearchParams(location.search).get("join");
    if (c) setCode(c.toUpperCase());
    try { setAccess(localStorage.getItem("hs:access") ?? ""); } catch {}
    fetch("/api/config").then((r) => r.json()).then((j) => setCfg(j.settings)).catch(() => {});
    fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).then((j: Me) => {
      setMe(j);
      if (j.user && !saved) setName(j.user.name);
    }).catch(() => {});
  }, []);

  // Check the access or host code as it's typed, so the host sees which plan it unlocks.
  useEffect(() => {
    const v = access.trim();
    if (v.replace(/[^A-Za-z0-9]/g, "").length < 12) { setAccessInfo(null); return; }
    const t = setTimeout(() => {
      post("/api/access", { code: v }).then(setAccessInfo).catch(() => setAccessInfo(null));
    }, 300);
    return () => clearTimeout(t);
  }, [access]);

  const paid = !!accessInfo?.valid;
  useEffect(() => { if (!paid && mode !== "classic") setMode("classic"); }, [paid, mode]);

  async function go(kind: "host" | "join") {
    setError("");
    if (!name.trim()) return setError("Enter your name to play.");
    if (kind === "join" && !code.trim()) return setError("Enter the game code from the host.");
    setBusy(true);
    try {
      try { localStorage.setItem("hs:name", name.trim()); localStorage.setItem("hs:access", access.trim()); } catch {}
      const r = kind === "host"
        ? await post("/api/games", { name, mode, roundMinutes: minutes, headStart, radius, accessCode: access })
        : await post(`/api/games/${encodeURIComponent(code.trim().toUpperCase())}/join`, { name });
      try { localStorage.setItem(`hs:p:${r.code}`, r.playerId); } catch {}
      router.push(`/g/${r.code}?p=${r.playerId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const usablePlans = me?.plans?.filter((p) => p.usable) ?? [];
  const modes = MODES.filter((m) => m.id === "classic" || cfg?.[m.id] !== false);

  return (
    <>
      <Nav current="play" signedIn={!!me?.user} />
      <div className="row between">
        <h1>Hide <span>&amp;</span> Seek</h1>
      </div>
      <InstallPrompt />
      {cfg && !cfg.newGames && <div className="notice">New games are paused for maintenance. Games already running carry on.</div>}
      <p className="muted">
        Real-world hide and seek. Everyone plays on their own phone, in the same park, office or campus.
        {me && !me.user && <> <Link href="/account">Sign in</Link> to keep your scores and plans.</>}
      </p>

      <label>Your name
        <input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="e.g. Shiva" autoComplete="nickname" />
      </label>

      {error && <div className="error" role="alert">{error}</div>}

      <div className="card">
        <h3>Join a game</h3>
        <input id="code" className="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="LANTERN-42" aria-label="Game code" />
        <button className="btn ghost" disabled={busy} onClick={() => go("join")}>Join game</button>
      </div>

      <div className="card">
        <h3>Host a game</h3>
        <div className="chips" role="group" aria-label="Mode">
          {modes.map((m) => {
            const locked = m.id !== "classic" && !paid;
            return (
              <button key={m.id} className="chip" aria-pressed={mode === m.id} disabled={locked}
                title={locked ? "Needs a paid plan" : undefined} onClick={() => setMode(m.id)}>
                {m.label}{locked ? " · paid" : ""}
              </button>
            );
          })}
        </div>
        <p className="muted">{MODES.find((m) => m.id === mode)?.note}</p>
        <div className="grid2">
          <label>{mode === "shadow" ? "Total length (two halves)" : "Round length"}
            <select id="minutes" value={minutes} onChange={(e) => setMinutes(+e.target.value)}>
              {[5, 10, 15, 20, 30].map((m) => <option key={m} value={m}>{m} minutes</option>)}
            </select>
          </label>
          <label>Head start
            <select id="head" value={headStart} onChange={(e) => setHeadStart(+e.target.value)}>
              {[30, 60, 90, 120].map((s) => <option key={s} value={s}>{s} seconds</option>)}
            </select>
          </label>
        </div>
        {mode !== "indoor" && (
          <label>Play zone size
            <select id="radius" value={radius} onChange={(e) => setRadius(+e.target.value)}>
              <option value={75}>Small: 75 m radius (garden, office floor)</option>
              <option value={200}>Medium: 200 m radius (park)</option>
              <option value={400}>Large: 400 m radius (campus)</option>
            </select>
          </label>
        )}
        {usablePlans.length > 0 && (
          <label>Use a plan from your account
            <select id="my-plan" value={usablePlans.some((p) => p.code === access) ? access : ""} onChange={(e) => setAccess(e.target.value)}>
              <option value="">Free (no plan)</option>
              {usablePlans.map((p) => <option key={p.code} value={p.code}>{p.name}{p.team ? ` · ${p.team}` : ""} · up to {p.maxPlayers} players</option>)}
            </select>
          </label>
        )}
        <label>Access or host code (optional)
          <input id="access" className="code" value={access} onChange={(e) => setAccess(e.target.value.toUpperCase())} placeholder="ABCD-EFGH-JKLM" />
        </label>
        {accessInfo && <p className={accessInfo.valid ? "notice" : "error"}>{accessInfo.valid ? `Unlocked: ${accessInfo.message}` : accessInfo.message}</p>}
        {!access && <p className="muted">Free: Classic mode, up to 6 players. <Link href="/pricing">See plans</Link> for every mode and bigger groups.</p>}
        <button className="btn" disabled={busy || (cfg ? !cfg.newGames : false)} onClick={() => go("host")}>Host game</button>
      </div>

      <p className="muted">Location is shared only during a game and is never shown to other players. Seekers see a warm zone, not your exact position.</p>
    </>
  );
}
