"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createAssetRecord, acceptSuggestedStage, updateAssetStage } from "./actions";
import { Upload, Check, Pencil, Sparkles, Loader2 } from "lucide-react";

type Asset = {
  id: string;
  name: string;
  kind: string;
  stage: string;
  storage_path: string;
  mime_type: string | null;
  ai_tags: {
    suggested_stage?: string;
    concern_or_angle?: string;
    mood?: string;
    angle?: string;
    confidence?: number;
  } | null;
  ai_analyzed_at: string | null;
  channel_id: string;
  created_at: string;
};

const STAGES = ["hook", "before", "after", "product"] as const;

export default function AssetLibraryClient({
  channels,
  initialAssets,
}: {
  channels: { id: string; name: string }[];
  initialAssets: Asset[];
}) {
  const [channelId, setChannelId] = useState(channels[0].id);
  const [assets, setAssets] = useState<Asset[]>(initialAssets);
  const [uploading, setUploading] = useState(false);
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
  const [urls, setUrls] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const visibleAssets = assets.filter((a) => a.channel_id === channelId);

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
    const supabase = createClient();

    for (const file of Array.from(files)) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) continue;

      const isVideo = file.type.startsWith("video/");
      const path = `${user.id}/${channelId}/${Date.now()}-${file.name}`;

      const { error: uploadError } = await supabase.storage.from("assets").upload(path, file);
      if (uploadError) {
        console.error(uploadError);
        continue;
      }

      const assetId = await createAssetRecord({
        channelId,
        name: file.name,
        kind: isVideo ? "other_clip" : "photo",
        storagePath: path,
        mimeType: file.type,
        sizeBytes: file.size,
      });

      const newAsset: Asset = {
        id: assetId,
        name: file.name,
        kind: isVideo ? "other_clip" : "photo",
        stage: "before",
        storage_path: path,
        mime_type: file.type,
        ai_tags: null,
        ai_analyzed_at: null,
        channel_id: channelId,
        created_at: new Date().toISOString(),
      };
      setAssets((prev) => [newAsset, ...prev]);

      if (!isVideo) {
        setAnalyzingIds((prev) => new Set(prev).add(assetId));
        fetch("/api/analyze-asset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assetId }),
        })
          .then((r) => r.json())
          .then((result) => {
            if (result.aiTags) {
              setAssets((prev) =>
                prev.map((a) =>
                  a.id === assetId
                    ? { ...a, ai_tags: result.aiTags, ai_analyzed_at: new Date().toISOString() }
                    : a
                )
              );
            }
          })
          .finally(() => {
            setAnalyzingIds((prev) => {
              const next = new Set(prev);
              next.delete(assetId);
              return next;
            });
          });
      }
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function accept(asset: Asset) {
    const stage = asset.ai_tags?.suggested_stage ?? asset.stage;
    await acceptSuggestedStage(asset.id, stage);
    setAssets((prev) => prev.map((a) => (a.id === asset.id ? { ...a, stage } : a)));
  }

  async function setStage(asset: Asset, stage: string) {
    await updateAssetStage(asset.id, stage);
    setAssets((prev) => prev.map((a) => (a.id === asset.id ? { ...a, stage } : a)));
  }

  return (
    <div className="p-10">
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display text-2xl font-semibold">Asset library</h1>
      </div>
      <p className="text-[var(--text-muted)] mb-6">
        Upload once, reuse everywhere. Photos are auto-analyzed for stage and content angle.
      </p>

      <div className="flex items-center gap-3 mb-8">
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

        <label className="ml-auto">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
          <span className="cursor-pointer flex items-center gap-2 rounded-lg bg-[var(--accent)] text-white px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity">
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            Upload assets
          </span>
        </label>
      </div>

      {!visibleAssets.length ? (
        <div className="text-center py-20 text-[var(--text-muted)] text-sm">
          No assets in this channel yet — upload your first photo or clip above.
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {visibleAssets.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              analyzing={analyzingIds.has(asset.id)}
              getSignedUrl={getSignedUrl}
              onAccept={() => accept(asset)}
              onSetStage={(s) => setStage(asset, s)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AssetCard({
  asset,
  analyzing,
  getSignedUrl,
  onAccept,
  onSetStage,
}: {
  asset: Asset;
  analyzing: boolean;
  getSignedUrl: (path: string) => Promise<string>;
  onAccept: () => void;
  onSetStage: (stage: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  if (!url) {
    getSignedUrl(asset.storage_path).then(setUrl);
  }

  const hasSuggestion =
    asset.ai_tags?.suggested_stage && asset.ai_tags.suggested_stage !== asset.stage;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="aspect-[9/16] bg-[var(--surface-raised)] relative">
        {url && asset.kind === "photo" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={asset.name} className="w-full h-full object-cover" />
        )}
        {url && asset.kind !== "photo" && (
          <video src={url} className="w-full h-full object-cover" muted />
        )}
        <span className="absolute top-2 left-2 rounded-md bg-black/60 backdrop-blur px-2 py-0.5 text-xs capitalize">
          {asset.stage}
        </span>
        {analyzing && (
          <span className="absolute top-2 right-2 rounded-md bg-black/60 backdrop-blur px-2 py-0.5 text-xs flex items-center gap-1">
            <Loader2 size={11} className="animate-spin" /> Analyzing
          </span>
        )}
      </div>

      <div className="p-3">
        <p className="text-xs text-[var(--text-muted)] truncate mb-2">{asset.name}</p>

        {asset.ai_tags && !editing && (
          <div className="rounded-lg bg-[var(--accent-soft)] border border-[var(--accent-dim)] p-2.5 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-[var(--accent)] font-medium">
              <Sparkles size={12} />
              AI suggested
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              <span className="capitalize text-[var(--text)]">
                {asset.ai_tags.suggested_stage}
              </span>
              {asset.ai_tags.concern_or_angle && ` · ${asset.ai_tags.concern_or_angle}`}
            </p>
            {hasSuggestion && (
              <div className="flex gap-1.5 pt-1">
                <button
                  onClick={onAccept}
                  className="flex items-center gap-1 rounded-md bg-[var(--accent)] text-white px-2 py-1 text-xs font-medium"
                >
                  <Check size={11} /> Accept
                </button>
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1 rounded-md bg-[var(--surface-raised)] px-2 py-1 text-xs"
                >
                  <Pencil size={11} /> Edit
                </button>
              </div>
            )}
          </div>
        )}

        {(editing || !asset.ai_tags) && (
          <div className="flex flex-wrap gap-1 mt-1">
            {STAGES.map((s) => (
              <button
                key={s}
                onClick={() => {
                  onSetStage(s);
                  setEditing(false);
                }}
                className={`text-xs px-2 py-1 rounded-md capitalize border transition-colors ${
                  asset.stage === s
                    ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                    : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)]"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
