import { createTeam } from "@/lib/team";
import { sendEmail, siteUrl } from "@/lib/email";
import { body, handle } from "@/lib/game";

export const dynamic = "force-dynamic";

// The buyer of a Group or Corporate plan sets up their team and becomes its owner (super user).
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body(req);
    const r = await createTeam({ accessCode: b.accessCode, teamName: b.teamName, ownerName: b.ownerName, ownerEmail: b.ownerEmail });
    const link = `${siteUrl(req)}/team/${r.teamId}#key=${r.adminKey}`;
    const emailed = await sendEmail(String(b.ownerEmail ?? ""), `Your ${String(b.teamName).trim()} team dashboard`, "Your team is ready",
      [`Hi ${String(b.ownerName).trim()}, your Hide & Seek team "${String(b.teamName).trim()}" is set up and you're its super user.`,
        "The button below opens your private dashboard on any device. Keep this email safe: anyone with the link can manage your team."],
      undefined, { label: "Open my team dashboard", url: link });
    return { ...r, emailed };
  });
}
