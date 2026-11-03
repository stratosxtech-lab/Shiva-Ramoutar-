import { db } from "@/lib/db";
import { lookup, normalizeAccess } from "@/lib/access";
import { body, handle } from "@/lib/game";
import { PLANS, PlanId } from "@/lib/plans";

export const dynamic = "force-dynamic";

// Tells a host which plan a code unlocks before they start a game.
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body(req);
    const code = normalizeAccess(b.code);
    if (!code) return { valid: false, message: "" };
    const sql = await db();
    const [m] = await sql<{ name: string; team: string; access_code: string; active: boolean }[]>`
      SELECT m.name, t.name AS team, t.access_code, m.active
      FROM hs_team_members m JOIN hs_teams t ON t.id = m.team_id WHERE m.host_code = ${code}`;
    const info = await lookup(m ? m.access_code : code);
    if (!info) return { valid: false, message: "That code isn't recognised." };
    if (m && !m.active) return { valid: false, message: "This host code has been switched off by your team owner." };
    if (info.expired) return { valid: false, message: "This plan has expired." };
    if (info.usedUp) return { valid: false, message: "All events on this plan have been used." };
    const plan = PLANS[info.plan.id as PlanId];
    return {
      valid: true,
      plan: plan.id,
      message: m ? `${m.team} · hosting as ${m.name} · up to ${plan.maxPlayers} players` : `${plan.name} · up to ${plan.maxPlayers} players`,
    };
  });
}
