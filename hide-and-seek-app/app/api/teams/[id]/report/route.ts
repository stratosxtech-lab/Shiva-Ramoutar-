import { requireTeam } from "@/lib/team";
import { reportCsv, teamReport } from "@/lib/report";
import { handle } from "@/lib/game";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const t = await requireTeam((await ctx.params).id, req);
    const q = new URL(req.url).searchParams;
    const r = await teamReport(t, q.get("from"), q.get("to"));
    if (q.get("format") !== "csv") return Response.json(r);
    const file = `hide-and-seek-report-${t.name.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}.csv`;
    return new Response("﻿" + reportCsv(r), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${file}"` },
    });
  } catch (e) { return handle(() => Promise.reject(e)); }
}
