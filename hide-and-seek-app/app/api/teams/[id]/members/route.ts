import { addMember, requireTeam, teamOverview } from "@/lib/team";
import { body, handle } from "@/lib/game";
import { sendEmail, siteUrl } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const t = await requireTeam((await ctx.params).id, req);
    const b = await body(req);
    const m = await addMember(t, { name: b.name, email: b.email, role: b.role });
    await sendEmail(m.email, `You can now host Hide & Seek games for ${t.name}`, `You're a host for ${t.name}`,
      [`Hi ${m.name}, you've been added as a ${m.role} for ${t.name}. Enter your host code in the "Access or host code" box when you host a game.`,
        "Players who join your games don't need a code."],
      m.hostCode, { label: "Host a game", url: siteUrl(req) });
    return teamOverview(t);
  });
}
