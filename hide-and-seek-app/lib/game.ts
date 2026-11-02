import { randomUUID, randomInt } from "crypto";
import { db } from "./db";

export const MODES = ["classic", "infection"] as const;
export type Mode = (typeof MODES)[number];

const WORDS = ["LANTERN", "SHADOW", "MAPLE", "COMET", "FERN", "HARBOR", "EMBER", "OTTER", "BIRCH", "RAVEN", "CEDAR", "MOTH"];
export const MIN_RADIUS = 40;
export const TAG_RANGE_M = 60;
export const DECOY_SECONDS = 60;
export const LOCATION_FRESH_S = 60;

export type Game = {
  code: string; host_id: string; mode: Mode; status: "lobby" | "live" | "ended";
  round_seconds: number; head_start: number; radius_m: number;
  center_lat: number | null; center_lng: number | null;
  started_at: Date | null; ended_at: Date | null;
};
export type Player = {
  id: string; game_code: string; name: string; role: "seeker" | "hider"; tag_code: string;
  lat: number | null; lng: number | null; loc_at: Date | null;
  found_at: Date | null; found_by: string | null; tags: number;
  decoy_lat: number | null; decoy_lng: number | null; decoy_at: Date | null;
  score: number; joined_at: Date;
};

export class GameError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export const newId = () => randomUUID();

export function cleanName(v: unknown) {
  const s = String(v ?? "").trim().replace(/\s+/g, " ").slice(0, 24);
  if (!s) throw new GameError("Enter your name to play.");
  return s;
}

export function normalizeCode(v: unknown) {
  return String(v ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

export async function uniqueCode() {
  const sql = await db();
  for (let i = 0; i < 20; i++) {
    const code = `${WORDS[randomInt(WORDS.length)]}-${randomInt(10, 100)}`;
    const [hit] = await sql`SELECT 1 FROM hs_games WHERE code = ${code}`;
    if (!hit) return code;
  }
  return `GAME-${randomInt(1000, 10000)}`;
}

export async function uniqueTag(code: string) {
  const sql = await db();
  const rows = await sql<{ tag_code: string }[]>`SELECT tag_code FROM hs_players WHERE game_code = ${code}`;
  const used = new Set(rows.map((r) => r.tag_code));
  for (;;) {
    const t = String(randomInt(1000, 10000));
    if (!used.has(t)) return t;
  }
}

/** Distance in metres between two coordinates. */
export function distance(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Position relative to the zone centre, in metres (x east, y north). */
export function relative(g: Game, lat: number, lng: number) {
  const cLat = g.center_lat ?? lat, cLng = g.center_lng ?? lng;
  const y = (lat - cLat) * 111320;
  const x = (lng - cLng) * 111320 * Math.cos((cLat * Math.PI) / 180);
  return { x: Math.round(x), y: Math.round(y) };
}

export function timeline(g: Game, now = Date.now()) {
  if (!g.started_at) return { phase: "lobby" as const, hideEndsAt: null, seekEndsAt: null, seekElapsed: 0, progress: 0 };
  const start = new Date(g.started_at).getTime();
  const hideEndsAt = start + g.head_start * 1000;
  const seekEndsAt = hideEndsAt + g.round_seconds * 1000;
  const seekElapsed = Math.max(0, Math.min(g.round_seconds, (now - hideEndsAt) / 1000));
  const progress = seekElapsed / g.round_seconds;
  let phase: "hiding" | "seeking" | "ended" = now < hideEndsAt ? "hiding" : now < seekEndsAt ? "seeking" : "ended";
  if (g.status === "ended") phase = "ended";
  return { phase, hideEndsAt, seekEndsAt, seekElapsed, progress };
}

export function warmRadius(g: Game, progress: number) {
  return Math.round(g.radius_m - (g.radius_m - MIN_RADIUS) * Math.min(1, progress));
}

/** Score rules: hiders earn 1 point per 2 seconds unseen plus 200 for surviving; seekers earn 150 per tag. */
export function scoreFor(g: Game, p: Player, now = Date.now()) {
  const t = timeline(g, now);
  if (!t.hideEndsAt) return 0;
  const end = g.ended_at ? new Date(g.ended_at).getTime() : Math.min(now, t.seekEndsAt!);
  let pts = p.tags * 150;
  const wasHider = p.role === "hider" || !!p.found_at;
  if (wasHider) {
    const until = p.found_at ? new Date(p.found_at).getTime() : end;
    pts += Math.floor(Math.max(0, until - t.hideEndsAt) / 2000);
    if (!p.found_at && g.status === "ended") pts += 200;
  }
  return pts;
}

export async function loadGame(code: string) {
  const sql = await db();
  const [g] = await sql<Game[]>`SELECT * FROM hs_games WHERE code = ${code}`;
  if (!g) throw new GameError("No game found with that code. Check the code and try again.", 404);
  return g;
}

export async function loadPlayers(code: string) {
  const sql = await db();
  return sql<Player[]>`SELECT * FROM hs_players WHERE game_code = ${code} ORDER BY joined_at`;
}

export async function requirePlayer(code: string, playerId: unknown) {
  const sql = await db();
  const [p] = await sql<Player[]>`SELECT * FROM hs_players WHERE id = ${String(playerId ?? "")} AND game_code = ${code}`;
  if (!p) throw new GameError("You're not in this game. Join it with the game code first.", 403);
  return p;
}

export async function addEvent(code: string, text: string) {
  const sql = await db();
  await sql`INSERT INTO hs_events (game_code, text) VALUES (${code}, ${text})`;
}

/** Ends the game when time is up or nobody is left hiding, and records final scores. */
export async function settle(g: Game): Promise<Game> {
  if (g.status !== "live") return g;
  const t = timeline(g);
  const players = await loadPlayers(g.code);
  const hidersLeft = players.filter((p) => p.role === "hider" && !p.found_at).length;
  if (t.phase !== "ended" && hidersLeft > 0) return g;
  const sql = await db();
  const endedAt = t.phase === "ended" ? new Date(t.seekEndsAt!) : new Date();
  const [updated] = await sql<Game[]>`
    UPDATE hs_games SET status = 'ended', ended_at = ${endedAt}
    WHERE code = ${g.code} AND status = 'live' RETURNING *`;
  if (!updated) return loadGame(g.code);
  for (const p of players) {
    await sql`UPDATE hs_players SET score = ${scoreFor(updated, p)} WHERE id = ${p.id}`;
  }
  await addEvent(g.code, hidersLeft > 0 ? `Time's up. ${hidersLeft} still hidden.` : "Every hider has been found.");
  return updated;
}

/** Everything a single player's screen needs, without leaking other players' positions. */
export async function stateFor(code: string, playerId: string) {
  let g = await loadGame(code);
  g = await settle(g);
  const me = await requirePlayer(code, playerId);
  const players = await loadPlayers(code);
  const sql = await db();
  const events = await sql<{ id: string; at: Date; text: string }[]>`
    SELECT id, at, text FROM hs_events WHERE game_code = ${code} ORDER BY id DESC LIMIT 12`;
  const now = Date.now();
  const t = timeline(g, now);
  const fresh = (p: Player) => p.lat != null && p.loc_at && now - new Date(p.loc_at).getTime() < LOCATION_FRESH_S * 1000;

  let warmZone: null | { x: number; y: number; r: number } = null;
  let nearestSeeker: number | null = null;

  if (g.status === "live" && g.center_lat != null) {
    if (me.role === "seeker" && t.phase === "seeking") {
      const pts = players
        .filter((p) => p.role === "hider" && !p.found_at && fresh(p))
        .map((p) => {
          const decoy = p.decoy_at && p.decoy_lat != null && now - new Date(p.decoy_at).getTime() < DECOY_SECONDS * 1000;
          return decoy ? relative(g, p.decoy_lat!, p.decoy_lng!) : relative(g, p.lat!, p.lng!);
        });
      if (pts.length) {
        const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
        const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
        const r = warmRadius(g, t.progress);
        // Offset the circle so the centre never points straight at a hider. Changes every 30 seconds.
        const bucket = Math.floor(t.seekElapsed / 30);
        const seed = [...(g.code + bucket)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
        const angle = (seed % 360) * (Math.PI / 180);
        const off = r * 0.45 * ((seed % 100) / 100);
        warmZone = { x: Math.round(cx + Math.cos(angle) * off), y: Math.round(cy + Math.sin(angle) * off), r };
      }
    }
    if (me.role === "hider" && !me.found_at && fresh(me)) {
      for (const s of players.filter((p) => p.role === "seeker" && fresh(p))) {
        const d = distance(me.lat!, me.lng!, s.lat!, s.lng!);
        if (nearestSeeker == null || d < nearestSeeker) nearestSeeker = Math.round(d);
      }
    }
  }

  const myPos = me.lat != null && g.center_lat != null ? relative(g, me.lat, me.lng!) : null;
  const decoyActive = !!(me.decoy_at && now - new Date(me.decoy_at).getTime() < DECOY_SECONDS * 1000);

  return {
    now,
    game: {
      code: g.code, mode: g.mode, status: g.status, radiusM: g.radius_m,
      roundSeconds: g.round_seconds, headStart: g.head_start, hasCenter: g.center_lat != null,
      isHost: g.host_id === me.id, ...t, warmRadius: t.phase === "seeking" ? warmRadius(g, t.progress) : g.radius_m,
    },
    me: {
      id: me.id, name: me.name, role: me.role, tagCode: me.role === "hider" && !me.found_at ? me.tag_code : null,
      found: !!me.found_at, tags: me.tags, pos: myPos,
      outside: myPos ? Math.hypot(myPos.x, myPos.y) > g.radius_m : false,
      decoyUsed: !!me.decoy_at, decoyActive, nearestSeeker,
    },
    players: players.map((p) => ({
      id: p.id, name: p.name, role: p.role, isHost: p.id === g.host_id, found: !!p.found_at,
      wasHider: p.role === "hider" || !!p.found_at, tags: p.tags,
      score: g.status === "ended" ? p.score : scoreFor(g, p, now),
      hiddenSeconds: t.hideEndsAt && (p.role === "hider" || p.found_at)
        ? Math.floor(((p.found_at ? new Date(p.found_at).getTime() : Math.min(now, g.ended_at ? new Date(g.ended_at).getTime() : t.seekEndsAt!)) - t.hideEndsAt) / 1000)
        : null,
    })),
    warmZone,
    hidersLeft: players.filter((p) => p.role === "hider" && !p.found_at).length,
    events: events.map((e) => ({ id: String(e.id), at: new Date(e.at).getTime(), text: e.text })),
  };
}

export function handle(fn: () => Promise<unknown>) {
  return fn().then(
    (data) => Response.json(data),
    (e) => {
      if (e instanceof GameError) return Response.json({ error: e.message }, { status: e.status });
      console.error(e);
      return Response.json({ error: "Something went wrong on our side. Try again in a moment." }, { status: 500 });
    },
  );
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  try { return (await req.json()) ?? {}; } catch { return {}; }
}

export function num(v: unknown, min: number, max: number, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

export function coord(v: unknown, limit: number) {
  const n = Number(v);
  return v != null && v !== "" && Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}
