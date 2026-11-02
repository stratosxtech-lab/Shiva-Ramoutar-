import { db } from "@/lib/db";
import { formatAccess, requireAdmin } from "@/lib/access";
import { SETTINGS, getGlobal } from "@/lib/settings";
import { handle } from "@/lib/game";

export const dynamic = "force-dynamic";

// Owner console: settings, access codes, sign-ups and teams.
export async function GET(req: Request) {
  return handle(async () => {
    requireAdmin(req);
    const sql = await db();
    const [codes, leads, teams, [totals]] = await Promise.all([
      sql`SELECT c.*, t.name AS team FROM hs_access_codes c LEFT JOIN hs_teams t ON t.access_code = c.code ORDER BY c.created_at DESC LIMIT 100`,
      sql`SELECT * FROM hs_leads ORDER BY created_at DESC LIMIT 200`,
      sql`SELECT t.id, t.name, t.created_at, c.plan,
            (SELECT count(*)::int FROM hs_team_members m WHERE m.team_id = t.id) AS members,
            (SELECT count(*)::int FROM hs_games g WHERE g.team_id = t.id) AS games
          FROM hs_teams t JOIN hs_access_codes c ON c.code = t.access_code ORDER BY t.created_at DESC`,
      sql`SELECT (SELECT count(*)::int FROM hs_games) AS games,
                 (SELECT count(*)::int FROM hs_players) AS players,
                 (SELECT count(*)::int FROM hs_games WHERE created_at > now() - interval '7 days') AS games_week`,
    ]);
    return {
      settings: await getGlobal(),
      settingInfo: SETTINGS,
      codes: codes.map((c) => ({ ...c, display: formatAccess(c.code as string) })),
      leads, teams, totals,
    };
  });
}
