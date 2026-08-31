"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createAssetRecord(input: {
  channelId: string; name: string; kind: "photo" | "hold_clip" | "face_clip" | "other_clip";
  storagePath: string; mimeType: string; sizeBytes: number;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase.from("assets").insert({
    user_id: user.id, channel_id: input.channelId, name: input.name, kind: input.kind,
    storage_path: input.storagePath, mime_type: input.mimeType, size_bytes: input.sizeBytes, stage: "before",
  }).select("id").single();
  if (error) throw new Error(error.message);
  revalidatePath("/assets");
  return data.id as string;
}

export async function acceptSuggestedStage(assetId: string, stage: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("assets").update({ stage }).eq("id", assetId);
  if (error) throw new Error(error.message);
  revalidatePath("/assets");
}

export async function updateAssetStage(assetId: string, stage: string) {
  return acceptSuggestedStage(assetId, stage);
}
