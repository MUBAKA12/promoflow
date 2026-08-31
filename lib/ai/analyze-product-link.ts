import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const SYSTEM_PROMPT = `You read a product page's raw HTML/text (from a TikTok Shop or similar e-commerce link) and extract structured info for a marketing tool.

Return ONLY valid JSON, no other text, in this exact shape:
{
  "product_name": "string",
  "category": "short category label, e.g. 'Beauty / Skincare'",
  "brand": "string or null",
  "selling_points": ["short bullet", "short bullet"],
  "suggested_content_angles": ["short content angle", "short content angle"],
  "summary": "one or two sentence plain-language summary of what the product is and does"
}

Rules:
- Base everything only on what's actually in the page content. Never invent claims not present on the page.
- For supplement/wellness/health-adjacent products, do NOT restate medical claims as fact — reframe as lifestyle/content language.
- suggested_content_angles should be short-form-video ideas, not medical claims.
- If the page content is unclear, return your best guess with fewer fields filled.`;

export async function analyzeProductLink(productId: string) {
  const supabase = await createClient();
  const { data: product } = await supabase.from("products").select("id, shop_link, name").eq("id", productId).single();
  if (!product?.shop_link || !process.env.ANTHROPIC_API_KEY) return null;

  let pageText = "";
  try {
    const pageResp = await fetch(product.shop_link, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" },
      redirect: "follow",
    });
    const html = await pageResp.text();
    pageText = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 12000);
  } catch (err) {
    console.error("product link fetch failed", err);
  }

  if (!pageText || pageText.length < 50) {
    const result = { error: "could_not_read_page", note: "The link may require a browser to load (JS-rendered) or blocks automated requests." };
    await supabase.from("products").update({ ai_link_analysis: result, link_analyzed_at: new Date().toISOString() }).eq("id", productId);
    return result;
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Product name as entered by the user: "${product.name}"\n\nPage content:\n${pageText}` }],
    });
    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") throw new Error("No text response");
    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Could not parse model output");
    const analysis = JSON.parse(jsonMatch[0]);
    await supabase.from("products").update({ ai_link_analysis: analysis, link_analyzed_at: new Date().toISOString() }).eq("id", productId);
    return analysis;
  } catch (err) {
    console.error("analyze-product-link model error", err);
    return null;
  }
}
