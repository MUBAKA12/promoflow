import { createClient } from "@/lib/supabase/server";
import StoryboardClient from "./storyboard-client";

export default async function StoryboardPage() {
  const supabase = await createClient();
  const { data: channels } = await supabase.from("channels").select("id, name").order("created_at", { ascending: true });
  if (!channels?.length) {
    return (<div className="p-10"><h1 className="font-display text-2xl font-semibold mb-2">Storyboard</h1><p className="text-[var(--text-muted)]">Add a channel first.</p></div>);
  }
  const { data: products } = await supabase.from("products").select("id, name, channel_id").order("created_at", { ascending: false });
  const { data: creatives } = await supabase.from("storyboard_creatives").select("id, name, image_paths, channel_id, product_id, created_at").order("created_at", { ascending: false });
  const { data: hooks } = await supabase.from("storyboard_hooks").select("id, creative_id, angle_label, hook_text, caption_text, source, created_at").order("created_at", { ascending: true });
  return <StoryboardClient channels={channels} products={products ?? []} creatives={creatives ?? []} hooks={hooks ?? []} />;
}
