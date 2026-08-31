"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { analyzeProductLink } from "@/lib/ai/analyze-product-link";

export async function createProduct(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const channelId = String(formData.get("channelId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const shopLink = String(formData.get("shopLink") ?? "").trim() || null;
  if (!channelId || !name) throw new Error("Channel and product name are required");

  const { data, error } = await supabase.from("products").insert({
    user_id: user.id, channel_id: channelId, name, category, notes, shop_link: shopLink,
  }).select("id").single();
  if (error) throw new Error(error.message);
  if (shopLink) await analyzeProductLink(data.id);
  revalidatePath("/products");
}

export async function toggleProductActive(productId: string, active: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("products").update({ active }).eq("id", productId);
  if (error) throw new Error(error.message);
  revalidatePath("/products");
}

export async function rereadProductLink(productId: string) {
  await analyzeProductLink(productId);
  revalidatePath("/products");
}

export async function createProductAsset(input: {
  productId: string; channelId: string; name: string; kind: "photo" | "hold_clip" | "face_clip" | "other_clip";
  storagePath: string; mimeType: string; sizeBytes: number;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase.from("assets").insert({
    user_id: user.id, channel_id: input.channelId, product_id: input.productId, name: input.name,
    kind: input.kind, storage_path: input.storagePath, mime_type: input.mimeType, size_bytes: input.sizeBytes, stage: "product",
  }).select("id").single();
  if (error) throw new Error(error.message);
  revalidatePath("/products");
  return data.id as string;
}
