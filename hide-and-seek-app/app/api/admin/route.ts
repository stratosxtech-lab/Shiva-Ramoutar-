import { db } from "@/lib/db";
import { formatAccess, requireAdmin } from "@/lib/access";
import { SETTINGS, getGlobal } from "@/lib/settings";
import { handle } from "@/lib/game";
import { stripeConfigured } from "@/lib/stripe";
import { emailConfigured } from "@/lib/email";

export const dynamic = "force-dynamic";

// Owner console: settings, access codes, sign-ups and teams.
export async function GET(req: Request) {
  return handle(async () => {
    requireAdmin(req);
    const sql = await db();
    const [codes, leads, teams, [totals], orders, emails] = await Promise.all([
      sql`SELECT c.*, t.name AS team FROM hs_access_codes c LEFT JOIN hs_teams t ON t.access_code = c.code ORDER BY c.created_at DESC LIMIT 100`,
      sql`SELECT * FROM hs_leads ORDER BY created_at DESC LIMIT 200`,
      sql`SELECT t.id, t.name, t.created_at, c.plan,
            (SELECT count(*)::int FROM hs_team_members m WHERE m.team_id = t.id) AS members,
            (SELECT count(*)::int FROM hs_games g WHERE g.team_id = t.id) AS games
          FROM hs_teams t JOIN hs_access_codes c ON c.code = t.access_code ORDER BY t.created_at DESC`,
      sql`SELECT (SELECT count(*)::int FROM hs_games) AS games,
                 (SELECT count(*)::int FROM hs_players) AS players,
                 (SELECT count(*)::int FROM hs_games WHERE created_at > now() - interval '7 days') AS games_week,
                 (SELECT coalesce(sum(amount_cents), 0)::int FROM hs_orders) AS revenue_cents,
                 (SELECT count(*)::int FROM hs_users) AS accounts`,
      sql`SELECT * FROM hs_orders ORDER BY created_at DESC LIMIT 200`,
      sql`SELECT * FROM hs_emails ORDER BY created_at DESC LIMIT 100`,
    ]);
    return {
      settings: await getGlobal(),
      settingInfo: SETTINGS,
      codes: codes.map((c) => ({ ...c, display: formatAccess(c.code as string) })),
      leads, teams, totals, stripe: stripeConfigured(), email: emailConfigured(), emails,
      orders: orders.map((o) => ({ ...o, display: formatAccess(o.access_code as string) })),
    };
  });
}
