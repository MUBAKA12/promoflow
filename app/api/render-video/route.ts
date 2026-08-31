import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderGeneratedVideo } from "@/lib/render/render-video";

export const maxDuration = 60;

export async function POST(request: Request) {
  const { videoId } = await request.json();
  if (!videoId) return NextResponse.json({ error: "videoId is required" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: video } = await supabase
    .from("generated_videos")
    .select("user_id")
    .eq("id", videoId)
    .single();
  if (!video || video.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await renderGeneratedVideo(videoId);
    return NextResponse.json({ ok: true, storagePath: result.storagePath });
  } catch (err) {
    console.error("render-video error", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Render failed" },
      { status: 500 }
    );
  }
}
