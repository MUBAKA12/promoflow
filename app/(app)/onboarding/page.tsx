import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OnboardingClient from "./onboarding-client";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { count } = await supabase
    .from("channels")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  // Already set up — no need for onboarding, straight to the app.
  if (count && count > 0) redirect("/dashboard");

  return <OnboardingClient />;
}
