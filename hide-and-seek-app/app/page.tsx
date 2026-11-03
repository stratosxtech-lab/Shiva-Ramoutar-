"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Nav } from "@/components/ui";
import { InstallPrompt } from "@/components/pwa";

const MODES = [
  { id: "classic", label: "Classic", note: "One seeker finds everyone else. The best way to start.", players: "2+ players" },
  { id: "infection", label: "Infection", note: "Each hider who's found becomes a seeker too.", players: "3+ players" },
  { id: "shadow", label: "Shadow Teams", note: "Two teams. Red hides, Blue seeks, then you swap.", players: "4+ players" },
  { id: "duel", label: "Decoy Duel", note: "Hiders can send seekers the wrong way with decoys.", players: "3+ players" },
  { id: "indoor", label: "Indoor", note: "For a house or office. No GPS: listen for chirps.", players: "2+ players" },
];

type Config = { newGames: boolean; freeHosting: boolean; demoModes: boolean } & Record<string, boolean>;
type Me = { user: { name: string } | null; plans?: { code: string; name: string; maxPlayers: number; usable: boolean; team: string | null }[] };

async function post(url: string, data: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Something went wrong. Try again.");
  return json;
}

export default function Home() {
  const router = useRouter();
  const [view, setView] = useState<"choose" | "host" | "join">("choose");
  const [name, setName] = useState("");
  const [mode, setMode] = useState("classic");
  const [minutes, setMinutes] = useState(10);
  const [headStart, setHeadStart] = useState(60);
  const [radius, setRadius] = useState(200);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [access, setAccess] = useState("");
  const [accessInfo, setAccessInfo] = useState<{ valid: boolean; plan?: string; message: string } | null>(null);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [intro, setIntro] = useState(false);

  useEffect(() => {
    let saved = "";
    try { saved = localStorage.getItem("hs:name") ?? ""; } catch {}
    setName(saved);
    const c = new URLSearchParams(location.search).get("join");
    if (c) { setCode(c.toUpperCase()); setView("join"); }
    try { setAccess(localStorage.getItem("hs:access") ?? ""); } catch {}
    try { if (!c && localStorage.getItem("hs:intro-seen") !== "1") setIntro(true); } catch {}
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

  const paid = !!accessInfo?.valid || !!cfg?.demoModes;
  useEffect(() => { if (!paid && mode !== "classic") setMode("classic"); }, [paid, mode]);

  async function go(kind: "host" | "join") {
    setError("");
    if (!name.trim()) return setError("Enter your name first.");
    if (kind === "join" && !code.trim()) return setError("Enter the game code from the host's screen.");
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

  const closeIntro = () => { setIntro(false); try { localStorage.setItem("hs:intro-seen", "1"); } catch {} };
  const usablePlans = me?.plans?.filter((p) => p.usable) ?? [];
  const modes = MODES.filter((m) => m.id === "classic" || cfg?.[m.id] !== false);
  const nameField = (
    <label>Your name
      <input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="e.g. Shiva" autoComplete="nickname" />
    </label>
  );

  return (
    <>
      <Nav current="play" signedIn={!!me?.user} />
      {intro && <Intro onClose={closeIntro} />}

      {view === "choose" && (
        <>
          <div className="hero">
            <h1>Hide <span>&amp;</span> Seek</h1>
            <p className="lede">Real hide and seek, played with your phones. Hiders hide, seekers hunt, and the app keeps it fair.</p>
          </div>
          <InstallPrompt />
          {cfg && !cfg.newGames && <div className="notice">New games are paused for maintenance. Games already running carry on.</div>}
          <button className="btn big" onClick={() => setView("host")}>Host a game</button>
          <button className="btn ghost big" onClick={() => setView("join")}>Join a game</button>
          <p className="muted center">Someone hosts, everyone else joins with the host&apos;s code.</p>
          <div className="card">
            <h3>How it works</h3>
            <ol className="steps">
              <li><b>Host</b> starts a game and shares a code.</li>
              <li><b>Friends join</b> with the code on their phones.</li>
              <li><b>Hiders hide</b> while the seeker counts.</li>
              <li><b>Seekers hunt</b> and scan a hider&apos;s QR code to catch them.</li>
            </ol>
            <Link href="/how-to-play" className="btn ghost">Read the full rules</Link>
          </div>
          {me && !me.user && <p className="muted center"><Link href="/account">Sign in</Link> to keep your scores and plans.</p>}
        </>
      )}

      {view === "join" && (
        <>
          <button className="back" onClick={() => { setView("choose"); setError(""); }}>← Back</button>
          <h1>Join a game</h1>
          <p className="muted">Ask the host for the code on their screen. It looks like LANTERN-42.</p>
          {error && <div className="error" role="alert">{error}</div>}
          {nameField}
          <label>Game code
            <input id="code" className="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="LANTERN-42" autoCapitalize="characters" />
          </label>
          <button className="btn big" disabled={busy} onClick={() => go("join")}>{busy ? "Joining…" : "Join game"}</button>
        </>
      )}

      {view === "host" && (
        <>
          <button className="back" onClick={() => { setView("choose"); setError(""); }}>← Back</button>
          <h1>Host a game</h1>
          {error && <div className="error" role="alert">{error}</div>}
          {nameField}

          <div className="field">
            <span className="field-label">Choose a game</span>
            <div className="mode-list" role="radiogroup" aria-label="Game mode">
              {modes.map((m) => {
                const locked = m.id !== "classic" && !paid;
                return (
                  <button key={m.id} role="radio" aria-checked={mode === m.id} disabled={locked}
                    className="mode-card" onClick={() => setMode(m.id)}>
                    <span className="row between"><b>{m.label}</b><small className="muted">{locked ? "Paid plan" : m.players}</small></span>
                    <span className="muted">{m.note}</span>
                  </button>
                );
              })}
            </div>
            {!paid && <p className="muted">Classic is free. <Link href="/pricing">See plans</Link> for the other games, or enter a code below.</p>}
          </div>

          <details className="card">
            <summary>Game settings: {mode === "shadow" ? `${minutes} minutes in two halves` : `${minutes} minute round`}, {headStart} second head start{mode !== "indoor" ? `, ${radius === 75 ? "small" : radius === 200 ? "medium" : "large"} area` : ""}</summary>
            <div className="grid2">
              <label>{mode === "shadow" ? "Total length" : "Round length"}
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
              <label>Play area
                <select id="radius" value={radius} onChange={(e) => setRadius(+e.target.value)}>
                  <option value={75}>Small: a garden or one office floor (75 m)</option>
                  <option value={200}>Medium: a park (200 m)</option>
                  <option value={400}>Large: a campus (400 m)</option>
                </select>
              </label>
            )}
          </details>

          <details className="card" open={!!access || usablePlans.length > 0}>
            <summary>Have a plan or code?</summary>
            {usablePlans.length > 0 && (
              <label>Use a plan from your account
                <select id="my-plan" value={usablePlans.some((p) => p.code === access) ? access : ""} onChange={(e) => setAccess(e.target.value)}>
                  <option value="">Free (no plan)</option>
                  {usablePlans.map((p) => <option key={p.code} value={p.code}>{p.name}{p.team ? ` · ${p.team}` : ""} · up to {p.maxPlayers} players</option>)}
                </select>
              </label>
            )}
            <label>Access or host code
              <input id="access" className="code" value={access} onChange={(e) => setAccess(e.target.value.toUpperCase())} placeholder="ABCD-EFGH-JKLM" />
            </label>
            {accessInfo && <p className={accessInfo.valid ? "notice" : "error"}>{accessInfo.valid ? `Unlocked: ${accessInfo.message}` : accessInfo.message}</p>}
          </details>

          <button className="btn big" disabled={busy || (cfg ? !cfg.newGames : false)} onClick={() => go("host")}>{busy ? "Creating…" : "Create game"}</button>
          <p className="muted center">Next you&apos;ll get a code to share with your players.</p>
        </>
      )}
    </>
  );
}

const SLIDES = [
  { title: "Real hide and seek, on your phones", body: "Everyone plays in the same place, like a park, office or home. Each person uses their own phone." },
  { title: "One person hosts", body: "The host creates a game and gets a code. Everyone else taps Join a game and types that code." },
  { title: "Hiders hide, seekers hunt", body: "Hiders get a head start. The seeker's map shows roughly where hiders are, and the circle shrinks as time runs out." },
  { title: "Scan to catch", body: "When a seeker finds a hider, they scan the QR code on the hider's phone. Most points at the end wins." },
];

function Intro({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const last = i === SLIDES.length - 1;
  return (
    <div className="reveal" role="dialog" aria-modal="true" aria-labelledby="intro-title">
      <div className="reveal-card" style={{ borderColor: "var(--lantern)" }}>
        <span className="eyebrow">How to play · {i + 1} of {SLIDES.length}</span>
        <h1 id="intro-title" style={{ fontSize: 26 }}>{SLIDES[i].title}</h1>
        <p>{SLIDES[i].body}</p>
        <div className="dots" aria-hidden="true">{SLIDES.map((_, k) => <i key={k} className={k === i ? "on" : ""} />)}</div>
        <button className="btn" onClick={() => (last ? onClose() : setI(i + 1))} autoFocus>{last ? "Let's play" : "Next"}</button>
        {!last && <button className="back" onClick={onClose}>Skip</button>}
      </div>
    </div>
  );
}
