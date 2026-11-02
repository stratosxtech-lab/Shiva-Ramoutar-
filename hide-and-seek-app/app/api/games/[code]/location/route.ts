import { db } from "@/lib/db";
import { GameError, body, coord, handle, normalizeCode, requirePlayer } from "@/lib/game";

export const dynamic = "force-dynamic";

// Players report their position every few seconds. Positions are never sent to other players.
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const code = normalizeCode((await ctx.params).code);
    const b = await body(req);
    const me = await requirePlayer(code, b.playerId);
    const lat = coord(b.lat, 90), lng = coord(b.lng, 180);
    if (lat == null || lng == null) throw new GameError("That location could not be read.");
    const sql = await db();
    await sql`UPDATE hs_players SET lat = ${lat}, lng = ${lng}, loc_at = now() WHERE id = ${me.id}`;
    return { ok: true };
  });
}
