import { createClient } from "@/lib/supabase/server";
import { estimateGeminiCost } from "@/lib/costs/pricing";

const GEMINI_BASE = "https://generativelanguage.googleapis.com";
const GEMINI_MODEL = "gemini-3.6-flash";

const SYSTEM_PROMPT = `You write short-form video hooks for TikTok Shop affiliate content. You understand direct-response selling psychology — pain points, dream outcomes, curiosity gaps, social proof, before/after transformation, comparison/skepticism — and you pick whichever angles genuinely fit the specific product, not a fixed template.

If a video is attached, actually watch it — base the hooks on what's really shown, not generic guesses. If no video is attached, base the hooks on the product info alone.

For each hook, write:
- angle_label: a short 1-2 word label for the psychological angle used
- hook_text: the opening line, under 12 words, first-person or POV style, no hard-sell language, no medical/health claims
- caption_text: a short caption to post alongside the video, under 15 words, can include 1-2 relevant hashtags

Return ONLY a JSON array, no other text, in this exact shape:
[{"angle_label": "...", "hook_text": "...", "caption_text": "..."}, ...]

Rules:
- Every hook must be genuinely different in angle, not just reworded
- Never invent product claims not supported by the product info or video given
- Never use medical/diagnostic language for health or wellness products
- Keep everything short`;

async function uploadVideoToGemini(apiKey: string, buffer: Buffer, mimeType: string): Promise<{ uri: string; name: string; mimeType: string }> {
  const startRes = await fetch(`${GEMINI_BASE}/upload/v1beta/files?key=${apiKey}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(buffer.length),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: "ad-remix-creative" } }),
  });
  if (!startRes.ok) throw new Error(`Gemini upload init failed (${startRes.status}): ${await startRes.text()}`);
  const uploadUrl = startRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini did not return an upload URL");
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Length": String(buffer.length), "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" },
    body: new Uint8Array(buffer),
  });
  if (!uploadRes.ok) throw new Error(`Gemini file upload failed (${uploadRes.status}): ${await uploadRes.text()}`);
  const uploadJson = await uploadRes.json();
  const file = uploadJson.file;
  if (!file?.uri || !file?.name) throw new Error(`Gemini upload response missing file info: ${JSON.stringify(uploadJson)}`);
  return { uri: file.uri, name: file.name, mimeType: file.mimeType ?? mimeType };
}

async function waitForFileActive(apiKey: string, fileName: string): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${GEMINI_BASE}/v1beta/${fileName}?key=${apiKey}`);
    if (!res.ok) throw new Error(`Gemini file status check failed (${res.status}): ${await res.text()}`);
    const json = await res.json();
    if (json.state === "ACTIVE") return;
    if (json.state === "FAILED") throw new Error("Gemini failed to process the uploaded video");
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("Timed out waiting for Gemini to finish processing the video");
}

export async function generateHooks(input: {
  videoBuffer?: Buffer | null; videoMimeType?: string | null; productName: string;
  productSummary?: string | null; sellingPoints?: string[] | null; count: number;
}): Promise<
  | { ok: true; hooks: { angle_label: string; hook_text: string; caption_text: string }[]; costPerHook: number }
  | { ok: false; error: string }
> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, error: "GEMINI_API_KEY is not configured on the server." };
  try {
    const parts: Array<Record<string, unknown>> = [];
    if (input.videoBuffer && input.videoMimeType) {
      const uploaded = await uploadVideoToGemini(apiKey, input.videoBuffer, input.videoMimeType);
      await waitForFileActive(apiKey, uploaded.name);
      parts.push({ file_data: { mime_type: uploaded.mimeType, file_uri: uploaded.uri } });
    }
    const promptText = `${SYSTEM_PROMPT}\n\nProduct: ${input.productName}\n${input.productSummary ? `Summary: ${input.productSummary}\n` : ""}${input.sellingPoints?.length ? `Selling points: ${input.sellingPoints.join(", ")}\n` : ""}\nWrite ${input.count} different hooks for this product.`;
    parts.push({ text: promptText });
    const genRes = await fetch(`${GEMINI_BASE}/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts }] }),
    });
    if (!genRes.ok) return { ok: false, error: `Gemini request failed (${genRes.status}): ${await genRes.text()}` };
    const genJson = await genRes.json();
    const text = genJson.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { ok: false, error: `Gemini returned no text. Raw response: ${JSON.stringify(genJson).slice(0, 500)}` };
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return { ok: false, error: `Could not parse hooks from Gemini's response: ${text.slice(0, 300)}` };
    const hooks = JSON.parse(jsonMatch[0]);
    const promptTokens = genJson.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = genJson.usageMetadata?.candidatesTokenCount ?? 0;
    const totalCost = estimateGeminiCost(promptTokens, outputTokens);
    const costPerHook = hooks.length ? totalCost / hooks.length : 0;
    return { ok: true, hooks, costPerHook };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error calling Gemini" };
  }
}

export async function saveGeneratedHooks(creativeId: string, userId: string, hooks: { angle_label: string; hook_text: string; caption_text: string }[], costPerHook: number = 0) {
  const supabase = await createClient();
  const rows = hooks.map((h) => ({ creative_id: creativeId, user_id: userId, angle_label: h.angle_label, hook_text: h.hook_text, caption_text: h.caption_text, source: "ai" as const, ai_cost_estimate: costPerHook }));
  const { data, error } = await supabase.from("ad_remix_hooks").insert(rows).select("id");
  if (error) throw new Error(error.message);
  return data;
}
