"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const MODES = [
  { id: "classic", label: "Classic", note: "One seeker. Found hiders sit out." },
  { id: "infection", label: "Infection", note: "Found hiders join the seekers." },
];
const SOON = ["Shadow Teams", "Decoy Duel", "Indoor"];

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

  useEffect(() => {
    try { setName(localStorage.getItem("hs:name") ?? ""); } catch {}
    const c = new URLSearchParams(location.search).get("join");
    if (c) setCode(c.toUpperCase());
  }, []);

  async function go(kind: "host" | "join") {
    setError("");
    if (!name.trim()) return setError("Enter your name to play.");
    if (kind === "join" && !code.trim()) return setError("Enter the game code from the host.");
    setBusy(true);
    try {
      try { localStorage.setItem("hs:name", name.trim()); } catch {}
      const r = kind === "host"
        ? await post("/api/games", { name, mode, roundMinutes: minutes, headStart, radius })
        : await post(`/api/games/${encodeURIComponent(code.trim().toUpperCase())}/join`, { name });
      try { localStorage.setItem(`hs:p:${r.code}`, r.playerId); } catch {}
      router.push(`/g/${r.code}?p=${r.playerId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="row between">
        <h1>Hide <span>&amp;</span> Seek</h1>
      </div>
      <p className="muted">Real-world hide and seek. Everyone plays on their own phone, in the same park, office or campus.</p>

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
          {MODES.map((m) => (
            <button key={m.id} className="chip" aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>{m.label}</button>
          ))}
          {SOON.map((s) => <button key={s} className="chip" disabled title="Coming soon">{s} · soon</button>)}
        </div>
        <p className="muted">{MODES.find((m) => m.id === mode)?.note}</p>
        <div className="grid2">
          <label>Round length
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
        <label>Play zone size
          <select id="radius" value={radius} onChange={(e) => setRadius(+e.target.value)}>
            <option value={75}>Small: 75 m radius (garden, office floor)</option>
            <option value={200}>Medium: 200 m radius (park)</option>
            <option value={400}>Large: 400 m radius (campus)</option>
          </select>
        </label>
        <button className="btn" disabled={busy} onClick={() => go("host")}>Host game</button>
      </div>

      <p className="muted">Location is shared only during a game and is never shown to other players. Seekers see a warm zone, not your exact position.</p>
    </>
  );
}
