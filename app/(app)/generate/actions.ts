"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { generateBeforeAfterHooks } from "@/lib/ai/generate-before-after-hooks";

type Mode = "transformation" | "product_journey" | "viral_hook";

async function loadImage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  assetId: string
): Promise<{ buffer: Buffer; mimeType: string | null } | null> {
  const { data: asset } = await supabase
    .from("assets")
    .select("storage_path, mime_type")
    .eq("id", assetId)
    .single();
  if (!asset) return null;

  const { data: blob } = await supabase.storage.from("assets").download(asset.storage_path);
  if (!blob) return null;

  return { buffer: Buffer.from(await blob.arrayBuffer()), mimeType: asset.mime_type };
}

export async function generateHooksForBeforeAfter(input: {
  mode: Mode;
  beforeAssetId: string;
  productAssetId?: string | null;
  afterAssetId?: string | null;
  productId: string;
  count: number;
}): Promise<
  | { ok: true; hooks: { angle_label: string; hook_text: string; caption_text: string; costPerHook: number }[] }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const beforeImage = await loadImage(supabase, input.beforeAssetId);
  if (!beforeImage) return { ok: false, error: "Could not read the Before clip." };

  const productImage = input.productAssetId ? await loadImage(supabase, input.productAssetId) : null;
  const afterImage = input.afterAssetId ? await loadImage(supabase, input.afterAssetId) : null;

  let productName = "This product";
  let productSummary: string | null = null;
  let sellingPoints: string[] | null = null;

  if (input.productId) {
    const { data: product } = await supabase
      .from("products")
      .select("name, ai_link_analysis")
      .eq("id", input.productId)
      .single();
    if (product) {
      productName = product.name;
      const analysis = product.ai_link_analysis as {
        summary?: string;
        selling_points?: string[];
      } | null;
      productSummary = analysis?.summary ?? null;
      sellingPoints = analysis?.selling_points ?? null;
    }
  }

  const result = await generateBeforeAfterHooks({
    mode: input.mode,
    beforeImage,
    productImage,
    afterImage,
    productName,
    productSummary,
    sellingPoints,
    count: input.count,
  });

  if (!result.ok) return result;

  return {
    ok: true,
    hooks: result.hooks.map((h) => ({ ...h, costPerHook: result.costPerHook })),
  };
}

export async function createGenerationJob(input: {
  channelId: string;
  productId: string;
  mode: Mode;
  clipIds: string[];
  hooks?: { hook_text: string; caption_text?: string; costPerHook?: number }[];
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  if (!input.clipIds.length) {
    throw new Error("Select clips for every required category first");
  }

  const { data: product } = await supabase
    .from("products")
    .select("name")
    .eq("id", input.productId)
    .single();

  const hooks = (input.hooks ?? []).filter((h) => h.hook_text.trim());
  const variations = hooks.length || 1;

  const { data: job, error: jobError } = await supabase
    .from("generation_jobs")
    .insert({
      user_id: user.id,
      channel_id: input.channelId,
      status: "queued",
      variations_per_product: variations,
      total_videos: variations,
      completed_videos: 0,
    })
    .select("id")
    .single();

  if (jobError) throw new Error(jobError.message);

  const rows = Array.from({ length: variations }).map((_, i) => {
    const hook = hooks.length ? hooks[i % hooks.length] : null;
    return {
      user_id: user.id,
      channel_id: input.channelId,
      job_id: job.id,
      product_id: input.productId,
      product_name: product?.name ?? null,
      variation_index: i,
      status: "queued",
      overlay_text: hook?.hook_text ?? null,
      ai_cost_estimate: hook?.costPerHook ?? 0,
      config: {
        mode: input.mode,
        clip_ids: input.clipIds,
      },
    };
  });

  const { error: videosError } = await supabase.from("generated_videos").insert(rows);
  if (videosError) throw new Error(videosError.message);

  revalidatePath("/generate");
  revalidatePath("/library");
  return job.id as string;
}
