import { fulfil, renew, verifyWebhook } from "@/lib/stripe";
import { handle } from "@/lib/game";

export const dynamic = "force-dynamic";

// Stripe calls this after payment. Point a Stripe webhook at /api/stripe/webhook with
// checkout.session.completed and invoice.paid events.
export async function POST(req: Request) {
  return handle(async () => {
    const event = verifyWebhook(await req.text(), req.headers.get("stripe-signature"));
    const o = event.data.object;
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      if (o.payment_status === "paid" || o.payment_status === "no_payment_required") await fulfil(o as never);
    } else if (event.type === "invoice.paid" && o.billing_reason === "subscription_cycle" && typeof o.subscription === "string") {
      await renew(o.subscription);
    }
    return { received: true };
  });
}
