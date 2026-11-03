import { randomInt } from "crypto";
import { db } from "./db";
import { Game, GameError, Player, addEvent, distance, relative, timeline } from "./game";

/** Hunt twists: mystery boxes with power-ups, the Freeze! event, the final countdown and end-of-game badges. */
export const BOX_EVERY_S = 90;      // a new box drops this often during the hunt
export const BOX_FIRST_S = 25;      // first box drops this long after the hunt starts
export const BOX_TTL_S = 180;       // an unclaimed box disappears after this long
export const BOX_RANGE_M = 25;      // how close you must be to grab one
export const FREEZE_AT = 0.5;       // Freeze! starts halfway through the hunt
export const FREEZE_S = 30;
export const FREEZE_MOVE_M = 20;    // moving further than this during Freeze! gets you spotted
export const SPOT_S = 20;
export const FINAL_S = 120;         // the final countdown: finds are worth double
export const CLOSE_CALL_M = 15;

export type PowerUp = "tracker" | "sonar" | "squeeze" | "shield" | "ghost" | "decoy";
export const POWER_UPS: Record<PowerUp, { label: string; role: "seeker" | "hider"; seconds: number; text: string }> = {
  tracker: { label: "Tracker", role: "seeker", seconds: 15, text: "An arrow points to the nearest hider for 15 seconds." },
  sonar: { label: "Sonar", role: "seeker", seconds: 0, text: "Every hider's phone chirps right now. Listen!" },
  squeeze: { label: "Squeeze", role: "seeker", seconds: 60, text: "The warm zone is half the size for 60 seconds." },
  shield: { label: "Shield", role: "hider", seconds: 60, text: "You can't be tagged for 60 seconds." },
  ghost: { label: "Ghost", role: "hider", seconds: 45, text: "You vanish from the seekers' map for 45 seconds." },
  decoy: { label: "Extra decoy", role: "hider", seconds: 0, text: "You have one more decoy to drop." },
};

const live = (d: Date | null | undefined, now: number) => !!d && new Date(d).getTime() > now;
const fresh = (p: Player, now: number) => p.lat != null && p.loc_at && now - new Date(p.loc_at).getTime() < 60_000;

export function freezeWindow(g: Game) {
  const t = timeline(g);
  if (!t.hideEndsAt) return null;
  const start = t.hideEndsAt + g.round_seconds * 1000 * FREEZE_AT;
  return { start, end: start + FREEZE_S * 1000 };
}

export function finalStretch(g: Game, now = Date.now()) {
  const t = timeline(g, now);
  return t.phase === "seeking" && !!t.seekEndsAt && t.seekEndsAt - now <= FINAL_S * 1000 && g.settings?.huntEvents !== false;
}

/** Random point inside the play zone, away from the very edge. */
function randomPoint(g: Game) {
  const r = g.radius_m * 0.8 * Math.sqrt(randomInt(1, 10_000) / 10_000);
  const a = (randomInt(0, 3600) / 3600) * 2 * Math.PI;
  const lat = g.center_lat! + (Math.sin(a) * r) / 111320;
  const lng = g.center_lng! + (Math.cos(a) * r) / (111320 * Math.cos((g.center_lat! * Math.PI) / 180));
  return { lat, lng };
}

/**
 * Advances the twists. Called whenever a player's screen refreshes, so the game moves on even though
 * there's no server timer: boxes drop, Freeze! starts and ends, and close calls are recorded.
 */
export async function tick(g: Game, players: Player[], now = Date.now()) {
  if (g.status !== "live" || g.center_lat == null || g.mode === "indoor") return;
  const t = timeline(g, now);
  if (t.phase !== "seeking" || !t.hideEndsAt) return;
  const sql = await db();
  const elapsed = (now - t.hideEndsAt) / 1000;

  if (g.settings?.powerUps !== false && elapsed >= BOX_FIRST_S) {
    const slot = Math.floor((elapsed - BOX_FIRST_S) / BOX_EVERY_S);
    const p = randomPoint(g);
    const [made] = await sql`
      INSERT INTO hs_boxes (game_code, half, slot, lat, lng) VALUES (${g.code}, ${g.half}, ${slot}, ${p.lat}, ${p.lng})
      ON CONFLICT (game_code, half, slot) DO NOTHING RETURNING id`;
    if (made) await addEvent(g.code, "A mystery box dropped on the map. First to reach it gets a power-up!");
  }

  if (g.settings?.huntEvents !== false) {
    const w = freezeWindow(g)!;
    if (now >= w.start && now < w.end) {
      if (g.freeze_stage === 0) {
        const [on] = await sql`UPDATE hs_games SET freeze_stage = 1 WHERE code = ${g.code} AND freeze_stage = 0 RETURNING code`;
        if (on) await addEvent(g.code, `FREEZE! Hiders, don't move for ${FREEZE_S} seconds. Anyone who moves gets spotted.`);
      }
      for (const p of players) {
        if (p.role === "hider" && !p.found_at && p.freeze_lat == null && fresh(p, now)) {
          await sql`UPDATE hs_players SET freeze_lat = ${p.lat}, freeze_lng = ${p.lng} WHERE id = ${p.id} AND freeze_lat IS NULL`;
        }
      }
    } else if (now >= w.end && g.freeze_stage < 2) {
      const [off] = await sql`UPDATE hs_games SET freeze_stage = 2 WHERE code = ${g.code} AND freeze_stage < 2 RETURNING code`;
      if (off) {
        const moved: string[] = [];
        for (const p of players) {
          if (p.role !== "hider" || p.found_at || p.freeze_lat == null || p.lat == null) continue;
          if (distance(p.freeze_lat, p.freeze_lng!, p.lat, p.lng!) > FREEZE_MOVE_M) {
            await sql`UPDATE hs_players SET spotted_until = now() + ${SPOT_S + " seconds"}::interval WHERE id = ${p.id}`;
            moved.push(p.name);
          }
        }
        await addEvent(g.code, moved.length
          ? `Freeze over. ${moved.join(", ")} moved and ${moved.length === 1 ? "is" : "are"} spotted on the seekers' map for ${SPOT_S} seconds!`
          : "Freeze over. Nobody moved. Nice nerves, hiders.");
      }
    }
  }

  // Close calls: remember how near the closest seeker ever got to each hider.
  for (const h of players) {
    if (h.role !== "hider" || h.found_at || !fresh(h, now)) continue;
    let near: number | null = null;
    for (const s of players) {
      if (s.role !== "seeker" || !fresh(s, now)) continue;
      const d = distance(h.lat!, h.lng!, s.lat!, s.lng!);
      if (near == null || d < near) near = d;
    }
    if (near != null && (h.min_seeker_m == null || near < h.min_seeker_m)) {
      await sql`UPDATE hs_players SET min_seeker_m = ${Math.round(near)} WHERE id = ${h.id}`;
    }
  }
}

/** Boxes on the map right now, as positions relative to the zone centre. */
export async function activeBoxes(g: Game, now = Date.now()) {
  if (g.status !== "live" || g.center_lat == null || g.settings?.powerUps === false) return [];
  const sql = await db();
  const rows = await sql<{ id: string; lat: number; lng: number; spawned_at: Date }[]>`
    SELECT id, lat, lng, spawned_at FROM hs_boxes
    WHERE game_code = ${g.code} AND half = ${g.half} AND claimed_by IS NULL AND spawned_at > now() - ${BOX_TTL_S + " seconds"}::interval`;
  return rows.map((b) => ({
    id: String(b.id), ...relative(g, b.lat, b.lng),
    expiresIn: Math.max(0, Math.round((new Date(b.spawned_at).getTime() + BOX_TTL_S * 1000 - now) / 1000)),
  }));
}

/** A player grabs a box: checks they're close enough, then gives a random power-up for their role. */
export async function claimBox(g: Game, me: Player, boxId: unknown) {
  if (g.status !== "live" || timeline(g).phase !== "seeking") throw new GameError("Boxes can only be grabbed during the hunt.");
  if (g.settings?.powerUps === false) throw new GameError("Mystery boxes are switched off for this game.");
  if (me.role === "hider" && me.found_at) throw new GameError("You've been found, so you can't grab boxes this round.");
  const now = Date.now();
  if (!fresh(me, now)) throw new GameError("We can't see your location yet. Make sure location is on, then try again.");
  const sql = await db();
  const [box] = await sql<{ id: string; lat: number; lng: number }[]>`
    SELECT id, lat, lng FROM hs_boxes WHERE id = ${String(boxId ?? "0")} AND game_code = ${g.code}
      AND claimed_by IS NULL AND spawned_at > now() - ${BOX_TTL_S + " seconds"}::interval`;
  if (!box) throw new GameError("Too late! That box is gone.");
  const d = distance(me.lat!, me.lng!, box.lat, box.lng);
  if (d > BOX_RANGE_M) throw new GameError(`You're about ${Math.round(d)} m away. Get within ${BOX_RANGE_M} m to grab it.`);
  const [got] = await sql`UPDATE hs_boxes SET claimed_by = ${me.id}, claimed_at = now() WHERE id = ${box.id} AND claimed_by IS NULL RETURNING id`;
  if (!got) throw new GameError("Someone grabbed it first!");

  const pool = (Object.keys(POWER_UPS) as PowerUp[]).filter((k) => POWER_UPS[k].role === me.role && (k !== "decoy" || g.settings?.decoys !== false));
  const kind = pool[randomInt(pool.length)];
  const secs = `${POWER_UPS[kind].seconds} seconds`;
  if (kind === "tracker") await sql`UPDATE hs_players SET tracker_until = now() + ${secs}::interval WHERE id = ${me.id}`;
  if (kind === "shield") await sql`UPDATE hs_players SET shield_until = now() + ${secs}::interval WHERE id = ${me.id}`;
  if (kind === "ghost") await sql`UPDATE hs_players SET ghost_until = now() + ${secs}::interval WHERE id = ${me.id}`;
  if (kind === "decoy") await sql`UPDATE hs_players SET decoys_left = decoys_left + 1 WHERE id = ${me.id}`;
  if (kind === "sonar") await sql`UPDATE hs_games SET sonar_at = now() WHERE code = ${g.code}`;
  if (kind === "squeeze") await sql`UPDATE hs_games SET squeeze_until = now() + ${secs}::interval WHERE code = ${g.code}`;
  await sql`UPDATE hs_players SET boxes = boxes + 1 WHERE id = ${me.id}`;
  await addEvent(g.code, kind === "sonar"
    ? `${me.name} grabbed a box: SONAR! Every hider's phone is chirping.`
    : `${me.name} grabbed a mystery box and got ${POWER_UPS[kind].label}.`);
  return { kind, label: POWER_UPS[kind].label, text: POWER_UPS[kind].text };
}

/** What a seeker's Tracker points at: bearing in degrees (0 = north) and distance to the nearest visible hider. */
export function trackerFor(me: Player, players: Player[], now = Date.now()) {
  if (me.role !== "seeker" || !live(me.tracker_until, now) || !fresh(me, now)) return null;
  let best: { d: number; p: Player } | null = null;
  for (const p of players) {
    if (p.role !== "hider" || p.found_at || !fresh(p, now) || live(p.ghost_until, now)) continue;
    const d = distance(me.lat!, me.lng!, p.lat!, p.lng!);
    if (!best || d < best.d) best = { d, p };
  }
  if (!best) return null;
  const y = (best.p.lat! - me.lat!) * 111320;
  const x = (best.p.lng! - me.lng!) * 111320 * Math.cos((me.lat! * Math.PI) / 180);
  const bearing = (Math.atan2(x, y) * 180) / Math.PI;
  return { bearing: Math.round((bearing + 360) % 360), distance: Math.round(best.d), seconds: Math.ceil((new Date(me.tracker_until!).getTime() - now) / 1000) };
}

/** End-of-game badges. */
export function badgesFor(players: Player[]) {
  const out: Record<string, string[]> = {};
  const add = (id: string, b: string) => (out[id] ??= []).push(b);
  const maxTags = Math.max(0, ...players.map((p) => p.tags));
  const maxBoxes = Math.max(0, ...players.map((p) => p.boxes));
  for (const p of players) {
    const survived = p.role === "hider" && !p.found_at;
    if (maxTags > 0 && p.tags === maxTags) add(p.id, "Bloodhound");
    if (p.first_find) add(p.id, "First Find");
    if (survived && p.min_seeker_m != null && p.min_seeker_m <= CLOSE_CALL_M) add(p.id, "Close Call");
    if (survived && (p.min_seeker_m == null || p.min_seeker_m >= 30)) add(p.id, "Ghost");
    if (maxBoxes > 0 && p.boxes === maxBoxes) add(p.id, "Collector");
  }
  return out;
}

export const isLive = live;
