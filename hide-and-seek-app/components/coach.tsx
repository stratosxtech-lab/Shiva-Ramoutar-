"use client";

import { useEffect, useState } from "react";

type Role = "seeker" | "hider";
export type CoachInput = {
  status: "lobby" | "live" | "ended";
  phase: "lobby" | "hiding" | "seeking" | "ended";
  role: Role;
  found: boolean;
  isHost: boolean;
  players: number;
  mode: string;
  secondsLeft: number;
  hidersLeft: number;
  half: number;
  team: "red" | "blue" | null;
};

const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, Math.ceil(s)) % 60).padStart(2, "0")}`;

/** One plain instruction for this moment of the game: what you are, and the single thing to do next. */
export function coachFor(c: CoachInput): { tone: "seeker" | "hider" | "neutral"; title: string; body: string } {
  if (c.status === "lobby") {
    if (!c.isHost) return { tone: "neutral", title: "You're in!", body: "Wait here. The game starts when the host taps Start." };
    if (c.players < 2) return { tone: "neutral", title: "Invite your players", body: "Ask everyone to open Hide & Seek, tap Join a game and type the code above." };
    return { tone: "neutral", title: `${c.players} players are in`, body: "Stand in the middle of where you want to play, then tap Start game." };
  }
  if (c.status === "ended") return { tone: "neutral", title: "Game over", body: "See who won below, then host a new game for another round." };
  const indoor = c.mode === "indoor";
  if (c.role === "hider" && c.found) {
    return c.mode === "infection"
      ? { tone: "seeker", title: "You were found, now you're a seeker!", body: "Help find the others. Scan their QR code when you catch them." }
      : { tone: "neutral", title: "You were found", body: "You're out for this round. Watch the scores until the game ends." };
  }
  if (c.phase === "hiding") {
    return c.role === "hider"
      ? { tone: "hider", title: `Go hide! ${mmss(c.secondsLeft)} left`, body: indoor ? "Find a hiding spot in the building. Turn on the chirp sound below." : "Find a hiding spot inside the play zone. Turn on the chirp sound below." }
      : { tone: "seeker", title: `Count to ${Math.round(c.secondsLeft)}…`, body: "Stay where you are and don't peek. The hunt starts when the timer hits zero." };
  }
  if (c.role === "hider") {
    return { tone: "hider", title: "Stay hidden", body: "Keep still and quiet. If a seeker finds you, show them your QR code so they can scan it." };
  }
  return indoor
    ? { tone: "seeker", title: `Find them! ${c.hidersLeft} still hiding`, body: "Listen for chirps from the hiders' phones. When you find someone, tap Scan their QR code." }
    : { tone: "seeker", title: `Find them! ${c.hidersLeft} still hiding`, body: "The orange circle shows roughly where hiders are. Walk there, search, and scan the QR code of anyone you find." };
}

export function Coach({ c }: { c: CoachInput }) {
  const t = coachFor(c);
  const bg = t.tone === "seeker" ? "rgba(255,123,92,.16)" : t.tone === "hider" ? "rgba(244,183,64,.14)" : "var(--dusk-2)";
  const edge = t.tone === "seeker" ? "var(--ember)" : t.tone === "hider" ? "var(--lantern)" : "var(--dusk-3)";
  return (
    <div className="card coach" style={{ background: bg, borderLeft: `4px solid ${edge}` }} role="status" aria-live="polite">
      <h2 style={{ fontSize: 21 }}>{t.title}</h2>
      <p>{t.body}</p>
    </div>
  );
}

/** Full-screen "You are the Seeker" moment at the start of a game (and at Shadow Teams half-time). */
export function RoleReveal({ game, role, half, team, mode }: { game: string; role: Role; half: number; team: "red" | "blue" | null; mode: string }) {
  const key = `hs:reveal:${game}:${half}:${role}`;
  const [show, setShow] = useState(false);
  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(key) === "1"; } catch {}
    if (!seen) setShow(true);
  }, [key]);
  if (!show) return null;
  const close = () => { setShow(false); try { localStorage.setItem(key, "1"); } catch {} };
  const seeker = role === "seeker";
  const steps = seeker
    ? ["Wait and count while the hiders get their head start.", mode === "indoor" ? "Then listen for chirps from the hiders' phones." : "Then follow the orange circle on your map.", "Found someone? Scan the QR code on their phone."]
    : ["Hide before the head start runs out.", mode === "indoor" ? "Your phone chirps every minute, so pick your spot well." : "Stay inside the dashed circle on your map.", "If you're found, show the seeker your QR code."];
  return (
    <div className="reveal" role="dialog" aria-modal="true" aria-labelledby="reveal-title" onClick={close}>
      <div className="reveal-card" onClick={(e) => e.stopPropagation()} style={{ borderColor: seeker ? "var(--ember)" : "var(--lantern)" }}>
        {team && <span className="eyebrow">{team === "red" ? "Red" : "Blue"} team · half {half} of 2</span>}
        <span className={`role ${role} reveal-badge`}>{seeker ? "Seeker" : "Hider"}</span>
        <h1 id="reveal-title">You&apos;re {seeker ? "the Seeker" : "a Hider"}</h1>
        <ol>{steps.map((s) => <li key={s}>{s}</li>)}</ol>
        <button className={`btn ${seeker ? "ember" : ""}`} onClick={close} autoFocus>Got it</button>
      </div>
    </div>
  );
}

/** Explains what each mark on the radar means. */
export function RadarLegend({ seeker }: { seeker: boolean }) {
  return (
    <div className="legend" aria-label="Map key">
      <span><i style={{ background: seeker ? "var(--mist)" : "var(--lantern)" }} />You</span>
      <span><i className="ring" />Play zone</span>
      {seeker && <span><i style={{ background: "rgba(255,123,92,.5)", border: "2px solid var(--ember)" }} />Hiders are somewhere in here</span>}
    </div>
  );
}
