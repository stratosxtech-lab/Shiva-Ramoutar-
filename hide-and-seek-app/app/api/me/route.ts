import { currentUser, requireUser } from "@/lib/auth";
import { profile, rename } from "@/lib/account";
import { body, handle } from "@/lib/game";

export const dynamic = "force-dynamic";

// Signed-out visitors get { user: null } rather than an error, so pages can check quietly.
export async function GET(req: Request) {
  return handle(async () => {
    const u = await currentUser(req);
    return u ? profile(u) : { user: null };
  });
}

export async function PATCH(req: Request) {
  return handle(async () => {
    const u = await requireUser(req);
    await rename(u, (await body(req)).name);
    return profile((await currentUser(req))!);
  });
}
