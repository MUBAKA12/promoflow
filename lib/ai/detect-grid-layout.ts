const GEMINI_BASE = "https://generativelanguage.googleapis.com";
const GEMINI_MODEL = "gemini-3.6-flash";

const SYSTEM_PROMPT = `You look at an uploaded image and determine whether it is a single collage/grid image made of several smaller photos tiled together edge-to-edge, arranged in a regular rows x columns pattern.

Return ONLY valid JSON, no other text, in this exact shape:
{"rows": number, "cols": number, "confidence": 0.0 to 1.0}

Rules:
- rows x cols must equal the total number of distinct photo tiles you can see in the grid.
- If the image is just one single ordinary photo (not a collage), return {"rows": 1, "cols": 1, "confidence": <your confidence>}.
- Keep rows and cols between 1 and 6.`;

function guessMimeType(mimeType: string): string {
  if (mimeType.includes("png")) return "image/png";
  if (mimeType.includes("webp")) return "image/webp";
  if (mimeType.includes("gif")) return "image/gif";
  return "image/jpeg";
}

export type GridDetectionResult = { rows: number; cols: number; confidence: number; error: string | null };

export async function detectGridLayout(imageBuffer: Buffer, mimeType: string): Promise<GridDetectionResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { rows: 1, cols: 1, confidence: 0, error: "GEMINI_API_KEY not configured" };
  try {
    const parts = [
      { inline_data: { mime_type: guessMimeType(mimeType), data: imageBuffer.toString("base64") } },
      { text: `${SYSTEM_PROMPT}\n\nAnalyze this image's grid layout.` },
    ];
    const genRes = await fetch(`${GEMINI_BASE}/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts }] }),
    });
    if (!genRes.ok) {
      const errText = await genRes.text();
      return { rows: 1, cols: 1, confidence: 0, error: `Gemini request failed (${genRes.status}): ${errText.slice(0, 400)}` };
    }
    const genJson = await genRes.json();
    const text = genJson.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { rows: 1, cols: 1, confidence: 0, error: `Gemini returned no text: ${JSON.stringify(genJson).slice(0, 400)}` };
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { rows: 1, cols: 1, confidence: 0, error: `Could not parse Gemini response as JSON: ${text.slice(0, 400)}` };
    const parsed = JSON.parse(jsonMatch[0]);
    const rows = Math.max(1, Math.min(6, Math.round(Number(parsed.rows) || 1)));
    const cols = Math.max(1, Math.min(6, Math.round(Number(parsed.cols) || 1)));
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.5;
    return { rows, cols, confidence, error: null };
  } catch (err) {
    return { rows: 1, cols: 1, confidence: 0, error: err instanceof Error ? err.message : "Unknown error calling Gemini" };
  }
}
