import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const SYSTEM_PROMPT = `You are a content-classification assistant for a short-form video marketing tool.
You look at a photo and suggest CONTENT/MARKETING framing only — never a medical, health, or diagnostic assessment.

Classify the image and return ONLY valid JSON, no other text, in this exact shape:
{
  "suggested_stage": "before" | "after" | "hook" | "product",
  "concern_or_angle": "short content-angle label, e.g. 'morning puffiness', 'glow', 'confident pose', 'product showcase'",
  "mood": "one word: tired | confident | neutral | energetic | playful",
  "angle": "front" | "side" | "three-quarter",
  "confidence": 0.0 to 1.0
}

Rules:
- Never use medical or diagnostic language. Frame everything as content/marketing language a creator would use.
- If the image shows a product/object rather than a person, suggested_stage should be "product".
- If uncertain, lower the confidence score rather than guessing wildly.`;

export async function POST(request: Request) {
  try {
    const { assetId } = await request.json();
    if (!assetId) return NextResponse.json({ error: "assetId is required" }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: asset, error: fetchError } = await supabase
      .from("assets")
      .select("id, storage_path, kind, mime_type, user_id")
      .eq("id", assetId)
      .single();

    if (fetchError || !asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    if (asset.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (asset.kind !== "photo") return NextResponse.json({ skipped: true, reason: "video_analysis_not_supported" });
    if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ skipped: true, reason: "no_api_key" });

    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from("assets")
      .createSignedUrl(asset.storage_path, 60);
    if (urlError || !signedUrlData) return NextResponse.json({ error: "Could not read asset" }, { status: 500 });

    const imageResp = await fetch(signedUrlData.signedUrl);
    const imageBuffer = Buffer.from(await imageResp.arrayBuffer());
    const base64 = imageBuffer.toString("base64");
    const mediaType = asset.mime_type?.includes("png") ? "image/png" : "image/jpeg";

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
        { type: "text", text: "Classify this image." },
      ]}],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") throw new Error("No text response from model");
    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Could not parse model output");
    const aiTags = JSON.parse(jsonMatch[0]);

    await supabase.from("assets").update({ ai_tags: aiTags, ai_analyzed_at: new Date().toISOString() }).eq("id", assetId);
    return NextResponse.json({ aiTags });
  } catch (err) {
    console.error("analyze-asset error", err);
    return NextResponse.json({ skipped: true, reason: "analysis_failed" });
  }
}
