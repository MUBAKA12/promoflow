import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";
import { PLANS, planForPriceId } from "@/lib/stripe/plans";
import { createClient } from "@supabase/supabase-js";

// This route needs to write to profiles for ANY user based on Stripe events,
// not just the currently-logged-in browser session — so it uses the service
// role key (server-only, bypasses RLS) rather than the normal cookie-based
// server client used everywhere else in the app.
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase service role credentials are not configured.");
  }
  return createClient(url, serviceKey);
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = getServiceClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id;
        const planId = session.metadata?.plan;
        if (!userId || !planId || !(planId in PLANS)) break;

        const plan = PLANS[planId as keyof typeof PLANS];
        await supabase
          .from("profiles")
          .update({
            stripe_subscription_id: session.subscription as string,
            plan: planId,
            subscription_status: "active",
            credits: plan.credits,
          })
          .eq("id", userId);
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = (invoice as unknown as { subscription?: string }).subscription;
        if (!subscriptionId) break;

        const { data: profile } = await supabase
          .from("profiles")
          .select("id, plan")
          .eq("stripe_subscription_id", subscriptionId)
          .single();
        if (!profile?.plan) break;

        const plan = PLANS[profile.plan as keyof typeof PLANS];
        if (!plan) break;

        // Monthly renewal: reset credits to the plan's allotment. Skip the
        // very first invoice (handled already by checkout.session.completed)
        // by only doing this for billing_reason === "subscription_cycle".
        if (invoice.billing_reason === "subscription_cycle") {
          await supabase
            .from("profiles")
            .update({ credits: plan.credits, subscription_status: "active" })
            .eq("id", profile.id);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const priceId = subscription.items.data[0]?.price.id;
        const newPlan = priceId ? planForPriceId(priceId) : null;

        const updates: Record<string, unknown> = {
          subscription_status: subscription.status,
        };
        if (newPlan) updates.plan = newPlan;

        await supabase
          .from("profiles")
          .update(updates)
          .eq("stripe_subscription_id", subscription.id);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await supabase
          .from("profiles")
          .update({ subscription_status: "canceled" })
          .eq("stripe_subscription_id", subscription.id);
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error("Stripe webhook handler error", err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
