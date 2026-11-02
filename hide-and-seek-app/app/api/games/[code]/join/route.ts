import { db } from "@/lib/db";
import { GameError, addEvent, body, cleanName, handle, loadGame, normalizeCode, newId, uniqueTag, loadPlayers } from "@/lib/game";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const code = normalizeCode((await ctx.params).code);
    const b = await body(req);
    const name = cleanName(b.name);
    const g = await loadGame(code);
    if (g.status !== "lobby") throw new GameError("This game has already started. Ask the host to start a new one.", 409);
    if ((await loadPlayers(code)).length >= g.max_players) {
      throw new GameError(`This game is full (${g.max_players} players on the host's plan). The host can upgrade for a bigger group.`, 409);
    }
    const sql = await db();
    const id = newId();
    await sql`INSERT INTO hs_players (id, game_code, name, tag_code) VALUES (${id}, ${code}, ${name}, ${await uniqueTag(code)})`;
    await addEvent(code, `${name} joined.`);
    return { code, playerId: id };
  });
}
