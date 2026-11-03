import { body, handle, loadGame, normalizeCode, requirePlayer } from "@/lib/game";
import { claimBox } from "@/lib/hunt";

export const dynamic = "force-dynamic";

// Grab a mystery box you're standing next to.
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const code = normalizeCode((await ctx.params).code);
    const b = await body(req);
    const g = await loadGame(code);
    const me = await requirePlayer(code, b.playerId);
    return claimBox(g, me, b.boxId);
  });
}
