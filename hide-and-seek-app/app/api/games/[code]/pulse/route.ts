import { db } from "@/lib/db";
import { GameError, PULSE_SECONDS, addEvent, body, handle, loadGame, normalizeCode, requirePlayer, timeline } from "@/lib/game";

export const dynamic = "force-dynamic";

// Decoy Duel: each seeker can call one reveal pulse that cuts through decoys for 20 seconds.
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const code = normalizeCode((await ctx.params).code);
    const b = await body(req);
    const g = await loadGame(code);
    const me = await requirePlayer(code, b.playerId);
    if (g.mode !== "duel") throw new GameError("Reveal pulses are only in Decoy Duel.");
    if (g.status !== "live" || timeline(g).phase !== "seeking") throw new GameError("Reveal pulses work during the hunt.");
    if (me.role !== "seeker") throw new GameError("Only seekers can call a reveal pulse.", 403);
    const sql = await db();
    const [ok] = await sql`
      UPDATE hs_players SET pulse_used = true, pulse_until = now() + ${PULSE_SECONDS + " seconds"}::interval
      WHERE id = ${me.id} AND NOT pulse_used RETURNING id`;
    if (!ok) throw new GameError("You've already used your reveal pulse this round.");
    await addEvent(code, `${me.name} called a reveal pulse. Decoys don't fool them for ${PULSE_SECONDS} seconds.`);
    return { ok: true, seconds: PULSE_SECONDS };
  });
}
