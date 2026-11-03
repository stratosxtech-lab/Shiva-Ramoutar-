import { db } from "@/lib/db";
import { GameError, decoySeconds, addEvent, body, handle, loadGame, normalizeCode, requirePlayer } from "@/lib/game";

export const dynamic = "force-dynamic";

// A hider drops one decoy per round. For 60 seconds the warm zone uses a point about 80 m away.
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const code = normalizeCode((await ctx.params).code);
    const b = await body(req);
    const g = await loadGame(code);
    const me = await requirePlayer(code, b.playerId);
    if (g.status !== "live" || me.role !== "hider" || me.found_at) throw new GameError("Decoys are for hiders during a live round.");
    if (g.settings?.decoys === false) throw new GameError("Decoy signals are switched off for this game.", 403);
    if (g.mode === "indoor") throw new GameError("Decoys aren't used in Indoor mode.");
    if (me.decoys_left <= 0) throw new GameError("You've used all your decoys this round.");
    if (me.lat == null || me.lng == null) throw new GameError("Turn on location sharing to drop a decoy.");
    const angle = Math.random() * 2 * Math.PI, dist = 80;
    const dLat = (Math.sin(angle) * dist) / 111320;
    const dLng = (Math.cos(angle) * dist) / (111320 * Math.cos((me.lat * Math.PI) / 180));
    const sql = await db();
    await sql`UPDATE hs_players SET decoy_lat = ${me.lat + dLat}, decoy_lng = ${me.lng + dLng}, decoy_at = now(), decoys_left = decoys_left - 1 WHERE id = ${me.id}`;
    await addEvent(code, "A hider dropped a decoy signal.");
    return { ok: true, seconds: decoySeconds(g) };
  });
}
