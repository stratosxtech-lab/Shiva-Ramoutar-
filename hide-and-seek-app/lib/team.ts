import { randomBytes, randomInt, timingSafeEqual } from "crypto";
import { db } from "./db";
import { GameError } from "./game";
import { PLANS, PlanId } from "./plans";
import { normalizeAccess, formatAccess } from "./access";
import { TEAM_KEYS, clean } from "./settings";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const hostCode = () => Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
export const ROLES = ["owner", "admin", "host"] as const;
export type Role = (typeof ROLES)[number];

type Team = { id: string; name: string; access_code: string; admin_key: string; settings: Record<string, boolean>; created_at: Date };

export async function createTeam(input: { accessCode: unknown; teamName: unknown; ownerName: unknown; ownerEmail: unknown }) {
  const code = normalizeAccess(input.accessCode);
  const teamName = String(input.teamName ?? "").trim().slice(0, 60);
  const ownerName = String(input.ownerName ?? "").trim().slice(0, 40);
  const ownerEmail = String(input.ownerEmail ?? "").trim().slice(0, 120);
  if (!code) throw new GameError("Enter the access code from your purchase.");
  if (!teamName) throw new GameError("Enter a name for your team or group.");
  if (!ownerName) throw new GameError("Enter your name.");
  const sql = await db();
  return sql.begin(async (tx) => {
    const [ac] = await tx<{ plan: PlanId; expires_at: Date }[]>`SELECT plan, expires_at FROM hs_access_codes WHERE code = ${code} FOR UPDATE`;
    if (!ac) throw new GameError("That access code isn't recognised. Check it and try again.");
    const plan = PLANS[ac.plan];
    if (plan.audience !== "group" && plan.audience !== "corporate") {
      throw new GameError("Team dashboards come with Group and Corporate plans. Individual plans don't need one.");
    }
    const [used] = await tx`SELECT 1 FROM hs_teams WHERE access_code = ${code}`;
    if (used) throw new GameError("A team has already been set up with this access code. Use the dashboard link you saved.", 409);
    const id = randomBytes(6).toString("hex");
    const adminKey = randomBytes(24).toString("base64url");
    await tx`INSERT INTO hs_teams (id, name, access_code, admin_key) VALUES (${id}, ${teamName}, ${code}, ${adminKey})`;
    await tx`
      INSERT INTO hs_team_members (id, team_id, name, email, role, host_code)
      VALUES (${randomBytes(8).toString("hex")}, ${id}, ${ownerName}, ${ownerEmail}, 'owner', ${hostCode()})`;
    return { teamId: id, adminKey };
  });
}

export async function requireTeam(teamId: string, req: Request): Promise<Team> {
  const sql = await db();
  const [t] = await sql<Team[]>`SELECT * FROM hs_teams WHERE id = ${teamId}`;
  const given = Buffer.from(req.headers.get("x-team-key") ?? "");
  if (!t || given.length !== Buffer.from(t.admin_key).length || !timingSafeEqual(given, Buffer.from(t.admin_key))) {
    throw new GameError("This dashboard link isn't valid. Use the link you saved when you set up your team.", 401);
  }
  return t;
}

export async function teamOverview(t: Team) {
  const sql = await db();
  const [ac] = await sql<{ plan: PlanId; uses_left: number | null; expires_at: Date; games_hosted: number }[]>`
    SELECT plan, uses_left, expires_at, games_hosted FROM hs_access_codes WHERE code = ${t.access_code}`;
  const members = await sql<{ id: string; name: string; email: string; role: Role; host_code: string; active: boolean; created_at: Date; games: number }[]>`
    SELECT m.*, (SELECT count(*)::int FROM hs_games g WHERE g.host_member = m.id) AS games
    FROM hs_team_members m WHERE team_id = ${t.id}
    ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, created_at`;
  const games = await sql<{ code: string; mode: string; status: string; created_at: Date; players: number; host: string | null; winner: string | null }[]>`
    SELECT g.code, g.mode, g.status, g.created_at,
      (SELECT count(*)::int FROM hs_players p WHERE p.game_code = g.code) AS players,
      (SELECT name FROM hs_team_members m WHERE m.id = g.host_member) AS host,
      (SELECT name FROM hs_players p WHERE p.game_code = g.code AND g.status = 'ended' ORDER BY score DESC LIMIT 1) AS winner
    FROM hs_games g WHERE g.team_id = ${t.id} ORDER BY g.created_at DESC LIMIT 25`;
  const players = games.reduce((s, g) => s + g.players, 0);
  const plan = PLANS[ac.plan];
  return {
    team: { id: t.id, name: t.name, createdAt: t.created_at },
    plan: {
      id: plan.id, name: plan.name, maxPlayers: plan.maxPlayers, eventsLeft: ac.uses_left, expiresAt: ac.expires_at,
      gamesHosted: ac.games_hosted, accessCode: formatAccess(t.access_code),
    },
    settings: Object.fromEntries(TEAM_KEYS.map((k) => [k, t.settings?.[k] !== false])),
    members: members.map((m) => ({ ...m, host_code: formatAccess(m.host_code) })),
    games,
    stats: { members: members.filter((m) => m.active).length, games: games.length, players },
  };
}

export async function addMember(t: Team, input: { name: unknown; email: unknown; role: unknown }) {
  const name = String(input.name ?? "").trim().slice(0, 40);
  const email = String(input.email ?? "").trim().slice(0, 120);
  const role: Role = input.role === "admin" ? "admin" : "host";
  if (!name) throw new GameError("Enter the member's name.");
  const sql = await db();
  const [{ n }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM hs_team_members WHERE team_id = ${t.id}`;
  if (n >= 200) throw new GameError("Teams can have up to 200 members. Contact us for larger organisations.");
  const code = hostCode();
  await sql`
    INSERT INTO hs_team_members (id, team_id, name, email, role, host_code)
    VALUES (${randomBytes(8).toString("hex")}, ${t.id}, ${name}, ${email}, ${role}, ${code})`;
  return { name, email, role, hostCode: formatAccess(code) };
}

export async function updateMember(t: Team, memberId: string, input: { role?: unknown; active?: unknown; remove?: unknown }) {
  const sql = await db();
  const [m] = await sql<{ role: Role }[]>`SELECT role FROM hs_team_members WHERE id = ${memberId} AND team_id = ${t.id}`;
  if (!m) throw new GameError("That member isn't on this team.", 404);
  if (m.role === "owner") throw new GameError("The team owner can't be changed or removed.");
  if (input.remove === true) {
    await sql`DELETE FROM hs_team_members WHERE id = ${memberId}`;
    return;
  }
  if (input.role === "admin" || input.role === "host") await sql`UPDATE hs_team_members SET role = ${input.role} WHERE id = ${memberId}`;
  if (typeof input.active === "boolean") await sql`UPDATE hs_team_members SET active = ${input.active} WHERE id = ${memberId}`;
}

export async function updateTeamSettings(t: Team, patch: unknown) {
  const sql = await db();
  const next = { ...(t.settings ?? {}), ...clean(patch, TEAM_KEYS) };
  await sql`UPDATE hs_teams SET settings = ${sql.json(next)} WHERE id = ${t.id}`;
}
