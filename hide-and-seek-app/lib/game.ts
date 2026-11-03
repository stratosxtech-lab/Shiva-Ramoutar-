import { randomUUID, randomInt } from "crypto";
import { db } from "./db";
import { PLANS, PlanId } from "./plans";
import { BOX_RANGE_M, CLOSE_CALL_M, activeBoxes, badgesFor, finalStretch, freezeWindow, isLive, tick, trackerFor } from "./hunt";

export const MODES = ["classic", "infection", "shadow", "duel", "indoor"] as const;
export const MODE_INFO: Record<(typeof MODES)[number], { label: string; note: string }> = {
  classic: { label: "Classic", note: "One seeker. Found hiders sit out." },
  infection: { label: "Infection", note: "Found hiders join the seekers." },
  shadow: { label: "Shadow Teams", note: "Two teams. Red hides while Blue seeks, then they swap. Highest team total wins." },
  duel: { label: "Decoy Duel", note: "Hiders get 3 decoys. Each seeker gets one 20-second reveal that cuts through them." },
  indoor: { label: "Indoor", note: "For homes and offices. No GPS needed: find hiders by their chirps." },
};
export type Mode = (typeof MODES)[number];

const WORDS = ["LANTERN", "SHADOW", "MAPLE", "COMET", "FERN", "HARBOR", "EMBER", "OTTER", "BIRCH", "RAVEN", "CEDAR", "MOTH"];
export const MIN_RADIUS = 40;
export const TAG_RANGE_M = 60;
export const DECOY_SECONDS = 60;
export const decoySeconds = (g: Game) => (g.mode === "duel" ? 45 : DECOY_SECONDS);
export const PULSE_SECONDS = 20;
export const LOCATION_FRESH_S = 60;

export type Game = {
  code: string; host_id: string; mode: Mode; status: "lobby" | "live" | "ended";
  round_seconds: number; head_start: number; radius_m: number;
  center_lat: number | null; center_lng: number | null;
  started_at: Date | null; ended_at: Date | null;
  plan: string; max_players: number; access_code: string | null;
  team_id: string | null; settings: Partial<Record<string, boolean>>; half: number;
  sonar_at: Date | null; squeeze_until: Date | null; freeze_stage: number;
};
export type Player = {
  id: string; game_code: string; name: string; role: "seeker" | "hider"; tag_code: string;
  lat: number | null; lng: number | null; loc_at: Date | null;
  found_at: Date | null; found_by: string | null; tags: number;
  decoy_lat: number | null; decoy_lng: number | null; decoy_at: Date | null;
  score: number; joined_at: Date;
  team: string | null; decoys_left: number; pulse_used: boolean; pulse_until: Date | null;
  shield_until: Date | null; ghost_until: Date | null; tracker_until: Date | null; spotted_until: Date | null;
  freeze_lat: number | null; freeze_lng: number | null; boxes: number; bonus: number; first_find: boolean; min_seeker_m: number | null;
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
  let pts = p.tags * 150 + (p.bonus ?? 0);
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
  if (g.mode === "shadow" && g.half === 1) {
    // Half-time: bank each player's points, swap the teams' roles and restart the clock.
    const [moved] = await sql<Game[]>`
      UPDATE hs_games SET half = 2, started_at = now(), freeze_stage = 0, squeeze_until = NULL
      WHERE code = ${g.code} AND status = 'live' AND half = 1 RETURNING *`;
    if (!moved) return loadGame(g.code);
    for (const p of players) {
      await sql`
        UPDATE hs_players SET score = score + ${scoreFor(g, p)}, tags = 0, found_at = NULL, found_by = NULL,
          role = ${p.team === "blue" ? "hider" : "seeker"}, decoy_at = NULL, decoy_lat = NULL, decoy_lng = NULL, decoys_left = 1,
          bonus = 0, min_seeker_m = NULL, freeze_lat = NULL, freeze_lng = NULL,
          shield_until = NULL, ghost_until = NULL, tracker_until = NULL, spotted_until = NULL
        WHERE id = ${p.id}`;
    }
    await addEvent(g.code, `Half-time. Blue team hides now, Red team seeks. ${g.head_start} seconds to hide.`);
    return moved;
  }
  const endedAt = t.phase === "ended" ? new Date(t.seekEndsAt!) : new Date();
  const [updated] = await sql<Game[]>`
    UPDATE hs_games SET status = 'ended', ended_at = ${endedAt}
    WHERE code = ${g.code} AND status = 'live' RETURNING *`;
  if (!updated) return loadGame(g.code);
  if (g.settings?.huntEvents !== false) {
    for (const p of players) {
      if (p.role === "hider" && !p.found_at && p.min_seeker_m != null && p.min_seeker_m <= CLOSE_CALL_M) {
        p.bonus += 100;
        await sql`UPDATE hs_players SET bonus = bonus + 100 WHERE id = ${p.id}`;
        await addEvent(g.code, `Close call bonus! ${p.name} survived with a seeker just ${p.min_seeker_m} m away. +100`);
      }
    }
  }
  for (const p of players) {
    await sql`UPDATE hs_players SET score = score + ${scoreFor(updated, p)} WHERE id = ${p.id}`;
  }
  await addEvent(g.code, hidersLeft > 0 ? `Time's up. ${hidersLeft} still hidden.` : "Every hider has been found.");
  return updated;
}

/** Everything a single player's screen needs, without leaking other players' positions. */
export async function stateFor(code: string, playerId: string) {
  let g = await loadGame(code);
  g = await settle(g);
  await requirePlayer(code, playerId);
  await tick(g, await loadPlayers(code));
  g = await loadGame(code);
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
  const pulsing = !!(me.pulse_until && new Date(me.pulse_until).getTime() > now);

  if (g.status === "live" && g.center_lat != null) {
    if (me.role === "seeker" && t.phase === "seeking" && g.mode !== "indoor") {
      const pts = players
        .filter((p) => p.role === "hider" && !p.found_at && fresh(p) && !isLive(p.ghost_until, now))
        .map((p) => {
          const decoy = !pulsing && p.decoy_at && p.decoy_lat != null && now - new Date(p.decoy_at).getTime() < decoySeconds(g) * 1000;
          return decoy ? relative(g, p.decoy_lat!, p.decoy_lng!) : relative(g, p.lat!, p.lng!);
        });
      if (pts.length) {
        const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
        const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
        const r = Math.round(warmRadius(g, t.progress) * (isLive(g.squeeze_until, now) ? 0.5 : 1));
        // Offset the circle so the centre never points straight at a hider. Moves every 30 seconds (10 at the end).
        const bucket = Math.floor(t.seekElapsed / (finalStretch(g, now) ? 10 : 30));
        const seed = [...(g.code + bucket)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
        const angle = (seed % 360) * (Math.PI / 180);
        const off = r * (pulsing ? 0.15 : 0.45) * ((seed % 100) / 100);
        warmZone = { x: Math.round(cx + Math.cos(angle) * off), y: Math.round(cy + Math.sin(angle) * off), r };
      }
    }
    if (me.role === "hider" && !me.found_at && fresh(me) && g.mode !== "indoor") {
      for (const s of players.filter((p) => p.role === "seeker" && fresh(p))) {
        const d = distance(me.lat!, me.lng!, s.lat!, s.lng!);
        if (nearestSeeker == null || d < nearestSeeker) nearestSeeker = Math.round(d);
      }
    }
  }

  const myPos = me.lat != null && g.center_lat != null ? relative(g, me.lat, me.lng!) : null;
  const decoyActive = !!(me.decoy_at && now - new Date(me.decoy_at).getTime() < decoySeconds(g) * 1000);
  const live = (p: Player) => (g.status === "ended" ? p.score : p.score + scoreFor(g, p, now));
  const twists = g.settings?.huntEvents !== false && g.mode !== "indoor";
  const fw = g.started_at ? freezeWindow(g) : null;
  const left = (d: Date | null) => (isLive(d, now) ? Math.ceil((new Date(d!).getTime() - now) / 1000) : 0);
  const boxes = g.mode === "indoor" ? [] : await activeBoxes(g, now);
  const spotted = me.role === "seeker" && g.status === "live"
    ? players.filter((p) => p.role === "hider" && !p.found_at && isLive(p.spotted_until, now) && p.lat != null && g.center_lat != null)
      .map((p) => ({ name: p.name, ...relative(g, p.lat!, p.lng!) }))
    : [];
  const badges = g.status === "ended" ? badgesFor(players) : {};
  const teams = g.mode === "shadow"
    ? (["red", "blue"] as const).map((team) => ({ team, score: players.filter((p) => p.team === team).reduce((s, p) => s + live(p), 0) }))
    : null;

  return {
    now,
    game: {
      code: g.code, mode: g.mode, status: g.status, radiusM: g.radius_m,
      roundSeconds: g.round_seconds, headStart: g.head_start, hasCenter: g.center_lat != null,
      isHost: g.host_id === me.id, plan: PLANS[(g.plan in PLANS ? g.plan : "free") as PlanId].name, maxPlayers: g.max_players,
      features: {
        decoys: g.settings?.decoys !== false, chirp: g.settings?.chirp !== false,
        liveScores: g.settings?.liveScores !== false, tagRange: g.settings?.tagRange !== false && g.mode !== "indoor",
      },
      half: g.half, chirpEvery: g.mode === "indoor" ? 60 : 120,
      ...t, warmRadius: t.phase === "seeking" ? warmRadius(g, t.progress) : g.radius_m,
    },
    me: {
      id: me.id, name: me.name, role: me.role, tagCode: me.role === "hider" && !me.found_at ? me.tag_code : null,
      found: !!me.found_at, tags: me.tags, pos: myPos,
      outside: myPos ? Math.hypot(myPos.x, myPos.y) > g.radius_m : false,
      decoyUsed: me.decoys_left <= 0, decoysLeft: me.decoys_left, decoyActive, nearestSeeker, team: me.team,
      canPulse: g.mode === "duel" && me.role === "seeker" && !me.pulse_used, pulseActive: pulsing,
      shield: left(me.shield_until), ghost: left(me.ghost_until), boxes: me.boxes,
      tracker: trackerFor(me, players, now),
    },
    players: players.map((p) => ({
      id: p.id, name: p.name, role: p.role, isHost: p.id === g.host_id, found: !!p.found_at,
      wasHider: p.role === "hider" || !!p.found_at, tags: p.tags, team: p.team, boxes: p.boxes, badges: badges[p.id] ?? [],
      score: live(p),
      hiddenSeconds: t.hideEndsAt && (p.role === "hider" || p.found_at)
        ? Math.floor(((p.found_at ? new Date(p.found_at).getTime() : Math.min(now, g.ended_at ? new Date(g.ended_at).getTime() : t.seekEndsAt!)) - t.hideEndsAt) / 1000)
        : null,
    })),
    warmZone,
    teams,
    boxes,
    boxRange: BOX_RANGE_M,
    spotted,
    hunt: {
      freeze: twists && fw && g.status === "live" ? { startsAt: fw.start, endsAt: fw.end } : null,
      final: twists && finalStretch(g, now),
      squeeze: left(g.squeeze_until),
      sonarAt: g.sonar_at ? new Date(g.sonar_at).getTime() : null,
    },
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
