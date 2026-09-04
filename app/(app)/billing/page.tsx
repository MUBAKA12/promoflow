import { createClient } from "@/lib/supabase/server";
import BillingClient from "./billing-client";

export default async function BillingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, subscription_status, credits")
    .eq("id", user?.id ?? "")
    .single();

  return (
    <BillingClient
      currentPlan={profile?.plan ?? null}
      subscriptionStatus={profile?.subscription_status ?? null}
      credits={profile?.credits ?? 0}
    />
  );
}
