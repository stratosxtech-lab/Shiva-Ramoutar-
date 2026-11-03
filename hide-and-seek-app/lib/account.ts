import { db } from "./db";
import { GameError } from "./game";
import { User } from "./auth";
import { formatAccess, normalizeAccess } from "./access";
import { PLANS, PlanId } from "./plans";

/** A player's profile: lifetime stats, recent games and the plans on their account. */
export async function profile(u: User) {
  const sql = await db();
  const history = await sql<{
    code: string; mode: string; status: string; created_at: Date; score: number; tags: number;
    was_hider: boolean; found: boolean; team: string | null; players: number; rank: number;
  }[]>`
    SELECT g.code, g.mode, g.status, g.created_at, p.score, p.tags, (p.found_at IS NOT NULL OR p.role = 'hider') AS was_hider,
      p.found_at IS NOT NULL AS found, p.team,
      (SELECT count(*)::int FROM hs_players x WHERE x.game_code = g.code) AS players,
      (SELECT count(*)::int + 1 FROM hs_players x WHERE x.game_code = g.code AND x.score > p.score) AS rank
    FROM hs_players p JOIN hs_games g ON g.code = p.game_code
    WHERE p.user_id = ${u.id} AND g.status <> 'lobby'
    ORDER BY g.created_at DESC LIMIT 25`;
  const [totals] = await sql<{ games: number; wins: number; tags: number; points: number; best: number }[]>`
    SELECT count(*)::int AS games,
      count(*) FILTER (WHERE g.status = 'ended' AND NOT EXISTS (
        SELECT 1 FROM hs_players x WHERE x.game_code = g.code AND x.score > p.score))::int AS wins,
      coalesce(sum(p.tags), 0)::int AS tags,
      coalesce(sum(p.score) FILTER (WHERE g.status = 'ended'), 0)::int AS points,
      coalesce(max(p.score) FILTER (WHERE g.status = 'ended'), 0)::int AS best
    FROM hs_players p JOIN hs_games g ON g.code = p.game_code
    WHERE p.user_id = ${u.id} AND g.status <> 'lobby'`;
  const codes = await sql<{ code: string; plan: PlanId; uses_left: number | null; expires_at: Date; games_hosted: number; team: string | null }[]>`
    SELECT c.code, c.plan, c.uses_left, c.expires_at, c.games_hosted, t.name AS team
    FROM hs_access_codes c LEFT JOIN hs_teams t ON t.access_code = c.code
    WHERE c.user_id = ${u.id} ORDER BY c.created_at DESC`;
  return {
    user: { id: u.id, name: u.name, email: u.email, since: u.created_at },
    stats: totals,
    history: history.map((h) => ({ ...h, finished: h.status === "ended" })),
    plans: codes.map((c) => {
      const expired = new Date(c.expires_at).getTime() < Date.now();
      const usedUp = c.uses_left !== null && c.uses_left <= 0;
      return {
        code: formatAccess(c.code), plan: c.plan, name: PLANS[c.plan].name, maxPlayers: PLANS[c.plan].maxPlayers,
        audience: PLANS[c.plan].audience, eventsLeft: c.uses_left, expiresAt: c.expires_at, team: c.team,
        usable: !expired && !usedUp, status: expired ? "Expired" : usedUp ? "Used" : "Active",
      };
    }),
  };
}

export async function claimCode(u: User, input: unknown) {
  const code = normalizeAccess(input);
  if (!code) throw new GameError("Enter the access code you want to add.");
  const sql = await db();
  const [row] = await sql<{ user_id: string | null }[]>`SELECT user_id FROM hs_access_codes WHERE code = ${code}`;
  if (!row) throw new GameError("That access code isn't recognised.");
  if (row.user_id && row.user_id !== u.id) throw new GameError("That code is already saved to another account.", 409);
  await sql`UPDATE hs_access_codes SET user_id = ${u.id} WHERE code = ${code}`;
}

export async function rename(u: User, input: unknown) {
  const name = String(input ?? "").trim().replace(/\s+/g, " ").slice(0, 24);
  if (!name) throw new GameError("Enter a name.");
  const sql = await db();
  await sql`UPDATE hs_users SET name = ${name} WHERE id = ${u.id}`;
}
