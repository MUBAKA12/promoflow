import { createClient } from "@/lib/supabase/server";
import CostDashboard from "./cost-dashboard";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: videos } = await supabase.from("generated_videos")
    .select("id, product_name, status, source_type, created_at, ai_cost_estimate, render_duration_ms, render_cost_estimate, output_bytes, storage_cost_estimate, egress_cost_estimate, total_cost_estimate")
    .order("created_at", { ascending: false });
  return <CostDashboard videos={videos ?? []} />;
}
