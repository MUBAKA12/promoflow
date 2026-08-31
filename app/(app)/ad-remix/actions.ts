"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { analyzeProductLink } from "@/lib/ai/analyze-product-link";
import { generateHooks, saveGeneratedHooks } from "@/lib/ai/generate-hooks";

export async function createCreative(input: { channelId: string; productId: string | null; name: string; storagePath: string; mimeType: string }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase.from("ad_remix_creatives").insert({
    user_id: user.id, channel_id: input.channelId, product_id: input.productId, name: input.name, storage_path: input.storagePath, mime_type: input.mimeType,
  }).select("id").single();
  if (error) throw new Error(error.message);
  revalidatePath("/ad-remix");
  return data.id as string;
}

export async function createProductForCreative(input: { channelId: string; name: string; shopLink: string }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase.from("products").insert({ user_id: user.id, channel_id: input.channelId, name: input.name, shop_link: input.shopLink }).select("id").single();
  if (error) throw new Error(error.message);
  if (input.shopLink) await analyzeProductLink(data.id);
  revalidatePath("/ad-remix");
  return data.id as string;
}

export async function generateHooksForCreative(creativeId: string, productId: string | null, count: number): Promise<
  | { ok: true; hooks: { angle_label: string; hook_text: string; caption_text: string; id: string }[] }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  let productName = "This product";
  let productSummary: string | null = null;
  let sellingPoints: string[] | null = null;
  if (productId) {
    const { data: product } = await supabase.from("products").select("name, ai_link_analysis").eq("id", productId).single();
    if (product) {
      productName = product.name;
      const analysis = product.ai_link_analysis as { summary?: string; selling_points?: string[] } | null;
      productSummary = analysis?.summary ?? null;
      sellingPoints = analysis?.selling_points ?? null;
    }
  }

  const { data: creative } = await supabase.from("ad_remix_creatives").select("storage_path, mime_type").eq("id", creativeId).single();
  let videoBuffer: Buffer | null = null;
  let videoMimeType: string | null = null;
  if (creative?.storage_path) {
    const { data: fileBlob, error: downloadError } = await supabase.storage.from("ad-remix-creatives").download(creative.storage_path);
    if (downloadError || !fileBlob) return { ok: false, error: `Could not read the uploaded video: ${downloadError?.message ?? "unknown error"}` };
    videoBuffer = Buffer.from(await fileBlob.arrayBuffer());
    videoMimeType = creative.mime_type ?? "video/mp4";
  }

  const result = await generateHooks({ videoBuffer, videoMimeType, productName, productSummary, sellingPoints, count });
  if (!result.ok) return result;
  const saved = await saveGeneratedHooks(creativeId, user.id, result.hooks, result.costPerHook);
  revalidatePath("/ad-remix");
  return { ok: true, hooks: result.hooks.map((h, i) => ({ ...h, id: saved[i].id })) };
}

export async function addCustomHook(creativeId: string, hookText: string, captionText: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase.from("ad_remix_hooks").insert({
    creative_id: creativeId, user_id: user.id, hook_text: hookText, caption_text: captionText, angle_label: "Custom", source: "custom",
  }).select("id").single();
  if (error) throw new Error(error.message);
  revalidatePath("/ad-remix");
  return data.id as string;
}

export async function deleteHook(hookId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("ad_remix_hooks").delete().eq("id", hookId);
  if (error) throw new Error(error.message);
  revalidatePath("/ad-remix");
}

export async function generateVideosFromHooks(input: { creativeId: string; channelId: string; productId: string | null; hookIds: string[] }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  if (!input.hookIds.length) throw new Error("Select at least one hook");
  const { data: hooks } = await supabase.from("ad_remix_hooks").select("id, hook_text, caption_text, ai_cost_estimate").in("id", input.hookIds);
  const { data: product } = input.productId ? await supabase.from("products").select("name").eq("id", input.productId).single() : { data: null };
  const { data: job, error: jobError } = await supabase.from("generation_jobs").insert({
    user_id: user.id, channel_id: input.channelId, status: "queued", variations_per_product: hooks?.length ?? 0, total_videos: hooks?.length ?? 0, completed_videos: 0,
  }).select("id").single();
  if (jobError) throw new Error(jobError.message);
  const rows = (hooks ?? []).map((h, i) => ({
    user_id: user.id, channel_id: input.channelId, job_id: job.id, product_id: input.productId, product_name: product?.name ?? null,
    variation_index: i, status: "queued", source_type: "ad_remix" as const, creative_id: input.creativeId, hook_id: h.id,
    overlay_text: h.hook_text, ai_cost_estimate: h.ai_cost_estimate ?? 0,
  }));
  const { error: videosError } = await supabase.from("generated_videos").insert(rows);
  if (videosError) throw new Error(videosError.message);
  revalidatePath("/ad-remix");
  revalidatePath("/library");
  return job.id as string;
}
