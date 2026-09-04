export type PlanId = "starter" | "growth" | "agency";

export const PLANS: Record<
  PlanId,
  { name: string; priceEnvVar: string; credits: number; displayPrice: string }
> = {
  starter: {
    name: "Starter",
    priceEnvVar: "STRIPE_PRICE_STARTER",
    credits: 20,
    displayPrice: "$19/mo",
  },
  growth: {
    name: "Growth",
    priceEnvVar: "STRIPE_PRICE_GROWTH",
    credits: 70,
    displayPrice: "$49/mo",
  },
  agency: {
    name: "Agency",
    priceEnvVar: "STRIPE_PRICE_AGENCY",
    credits: 200,
    displayPrice: "$119/mo",
  },
};

export function priceIdForPlan(planId: PlanId): string | null {
  const plan = PLANS[planId];
  if (!plan) return null;
  return process.env[plan.priceEnvVar] ?? null;
}

export function planForPriceId(priceId: string): PlanId | null {
  for (const [id, plan] of Object.entries(PLANS)) {
    if (process.env[plan.priceEnvVar] === priceId) return id as PlanId;
  }
  return null;
}
