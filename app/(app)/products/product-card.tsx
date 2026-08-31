"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createProductAsset, rereadProductLink } from "./actions";
import { Upload, Sparkles, Loader2, RefreshCw, AlertCircle } from "lucide-react";

type LinkAnalysis = {
  product_name?: string;
  category?: string;
  brand?: string | null;
  selling_points?: string[];
  suggested_content_angles?: string[];
  summary?: string;
  error?: string;
  note?: string;
} | null;

type ProductAsset = {
  id: string;
  name: string;
  kind: string;
  storage_path: string;
  ai_tags: { concern_or_angle?: string } | null;
};

export default function ProductCard({
  product,
  channelId,
  initialClips,
}: {
  product: {
    id: string;
    name: string;
    category: string | null;
    notes: string | null;
    shop_link: string | null;
    active: boolean;
    ai_link_analysis: LinkAnalysis;
    link_analyzed_at: string | null;
  };
  channelId: string;
  initialClips: ProductAsset[];
}) {
  const [clips, setClips] = useState(initialClips);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [rereading, setRereading] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const analysis = product.ai_link_analysis;
  const linkFailed = analysis?.error === "could_not_read_page";

  async function getSignedUrl(path: string) {
    if (urls[path]) return urls[path];
    const supabase = createClient();
    const { data } = await supabase.storage.from("assets").createSignedUrl(path, 3600);
    if (data?.signedUrl) setUrls((prev) => ({ ...prev, [path]: data.signedUrl }));
    return data?.signedUrl ?? "";
  }

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setUploadError(null);
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setUploading(false);
      return;
    }

    for (const file of Array.from(files)) {
      const isVideo = file.type.startsWith("video/");
      const path = `${user.id}/${channelId}/products/${product.id}/${Date.now()}-${file.name}`;

      const { error: storageError } = await supabase.storage.from("assets").upload(path, file);
      if (storageError) {
        console.error(storageError);
        setUploadError(`Upload failed: ${storageError.message}`);
        continue;
      }

      const assetId = await createProductAsset({
        productId: product.id,
        channelId,
        name: file.name,
        kind: isVideo ? "other_clip" : "photo",
        storagePath: path,
        mimeType: file.type,
        sizeBytes: file.size,
      });

      const newClip: ProductAsset = {
        id: assetId,
        name: file.name,
        kind: isVideo ? "other_clip" : "photo",
        storage_path: path,
        ai_tags: null,
      };
      setClips((prev) => [newClip, ...prev]);

      if (!isVideo) {
        fetch("/api/analyze-asset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assetId }),
        })
          .then((r) => r.json())
          .then((result) => {
            if (result.aiTags) {
              setClips((prev) =>
                prev.map((c) => (c.id === assetId ? { ...c, ai_tags: result.aiTags } : c))
              );
            }
          });
      }
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleReread() {
    setRereading(true);
    await rereadProductLink(product.id);
    setRereading(false);
    window.location.reload();
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-start justify-between mb-1">
        <span className="font-medium">{product.name}</span>
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            product.active
              ? "bg-[var(--accent-dim)] text-[var(--accent)]"
              : "bg-[var(--surface-raised)] text-[var(--text-muted)]"
          }`}
        >
          {product.active ? "Active" : "Inactive"}
        </span>
      </div>
      {product.category && (
        <p className="text-xs text-[var(--text-muted)] mb-1">{product.category}</p>
      )}
      {product.notes && (
        <p className="text-sm text-[var(--text-muted)] line-clamp-2 mb-2">{product.notes}</p>
      )}

      {product.shop_link && (
        <div className="mt-2 rounded-lg bg-[var(--accent-soft)] border border-[var(--accent-dim)] p-2.5">
          {analysis && !linkFailed ? (
            <>
              <div className="flex items-center gap-1.5 text-xs text-[var(--accent)] font-medium mb-1">
                <Sparkles size={12} /> Read from link
              </div>
              {analysis.summary && (
                <p className="text-xs text-[var(--text-muted)] mb-1.5">{analysis.summary}</p>
              )}
              {!!analysis.suggested_content_angles?.length && (
                <div className="flex flex-wrap gap-1">
                  {analysis.suggested_content_angles.slice(0, 4).map((a) => (
                    <span
                      key={a}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-raised)] text-[var(--text-muted)]"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : linkFailed ? (
            <div className="flex items-start gap-1.5 text-xs text-[var(--warn)]">
              <AlertCircle size={12} className="mt-0.5 shrink-0" />
              <span>
                Couldn&apos;t read this link automatically — {analysis?.note ?? "it may block automated requests."}
              </span>
            </div>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">Not read yet.</p>
          )}
          <button
            onClick={handleReread}
            disabled={rereading}
            className="mt-1.5 flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--accent)]"
          >
            {rereading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            Re-read link
          </button>
        </div>
      )}

      <div className="mt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-[var(--text-muted)]">
            Product-specific clips ({clips.length})
          </span>
          <label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
            <span className="cursor-pointer flex items-center gap-1 text-xs text-[var(--accent)]">
              {uploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
              Add clip
            </span>
          </label>
        </div>

        {uploadError && (
          <p className="text-xs text-red-400 mb-1.5">{uploadError}</p>
        )}

        {!!clips.length && (
          <div className="grid grid-cols-4 gap-1.5">
            {clips.map((c) => (
              <ClipThumb key={c.id} clip={c} getSignedUrl={getSignedUrl} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ClipThumb({
  clip,
  getSignedUrl,
}: {
  clip: ProductAsset;
  getSignedUrl: (path: string) => Promise<string>;
}) {
  const [url, setUrl] = useState<string | null>(null);
  if (!url) getSignedUrl(clip.storage_path).then(setUrl);

  return (
    <div className="aspect-square rounded-md bg-[var(--surface-raised)] overflow-hidden relative group">
      {url && clip.kind === "photo" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={clip.name} className="w-full h-full object-cover" />
      )}
      {url && clip.kind !== "photo" && (
        <video src={url} className="w-full h-full object-cover" muted />
      )}
      {clip.ai_tags?.concern_or_angle && (
        <span className="absolute bottom-0 left-0 right-0 bg-black/70 text-[9px] px-1 py-0.5 truncate">
          {clip.ai_tags.concern_or_angle}
        </span>
      )}
    </div>
  );
}
