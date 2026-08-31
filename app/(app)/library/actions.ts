"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function deleteGeneratedVideo(videoId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: video, error: fetchError } = await supabase.from("generated_videos").select("user_id, storage_path").eq("id", videoId).single();
  if (fetchError || !video) throw new Error("Video not found");
  if (video.user_id !== user.id) throw new Error("Forbidden");
  if (video.storage_path) await supabase.storage.from("generated-videos").remove([video.storage_path]);
  const { error: deleteError } = await supabase.from("generated_videos").delete().eq("id", videoId);
  if (deleteError) throw new Error(deleteError.message);
  revalidatePath("/library");
}
