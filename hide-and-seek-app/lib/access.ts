import { randomInt, timingSafeEqual } from "crypto";
import type postgres from "postgres";
import { db } from "./db";
import { GameError } from "./game";
import { PLANS, Plan, PlanId } from "./plans";

type Sql = postgres.Sql | postgres.TransactionSql;
type AccessCode = { code: string; plan: PlanId; label: string; uses_left: number | null; expires_at: Date; games_hosted: number };

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I

export function normalizeAccess(v: unknown) {
  return String(v ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function formatAccess(raw: string) {
  return raw.match(/.{1,4}/g)!.join("-");
}

export async function issueCode(plan: PlanId, label: string, overrideDays?: number, owner: { email?: string | null; userId?: string | null } = {}) {
  const p = PLANS[plan];
  if (p.usage === "none") throw new GameError("The Free plan doesn't need an access code.");
  const sql = await db();
  const days = overrideDays ?? p.validDays;
  for (let i = 0; i < 10; i++) {
    const raw = Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
    const [row] = await sql<AccessCode[]>`
      INSERT INTO hs_access_codes (code, plan, label, uses_left, expires_at, email, user_id)
      VALUES (${raw}, ${plan}, ${label.slice(0, 80)}, ${p.usage === "single_event" ? 1 : null}, now() + ${days + " days"}::interval,
              ${owner.email?.toLowerCase() ?? null},
              ${owner.userId ?? (owner.email ? sql`(SELECT id FROM hs_users WHERE email = ${owner.email.toLowerCase()})` : null)})
      ON CONFLICT (code) DO NOTHING RETURNING *`;
    if (row) return { ...row, display: formatAccess(row.code) };
  }
  throw new Error("Could not generate a unique access code.");
}

export type Redeemed = {
  plan: Plan; code: string | null; teamId: string | null; memberId: string | null; teamSettings: Record<string, boolean> | null;
};

/**
 * Accepts either a purchased access code or a team member's host code. Inside the given transaction,
 * single-event plans use up one event.
 */
export async function redeem(sql: Sql, input: unknown): Promise<Redeemed> {
  const entered = normalizeAccess(input);
  if (!entered) return { plan: PLANS.free, code: null, teamId: null, memberId: null, teamSettings: null };

  let code = entered, teamId: string | null = null, memberId: string | null = null, teamSettings: Record<string, boolean> | null = null;
  const [member] = await sql<{ id: string; role: string; active: boolean; team_id: string; access_code: string; settings: Record<string, boolean> }[]>`
    SELECT m.id, m.role, m.active, m.team_id, t.access_code, t.settings
    FROM hs_team_members m JOIN hs_teams t ON t.id = m.team_id WHERE m.host_code = ${entered}`;
  if (member) {
    if (!member.active) throw new GameError("This host code has been switched off by your team owner.", 403);
    if (member.role === "host" && member.settings?.membersHost === false) {
      throw new GameError("Your team owner has limited hosting to admins. Ask them to host, or to turn hosting back on.", 403);
    }
    code = member.access_code; teamId = member.team_id; memberId = member.id; teamSettings = member.settings ?? {};
  } else {
    const [team] = await sql<{ id: string; settings: Record<string, boolean> }[]>`SELECT id, settings FROM hs_teams WHERE access_code = ${entered}`;
    if (team) { teamId = team.id; teamSettings = team.settings ?? {}; }
  }

  const [row] = await sql<AccessCode[]>`SELECT * FROM hs_access_codes WHERE code = ${code} FOR UPDATE`;
  if (!row) throw new GameError("That code isn't recognised. Check it and try again, or leave it blank to play free.");
  if (new Date(row.expires_at).getTime() < Date.now()) throw new GameError("This plan has expired. Renew it to keep hosting.");
  if (row.uses_left !== null && row.uses_left <= 0) throw new GameError("All events on this plan have been used. Buy another event to keep playing.");
  await sql`
    UPDATE hs_access_codes
    SET games_hosted = games_hosted + 1, uses_left = CASE WHEN uses_left IS NULL THEN NULL ELSE uses_left - 1 END
    WHERE code = ${code}`;
  return { plan: PLANS[row.plan], code, teamId, memberId, teamSettings };
}

export async function lookup(input: unknown) {
  const code = normalizeAccess(input);
  if (!code) return null;
  const sql = await db();
  const [row] = await sql<AccessCode[]>`SELECT * FROM hs_access_codes WHERE code = ${code}`;
  if (!row) return null;
  const expired = new Date(row.expires_at).getTime() < Date.now();
  const usedUp = row.uses_left !== null && row.uses_left <= 0;
  return { plan: PLANS[row.plan], valid: !expired && !usedUp, expired, usedUp, expiresAt: row.expires_at };
}

export function requireAdmin(req: Request) {
  const expected = process.env.ADMIN_KEY;
  if (!expected) throw new GameError("The admin area isn't set up yet. Add ADMIN_KEY in Vercel.", 503);
  const given = req.headers.get("x-admin-key") ?? "";
  const a = Buffer.from(given), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new GameError("That admin key is incorrect.", 401);
}

/** Emails an access code with the right next step for its plan. */
export async function emailCode(to: string | null | undefined, display: string, planId: PlanId, origin: string) {
  const { sendEmail } = await import("./email");
  const plan = PLANS[planId];
  const team = plan.audience === "group" || plan.audience === "corporate";
  return sendEmail(to, `Your Hide & Seek ${plan.name} access code`, `Your ${plan.name} access code`,
    team
      ? ["Thank you for choosing Hide & Seek. Use the code below to set up your team. You'll become its super user, able to add hosts, control settings and see every game."]
      : [`Thank you for choosing Hide & Seek. Enter the code below in the "Access or host code" box when you host a game to unlock every mode and up to ${plan.maxPlayers} players.`],
    display,
    team ? { label: "Set up my team", url: `${origin}/team/new?code=${encodeURIComponent(display)}` } : { label: "Host a game", url: origin });
}
