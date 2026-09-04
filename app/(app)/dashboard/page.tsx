import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { count: channelCount } = await supabase
    .from("channels")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user?.id ?? "");

  // New user with no channel yet — send them through onboarding instead of
  // an empty dashboard full of zeroes.
  if (!channelCount || channelCount === 0) {
    redirect("/onboarding");
  }

  const [{ count: assetCount }, { count: productCount }, { count: videoCount }] = await Promise.all([
    supabase.from("assets").select("*", { count: "exact", head: true }),
    supabase.from("products").select("*", { count: "exact", head: true }).eq("active", true),
    supabase.from("generated_videos").select("*", { count: "exact", head: true }),
  ]);

  const stats = [
    { label: "Assets", value: assetCount ?? 0 },
    { label: "Active products", value: productCount ?? 0 },
    { label: "Videos generated", value: videoCount ?? 0 },
  ];

  return (
    <div className="p-10 max-w-4xl">
      <h1 className="font-display text-2xl font-semibold mb-1">
        Good to see you{user?.email ? `, ${user.email.split("@")[0]}` : ""} 👋
      </h1>
      <p className="text-[var(--text-muted)] mb-8">Your content engine, at a glance.</p>
      <div className="grid grid-cols-3 gap-4 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="font-display text-3xl font-semibold mb-1">{s.value}</div>
            <div className="text-sm text-[var(--text-muted)]">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
