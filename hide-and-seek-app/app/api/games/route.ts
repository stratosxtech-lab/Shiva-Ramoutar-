import { db } from "@/lib/db";
import { redeem } from "@/lib/access";
import { effective, getGlobal } from "@/lib/settings";
import { GameError, MODES, body, cleanName, handle, newId, num, uniqueCode, uniqueTag, addEvent, Mode } from "@/lib/game";

export const dynamic = "force-dynamic";

// Host a new game. An access code or team host code unlocks a paid plan; without one the game uses the Free plan.
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body(req);
    const name = cleanName(b.name);
    const mode: Mode = MODES.includes(b.mode as Mode) ? (b.mode as Mode) : "classic";
    const global = await getGlobal();
    if (!global.newGames) throw new GameError("New games are paused for maintenance. Please try again shortly.", 503);
    const sql = await db();
    const code = await uniqueCode();
    const hostId = newId();
    const tag = await uniqueTag(code);
    const plan = await sql.begin(async (tx) => {
      const r = await redeem(tx, b.accessCode);
      const settings = effective(global, r.teamSettings);
      if (r.plan.id === "free" && !settings.freeHosting) {
        throw new GameError("Free games are currently unavailable. Enter an access code to host.", 402);
      }
      if (mode === "infection" && !settings.infection) {
        throw new GameError("Infection mode is switched off. Choose Classic.", 403);
      }
      if (!r.plan.modes.includes(mode)) {
        throw new GameError("Infection mode needs a paid plan. Choose Classic, or enter an access code.", 402);
      }
      await tx`
        INSERT INTO hs_games (code, host_id, mode, round_seconds, head_start, radius_m, plan, max_players, access_code, team_id, host_member, settings)
        VALUES (${code}, ${hostId}, ${mode}, ${num(b.roundMinutes, 3, 60, 15) * 60},
                ${num(b.headStart, 15, 300, 60)}, ${num(b.radius, 50, 1000, 200)}, ${r.plan.id}, ${r.plan.maxPlayers},
                ${r.code}, ${r.teamId}, ${r.memberId}, ${tx.json(settings)})`;
      await tx`INSERT INTO hs_players (id, game_code, name, tag_code) VALUES (${hostId}, ${code}, ${name}, ${tag})`;
      return r.plan;
    });
    await addEvent(code, `${name} opened the game on the ${plan.name} plan.`);
    return { code, playerId: hostId };
  });
}
