import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { redeem } from "@/lib/access";
import { SettingKey, effective, getGlobal } from "@/lib/settings";
import { GameError, MODES, MODE_INFO, body, cleanName, handle, newId, num, uniqueCode, uniqueTag, addEvent, Mode } from "@/lib/game";

export const dynamic = "force-dynamic";

// Host a new game. An access code or team host code unlocks a paid plan; without one the game uses the Free plan.
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body(req);
    const user = await currentUser(req);
    const name = cleanName(b.name || user?.name);
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
      if (mode !== "classic" && !settings[mode as SettingKey]) {
        throw new GameError(`${MODE_INFO[mode].label} is switched off. Choose another mode.`, 403);
      }
      if (!r.plan.modes.includes(mode) && !(r.plan.id === "free" && global.demoModes)) {
        throw new GameError(`${MODE_INFO[mode].label} needs a paid plan. Choose Classic, or enter an access code.`, 402);
      }
      await tx`
        INSERT INTO hs_games (code, host_id, mode, round_seconds, head_start, radius_m, plan, max_players, access_code, team_id, host_member, settings)
        VALUES (${code}, ${hostId}, ${mode}, ${mode === "shadow" ? Math.max(180, num(b.roundMinutes, 3, 60, 15) * 30) : num(b.roundMinutes, 3, 60, 15) * 60},
                ${num(b.headStart, 15, 300, 60)}, ${num(b.radius, 50, 1000, 200)}, ${r.plan.id}, ${r.plan.maxPlayers},
                ${r.code}, ${r.teamId}, ${r.memberId}, ${tx.json(settings)})`;
      await tx`INSERT INTO hs_players (id, game_code, name, tag_code, user_id) VALUES (${hostId}, ${code}, ${name}, ${tag}, ${user?.id ?? null})`;
      return r.plan;
    });
    await addEvent(code, `${name} opened the game on the ${plan.name} plan.`);
    return { code, playerId: hostId };
  });
}
