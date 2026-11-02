import { handle, normalizeCode, stateFor } from "@/lib/game";

export const dynamic = "force-dynamic";

// Current game state for one player.
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const { code } = await ctx.params;
    const p = new URL(req.url).searchParams.get("p") ?? "";
    return stateFor(normalizeCode(code), p);
  });
}
