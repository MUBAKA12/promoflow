import { createClient } from "@/lib/supabase/server";
import LibraryClient from "./library-client";

export default async function LibraryPage() {
  const supabase = await createClient();
  const { data: channels } = await supabase.from("channels").select("id, name").order("created_at", { ascending: true });
  if (!channels?.length) {
    return (<div className="p-10"><h1 className="font-display text-2xl font-semibold mb-2">Video library</h1><p className="text-[var(--text-muted)]">Add a channel first.</p></div>);
  }
  const { data: videos } = await supabase.from("generated_videos")
    .select("id, product_name, variation_index, status, storage_path, duration_seconds, channel_id, overlay_text, created_at")
    .order("created_at", { ascending: false });
  return <LibraryClient channels={channels} initialVideos={videos ?? []} />;
}
