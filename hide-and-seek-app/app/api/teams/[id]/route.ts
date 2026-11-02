import { requireTeam, teamOverview } from "@/lib/team";
import { handle } from "@/lib/game";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => teamOverview(await requireTeam((await ctx.params).id, req)));
}
