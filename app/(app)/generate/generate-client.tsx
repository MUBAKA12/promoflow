"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createGenerationJob, generateHooksForBeforeAfter } from "./actions";
import { Sparkles, Loader2, Check, Plus, Film, Wand2, ListChecks } from "lucide-react";

type Asset = {
  id: string;
  name: string;
  stage: string;
  kind: string;
  storage_path: string;
  channel_id: string;
  product_id: string | null;
  created_at: string;
};

type Mode = "transformation" | "product_journey" | "viral_hook";

const MODE_INFO: Record<
  Mode,
  { label: string; order: ("before" | "product" | "after")[]; blurb: string }
> = {
  transformation: {
    label: "Transformation",
    order: ["before", "after", "product"],
    blurb: "Before → After → Product",
  },
  product_journey: {
    label: "Product Journey",
    order: ["before", "product", "after"],
    blurb: "Before → Product → After",
  },
  viral_hook: {
    label: "Viral Hook",
    order: ["before", "product"],
    blurb: "Before → Product, hook text on the Before clip",
  },
};

const CATEGORY_LABEL: Record<string, string> = {
  before: "Before / Problem",
  product: "Product",
  after: "After / Result",
};

type Hook = {
  id: string;
  angle_label: string | null;
  hook_text: string;
  caption_text: string | null;
  costPerHook: number;
  source: "ai" | "custom";
};

type Selection = { auto: boolean; assetId: string | null };

export default function GenerateClient({
  channels,
  products,
  assets,
}: {
  channels: { id: string; name: string }[];
  products: { id: string; name: string; channel_id: string; active: boolean }[];
  assets: Asset[];
}) {
  const [channelId, setChannelId] = useState(channels[0].id);
  const [productId, setProductId] = useState<string>("");
  const [mode, setMode] = useState<Mode | null>(null);
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [hookCount, setHookCount] = useState(6);
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [selectedHookIds, setSelectedHookIds] = useState<Set<string>>(new Set());
  const [customHook, setCustomHook] = useState("");
  const [customCaption, setCustomCaption] = useState("");
  const [generatingHooks, setGeneratingHooks] = useState(false);
  const [hookError, setHookError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});

  const channelProducts = products.filter((p) => p.channel_id === channelId);

  const relevantAssets = useMemo(() => {
    return assets
      .filter(
        (a) => a.channel_id === channelId && (a.product_id === null || a.product_id === productId)
      )
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [assets, channelId, productId]);

  const byCategory = useMemo(() => {
    const map: Record<string, Asset[]> = { before: [], product: [], after: [] };
    for (const a of relevantAssets) {
      if (map[a.stage]) map[a.stage].push(a);
    }
    return map;
  }, [relevantAssets]);

  const modeAvailability: Record<Mode, boolean> = {
    viral_hook: byCategory.before.length > 0,
    transformation: byCategory.before.length > 0 && byCategory.after.length > 0,
    product_journey: byCategory.before.length > 0 && byCategory.after.length > 0,
  };

  async function getSignedUrl(path: string) {
    if (urls[path]) return urls[path];
    const supabase = createClient();
    const { data } = await supabase.storage.from("assets").createSignedUrl(path, 3600);
    if (data?.signedUrl) setUrls((prev) => ({ ...prev, [path]: data.signedUrl }));
    return data?.signedUrl ?? "";
  }

  function resolvedAssetId(category: string): string | null {
    const sel = selections[category];
    if (!sel || sel.auto) return byCategory[category]?.[0]?.id ?? null;
    return sel.assetId;
  }

  function selectMode(m: Mode) {
    setMode(m);
    const next: Record<string, Selection> = {};
    for (const cat of MODE_INFO[m].order) {
      next[cat] = { auto: true, assetId: null };
    }
    setSelections(next);
    setHooks([]);
    setSelectedHookIds(new Set());
    setDone(false);
  }

  function setCategoryAuto(category: string, auto: boolean) {
    setSelections((prev) => ({
      ...prev,
      [category]: { auto, assetId: auto ? null : prev[category]?.assetId ?? null },
    }));
  }

  function setCategoryAsset(category: string, assetId: string) {
    setSelections((prev) => ({ ...prev, [category]: { auto: false, assetId } }));
  }

  const allCategoriesResolved =
    mode !== null && MODE_INFO[mode].order.every((cat) => resolvedAssetId(cat));

  function toggleHook(id: string) {
    setSelectedHookIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleGenerateHooks() {
    if (!mode || !allCategoriesResolved) return;
    const beforeId = resolvedAssetId("before")!;
    const productAssetId = resolvedAssetId("product");
    const afterAssetId = resolvedAssetId("after");

    setHookError(null);
    setGeneratingHooks(true);
    try {
      const result = await generateHooksForBeforeAfter({
        mode,
        beforeAssetId: beforeId,
        productAssetId,
        afterAssetId,
        productId,
        count: hookCount,
      });
      if (!result.ok) {
        setHookError(result.error);
        return;
      }
      setHooks((prev) => [
        ...prev,
        ...result.hooks.map((h, i) => ({
          id: `ai-${Date.now()}-${i}`,
          angle_label: h.angle_label,
          hook_text: h.hook_text,
          caption_text: h.caption_text,
          costPerHook: h.costPerHook,
          source: "ai" as const,
        })),
      ]);
    } catch (e) {
      setHookError(e instanceof Error ? e.message : "Hook generation failed");
    } finally {
      setGeneratingHooks(false);
    }
  }

  function handleAddCustomHook() {
    if (!customHook.trim()) return;
    const id = `custom-${Date.now()}`;
    setHooks((prev) => [
      ...prev,
      {
        id,
        angle_label: "Custom",
        hook_text: customHook.trim(),
        caption_text: customCaption.trim() || null,
        costPerHook: 0,
        source: "custom",
      },
    ]);
    setSelectedHookIds((prev) => new Set(prev).add(id));
    setCustomHook("");
    setCustomCaption("");
  }

  async function handleGenerate() {
    if (!mode || !allCategoriesResolved) return;
    setError(null);
    setSubmitting(true);
    try {
      const clipIds = MODE_INFO[mode].order.map((cat) => resolvedAssetId(cat)!);
      const chosenHooks = hooks
        .filter((h) => selectedHookIds.has(h.id))
        .map((h) => ({
          hook_text: h.hook_text,
          caption_text: h.caption_text ?? undefined,
          costPerHook: h.costPerHook,
        }));

      await createGenerationJob({
        channelId,
        productId,
        mode,
        clipIds,
        hooks: chosenHooks,
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (!channelProducts.length) {
    return (
      <div className="p-10">
        <h1 className="font-display text-2xl font-semibold mb-2">Generate</h1>
        <p className="text-[var(--text-muted)]">
          No active products on this channel yet — add one on the Products page first.
        </p>
      </div>
    );
  }

  return (
    <div className="p-10 max-w-3xl">
      <h1 className="font-display text-2xl font-semibold mb-1">Generate</h1>
      <p className="text-[var(--text-muted)] mb-8">
        Pick a product, pick a video style, and PromoFlow pulls the right clips from that
        product's library automatically — or override any pick yourself.
      </p>

      <div className="space-y-8">
        {/* Step 1: Channel + Product */}
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1.5">Channel</label>
          <select
            value={channelId}
            onChange={(e) => {
              setChannelId(e.target.value);
              setProductId("");
              setMode(null);
              setSelections({});
              setHooks([]);
              setSelectedHookIds(new Set());
            }}
            className="w-full rounded-lg bg-[var(--surface)] border border-[var(--border)] px-3.5 py-2 text-sm outline-none focus:border-[var(--accent)]"
          >
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1.5">Product</label>
          <select
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value);
              setMode(null);
              setSelections({});
              setHooks([]);
              setSelectedHookIds(new Set());
            }}
            className="w-full rounded-lg bg-[var(--surface)] border border-[var(--border)] px-3.5 py-2 text-sm outline-none focus:border-[var(--accent)]"
          >
            <option value="">Select a product…</option>
            {channelProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Step 2: Mode */}
        {productId && (
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-2">Video style</label>
            <div className="grid grid-cols-3 gap-3">
              {(Object.keys(MODE_INFO) as Mode[]).map((m) => {
                const info = MODE_INFO[m];
                const available = modeAvailability[m];
                const active = mode === m;
                return (
                  <button
                    key={m}
                    disabled={!available}
                    onClick={() => selectMode(m)}
                    className={`text-left rounded-xl border p-4 transition-colors ${
                      active
                        ? "border-[var(--accent)] bg-[var(--accent-dim)]"
                        : available
                        ? "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]"
                        : "border-[var(--border)] bg-[var(--surface)] opacity-40 cursor-not-allowed"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      {m === "viral_hook" ? <Wand2 size={14} /> : <ListChecks size={14} />}
                      <span className="text-sm font-medium">{info.label}</span>
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">{info.blurb}</p>
                    {!available && (
                      <p className="text-[10px] text-[var(--warn)] mt-1.5">
                        Needs {m === "viral_hook" ? "a Before clip" : "Before & After clips"}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 3: Clip selection */}
        {mode && (
          <div className="space-y-4">
            <label className="block text-xs text-[var(--text-muted)]">Clips</label>
            {MODE_INFO[mode].order.map((category) => (
              <CategoryPicker
                key={category}
                category={category}
                assets={byCategory[category] ?? []}
                selection={selections[category] ?? { auto: true, assetId: null }}
                onSetAuto={(auto) => setCategoryAuto(category, auto)}
                onSetAsset={(assetId) => setCategoryAsset(category, assetId)}
                getSignedUrl={getSignedUrl}
              />
            ))}
          </div>
        )}

        {/* Step 4: Hooks */}
        {mode && allCategoriesResolved && (
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1.5">
              Hooks / captions — write your own, or generate from the actual clips
            </label>

            <p className="text-sm font-medium mb-2">
              Hooks to generate: <span className="text-[var(--accent)]">{hookCount}</span>
            </p>
            <div className="flex items-center gap-3 mb-3">
              <input
                type="range"
                min={1}
                max={20}
                value={hookCount}
                onChange={(e) => setHookCount(Number(e.target.value))}
                className="count-slider flex-1"
              />
              <button
                onClick={handleGenerateHooks}
                disabled={generatingHooks}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] text-white px-3 py-1.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 whitespace-nowrap"
              >
                {generatingHooks ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Sparkles size={14} />
                )}
                {generatingHooks ? "Writing hooks…" : "Generate hooks"}
              </button>
            </div>
            {hookError && <p className="text-xs text-red-400 mb-3">{hookError}</p>}

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
                onClick={handleAddCustomHook}
                className="flex items-center gap-1 rounded-lg bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--accent-dim)] transition-colors"
              >
                <Plus size={14} /> Add
              </button>
            </div>

            {!hooks.length ? (
              <div className="text-center py-10 text-[var(--text-muted)] text-sm rounded-xl border border-dashed border-[var(--border)]">
                No hooks yet — generate some or add your own above.
              </div>
            ) : (
              <div className="space-y-2">
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
                        selectedHookIds.has(h.id)
                          ? "bg-[var(--accent)] border-[var(--accent)]"
                          : "border-[var(--border)]"
                      }`}
                    >
                      {selectedHookIds.has(h.id) && <Check size={11} className="text-white" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      {h.angle_label && (
                        <span className="text-[10px] uppercase tracking-wide text-[var(--accent)] font-medium">
                          {h.angle_label}
                        </span>
                      )}
                      <p className="text-sm font-medium">{h.hook_text}</p>
                      {h.caption_text && (
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">{h.caption_text}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {mode && allCategoriesResolved && (
          <>
            {error && <p className="text-sm text-red-400">{error}</p>}

            {done ? (
              <div className="rounded-lg bg-[var(--accent-soft)] border border-[var(--accent-dim)] p-4 text-sm">
                <p className="font-medium mb-1">Batch queued ✓</p>
                <p className="text-[var(--text-muted)]">
                  {selectedHookIds.size || 1} video{selectedHookIds.size === 1 ? "" : "s"} queued.
                  Check the Video library once rendering is live.
                </p>
              </div>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={submitting}
                className="flex items-center gap-2 rounded-lg bg-[var(--accent)] text-white px-5 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Film size={16} />}
                Generate {selectedHookIds.size || 1} video{selectedHookIds.size === 1 ? "" : "s"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CategoryPicker({
  category,
  assets,
  selection,
  onSetAuto,
  onSetAsset,
  getSignedUrl,
}: {
  category: string;
  assets: Asset[];
  selection: Selection;
  onSetAuto: (auto: boolean) => void;
  onSetAsset: (assetId: string) => void;
  getSignedUrl: (path: string) => Promise<string>;
}) {
  const autoPick = assets[0] ?? null;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-[var(--text)]">{CATEGORY_LABEL[category]}</span>
        <div className="flex gap-1 text-xs">
          <button
            onClick={() => onSetAuto(true)}
            className={`px-2 py-1 rounded-md ${
              selection.auto
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--surface-raised)] text-[var(--text-muted)]"
            }`}
          >
            Auto-pull
          </button>
          <button
            onClick={() => onSetAuto(false)}
            className={`px-2 py-1 rounded-md ${
              !selection.auto
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--surface-raised)] text-[var(--text-muted)]"
            }`}
          >
            Choose
          </button>
        </div>
      </div>

      {selection.auto ? (
        autoPick ? (
          <MiniThumb asset={autoPick} getSignedUrl={getSignedUrl} note="Auto-picked (most recent)" />
        ) : (
          <p className="text-xs text-[var(--text-muted)]">No clips in this category yet.</p>
        )
      ) : (
        <div className="grid grid-cols-6 gap-1.5">
          {assets.map((a) => (
            <button
              key={a.id}
              onClick={() => onSetAsset(a.id)}
              className={`aspect-[9/16] rounded-md overflow-hidden relative border-2 transition-colors ${
                selection.assetId === a.id ? "border-[var(--accent)]" : "border-transparent"
              }`}
            >
              <ClipThumb asset={a} getSignedUrl={getSignedUrl} />
              {selection.assetId === a.id && (
                <span className="absolute top-1 right-1 bg-[var(--accent)] rounded-full p-0.5">
                  <Check size={10} className="text-white" />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniThumb({
  asset,
  getSignedUrl,
  note,
}: {
  asset: Asset;
  getSignedUrl: (path: string) => Promise<string>;
  note: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  if (!url) getSignedUrl(asset.storage_path).then(setUrl);

  return (
    <div className="flex items-center gap-2">
      <div className="w-12 h-20 rounded-md overflow-hidden bg-[var(--surface-raised)] shrink-0">
        {url && asset.kind === "photo" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={asset.name} className="w-full h-full object-cover" />
        )}
        {url && asset.kind !== "photo" && (
          <video src={url} className="w-full h-full object-cover" muted />
        )}
      </div>
      <p className="text-xs text-[var(--text-muted)]">{note}</p>
    </div>
  );
}

function ClipThumb({
  asset,
  getSignedUrl,
}: {
  asset: Asset;
  getSignedUrl: (path: string) => Promise<string>;
}) {
  const [url, setUrl] = useState<string | null>(null);
  if (!url) getSignedUrl(asset.storage_path).then(setUrl);

  return (
    <>
      {url && asset.kind === "photo" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={asset.name} className="w-full h-full object-cover" />
      )}
      {url && asset.kind !== "photo" && (
        <video src={url} className="w-full h-full object-cover" muted />
      )}
    </>
  );
}
