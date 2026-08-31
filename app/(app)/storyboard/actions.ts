"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { analyzeProductLink } from "@/lib/ai/analyze-product-link";
import { generateStoryboardHooks, saveStoryboardHooks } from "@/lib/ai/generate-storyboard-hooks";
import { detectGridLayout } from "@/lib/ai/detect-grid-layout";
import { splitGridImage } from "@/lib/render/split-grid";
import { mkdtemp, readFile, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

function guessImageMimeType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

export async function createStoryboardFromGridImage(input: { channelId: string; productId: string | null; name: string; sourceImagePath: string }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const workDir = await mkdtemp(path.join(tmpdir(), "promoflow-grid-"));
  try {
    const { data: sourceBlob, error: downloadError } = await supabase.storage.from("storyboard-images").download(input.sourceImagePath);
    if (downloadError || !sourceBlob) throw new Error(`Could not read the uploaded image: ${downloadError?.message ?? "unknown error"}`);
    const sourceBuffer = Buffer.from(await sourceBlob.arrayBuffer());
    const sourceLocalPath = path.join(workDir, "source.jpg");
    await writeFile(sourceLocalPath, sourceBuffer);

    const detected = await detectGridLayout(sourceBuffer, guessImageMimeType(input.sourceImagePath));
    let rows = detected.rows;
    let cols = detected.cols;
    if (detected.error && rows === 1 && cols === 1) { rows = 3; cols = 3; }

    if (rows === 1 && cols === 1) {
      const { data, error } = await supabase.from("storyboard_creatives").insert({
        user_id: user.id, channel_id: input.channelId, product_id: input.productId, name: input.name,
        image_paths: [input.sourceImagePath], detected_rows: detected.rows, detected_cols: detected.cols,
        detected_confidence: detected.confidence, detection_error: detected.error,
      }).select("id").single();
      if (error) throw new Error(error.message);
      revalidatePath("/storyboard");
      return { id: data.id as string, imagePaths: [input.sourceImagePath], detectedRows: 1, detectedCols: 1 };
    }

    const tilePaths = await splitGridImage(sourceLocalPath, workDir, rows, cols);
    const imagePaths: string[] = [];
    for (let i = 0; i < tilePaths.length; i++) {
      const tileBuffer = await readFile(tilePaths[i]);
      const tileStoragePath = `${user.id}/${input.channelId}/storyboard/${Date.now()}-tile-${i}.jpg`;
      const { error: uploadError } = await supabase.storage.from("storyboard-images").upload(tileStoragePath, tileBuffer, { contentType: "image/jpeg" });
      if (uploadError) throw new Error(`Could not upload tile ${i}: ${uploadError.message}`);
      imagePaths.push(tileStoragePath);
    }

    const { data, error } = await supabase.from("storyboard_creatives").insert({
      user_id: user.id, channel_id: input.channelId, product_id: input.productId, name: input.name, image_paths: imagePaths,
      detected_rows: rows, detected_cols: cols, detected_confidence: detected.confidence, detection_error: detected.error,
    }).select("id").single();
    if (error) throw new Error(error.message);
    revalidatePath("/storyboard");
    return { id: data.id as string, imagePaths, detectedRows: rows, detectedCols: cols };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export async function createStoryboardCreative(input: { channelId: string; productId: string | null; name: string; imagePaths: string[] }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase.from("storyboard_creatives").insert({
    user_id: user.id, channel_id: input.channelId, product_id: input.productId, name: input.name, image_paths: input.imagePaths,
  }).select("id").single();
  if (error) throw new Error(error.message);
  revalidatePath("/storyboard");
  return data.id as string;
}

export async function createProductForStoryboard(input: { channelId: string; name: string; shopLink: string }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase.from("products").insert({ user_id: user.id, channel_id: input.channelId, name: input.name, shop_link: input.shopLink }).select("id").single();
  if (error) throw new Error(error.message);
  if (input.shopLink) await analyzeProductLink(data.id);
  revalidatePath("/storyboard");
  return data.id as string;
}

export async function generateHooksForStoryboard(creativeId: string, productId: string | null, count: number): Promise<
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
  const { data: creative } = await supabase.from("storyboard_creatives").select("image_paths").eq("id", creativeId).single();
  if (!creative?.image_paths?.length) return { ok: false, error: "This storyboard has no images." };
  const images: { buffer: Buffer; storagePath: string }[] = [];
  for (const storagePath of creative.image_paths as string[]) {
    const { data: fileBlob, error: downloadError } = await supabase.storage.from("storyboard-images").download(storagePath);
    if (downloadError || !fileBlob) return { ok: false, error: `Could not read one of the storyboard images: ${downloadError?.message ?? "unknown error"}` };
    images.push({ buffer: Buffer.from(await fileBlob.arrayBuffer()), storagePath });
  }
  const result = await generateStoryboardHooks({ images, productName, productSummary, sellingPoints, count });
  if (!result.ok) return result;
  const saved = await saveStoryboardHooks(creativeId, user.id, result.hooks, result.costPerHook);
  revalidatePath("/storyboard");
  return { ok: true, hooks: result.hooks.map((h, i) => ({ ...h, id: saved[i].id })) };
}

export async function addCustomStoryboardHook(creativeId: string, hookText: string, captionText: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase.from("storyboard_hooks").insert({
    creative_id: creativeId, user_id: user.id, hook_text: hookText, caption_text: captionText, angle_label: "Custom", source: "custom",
  }).select("id").single();
  if (error) throw new Error(error.message);
  revalidatePath("/storyboard");
  return data.id as string;
}

export async function deleteStoryboardHook(hookId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("storyboard_hooks").delete().eq("id", hookId);
  if (error) throw new Error(error.message);
  revalidatePath("/storyboard");
}

export async function generateVideosFromStoryboardHooks(input: { creativeId: string; channelId: string; productId: string | null; hookIds: string[] }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  if (!input.hookIds.length) throw new Error("Select at least one hook");
  const { data: hooks } = await supabase.from("storyboard_hooks").select("id, hook_text, caption_text, ai_cost_estimate").in("id", input.hookIds);
  const { data: product } = input.productId ? await supabase.from("products").select("name").eq("id", input.productId).single() : { data: null };
  const { data: job, error: jobError } = await supabase.from("generation_jobs").insert({
    user_id: user.id, channel_id: input.channelId, status: "queued", variations_per_product: hooks?.length ?? 0, total_videos: hooks?.length ?? 0, completed_videos: 0,
  }).select("id").single();
  if (jobError) throw new Error(jobError.message);
  const rows = (hooks ?? []).map((h, i) => ({
    user_id: user.id, channel_id: input.channelId, job_id: job.id, product_id: input.productId, product_name: product?.name ?? null,
    variation_index: i, status: "queued", source_type: "storyboard" as const, storyboard_creative_id: input.creativeId, storyboard_hook_id: h.id,
    overlay_text: h.hook_text, ai_cost_estimate: h.ai_cost_estimate ?? 0,
  }));
  const { error: videosError } = await supabase.from("generated_videos").insert(rows);
  if (videosError) throw new Error(videosError.message);
  revalidatePath("/storyboard");
  revalidatePath("/library");
  return job.id as string;
}
