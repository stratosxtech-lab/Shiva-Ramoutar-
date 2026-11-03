import { requireTeam, teamOverview, updateMember } from "@/lib/team";
import { body, handle } from "@/lib/game";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; mid: string }> }) {
  return handle(async () => {
    const { id, mid } = await ctx.params;
    const t = await requireTeam(id, req);
    await updateMember(t, mid, await body(req));
    return teamOverview(t);
  });
}
