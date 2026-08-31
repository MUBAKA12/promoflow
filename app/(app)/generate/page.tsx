import { createClient } from "@/lib/supabase/server";
import GenerateClient from "./generate-client";

export default async function GeneratePage() {
  const supabase = await createClient();

  const { data: channels } = await supabase
    .from("channels")
    .select("id, name")
    .order("created_at", { ascending: true });

  if (!channels?.length) {
    return (
      <div className="p-10">
        <h1 className="font-display text-2xl font-semibold mb-2">Generate</h1>
        <p className="text-[var(--text-muted)]">Add a channel first.</p>
      </div>
    );
  }

  const { data: products } = await supabase
    .from("products")
    .select("id, name, channel_id, active")
    .eq("active", true)
    .order("created_at", { ascending: false });

  const { data: assets } = await supabase
    .from("assets")
    .select("id, name, stage, kind, storage_path, channel_id, product_id, created_at")
    .order("created_at", { ascending: false });

  return (
    <GenerateClient
      channels={channels}
      products={products ?? []}
      assets={assets ?? []}
    />
  );
}
