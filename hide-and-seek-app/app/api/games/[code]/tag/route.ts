import { db } from "@/lib/db";
import {
  GameError, LOCATION_FRESH_S, Player, TAG_RANGE_M, addEvent, body, distance, handle,
  loadGame, normalizeCode, requirePlayer, settle, timeline,
} from "@/lib/game";

export const dynamic = "force-dynamic";

// A seeker enters the 4-digit code shown on a hider's screen.
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const code = normalizeCode((await ctx.params).code);
    const b = await body(req);
    const g = await settle(await loadGame(code));
    const me = await requirePlayer(code, b.playerId);
    if (g.status !== "live") throw new GameError("The round has ended.", 409);
    if (timeline(g).phase !== "seeking") throw new GameError("Hiders are still hiding. Tagging opens when the head start ends.", 409);
    if (me.role !== "seeker") throw new GameError("Only seekers can tag.", 403);
    const tag = String(b.tagCode ?? "").replace(/\D/g, "");
    const sql = await db();
    const [h] = await sql<Player[]>`
      SELECT * FROM hs_players WHERE game_code = ${code} AND tag_code = ${tag} AND role = 'hider' AND found_at IS NULL`;
    if (!h) throw new GameError("That code doesn't match anyone still hiding. Check the code on their screen.");
    const fresh = (p: Player) => p.lat != null && p.loc_at && Date.now() - new Date(p.loc_at).getTime() < LOCATION_FRESH_S * 1000;
    if (fresh(me) && fresh(h)) {
      const d = distance(me.lat!, me.lng!, h.lat!, h.lng!);
      if (d > TAG_RANGE_M) throw new GameError(`You're about ${Math.round(d)} m apart. Get within ${TAG_RANGE_M} m to tag.`);
    }
    const newRole = g.mode === "infection" ? "seeker" : "hider";
    const [done] = await sql`
      UPDATE hs_players SET found_at = now(), found_by = ${me.id}, role = ${newRole}
      WHERE id = ${h.id} AND found_at IS NULL RETURNING id`;
    if (!done) throw new GameError("Someone tagged them first.");
    await sql`UPDATE hs_players SET tags = tags + 1 WHERE id = ${me.id}`;
    await addEvent(code, `${me.name} found ${h.name}.${newRole === "seeker" ? ` ${h.name} joins the seekers.` : ""}`);
    await settle(g);
    return { ok: true, found: h.name };
  });
}
