import { requireTeam, teamOverview, updateTeamSettings } from "@/lib/team";
import { body, handle } from "@/lib/game";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const t = await requireTeam(id, req);
    await updateTeamSettings(t, await body(req));
    return teamOverview(await requireTeam(id, req));
  });
}
