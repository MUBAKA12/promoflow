"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { deleteGeneratedVideo } from "./actions";
import { Loader2, Sparkles, Download, AlertCircle, Clock, Search, Trash2 } from "lucide-react";

type Video = {
  id: string;
  product_name: string | null;
  variation_index: number;
  status: string;
  storage_path: string | null;
  duration_seconds: number | null;
  channel_id: string;
  overlay_text: string | null;
  created_at: string;
};

export default function LibraryClient({
  channels,
  initialVideos,
}: {
  channels: { id: string; name: string }[];
  initialVideos: Video[];
}) {
  const [channelId, setChannelId] = useState(channels[0].id);
  const [videos, setVideos] = useState(initialVideos);
  const [renderingIds, setRenderingIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");

  const query = search.trim().toLowerCase();

  const visible = videos.filter((v) => {
    if (v.channel_id !== channelId) return false;
    if (!query) return true;
    const dateStr = new Date(v.created_at).toLocaleDateString().toLowerCase();
    const haystack = [v.product_name, v.overlay_text, dateStr]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });

  async function handleDelete(videoId: string) {
    setDeletingIds((prev) => new Set(prev).add(videoId));
    try {
      await deleteGeneratedVideo(videoId);
      setVideos((prev) => prev.filter((v) => v.id !== videoId));
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [videoId]: err instanceof Error ? err.message : "Delete failed",
      }));
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(videoId);
        return next;
      });
    }
  }

  async function render(videoId: string) {
    setRenderingIds((prev) => new Set(prev).add(videoId));
    setErrors((prev) => ({ ...prev, [videoId]: "" }));

    try {
      const res = await fetch("/api/render-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId }),
      });
      const result = await res.json();

      if (result.ok) {
        setVideos((prev) =>
          prev.map((v) =>
            v.id === videoId ? { ...v, status: "completed", storage_path: result.storagePath } : v
          )
        );
      } else {
        setErrors((prev) => ({ ...prev, [videoId]: result.error ?? "Render failed" }));
        setVideos((prev) => prev.map((v) => (v.id === videoId ? { ...v, status: "failed" } : v)));
      }
    } catch {
      setErrors((prev) => ({ ...prev, [videoId]: "Network error during render" }));
    } finally {
      setRenderingIds((prev) => {
        const next = new Set(prev);
        next.delete(videoId);
        return next;
      });
    }
  }

  return (
    <div className="p-10">
      <h1 className="font-display text-2xl font-semibold mb-1">Video library</h1>
      <p className="text-[var(--text-muted)] mb-6">
        Render turns a queued batch entry into a real downloadable MP4.
      </p>

      <div className="flex items-center gap-3 mb-6">
        <select
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
          className="rounded-lg bg-[var(--surface)] border border-[var(--border)] px-3.5 py-2 text-sm outline-none focus:border-[var(--accent)]"
        >
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by product, hook, or date…"
            className="w-full rounded-lg bg-[var(--surface)] border border-[var(--border)] pl-8 pr-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>
      </div>

      {!videos.filter((v) => v.channel_id === channelId).length ? (
        <div className="text-center py-20 text-[var(--text-muted)] text-sm">
          No videos queued yet — go to Generate to queue a batch.
        </div>
      ) : !visible.length ? (
        <div className="text-center py-20 text-[var(--text-muted)] text-sm">
          No videos match &ldquo;{search}&rdquo;.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {visible.map((v) => (
            <VideoCard
              key={v.id}
              video={v}
              rendering={renderingIds.has(v.id)}
              deleting={deletingIds.has(v.id)}
              error={errors[v.id]}
              onRender={() => render(v.id)}
              onDelete={() => handleDelete(v.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VideoCard({
  video,
  rendering,
  deleting,
  error,
  onRender,
  onDelete,
}: {
  video: Video;
  rendering: boolean;
  deleting: boolean;
  error?: string;
  onRender: () => void;
  onDelete: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  if (video.status === "completed" && video.storage_path && !url) {
    const supabase = createClient();
    supabase.storage
      .from("generated-videos")
      .createSignedUrl(video.storage_path, 3600, { download: `promoflow-${video.id}.mp4` })
      .then(({ data }) => {
        if (data?.signedUrl) setUrl(data.signedUrl);
      });
  }

  async function handleDownload() {
    if (!url) return;
    setDownloading(true);
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `promoflow-${(video.product_name ?? "video").slice(0, 24).replace(/[^a-z0-9]+/gi, "-")}-v${video.variation_index + 1}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error("Download failed", err);
    } finally {
      setDownloading(false);
    }
  }

  function handleRerender() {
    setUrl(null);
    onRender();
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="aspect-[9/16] bg-[var(--surface-raised)] relative flex items-center justify-center">
        {video.status === "completed" && url ? (
          <video src={url} className="w-full h-full object-cover" controls />
        ) : video.status === "failed" ? (
          <AlertCircle size={24} className="text-red-400" />
        ) : (
          <Clock size={24} className="text-[var(--text-muted)]" />
        )}
      </div>

      <div className="p-3">
        <p className="text-sm font-medium truncate mb-0.5">
          {video.product_name ?? "Untitled"}
        </p>
        <p className="text-xs text-[var(--text-muted)] mb-2">Variation {video.variation_index + 1}</p>
        {video.overlay_text && (
          <p className="text-xs text-[var(--accent)] line-clamp-2 mb-2">&ldquo;{video.overlay_text}&rdquo;</p>
        )}

        {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

        {video.status === "completed" && url ? (
          <div className="space-y-1.5">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[var(--accent)] text-white py-1.5 text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
              {downloading ? "Saving…" : "Download"}
            </button>
            <button
              onClick={handleRerender}
              disabled={rendering}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[var(--surface-raised)] text-[var(--text-muted)] py-1.5 text-xs font-medium hover:text-[var(--accent)] transition-colors disabled:opacity-50"
            >
              {rendering ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {rendering ? "Re-rendering…" : "Re-render"}
            </button>
            <button
              onClick={onDelete}
              disabled={deleting}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[var(--surface-raised)] text-red-400 py-1.5 text-xs font-medium hover:bg-red-400/10 transition-colors disabled:opacity-50"
            >
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <button
              onClick={onRender}
              disabled={rendering}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[var(--accent-dim)] text-[var(--accent)] py-1.5 text-xs font-medium hover:opacity-80 transition-opacity disabled:opacity-50"
            >
              {rendering ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Sparkles size={12} />
              )}
              {rendering ? "Rendering…" : video.status === "failed" ? "Retry render" : "Render"}
            </button>
            <button
              onClick={onDelete}
              disabled={deleting || rendering}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[var(--surface-raised)] text-red-400 py-1.5 text-xs font-medium hover:bg-red-400/10 transition-colors disabled:opacity-50"
            >
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
