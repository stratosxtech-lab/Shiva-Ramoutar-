import { createHmac, timingSafeEqual } from "crypto";
import { db } from "./db";
import { GameError } from "./game";
import { formatAccess, issueCode } from "./access";
import { PLANS, PlanId, isPlanId } from "./plans";

/** Stripe is used through its REST API so the app needs no extra SDK. */
export const stripeConfigured = () => !!process.env.STRIPE_SECRET_KEY;

function form(params: Record<string, string | number | boolean | undefined>) {
  const f = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) f.append(k, String(v));
  return f;
}

async function stripe<T>(method: "GET" | "POST", path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new GameError("Online checkout isn't set up yet. Please contact us to buy this plan.", 503);
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded" },
    body: method === "POST" && params ? form(params) : undefined,
  });
  const json = await res.json();
  if (!res.ok) {
    console.error("Stripe error", json?.error?.message);
    throw new GameError("We couldn't start checkout. Please try again in a moment.", 502);
  }
  return json as T;
}

type Session = {
  id: string; url?: string; status?: string; payment_status: string; mode: string;
  amount_total: number | null; subscription: string | null;
  metadata: Record<string, string>; customer_details?: { email?: string | null } | null;
};

export async function createCheckout(planId: unknown, origin: string) {
  if (!isPlanId(planId)) throw new GameError("Choose a plan to buy.");
  const plan = PLANS[planId];
  if (plan.cents == null) throw new GameError("This plan is sold by quote. Use the enquiry form and we'll be in touch.");
  const subscription = plan.usage === "subscription";
  const s = await stripe<Session>("POST", "checkout/sessions", {
    mode: subscription ? "subscription" : "payment",
    "line_items[0][quantity]": 1,
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": plan.cents,
    "line_items[0][price_data][product_data][name]": `Hide & Seek: ${plan.name}`,
    "line_items[0][price_data][recurring][interval]": subscription ? "month" : undefined,
    "metadata[plan]": plan.id,
    "subscription_data[metadata][plan]": subscription ? plan.id : undefined,
    allow_promotion_codes: true,
    billing_address_collection: plan.audience === "corporate" ? "required" : "auto",
    success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/pricing`,
  });
  return { url: s.url };
}

/** Turns a paid checkout into an access code. Safe to call more than once for the same session. */
export async function fulfil(session: Session) {
  const sql = await db();
  const [existing] = await sql<{ access_code: string; plan: PlanId }[]>`SELECT access_code, plan FROM hs_orders WHERE session_id = ${session.id}`;
  if (existing) return { plan: PLANS[existing.plan], code: formatAccess(existing.access_code) };
  const paid = session.payment_status === "paid" || session.payment_status === "no_payment_required";
  if (!paid) throw new GameError("This payment hasn't completed yet. Refresh in a moment.", 409);
  const planId = session.metadata?.plan;
  if (!isPlanId(planId) || PLANS[planId].cents == null) throw new GameError("This checkout isn't for a Hide & Seek plan.", 400);
  const email = session.customer_details?.email ?? null;
  const issued = await issueCode(planId, `Stripe ${email ?? session.id}`);
  const [row] = await sql<{ access_code: string }[]>`
    INSERT INTO hs_orders (session_id, plan, email, amount_cents, access_code, subscription_id)
    VALUES (${session.id}, ${planId}, ${email}, ${session.amount_total}, ${issued.code}, ${session.subscription})
    ON CONFLICT (session_id) DO NOTHING RETURNING access_code`;
  if (!row) {
    // Another request fulfilled this session at the same moment. Use theirs and retire the spare code.
    await sql`DELETE FROM hs_access_codes WHERE code = ${issued.code}`;
    const [o] = await sql<{ access_code: string }[]>`SELECT access_code FROM hs_orders WHERE session_id = ${session.id}`;
    return { plan: PLANS[planId], code: formatAccess(o.access_code) };
  }
  return { plan: PLANS[planId], code: issued.display };
}

export async function statusFor(sessionId: string) {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) throw new GameError("That checkout link isn't valid.", 400);
  const sql = await db();
  const [o] = await sql<{ access_code: string; plan: PlanId }[]>`SELECT access_code, plan FROM hs_orders WHERE session_id = ${sessionId}`;
  if (o) return { plan: PLANS[o.plan], code: formatAccess(o.access_code) };
  return fulfil(await stripe<Session>("GET", `checkout/sessions/${sessionId}`));
}

/** Monthly renewals keep an Individual plan's access code valid. */
export async function renew(subscriptionId: string) {
  const sql = await db();
  await sql`
    UPDATE hs_access_codes SET expires_at = greatest(expires_at, now()) + interval '31 days'
    WHERE code = (SELECT access_code FROM hs_orders WHERE subscription_id = ${subscriptionId} LIMIT 1)`;
}

export function verifyWebhook(raw: string, header: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new GameError("Webhook secret isn't configured.", 503);
  const parts = Object.fromEntries((header ?? "").split(",").map((p) => p.split("=", 2) as [string, string]));
  const t = Number(parts.t);
  const sigs = (header ?? "").split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - t) > 300) throw new GameError("Invalid signature.", 400);
  const expected = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  const ok = sigs.some((s) => s.length === expected.length && timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
  if (!ok) throw new GameError("Invalid signature.", 400);
  return JSON.parse(raw) as { type: string; data: { object: Record<string, unknown> } };
}
