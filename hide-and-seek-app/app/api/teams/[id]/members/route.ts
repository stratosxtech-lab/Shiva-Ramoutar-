import { addMember, requireTeam, teamOverview } from "@/lib/team";
import { body, handle } from "@/lib/game";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const t = await requireTeam((await ctx.params).id, req);
    const b = await body(req);
    await addMember(t, { name: b.name, email: b.email, role: b.role });
    return teamOverview(t);
  });
}
