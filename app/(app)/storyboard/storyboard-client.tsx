"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  createStoryboardCreative,
  createStoryboardFromGridImage,
  createProductForStoryboard,
  generateHooksForStoryboard,
  addCustomStoryboardHook,
  deleteStoryboardHook,
  generateVideosFromStoryboardHooks,
} from "./actions";
import { Upload, Sparkles, Loader2, Trash2, Plus, Images as ImagesIcon, Check } from "lucide-react";

type Product = { id: string; name: string; channel_id: string };
type Creative = {
  id: string;
  name: string;
  image_paths: string[];
  channel_id: string;
  product_id: string | null;
  created_at: string;
};
type Hook = {
  id: string;
  creative_id: string;
  angle_label: string | null;
  hook_text: string;
  caption_text: string | null;
  source: string;
  created_at: string;
};

export default function StoryboardClient({
  channels,
  products,
  creatives: initialCreatives,
  hooks: initialHooks,
}: {
  channels: { id: string; name: string }[];
  products: Product[];
  creatives: Creative[];
  hooks: Hook[];
}) {
  const [channelId, setChannelId] = useState(channels[0].id);
  const [creatives, setCreatives] = useState(initialCreatives);
  const [hooks, setHooks] = useState(initialHooks);
  const [selectedCreativeId, setSelectedCreativeId] = useState<string | null>(null);

  const channelCreatives = creatives.filter((c) => c.channel_id === channelId);
  const selected = creatives.find((c) => c.id === selectedCreativeId) ?? null;
  const creativeHooks = hooks.filter((h) => h.creative_id === selectedCreativeId);

  return (
    <div className="p-10 max-w-5xl">
      <h1 className="font-display text-2xl font-semibold mb-1">Storyboard</h1>
      <p className="text-[var(--text-muted)] mb-6">
        Upload a sequence of photos — PromoFlow understands the story they tell, writes hooks
        around it, then stitches them into a slideshow video (~2.5s per photo).
      </p>

      <select
        value={channelId}
        onChange={(e) => {
          setChannelId(e.target.value);
          setSelectedCreativeId(null);
        }}
        className="mb-6 rounded-lg bg-[var(--surface)] border border-[var(--border)] px-3.5 py-2 text-sm outline-none focus:border-[var(--accent)]"
      >
        {channels.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <div className="grid grid-cols-[280px_1fr] gap-6">
        <div>
          <UploadCreative
            channelId={channelId}
            products={products.filter((p) => p.channel_id === channelId)}
            onCreated={(creative) => {
              setCreatives((prev) => [creative, ...prev]);
              setSelectedCreativeId(creative.id);
            }}
          />

          <div className="mt-4 space-y-2">
            {channelCreatives.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCreativeId(c.id)}
                className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition-colors ${
                  selectedCreativeId === c.id
                    ? "border-[var(--accent)] bg-[var(--accent-dim)]"
                    : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <ImagesIcon size={14} className="shrink-0" />
                  <span className="truncate">{c.name}</span>
                  <span className="ml-auto text-[10px] text-[var(--text-muted)]">
                    {c.image_paths?.length ?? 0}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div>
          {selected ? (
            <CreativeDetail
              creative={selected}
              hooks={creativeHooks}
              onHooksAdded={(newHooks) => setHooks((prev) => [...prev, ...newHooks])}
              onHookDeleted={(id) => setHooks((prev) => prev.filter((h) => h.id !== id))}
            />
          ) : (
            <div className="text-center py-24 text-[var(--text-muted)] text-sm rounded-xl border border-dashed border-[var(--border)]">
              Upload or select a storyboard to generate hooks for it.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UploadCreative({
  channelId,
  products,
  onCreated,
}: {
  channelId: string;
  products: Product[];
  onCreated: (c: Creative) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState("");
  const [productMode, setProductMode] = useState<"existing" | "new">("existing");
  const [productId, setProductId] = useState("");
  const [newProductName, setNewProductName] = useState("");
  const [newProductLink, setNewProductLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setUploading(true);
    const supabase = createClient();
    const fileList = Array.from(files);
    const finalName = name.trim() || `Storyboard ${new Date().toLocaleDateString()}`;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      let finalProductId: string | null = null;
      if (productMode === "existing" && productId) {
        finalProductId = productId;
      } else if (productMode === "new" && newProductName.trim()) {
        finalProductId = await createProductForStoryboard({
          channelId,
          name: newProductName.trim(),
          shopLink: newProductLink.trim(),
        });
      }

      if (fileList.length === 1) {
        const file = fileList[0];
        const sourcePath = `${user.id}/${channelId}/storyboard/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("storyboard-images")
          .upload(sourcePath, file);
        if (uploadError) throw new Error(uploadError.message);

        const result = await createStoryboardFromGridImage({
          channelId,
          productId: finalProductId,
          name: finalName,
          sourceImagePath: sourcePath,
        });

        onCreated({
          id: result.id,
          name: finalName,
          image_paths: result.imagePaths,
          channel_id: channelId,
          product_id: finalProductId,
          created_at: new Date().toISOString(),
        });
      } else {
        const imagePaths: string[] = [];
        for (const file of fileList) {
          const path = `${user.id}/${channelId}/storyboard/${Date.now()}-${file.name}`;
          const { error: uploadError } = await supabase.storage
            .from("storyboard-images")
            .upload(path, file);
          if (uploadError) throw new Error(uploadError.message);
          imagePaths.push(path);
        }

        const creativeId = await createStoryboardCreative({
          channelId,
          productId: finalProductId,
          name: finalName,
          imagePaths,
        });

        onCreated({
          id: creativeId,
          name: finalName,
          image_paths: imagePaths,
          channel_id: channelId,
          product_id: finalProductId,
          created_at: new Date().toISOString(),
        });
      }

      setName("");
      setNewProductName("");
      setNewProductLink("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
      <p className="text-xs font-medium text-[var(--text-muted)]">New storyboard</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Storyboard name (optional)"
        className="w-full rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
      />

      <div className="flex gap-2 text-xs">
        <button
          onClick={() => setProductMode("existing")}
          className={`px-2 py-1 rounded-md ${productMode === "existing" ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-raised)] text-[var(--text-muted)]"}`}
        >
          Existing product
        </button>
        <button
          onClick={() => setProductMode("new")}
          className={`px-2 py-1 rounded-md ${productMode === "new" ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-raised)] text-[var(--text-muted)]"}`}
        >
          New product
        </button>
      </div>

      {productMode === "existing" ? (
        <select
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          className="w-full rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        >
          <option value="">No product (optional)</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      ) : (
        <>
          <input
            value={newProductName}
            onChange={(e) => setNewProductName(e.target.value)}
            placeholder="Product name"
            className="w-full rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <input
            value={newProductLink}
            onChange={(e) => setNewProductLink(e.target.value)}
            placeholder="TikTok Shop link — PromoFlow will read it"
            className="w-full rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
        />
        <span className="cursor-pointer w-full flex items-center justify-center gap-2 rounded-lg bg-[var(--accent)] text-white py-2 text-sm font-medium hover:opacity-90 transition-opacity">
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {uploading ? "Uploading…" : "Upload photos"}
        </span>
      </label>
      <p className="text-[10px] text-[var(--text-muted)]">
        Select multiple photos in the order you want them to play, or upload one grid/collage
        image — PromoFlow reads it and splits it into slides automatically.
      </p>
    </div>
  );
}

function CreativeDetail({
  creative,
  hooks,
  onHooksAdded,
  onHookDeleted,
}: {
  creative: Creative;
  hooks: Hook[];
  onHooksAdded: (h: Hook[]) => void;
  onHookDeleted: (id: string) => void;
}) {
  const [urls, setUrls] = useState<string[]>([]);
  const [count, setCount] = useState(10);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedHookIds, setSelectedHookIds] = useState<Set<string>>(new Set());
  const [customHook, setCustomHook] = useState("");
  const [customCaption, setCustomCaption] = useState("");
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [batchDone, setBatchDone] = useState(false);

  if (!urls.length && creative.image_paths?.length) {
    const supabase = createClient();
    Promise.all(
      creative.image_paths.map((p) =>
        supabase.storage
          .from("storyboard-images")
          .createSignedUrl(p, 3600)
          .then(({ data }) => data?.signedUrl ?? "")
      )
    ).then((signed) => setUrls(signed.filter(Boolean)));
  }

  async function handleGenerateHooks() {
    setError(null);
    setGenerating(true);
    try {
      const result = await generateHooksForStoryboard(creative.id, creative.product_id, count);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onHooksAdded(
        result.hooks.map((h) => ({
          id: h.id,
          creative_id: creative.id,
          angle_label: h.angle_label,
          hook_text: h.hook_text,
          caption_text: h.caption_text,
          source: "ai",
          created_at: new Date().toISOString(),
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hook generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleAddCustom() {
    if (!customHook.trim()) return;
    const id = await addCustomStoryboardHook(creative.id, customHook.trim(), customCaption.trim());
    onHooksAdded([
      {
        id,
        creative_id: creative.id,
        angle_label: "Custom",
        hook_text: customHook.trim(),
        caption_text: customCaption.trim(),
        source: "custom",
        created_at: new Date().toISOString(),
      },
    ]);
    setCustomHook("");
    setCustomCaption("");
  }

  function toggleHook(id: string) {
    setSelectedHookIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleGenerateVideos() {
    setBatchSubmitting(true);
    setError(null);
    try {
      await generateVideosFromStoryboardHooks({
        creativeId: creative.id,
        channelId: creative.channel_id,
        productId: creative.product_id,
        hookIds: Array.from(selectedHookIds),
      });
      setBatchDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBatchSubmitting(false);
    }
  }

  return (
    <div>
      <div className="flex gap-4 mb-6">
        <div className="flex gap-1.5 overflow-x-auto shrink-0 max-w-[220px]">
          {urls.slice(0, 4).map((u, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={u}
              alt={`slide ${i + 1}`}
              className="w-14 h-24 object-cover rounded-md bg-[var(--surface-raised)] shrink-0"
            />
          ))}
        </div>
        <div className="flex-1">
          <h2 className="font-display font-semibold mb-1">{creative.name}</h2>
          <p className="text-xs text-[var(--text-muted)] mb-2">
            {creative.image_paths?.length ?? 0} photos
          </p>
          <p className="text-sm font-medium mb-2">
            Hooks to generate: <span className="text-[var(--accent)]">{count}</span>
          </p>
          <div className="flex items-center gap-3 mb-3">
            <input
              type="range"
              min={1}
              max={30}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="count-slider flex-1"
            />
            <button
              onClick={handleGenerateHooks}
              disabled={generating}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] text-white px-3 py-1.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 whitespace-nowrap"
            >
              {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {generating ? "Writing hooks…" : "Generate hooks"}
            </button>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 mb-4 flex gap-2">
        <input
          value={customHook}
          onChange={(e) => setCustomHook(e.target.value)}
          placeholder="Write your own hook…"
          className="flex-1 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <input
          value={customCaption}
          onChange={(e) => setCustomCaption(e.target.value)}
          placeholder="Caption (optional)"
          className="flex-1 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <button
          onClick={handleAddCustom}
          className="flex items-center gap-1 rounded-lg bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--accent-dim)] transition-colors"
        >
          <Plus size={14} /> Add
        </button>
      </div>

      {!hooks.length ? (
        <div className="text-center py-16 text-[var(--text-muted)] text-sm">
          No hooks yet — generate some or add your own above.
        </div>
      ) : (
        <div className="space-y-2 mb-6">
          {hooks.map((h) => (
            <div
              key={h.id}
              className={`rounded-lg border px-4 py-3 flex items-start gap-3 transition-colors ${
                selectedHookIds.has(h.id)
                  ? "border-[var(--accent)] bg-[var(--accent-dim)]"
                  : "border-[var(--border)] bg-[var(--surface)]"
              }`}
            >
              <button
                onClick={() => toggleHook(h.id)}
                className={`mt-0.5 w-4 h-4 rounded shrink-0 border flex items-center justify-center ${
                  selectedHookIds.has(h.id) ? "bg-[var(--accent)] border-[var(--accent)]" : "border-[var(--border)]"
                }`}
              >
                {selectedHookIds.has(h.id) && <Check size={11} className="text-white" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  {h.angle_label && (
                    <span className="text-[10px] uppercase tracking-wide text-[var(--accent)] font-medium">
                      {h.angle_label}
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium">{h.hook_text}</p>
                {h.caption_text && (
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">{h.caption_text}</p>
                )}
              </div>
              <button
                onClick={() => deleteStoryboardHook(h.id).then(() => onHookDeleted(h.id))}
                className="text-[var(--text-muted)] hover:text-red-400 transition-colors shrink-0"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {batchDone ? (
        <div className="rounded-lg bg-[var(--accent-soft)] border border-[var(--accent-dim)] p-4 text-sm">
          <p className="font-medium mb-1">Batch queued ✓</p>
          <p className="text-[var(--text-muted)]">
            {selectedHookIds.size} videos queued — go to Video Library to render and download.
          </p>
        </div>
      ) : (
        <button
          onClick={handleGenerateVideos}
          disabled={!selectedHookIds.size || batchSubmitting}
          className="flex items-center gap-2 rounded-lg bg-[var(--accent)] text-white px-5 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {batchSubmitting ? <Loader2 size={16} className="animate-spin" /> : <ImagesIcon size={16} />}
          Generate {selectedHookIds.size || ""} video{selectedHookIds.size === 1 ? "" : "s"}
        </button>
      )}
    </div>
  );
}
