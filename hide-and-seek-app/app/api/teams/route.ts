import { createTeam } from "@/lib/team";
import { body, handle } from "@/lib/game";

export const dynamic = "force-dynamic";

// The buyer of a Group or Corporate plan sets up their team and becomes its owner (super user).
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body(req);
    return createTeam({ accessCode: b.accessCode, teamName: b.teamName, ownerName: b.ownerName, ownerEmail: b.ownerEmail });
  });
}
