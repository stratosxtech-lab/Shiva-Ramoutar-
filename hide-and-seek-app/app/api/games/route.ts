import { db } from "@/lib/db";
import { MODES, body, cleanName, handle, newId, num, uniqueCode, uniqueTag, addEvent, Mode } from "@/lib/game";

export const dynamic = "force-dynamic";

// Host a new game.
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body(req);
    const name = cleanName(b.name);
    const mode: Mode = MODES.includes(b.mode as Mode) ? (b.mode as Mode) : "classic";
    const sql = await db();
    const code = await uniqueCode();
    const hostId = newId();
    await sql`
      INSERT INTO hs_games (code, host_id, mode, round_seconds, head_start, radius_m)
      VALUES (${code}, ${hostId}, ${mode}, ${num(b.roundMinutes, 3, 60, 15) * 60},
              ${num(b.headStart, 15, 300, 60)}, ${num(b.radius, 50, 1000, 200)})`;
    await sql`INSERT INTO hs_players (id, game_code, name, tag_code) VALUES (${hostId}, ${code}, ${name}, ${await uniqueTag(code)})`;
    await addEvent(code, `${name} opened the game.`);
    return { code, playerId: hostId };
  });
}
