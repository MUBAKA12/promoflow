import { estimateGeminiCost } from "@/lib/costs/pricing";

const GEMINI_BASE = "https://generativelanguage.googleapis.com";
const GEMINI_MODEL = "gemini-3.6-flash";

function guessMimeType(mimeType: string | null | undefined): string {
  if (mimeType?.includes("png")) return "image/png";
  if (mimeType?.includes("webp")) return "image/webp";
  if (mimeType?.includes("gif")) return "image/gif";
  return "image/jpeg";
}

function systemPromptFor(mode: "transformation" | "product_journey" | "viral_hook"): string {
  const base = `You write short-form video hooks for TikTok Shop affiliate content, based on a short slideshow ad.

You understand direct-response selling psychology — pain points, dream outcomes, curiosity gaps, social proof, before/after transformation, comparison/skepticism — and you pick whichever angles genuinely fit what's shown, not a fixed template.

For each hook, write:
- angle_label: a short 1-2 word label for the psychological angle used (e.g. "Pain point", "Dream outcome", "Curiosity", "Skeptic/comparison", "Social proof")
- hook_text: the opening line, under 12 words, first-person or POV style, no hard-sell language, no medical/health claims — content framing only
- caption_text: a short caption to post alongside the video, under 15 words, can include 1-2 relevant hashtags

Return ONLY a JSON array, no other text, in this exact shape:
[{"angle_label": "...", "hook_text": "...", "caption_text": "..."}, ...]

Rules:
- Every hook must be genuinely different in angle, not just reworded
- Never invent product claims not supported by the images or product info given
- Never use medical/diagnostic language for health or wellness products — reframe as lifestyle/content language
- Keep everything short — this is for on-screen text and captions, not paragraphs`;

  if (mode === "viral_hook") {
    return `${base}

This is a "Viral Hook" video: it shows a "before" clip then a product clip, and the hook_text will be burned as on-screen text directly over the BEFORE clip only. Write hooks that work as a scroll-stopping opener layered on top of that before footage — think POV/relatable-moment style text, not a narrated caption.`;
  }
  if (mode === "product_journey") {
    return `${base}

This shows a "before" image, then the product, then the "after" result, in that order — a journey from problem to product to payoff. Write hooks that work as the opening line while this sequence plays.`;
  }
  return `${base}

This shows a "before" image, then an "after" result, then the product, in that order — a classic transformation reveal. Write hooks that work as the opening line while this sequence plays.`;
}

export async function generateBeforeAfterHooks(input: {
  mode: "transformation" | "product_journey" | "viral_hook";
  beforeImage: { buffer: Buffer; mimeType: string | null };
  productImage?: { buffer: Buffer; mimeType: string | null } | null;
  afterImage?: { buffer: Buffer; mimeType: string | null } | null;
  productName: string;
  productSummary?: string | null;
  sellingPoints?: string[] | null;
  count: number;
}): Promise<
  | {
      ok: true;
      hooks: { angle_label: string; hook_text: string; caption_text: string }[];
      costPerHook: number;
    }
  | { ok: false; error: string }
> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "GEMINI_API_KEY is not configured on the server." };
  }

  try {
    const parts: Array<Record<string, unknown>> = [
      {
        inline_data: {
          mime_type: guessMimeType(input.beforeImage.mimeType),
          data: input.beforeImage.buffer.toString("base64"),
        },
      },
    ];

    const imageOrder: string[] = ["before"];

    if (input.mode === "product_journey" || input.mode === "viral_hook") {
      if (input.productImage) {
        parts.push({
          inline_data: {
            mime_type: guessMimeType(input.productImage.mimeType),
            data: input.productImage.buffer.toString("base64"),
          },
        });
        imageOrder.push("product");
      }
      if (input.afterImage) {
        parts.push({
          inline_data: {
            mime_type: guessMimeType(input.afterImage.mimeType),
            data: input.afterImage.buffer.toString("base64"),
          },
        });
        imageOrder.push("after");
      }
    } else {
      // transformation: before -> after -> product
      if (input.afterImage) {
        parts.push({
          inline_data: {
            mime_type: guessMimeType(input.afterImage.mimeType),
            data: input.afterImage.buffer.toString("base64"),
          },
        });
        imageOrder.push("after");
      }
      if (input.productImage) {
        parts.push({
          inline_data: {
            mime_type: guessMimeType(input.productImage.mimeType),
            data: input.productImage.buffer.toString("base64"),
          },
        });
        imageOrder.push("product");
      }
    }

    const promptText = `${systemPromptFor(input.mode)}

Product: ${input.productName}
${input.productSummary ? `Summary: ${input.productSummary}\n` : ""}${
      input.sellingPoints?.length ? `Selling points: ${input.sellingPoints.join(", ")}\n` : ""
    }
The images above are shown in this order: ${imageOrder.join(" then ")}.

Write ${input.count} different hooks for this video.`;

    parts.push({ text: promptText });

    const genRes = await fetch(
      `${GEMINI_BASE}/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts }] }),
      }
    );

    if (!genRes.ok) {
      return { ok: false, error: `Gemini request failed (${genRes.status}): ${await genRes.text()}` };
    }

    const genJson = await genRes.json();
    const text = genJson.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return { ok: false, error: `Gemini returned no text. Raw response: ${JSON.stringify(genJson).slice(0, 500)}` };
    }

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return { ok: false, error: `Could not parse hooks from Gemini's response: ${text.slice(0, 300)}` };
    }

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
