import { createClient } from "@/lib/supabase/server";
import { estimateGeminiCost } from "@/lib/costs/pricing";

const GEMINI_BASE = "https://generativelanguage.googleapis.com";
const GEMINI_MODEL = "gemini-3.6-flash";

const SYSTEM_PROMPT = `You write short-form video hooks for TikTok Shop affiliate content, based on a storyboard — a sequence of photos that will play one after another as a slideshow video.

Look at all the photos together, in order, and understand the story they tell. Write hooks that work as the opening line while this sequence plays.

You understand direct-response selling psychology and pick whichever angles genuinely fit what's shown.

For each hook, write:
- angle_label: a short 1-2 word label for the psychological angle used
- hook_text: the opening line, under 12 words, first-person or POV style, no hard-sell language, no medical/health claims
- caption_text: a short caption to post alongside the video, under 15 words, can include 1-2 relevant hashtags

Return ONLY a JSON array, no other text, in this exact shape:
[{"angle_label": "...", "hook_text": "...", "caption_text": "..."}, ...]

Rules:
- Every hook must be genuinely different in angle
- Never invent product claims not supported by the photos or product info given
- Never use medical/diagnostic language for health or wellness products`;

function guessMimeType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

export async function generateStoryboardHooks(input: {
  images: { buffer: Buffer; storagePath: string }[]; productName: string;
  productSummary?: string | null; sellingPoints?: string[] | null; count: number;
}): Promise<
  | { ok: true; hooks: { angle_label: string; hook_text: string; caption_text: string }[]; costPerHook: number }
  | { ok: false; error: string }
> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, error: "GEMINI_API_KEY is not configured on the server." };
  if (!input.images.length) return { ok: false, error: "No storyboard images to analyze." };
  try {
    const parts: Array<Record<string, unknown>> = input.images.map((img) => ({
      inline_data: { mime_type: guessMimeType(img.storagePath), data: img.buffer.toString("base64") },
    }));
    const promptText = `${SYSTEM_PROMPT}\n\nProduct: ${input.productName}\n${input.productSummary ? `Summary: ${input.productSummary}\n` : ""}${input.sellingPoints?.length ? `Selling points: ${input.sellingPoints.join(", ")}\n` : ""}\nThis storyboard has ${input.images.length} photos, shown in the order given above.\n\nWrite ${input.count} different hooks for this storyboard.`;
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

export async function saveStoryboardHooks(creativeId: string, userId: string, hooks: { angle_label: string; hook_text: string; caption_text: string }[], costPerHook: number = 0) {
  const supabase = await createClient();
  const rows = hooks.map((h) => ({ creative_id: creativeId, user_id: userId, angle_label: h.angle_label, hook_text: h.hook_text, caption_text: h.caption_text, source: "ai" as const, ai_cost_estimate: costPerHook }));
  const { data, error } = await supabase.from("storyboard_hooks").insert(rows).select("id");
  if (error) throw new Error(error.message);
  return data;
}
