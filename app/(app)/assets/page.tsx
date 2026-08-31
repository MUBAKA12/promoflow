import { createClient } from "@/lib/supabase/server";
import AssetLibraryClient from "./asset-library-client";

export default async function AssetsPage() {
  const supabase = await createClient();
  const { data: channels } = await supabase.from("channels").select("id, name").order("created_at", { ascending: true });
  if (!channels?.length) {
    return (<div className="p-10"><h1 className="font-display text-2xl font-semibold mb-2">Asset library</h1><p className="text-[var(--text-muted)]">Add a channel first — assets belong to a channel.</p></div>);
  }
  const { data: assets } = await supabase.from("assets")
    .select("id, name, kind, stage, storage_path, mime_type, ai_tags, ai_analyzed_at, channel_id, created_at")
    .order("created_at", { ascending: false });
  return <AssetLibraryClient channels={channels} initialAssets={assets ?? []} />;
}
