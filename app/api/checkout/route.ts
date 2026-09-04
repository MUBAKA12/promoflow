import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/client";
import { PLANS, priceIdForPlan, type PlanId } from "@/lib/stripe/plans";

export async function POST(request: Request) {
  const { plan } = await request.json();

  if (!plan || !(plan in PLANS)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }
  const planId = plan as PlanId;

  const priceId = priceIdForPlan(planId);
  if (!priceId) {
    return NextResponse.json(
      { error: `Stripe price ID for "${planId}" is not configured on the server.` },
      { status: 500 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let stripe;
  try {
    stripe = getStripe();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Stripe is not configured" },
      { status: 500 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, email")
    .eq("id", user.id)
    .single();

  let customerId = profile?.stripe_customer_id ?? null;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile?.email ?? user.email ?? undefined,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
  }

  const origin = request.headers.get("origin") ?? "";

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/dashboard?checkout=success`,
    cancel_url: `${origin}/billing?checkout=cancelled`,
    metadata: { supabase_user_id: user.id, plan: planId },
    subscription_data: {
      metadata: { supabase_user_id: user.id, plan: planId },
    },
  });

  return NextResponse.json({ url: session.url });
}
