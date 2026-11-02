import { db } from "@/lib/db";
import { getGlobal } from "@/lib/settings";
import { isPlanId } from "@/lib/plans";
import { GameError, body, handle, num } from "@/lib/game";

export const dynamic = "force-dynamic";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Early-access sign-ups and corporate enquiries, kept until checkout is switched on.
export async function POST(req: Request) {
  return handle(async () => {
    if (!(await getGlobal()).enquiries) throw new GameError("We're not taking sign-ups right now. Please check back soon.", 503);
    const b = await body(req);
    const kind = b.kind === "corporate" ? "corporate" : "signup";
    const name = String(b.name ?? "").trim().slice(0, 80);
    const email = String(b.email ?? "").trim().slice(0, 120);
    if (!name) throw new GameError("Enter your name.");
    if (!EMAIL.test(email)) throw new GameError("Enter a valid email address so we can reach you.");
    const sql = await db();
    await sql`
      INSERT INTO hs_leads (kind, plan, name, email, company, team_size, event_date, message)
      VALUES (${kind}, ${isPlanId(b.plan) ? b.plan : null}, ${name}, ${email},
              ${String(b.company ?? "").trim().slice(0, 120) || null},
              ${b.teamSize ? num(b.teamSize, 1, 100000, 0) : null},
              ${String(b.eventDate ?? "").trim().slice(0, 40) || null},
              ${String(b.message ?? "").trim().slice(0, 2000) || null})`;
    return { ok: true };
  });
}
