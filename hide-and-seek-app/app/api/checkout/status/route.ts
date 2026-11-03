import { statusFor } from "@/lib/stripe";
import { handle } from "@/lib/game";

export const dynamic = "force-dynamic";

// The success page asks for the customer's access code. Works even if the webhook hasn't arrived yet.
export async function GET(req: Request) {
  return handle(async () => {
    const r = await statusFor(new URL(req.url).searchParams.get("session_id") ?? "");
    return { code: r.code, plan: { id: r.plan.id, name: r.plan.name, audience: r.plan.audience, maxPlayers: r.plan.maxPlayers } };
  });
}
