import { randomInt } from "crypto";
import { db } from "@/lib/db";
import { GameError, addEvent, body, coord, handle, loadGame, loadPlayers, normalizeCode, requirePlayer } from "@/lib/game";

export const dynamic = "force-dynamic";

// Host starts the game: the zone is centred on the host, one seeker is chosen at random.
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const code = normalizeCode((await ctx.params).code);
    const b = await body(req);
    const g = await loadGame(code);
    const me = await requirePlayer(code, b.playerId);
    if (g.host_id !== me.id) throw new GameError("Only the host can start the game.", 403);
    if (g.status !== "lobby") throw new GameError("This game has already started.", 409);
    const players = await loadPlayers(code);
    if (players.length < 2) throw new GameError("You need at least 2 players to start. Share the game code first.");
    const lat = coord(b.lat, 90) ?? me.lat, lng = coord(b.lng, 180) ?? me.lng;
    const indoor = g.mode === "indoor";
    if (!indoor && (lat == null || lng == null)) throw new GameError("Turn on location sharing so the play zone can be centred on you.");
    const sql = await db();
    const decoys = g.mode === "duel" ? 3 : 1;
    let announce: string;
    if (g.mode === "shadow") {
      if (players.length < 4) throw new GameError("Shadow Teams needs at least 4 players, so each team has 2.");
      const shuffled = [...players].sort(() => randomInt(1000) - 500);
      for (const [i, p] of shuffled.entries()) {
        const team = i % 2 === 0 ? "red" : "blue";
        await sql`UPDATE hs_players SET team = ${team}, role = ${team === "red" ? "hider" : "seeker"}, decoys_left = ${decoys} WHERE id = ${p.id}`;
      }
      announce = `Game on. Red team hides first, Blue team seeks. ${g.head_start} seconds to hide.`;
    } else {
      const seeker = players[randomInt(players.length)];
      await sql`UPDATE hs_players SET role = 'hider', decoys_left = ${decoys} WHERE game_code = ${code}`;
      await sql`UPDATE hs_players SET role = 'seeker' WHERE id = ${seeker.id}`;
      announce = `Game on. ${seeker.name} is seeking. Hiders have ${g.head_start} seconds to hide.`;
    }
    const [ok] = await sql`
      UPDATE hs_games SET status = 'live', started_at = now(), center_lat = ${indoor ? null : lat}, center_lng = ${indoor ? null : lng}
      WHERE code = ${code} AND status = 'lobby' RETURNING code`;
    if (!ok) throw new GameError("This game has already started.", 409);
    await addEvent(code, announce);
    return { ok: true };
  });
}
