"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

type State = {
  now: number;
  game: {
    code: string; mode: "classic" | "infection"; status: "lobby" | "live" | "ended"; radiusM: number;
    roundSeconds: number; headStart: number; hasCenter: boolean; isHost: boolean;
    phase: "lobby" | "hiding" | "seeking" | "ended"; hideEndsAt: number | null; seekEndsAt: number | null;
    seekElapsed: number; progress: number; warmRadius: number;
  };
  me: {
    id: string; name: string; role: "seeker" | "hider"; tagCode: string | null; found: boolean; tags: number;
    pos: { x: number; y: number } | null; outside: boolean; decoyUsed: boolean; decoyActive: boolean; nearestSeeker: number | null;
  };
  players: { id: string; name: string; role: "seeker" | "hider"; isHost: boolean; found: boolean; wasHider: boolean; tags: number; score: number; hiddenSeconds: number | null }[];
  warmZone: { x: number; y: number; r: number } | null;
  hidersLeft: number;
  events: { id: string; at: number; text: string }[];
};

const COLORS = ["#F4B740", "#7FD6A8", "#8EC5FF", "#B9A6FF", "#FF9F87", "#E3D27A", "#9FE0E6", "#F7A8D0"];
const color = (s: string) => COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const initials = (n: string) => n.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const CHIRP_EVERY = 120;

async function post(url: string, data: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Something went wrong. Try again.");
  return json;
}

export default function Game({ code }: { code: string }) {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [s, setS] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [fatal, setFatal] = useState("");
  const [now, setNow] = useState(Date.now());
  const [loc, setLoc] = useState<"waiting" | "on" | "denied" | "unsupported">("waiting");
  const [busy, setBusy] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [toast, setToast] = useState("");
  const [sound, setSound] = useState(false);
  const offset = useRef(0);
  const coords = useRef<{ lat: number; lng: number } | null>(null);
  const lastSent = useRef(0);
  const lastChirp = useRef(-1);
  const audio = useRef<AudioContext | null>(null);

  // Who am I? The link carries the player id so each tab or phone is its own player.
  useEffect(() => {
    const fromUrl = new URLSearchParams(location.search).get("p");
    let id = fromUrl;
    try { id = fromUrl || localStorage.getItem(`hs:p:${code}`); } catch {}
    if (!id) { setFatal("join"); return; }
    try { localStorage.setItem(`hs:p:${code}`, id); } catch {}
    setPlayerId(id);
  }, [code]);

  const refresh = useCallback(async () => {
    if (!playerId) return;
    try {
      const res = await fetch(`/api/games/${encodeURIComponent(code)}?p=${playerId}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) { if (res.status === 403 || res.status === 404) setFatal(json.error); else setError(json.error); return; }
      offset.current = json.now - Date.now();
      setS(json);
    } catch {
      setError("Connection lost. Retrying…");
    }
  }, [code, playerId]);

  useEffect(() => {
    if (!playerId) return;
    refresh();
    const poll = setInterval(refresh, 2000);
    const tick = setInterval(() => setNow(Date.now()), 500);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [playerId, refresh]);

  const ended = s?.game.status === "ended";

  // Share location while the game is open. Sent every 5 seconds at most.
  useEffect(() => {
    if (!playerId || ended) return;
    if (!("geolocation" in navigator)) { setLoc("unsupported"); return; }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        coords.current = { lat: p.coords.latitude, lng: p.coords.longitude };
        setLoc("on");
        if (Date.now() - lastSent.current > 5000) {
          lastSent.current = Date.now();
          post(`/api/games/${encodeURIComponent(code)}/location`, { playerId, ...coords.current }).catch(() => {});
        }
      },
      (e) => setLoc(e.code === e.PERMISSION_DENIED ? "denied" : "waiting"),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [playerId, code, ended]);

  // Hiders' phones chirp every two minutes during the hunt.
  const seekElapsed = s && s.game.hideEndsAt ? Math.max(0, (now + offset.current - s.game.hideEndsAt) / 1000) : 0;
  const amHiding = s?.game.phase === "seeking" && s.me.role === "hider" && !s.me.found;
  useEffect(() => {
    if (!amHiding || !sound) return;
    const bucket = Math.floor(seekElapsed / CHIRP_EVERY);
    if (bucket > 0 && bucket !== lastChirp.current) { lastChirp.current = bucket; chirp(); }
    if (lastChirp.current === -1) lastChirp.current = bucket;
  });

  function chirp() {
    const ctx = audio.current;
    if (!ctx) return;
    [0, 0.18, 0.36].forEach((t, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 1900 + i * 250;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.14);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.16);
    });
  }
  function enableSound() {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audio.current = audio.current ?? new AC();
      audio.current.resume();
      setSound(true);
      chirp();
    } catch { setError("This browser can't play the chirp sound."); }
  }

  async function act(path: string, data: Record<string, unknown> = {}, ok?: (r: Record<string, unknown>) => string) {
    setError(""); setBusy(true);
    try {
      const r = await post(`/api/games/${encodeURIComponent(code)}/${path}`, { playerId, ...data });
      if (ok) { setToast(ok(r)); setTimeout(() => setToast(""), 4000); }
      await refresh();
      return true;
    } catch (e) { setError((e as Error).message); return false; }
    finally { setBusy(false); }
  }

  async function copyLink() {
    const url = `${location.origin}/?join=${code}`;
    try { await navigator.clipboard.writeText(url); setToast("Invite link copied."); }
    catch { setToast(url); }
    setTimeout(() => setToast(""), 4000);
  }

  if (fatal) {
    return (
      <>
        <h1>Hide <span>&amp;</span> Seek</h1>
        <div className="error">{fatal === "join" ? `You haven't joined ${code} on this device yet.` : fatal}</div>
        <Link className="btn" href={`/?join=${code}`}>Join {code}</Link>
      </>
    );
  }
  if (!s) return <p className="muted">Loading game {code}…</p>;

  const g = s.game;
  const serverNow = now + offset.current;
  const locBanner =
    loc === "denied" ? "Location is blocked. Allow location for this site in your browser settings so the game can work." :
    loc === "unsupported" ? "This browser can't share location. Try Safari or Chrome on your phone." :
    loc === "waiting" && !ended ? "Finding your location…" : "";

  return (
    <>
      <div className="row between">
        <h2>Hide <span style={{ color: "var(--lantern)" }}>&amp;</span> Seek</h2>
        <span className="role hider">{g.code}</span>
      </div>
      {locBanner && <div className="notice">{locBanner}</div>}
      {error && <div className="error" role="alert">{error}</div>}
      {toast && <div className="notice" role="status">{toast}</div>}

      {g.status === "lobby" && (
        <>
          <div className="card">
            <span className="eyebrow">Game code</span>
            <div className="bigcode">{g.code}</div>
            <button className="btn ghost" onClick={copyLink}>Copy invite link</button>
          </div>
          <div className="kv">
            <div><b>{g.mode === "infection" ? "Infection" : "Classic"}</b><small>Mode</small></div>
            <div><b>{g.roundSeconds / 60} min</b><small>Round length</small></div>
            <div><b>{g.headStart} s</b><small>Head start</small></div>
            <div><b>{g.radiusM} m</b><small>Zone radius</small></div>
          </div>
          <div className="card">
            <div className="row between"><h3>Players ({s.players.length})</h3><span className="muted">Seeker picked at random</span></div>
            <div className="list">
              {s.players.map((p) => (
                <div className="item" key={p.id}>
                  <span className="row"><span className="av" style={{ background: color(p.name) }}>{initials(p.name)}</span>{p.name}{p.id === s.me.id ? " (you)" : ""}</span>
                  {p.isHost && <span className="role hider">Host</span>}
                </div>
              ))}
            </div>
          </div>
          {g.isHost ? (
            <>
              <button className="btn" disabled={busy || s.players.length < 2} onClick={() => act("start", coords.current ?? {})}>
                {s.players.length < 2 ? "Waiting for at least 1 more player" : "Start game"}
              </button>
              <p className="muted">The play zone is centred on where you stand when you press Start.</p>
            </>
          ) : (
            <p className="notice">Waiting for the host to start the game.</p>
          )}
        </>
      )}

      {g.status === "live" && (
        <>
          <PhaseBanner s={s} serverNow={serverNow} />
          <Radar s={s} serverNow={serverNow} />
          {s.me.outside && <div className="error">You're outside the play zone. Head back towards the centre.</div>}

          {s.me.role === "seeker" && (
            <div className="card">
              <div className="row between"><h3>Tag a hider</h3><span className="role seeker">Seeker{s.me.tags ? ` · ${s.me.tags} tagged` : ""}</span></div>
              <p className="muted">Found someone? Enter the 4-digit code on their screen. You need to be within about 60 m.</p>
              <form className="row" onSubmit={async (e) => {
                e.preventDefault();
                if (await act("tag", { tagCode: tagInput }, (r) => `You found ${r.found}!`)) setTagInput("");
              }}>
                <input id="tag" className="code" inputMode="numeric" maxLength={4} value={tagInput}
                  onChange={(e) => setTagInput(e.target.value.replace(/\D/g, ""))} placeholder="0000" aria-label="Hider's code" />
                <button className="btn ember" style={{ width: "auto" }} disabled={busy || tagInput.length !== 4 || g.phase !== "seeking"}>Tag</button>
              </form>
            </div>
          )}

          {s.me.role === "hider" && !s.me.found && (
            <div className="card">
              <div className="row between"><h3>You&apos;re hiding</h3><span className="role hider">Hider</span></div>
              <p className="muted">If a seeker finds you, show them this code.</p>
              <div className="bigcode">{s.me.tagCode}</div>
              <Heat s={s} />
              {!sound
                ? <button className="btn ghost" onClick={enableSound}>Turn on chirp sound (required)</button>
                : <p className="muted">Chirp is on. Your phone will chirp every 2 minutes during the hunt.</p>}
              <button className="btn ghost" disabled={busy || s.me.decoyUsed || g.phase !== "seeking"} onClick={() => act("decoy", {}, () => "Decoy dropped. The warm zone is pulled away from you for 60 seconds.")}>
                {s.me.decoyActive ? "Decoy active" : s.me.decoyUsed ? "Decoy used" : "Drop decoy signal (1 per round)"}
              </button>
            </div>
          )}

          {s.me.role === "hider" && s.me.found && (
            <div className="card"><h3>You were found</h3><p className="muted">You&apos;re out for this round. Keep watching the scores.</p></div>
          )}

          <Feed s={s} />
          <Scores s={s} />
        </>
      )}

      {ended && <Results s={s} />}
    </>
  );
}

function PhaseBanner({ s, serverNow }: { s: State; serverNow: number }) {
  const g = s.game;
  if (g.phase === "hiding") {
    const left = clock(g.hideEndsAt! - serverNow);
    return (
      <div className="card" style={{ background: s.me.role === "seeker" ? "rgba(255,123,92,.14)" : "rgba(244,183,64,.12)" }}>
        <span className="eyebrow">Head start · {left}</span>
        <h2>{s.me.role === "seeker" ? "Close your eyes and count." : "Hide now!"}</h2>
        <p className="muted">{s.me.role === "seeker" ? "The hunt starts when the head start ends." : "Find a spot inside the play zone before time runs out."}</p>
      </div>
    );
  }
  return null;
}

function Radar({ s, serverNow }: { s: State; serverNow: number }) {
  const g = s.game;
  const R = g.radiusM * 1.15;
  const left = (g.phase === "hiding" ? g.hideEndsAt! : g.seekEndsAt!) - serverNow;
  return (
    <div className="radar">
      <svg viewBox={`${-R} ${-R} ${2 * R} ${2 * R}`} role="img" aria-label="Play zone radar">
        <rect x={-R} y={-R} width={2 * R} height={2 * R} fill="var(--grass)" />
        <circle r={g.radiusM * 0.33} fill="none" stroke="var(--path)" strokeWidth={R / 120} />
        <circle r={g.radiusM * 0.66} fill="none" stroke="var(--path)" strokeWidth={R / 120} />
        <line x1={-R} y1={0} x2={R} y2={0} stroke="var(--path)" strokeWidth={R / 120} />
        <line x1={0} y1={-R} x2={0} y2={R} stroke="var(--path)" strokeWidth={R / 120} />
        <circle r={g.radiusM} fill="rgba(244,183,64,.06)" stroke="var(--lantern)" strokeWidth={R / 90} strokeDasharray={`${R / 25} ${R / 35}`} />
        <WarmZone s={s} R={R} />
        {s.me.pos && (
          <g transform={`translate(${s.me.pos.x} ${-s.me.pos.y})`}>
            <circle r={R / 18} fill={s.me.role === "seeker" ? "var(--mist)" : "var(--lantern)"} />
            <circle r={R / 10} fill="none" stroke={s.me.role === "seeker" ? "var(--mist)" : "var(--lantern)"} strokeWidth={R / 120} opacity={0.5} />
          </g>
        )}
        <text x={0} y={-R + R / 9} textAnchor="middle" fill="var(--fog)" fontSize={R / 13} fontFamily="JetBrains Mono, monospace">N</text>
      </svg>
      <div className="hud">
        <span className="pill"><span className="dot" />{clock(left)}</span>
        <span className="pill">{s.hidersLeft} hiding</span>
      </div>
    </div>
  );
}

function WarmZone({ s, R }: { s: State; R: number }) {
  const z = s.warmZone;
  if (!z) return null;
  return (
    <g>
      <circle cx={z.x} cy={-z.y} r={z.r} fill="rgba(255,123,92,.2)" stroke="var(--ember)" strokeWidth={R / 90} />
      <text x={z.x} y={-z.y} textAnchor="middle" dominantBaseline="middle" fill="var(--ember)" fontSize={R / 12} fontWeight={700} fontFamily="JetBrains Mono, monospace">{z.r} m</text>
    </g>
  );
}

function Heat({ s }: { s: State }) {
  const d = s.me.nearestSeeker;
  if (d == null) return <p className="muted">Heat meter appears once seekers are sharing their location.</p>;
  const pct = Math.round(Math.max(4, Math.min(96, (1 - d / (s.game.radiusM * 1.5)) * 100)));
  return (
    <>
      <p className="muted">Nearest seeker is about <b style={{ color: "var(--mist)" }}>{d} m</b> away.</p>
      <div className="heat" aria-hidden="true"><i style={{ left: `${pct}%` }} /></div>
      <div className="row between muted"><span>Cold</span><span>Warm</span><span>Hot</span></div>
    </>
  );
}

function Feed({ s }: { s: State }) {
  return (
    <div className="feed" aria-live="polite">
      <h3>What&apos;s happening</h3>
      {s.events.slice(0, 6).map((e) => (
        <div className="clue" key={e.id}>
          <time>{new Date(e.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
          <span>{e.text}</span>
        </div>
      ))}
    </div>
  );
}

function Scores({ s }: { s: State }) {
  const rows = [...s.players].sort((a, b) => b.score - a.score);
  return (
    <div className="card">
      <h3>Live scores</h3>
      <div className="list">
        {rows.map((p) => (
          <div className="item" key={p.id}>
            <span className="row">
              <span className="av" style={{ background: color(p.name) }}>{initials(p.name)}</span>
              {p.name}{p.id === s.me.id ? " (you)" : ""}
            </span>
            <span className="row">
              <span className={`role ${p.found && p.role === "hider" ? "out" : p.role}`}>{p.found && p.role === "hider" ? "Found" : p.role}</span>
              <span className="num">{p.score}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Results({ s }: { s: State }) {
  const rows = [...s.players].sort((a, b) => b.score - a.score);
  const [first, second, third] = rows;
  const winner = first;
  const describe = (p: State["players"][number]) =>
    p.tags ? `${p.tags} tag${p.tags > 1 ? "s" : ""}` : p.hiddenSeconds != null ? `hid ${clock(Math.max(0, p.hiddenSeconds) * 1000)}` : "";
  return (
    <>
      <span className="eyebrow">Round complete</span>
      <h2>{winner ? `${winner.name} wins with ${winner.score} points` : "Round complete"}</h2>
      <div className="podium">
        {[second, first, third].map((p, i) => p ? (
          <div className={`p ${i === 1 ? "first" : ""}`} key={p.id}>
            <span className="av" style={{ background: color(p.name) }}>{initials(p.name)}</span>
            <span className="name">{p.name}</span>
            <div className="bar" style={{ height: [70, 100, 50][i] }}>{[2, 1, 3][i]}</div>
            <span className="num">{p.score}</span>
          </div>
        ) : <div key={i} />)}
      </div>
      <div className="card">
        <h3>Leaderboard</h3>
        <div className="list">
          {rows.map((p) => (
            <div className="item" key={p.id}>
              <span>{p.name}{p.id === s.me.id ? " (you)" : ""} <span className="muted">· {describe(p)}</span></span>
              <span className="num">{p.score}</span>
            </div>
          ))}
        </div>
      </div>
      <Feed s={s} />
      <Link className="btn" href="/">Host a new game</Link>
    </>
  );
}
