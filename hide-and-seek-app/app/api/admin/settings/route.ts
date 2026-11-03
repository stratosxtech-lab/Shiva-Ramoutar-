import { requireAdmin } from "@/lib/access";
import { clean, setGlobal } from "@/lib/settings";
import { body, handle } from "@/lib/game";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  return handle(async () => {
    requireAdmin(req);
    return { settings: await setGlobal(clean(await body(req))) };
  });
}
