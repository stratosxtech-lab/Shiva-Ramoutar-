import { emailCode, issueCode, requireAdmin } from "@/lib/access";
import { siteUrl } from "@/lib/email";
import { isPlanId } from "@/lib/plans";
import { GameError, body, handle, num } from "@/lib/game";

export const dynamic = "force-dynamic";

// Issue an access code by hand, for example after an invoice is paid. Stripe will do this automatically later.
export async function POST(req: Request) {
  return handle(async () => {
    requireAdmin(req);
    const b = await body(req);
    if (!isPlanId(b.plan)) throw new GameError("Choose a plan for the access code.");
    const days = b.days ? num(b.days, 1, 1100, 30) : undefined;
    const email = String(b.email ?? "").trim() || null;
    const issued = await issueCode(b.plan, String(b.label ?? "").trim(), days, { email });
    const emailed = email ? await emailCode(email, issued.display, b.plan, siteUrl(req)) : false;
    return { ...issued, emailed };
  });
}
