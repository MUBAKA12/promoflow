import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import ffmpeg from "fluent-ffmpeg";
import { createClient } from "@/lib/supabase/server";
import { writeFile, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { estimateRenderCost, estimateStorageAndEgressCost } from "@/lib/costs/pricing";

ffmpeg.setFfmpegPath(ffmpegPath.path);

const SLIDE_SECONDS = 2.2;
const FADE_SECONDS = 0.3;
const WIDTH = 1080;
const HEIGHT = 1920;
const HOOK_DISPLAY_SECONDS = 3.5;

function wrapCaption(text: string, maxCharsPerLine = 24, maxLines = 3): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    } else {
      current = candidate;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines.join("\n");
}

async function downloadToTemp(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bucket: "assets" | "ad-remix-creatives" | "storyboard-images",
  storagePath: string,
  destDir: string,
  name: string
) {
  const { data, error } = await supabase.storage.from(bucket).download(storagePath);
  if (error || !data) throw new Error(`Could not download ${bucket}/${storagePath}`);
  const buffer = Buffer.from(await data.arrayBuffer());
  const filePath = path.join(destDir, name);
  await writeFile(filePath, buffer);
  return filePath;
}

let cachedFontBuffer: Buffer | null = null;

async function getCaptionFontBuffer(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<Buffer | null> {
  if (cachedFontBuffer) return cachedFontBuffer;
  const { data, error } = await supabase
    .from("system_assets")
    .select("data")
    .eq("key", "caption-font-ttf")
    .single();
  if (error || !data?.data) {
    console.error("Could not load caption font from database:", error?.message);
    return null;
  }
  const buffer = Buffer.from(data.data, "base64");
  cachedFontBuffer = buffer;
  return buffer;
}

async function writeCaptionAssets(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workDir: string,
  text: string
): Promise<{ fontPath: string; captionFilePath: string } | null> {
  const fontBuffer = await getCaptionFontBuffer(supabase);
  if (!fontBuffer || fontBuffer.length < 10_000) {
    console.error(
      `Caption font data looks corrupt or missing (${fontBuffer?.length ?? 0} bytes, expected ~55000) — skipping caption burn-in for this render.`
    );
    return null;
  }
  const fontPath = path.join(workDir, "caption-font.ttf");
  await writeFile(fontPath, fontBuffer);
  const captionFilePath = path.join(workDir, "caption.txt");
  await writeFile(captionFilePath, wrapCaption(text));
  return { fontPath, captionFilePath };
}

export async function renderGeneratedVideo(videoId: string) {
  const supabase = await createClient();

  const { data: video, error: videoError } = await supabase
    .from("generated_videos")
    .select(
      "id, user_id, channel_id, product_id, config, status, overlay_text, source_type, creative_id, storyboard_creative_id"
    )
    .eq("id", videoId)
    .single();

  if (videoError || !video) throw new Error("Video not found");

  const workDir = await mkdtemp(path.join(tmpdir(), "promoflow-"));

  try {
    if (video.source_type === "ad_remix") {
      return await renderAdRemix(supabase, video, workDir);
    }
    if (video.source_type === "storyboard") {
      return await renderStoryboard(supabase, video, workDir);
    }
    return await renderBeforeAfter(supabase, video, workDir);
  } catch (err) {
    await supabase.from("generated_videos").update({ status: "failed" }).eq("id", videoId);
    throw err;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function renderAdRemix(
  supabase: Awaited<ReturnType<typeof createClient>>,
  video: {
    id: string;
    user_id: string;
    channel_id: string;
    overlay_text: string | null;
    creative_id: string | null;
  },
  workDir: string
) {
  if (!video.creative_id) throw new Error("No creative attached to this video");

  const { data: creative } = await supabase
    .from("ad_remix_creatives")
    .select("storage_path")
    .eq("id", video.creative_id)
    .single();
  if (!creative) throw new Error("Source creative not found");

  const sourcePath = await downloadToTemp(
    supabase,
    "ad-remix-creatives",
    creative.storage_path,
    workDir,
    "source.mp4"
  );
  const outputPath = path.join(workDir, "output.mp4");

  let captionAssets: { fontPath: string; captionFilePath: string } | null = null;
  if (video.overlay_text && video.overlay_text.trim()) {
    captionAssets = await writeCaptionAssets(supabase, workDir, video.overlay_text);
  }

  const renderStart = Date.now();
  await new Promise<void>((resolve, reject) => {
    const baseFilter = `[0:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},setsar=1[vbase]`;
    let filterComplex = baseFilter;
    let finalLabel = "vbase";

    if (captionAssets) {
      filterComplex += `;[vbase]drawtext=fontfile=${captionAssets.fontPath}:textfile=${captionAssets.captionFilePath}:fontcolor=white:fontsize=54:x=(w-text_w)/2:y=h*0.10:box=1:boxcolor=black@0.45:boxborderw=24:line_spacing=10:enable='between(t\\,0\\,${HOOK_DISPLAY_SECONDS})'[vout]`;
      finalLabel = "vout";
    }

    ffmpeg(sourcePath)
      .complexFilter(filterComplex, finalLabel)
      .outputOptions([
        "-map 0:a?",
        "-c:v libx264",
        "-crf 18",
        "-pix_fmt yuv420p",
        "-movflags +faststart",
        "-preset medium",
        "-c:a aac",
        "-r 30",
      ])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
  const renderDurationMs = Date.now() - renderStart;

  const outputBuffer = await readFile(outputPath);
  const storagePath = `${video.user_id}/${video.channel_id}/${video.id}.mp4`;

  const { error: uploadError } = await supabase.storage
    .from("generated-videos")
    .upload(storagePath, outputBuffer, { contentType: "video/mp4", upsert: true });
  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  const renderCost = estimateRenderCost(renderDurationMs);
  const { storageCost, egressCost } = estimateStorageAndEgressCost(outputBuffer.length);

  const { data: existingVideo } = await supabase
    .from("generated_videos")
    .select("ai_cost_estimate")
    .eq("id", video.id)
    .single();
  const aiCost = existingVideo?.ai_cost_estimate ?? 0;

  await supabase
    .from("generated_videos")
    .update({
      status: "completed",
      storage_path: storagePath,
      ai_cost_estimate: aiCost,
      render_duration_ms: renderDurationMs,
      render_cost_estimate: renderCost,
      output_bytes: outputBuffer.length,
      storage_cost_estimate: storageCost,
      egress_cost_estimate: egressCost,
      total_cost_estimate: aiCost + renderCost + storageCost + egressCost,
    })
    .eq("id", video.id);

  return { storagePath };
}

const STORYBOARD_SLIDE_SECONDS = 2.5;

async function renderStoryboard(
  supabase: Awaited<ReturnType<typeof createClient>>,
  video: {
    id: string;
    user_id: string;
    channel_id: string;
    overlay_text: string | null;
    storyboard_creative_id: string | null;
  },
  workDir: string
) {
  if (!video.storyboard_creative_id) throw new Error("No storyboard attached to this video");

  const { data: creative } = await supabase
    .from("storyboard_creatives")
    .select("image_paths")
    .eq("id", video.storyboard_creative_id)
    .single();
  if (!creative || !creative.image_paths?.length) throw new Error("Storyboard has no images");

  const imagePaths: string[] = creative.image_paths;
  const localPaths = await Promise.all(
    imagePaths.map((p, i) => downloadToTemp(supabase, "storyboard-images", p, workDir, `slide-${i}.jpg`))
  );

  const outputPath = path.join(workDir, "output.mp4");

  let captionAssets: { fontPath: string; captionFilePath: string } | null = null;
  if (video.overlay_text && video.overlay_text.trim()) {
    captionAssets = await writeCaptionAssets(supabase, workDir, video.overlay_text);
  }

  const renderStart = Date.now();
  await new Promise<void>((resolve, reject) => {
    const command = ffmpeg();

    localPaths.forEach((img) => {
      command.input(img).inputOptions(["-loop 1", `-t ${STORYBOARD_SLIDE_SECONDS}`]);
    });

    const fadeOutStart = (STORYBOARD_SLIDE_SECONDS - FADE_SECONDS).toFixed(2);
    const perImageFilters = localPaths
      .map(
        (_, i) =>
          `[${i}:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,fade=t=in:st=0:d=${FADE_SECONDS},fade=t=out:st=${fadeOutStart}:d=${FADE_SECONDS}[v${i}]`
      )
      .join(";");

    const concatInputs = localPaths.map((_, i) => `[v${i}]`).join("");
    let filterComplex = `${perImageFilters};${concatInputs}concat=n=${localPaths.length}:v=1:a=0[vconcat]`;
    let finalLabel = "vconcat";

    if (captionAssets) {
      filterComplex += `;[vconcat]drawtext=fontfile=${captionAssets.fontPath}:textfile=${captionAssets.captionFilePath}:fontcolor=white:fontsize=54:x=(w-text_w)/2:y=h*0.10:box=1:boxcolor=black@0.45:boxborderw=24:line_spacing=10:enable='between(t\\,0\\,${HOOK_DISPLAY_SECONDS})'[vout]`;
      finalLabel = "vout";
    }

    command
      .complexFilter(filterComplex, finalLabel)
      .outputOptions([
        "-c:v libx264",
        "-crf 18",
        "-pix_fmt yuv420p",
        "-movflags +faststart",
        "-preset medium",
        "-r 30",
      ])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
  const renderDurationMs = Date.now() - renderStart;

  const outputBuffer = await readFile(outputPath);
  const storagePath = `${video.user_id}/${video.channel_id}/${video.id}.mp4`;

  const { error: uploadError } = await supabase.storage
    .from("generated-videos")
    .upload(storagePath, outputBuffer, { contentType: "video/mp4", upsert: true });
  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  const totalDuration = STORYBOARD_SLIDE_SECONDS * localPaths.length;
  const renderCost = estimateRenderCost(renderDurationMs);
  const { storageCost, egressCost } = estimateStorageAndEgressCost(outputBuffer.length);

  const { data: existingVideo } = await supabase
    .from("generated_videos")
    .select("ai_cost_estimate")
    .eq("id", video.id)
    .single();
  const aiCost = existingVideo?.ai_cost_estimate ?? 0;

  await supabase
    .from("generated_videos")
    .update({
      status: "completed",
      storage_path: storagePath,
      duration_seconds: totalDuration,
      ai_cost_estimate: aiCost,
      render_duration_ms: renderDurationMs,
      render_cost_estimate: renderCost,
      output_bytes: outputBuffer.length,
      storage_cost_estimate: storageCost,
      egress_cost_estimate: egressCost,
      total_cost_estimate: aiCost + renderCost + storageCost + egressCost,
    })
    .eq("id", video.id);

  return { storagePath };
}

/**
 * Resolves any asset (photo or video clip) to a local still-image file
 * PromoFlow's slideshow renderer can use. Video clips get their first
 * frame extracted; photos are downloaded as-is.
 */
async function resolveClipToImage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workDir: string,
  assetId: string,
  index: number
): Promise<string> {
  const { data: asset } = await supabase
    .from("assets")
    .select("id, storage_path, kind")
    .eq("id", assetId)
    .single();

  if (!asset) throw new Error(`Clip asset ${assetId} not found`);

  if (asset.kind === "photo") {
    return downloadToTemp(supabase, "assets", asset.storage_path, workDir, `clip-${index}.jpg`);
  }

  // Video clip — extract a representative frame.
  const rawVideoPath = await downloadToTemp(
    supabase,
    "assets",
    asset.storage_path,
    workDir,
    `clip-${index}-source.mp4`
  );
  const framePath = path.join(workDir, `clip-${index}.jpg`);
  await new Promise<void>((resolve, reject) => {
    ffmpeg(rawVideoPath)
      .inputOptions(["-ss 0.1"])
      .outputOptions(["-frames:v 1"])
      .output(framePath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
  return framePath;
}

async function renderBeforeAfter(
  supabase: Awaited<ReturnType<typeof createClient>>,
  video: {
    id: string;
    user_id: string;
    channel_id: string;
    product_id: string | null;
    config: unknown;
    overlay_text: string | null;
  },
  workDir: string
) {
  const config = video.config as {
    mode?: "transformation" | "product_journey" | "viral_hook";
    clip_ids?: string[];
    // legacy shape, still supported for previously-queued rows:
    before_asset_id?: string;
    after_asset_id?: string;
  } | null;

  let clipIds: string[];
  const mode = config?.mode ?? "transformation";

  if (config?.clip_ids?.length) {
    clipIds = config.clip_ids;
  } else if (config?.before_asset_id && config?.after_asset_id) {
    // Legacy queued rows from before the multi-mode flow.
    clipIds = [config.before_asset_id, config.after_asset_id];
  } else {
    throw new Error("Missing clip selection for this video");
  }

  const images = await Promise.all(
    clipIds.map((assetId, i) => resolveClipToImage(supabase, workDir, assetId, i))
  );

  const outputPath = path.join(workDir, "output.mp4");

  let captionAssets: { fontPath: string; captionFilePath: string } | null = null;
  if (video.overlay_text && video.overlay_text.trim()) {
    captionAssets = await writeCaptionAssets(supabase, workDir, video.overlay_text);
  }

  const renderStart = Date.now();
  await new Promise<void>((resolve, reject) => {
    const command = ffmpeg();

    images.forEach((img) => {
      command.input(img).inputOptions(["-loop 1", `-t ${SLIDE_SECONDS}`]);
    });

    const fadeOutStart = (SLIDE_SECONDS - FADE_SECONDS).toFixed(2);
    const perImageFilters = images
      .map(
        (_, i) =>
          `[${i}:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,fade=t=in:st=0:d=${FADE_SECONDS},fade=t=out:st=${fadeOutStart}:d=${FADE_SECONDS}[v${i}]`
      )
      .join(";");

    const concatInputs = images.map((_, i) => `[v${i}]`).join("");
    let filterComplex = `${perImageFilters};${concatInputs}concat=n=${images.length}:v=1:a=0[vconcat]`;
    let finalLabel = "vconcat";

    if (captionAssets) {
      // Viral Hook: the hook text is specifically "burned onto the Before
      // clip" per the spec — restrict it to just the first slide's window.
      // Other modes keep the existing full-video caption behavior.
      const enableClause =
        mode === "viral_hook" ? `:enable='between(t\\,0\\,${SLIDE_SECONDS})'` : "";
      filterComplex += `;[vconcat]drawtext=fontfile=${captionAssets.fontPath}:textfile=${captionAssets.captionFilePath}:fontcolor=white:fontsize=54:x=(w-text_w)/2:y=h*0.10:box=1:boxcolor=black@0.45:boxborderw=24:line_spacing=10${enableClause}[vout]`;
      finalLabel = "vout";
    }

    command
      .complexFilter(filterComplex, finalLabel)
      .outputOptions([
        "-c:v libx264",
        "-crf 18",
        "-pix_fmt yuv420p",
        "-movflags +faststart",
        "-preset medium",
        "-r 30",
      ])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
  const renderDurationMs = Date.now() - renderStart;

  const outputBuffer = await readFile(outputPath);
  const storagePath = `${video.user_id}/${video.channel_id}/${video.id}.mp4`;

  const { error: uploadError } = await supabase.storage
    .from("generated-videos")
    .upload(storagePath, outputBuffer, { contentType: "video/mp4", upsert: true });
  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  const totalDuration = SLIDE_SECONDS * images.length;
  const renderCost = estimateRenderCost(renderDurationMs);
  const { storageCost, egressCost } = estimateStorageAndEgressCost(outputBuffer.length);

  const { data: existingVideo } = await supabase
    .from("generated_videos")
    .select("ai_cost_estimate")
    .eq("id", video.id)
    .single();
  const aiCost = existingVideo?.ai_cost_estimate ?? 0;

  await supabase
    .from("generated_videos")
    .update({
      status: "completed",
      storage_path: storagePath,
      duration_seconds: totalDuration,
      ai_cost_estimate: aiCost,
      render_duration_ms: renderDurationMs,
      render_cost_estimate: renderCost,
      output_bytes: outputBuffer.length,
      storage_cost_estimate: storageCost,
      egress_cost_estimate: egressCost,
      total_cost_estimate: aiCost + renderCost + storageCost + egressCost,
    })
    .eq("id", video.id);

  return { storagePath };
}
