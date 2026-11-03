import { requireUser } from "@/lib/auth";
import { claimCode, profile } from "@/lib/account";
import { body, handle } from "@/lib/game";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    const u = await requireUser(req);
    await claimCode(u, (await body(req)).code);
    return profile(u);
  });
}
