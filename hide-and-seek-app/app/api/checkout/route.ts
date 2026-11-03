import { createCheckout, stripeConfigured } from "@/lib/stripe";
import { getGlobal } from "@/lib/settings";
import { currentUser } from "@/lib/auth";
import { GameError, body, handle } from "@/lib/game";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    if (!stripeConfigured() || !(await getGlobal()).onlineCheckout) {
      throw new GameError("Online checkout isn't open yet. Use the sign-up form and we'll send your access code.", 503);
    }
    const b = await body(req);
    return createCheckout(b.plan, new URL(req.url).origin, await currentUser(req));
  });
}
