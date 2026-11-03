import { getGlobal } from "@/lib/settings";
import { PLANS } from "@/lib/plans";
import { handle } from "@/lib/game";
import { stripeConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";

// Public switches and plan catalogue for the home and pricing pages.
export async function GET() {
  return handle(async () => {
    const s = await getGlobal();
    return {
      settings: { newGames: s.newGames, freeHosting: s.freeHosting, pricingPage: s.pricingPage, enquiries: s.enquiries, infection: s.infection, shadow: s.shadow, duel: s.duel, indoor: s.indoor,
        checkout: s.onlineCheckout && stripeConfigured() },
      plans: Object.values(PLANS),
    };
  });
}
