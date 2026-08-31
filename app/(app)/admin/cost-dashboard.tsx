"use client";

import { Info } from "lucide-react";

type Video = {
  id: string;
  product_name: string | null;
  status: string;
  source_type: string | null;
  created_at: string;
  ai_cost_estimate: number | null;
  render_duration_ms: number | null;
  render_cost_estimate: number | null;
  output_bytes: number | null;
  storage_cost_estimate: number | null;
  egress_cost_estimate: number | null;
  total_cost_estimate: number | null;
};

const ENGINE_LABELS: Record<string, string> = {
  ad_remix: "Ad Remix",
  storyboard: "Storyboard",
  before_after: "Before/After",
};

function engineLabel(sourceType: string | null): string {
  if (!sourceType) return "Before/After";
  return ENGINE_LABELS[sourceType] ?? sourceType;
}

function money(n: number | null): string {
  if (n === null || n === undefined) return "—";
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(3)}`;
}

export default function CostDashboard({ videos }: { videos: Video[] }) {
  const rendered = videos.filter((v) => v.total_cost_estimate !== null);

  const totalCost = rendered.reduce((sum, v) => sum + (v.total_cost_estimate ?? 0), 0);
  const avgCost = rendered.length ? totalCost / rendered.length : 0;

  const byEngine = new Map<
    string,
    { count: number; totalCost: number; aiCost: number; renderCost: number; storageCost: number }
  >();
  for (const v of rendered) {
    const key = engineLabel(v.source_type);
    const entry = byEngine.get(key) ?? {
      count: 0,
      totalCost: 0,
      aiCost: 0,
      renderCost: 0,
      storageCost: 0,
    };
    entry.count += 1;
    entry.totalCost += v.total_cost_estimate ?? 0;
    entry.aiCost += v.ai_cost_estimate ?? 0;
    entry.renderCost += v.render_cost_estimate ?? 0;
    entry.storageCost += (v.storage_cost_estimate ?? 0) + (v.egress_cost_estimate ?? 0);
    byEngine.set(key, entry);
  }

  return (
    <div className="p-10 max-w-5xl">
      <h1 className="font-display text-2xl font-semibold mb-1">Admin</h1>
      <p className="text-[var(--text-muted)] mb-6">
        Cost estimate per rendered video, broken down by engine and cost type.
      </p>

      <div className="rounded-xl border border-[var(--accent-dim)] bg-[var(--accent-soft)] p-4 mb-8 flex gap-3">
        <Info size={16} className="text-[var(--accent)] shrink-0 mt-0.5" />
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          AI token costs above are real, calculated from actual tokens used on each call. Render
          compute and storage costs are <span className="text-[var(--text)]">estimates</span>{" "}
          based on typical Vercel + Supabase rates — check your real Vercel usage dashboard and
          Supabase billing page after this first week, then this app&apos;s render/storage cost
          constants (in <code className="text-[var(--accent)]">lib/costs/pricing.ts</code>) can be
          updated to match your actual bill, and every number here recalculates automatically.
        </p>
      </div>

      {!rendered.length ? (
        <div className="text-center py-16 text-[var(--text-muted)] text-sm rounded-xl border border-dashed border-[var(--border)]">
          No rendered videos yet — cost estimates appear here once videos finish rendering.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="font-display text-2xl font-semibold mb-1">{rendered.length}</div>
              <div className="text-sm text-[var(--text-muted)]">Videos rendered</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="font-display text-2xl font-semibold mb-1">{money(totalCost)}</div>
              <div className="text-sm text-[var(--text-muted)]">Total estimated cost</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="font-display text-2xl font-semibold mb-1">{money(avgCost)}</div>
              <div className="text-sm text-[var(--text-muted)]">Average cost per video</div>
            </div>
          </div>

          <h2 className="font-display font-semibold mb-3">By engine</h2>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden mb-8">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--text-muted)] border-b border-[var(--border)]">
                  <th className="px-4 py-2.5 font-medium">Engine</th>
                  <th className="px-4 py-2.5 font-medium">Videos</th>
                  <th className="px-4 py-2.5 font-medium">AI cost</th>
                  <th className="px-4 py-2.5 font-medium">Render cost</th>
                  <th className="px-4 py-2.5 font-medium">Storage/egress</th>
                  <th className="px-4 py-2.5 font-medium">Total</th>
                  <th className="px-4 py-2.5 font-medium">Avg / video</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(byEngine.entries()).map(([engine, e]) => (
                  <tr key={engine} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-2.5 font-medium">{engine}</td>
                    <td className="px-4 py-2.5 text-[var(--text-muted)]">{e.count}</td>
                    <td className="px-4 py-2.5 text-[var(--text-muted)]">{money(e.aiCost)}</td>
                    <td className="px-4 py-2.5 text-[var(--text-muted)]">
                      {money(e.renderCost)}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-muted)]">
                      {money(e.storageCost)}
                    </td>
                    <td className="px-4 py-2.5 font-medium">{money(e.totalCost)}</td>
                    <td className="px-4 py-2.5 font-medium">
                      {money(e.count ? e.totalCost / e.count : 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="font-display font-semibold mb-3">Per video</h2>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--text-muted)] border-b border-[var(--border)]">
                  <th className="px-4 py-2.5 font-medium">Product</th>
                  <th className="px-4 py-2.5 font-medium">Engine</th>
                  <th className="px-4 py-2.5 font-medium">Render time</th>
                  <th className="px-4 py-2.5 font-medium">Size</th>
                  <th className="px-4 py-2.5 font-medium">Total cost</th>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {rendered.slice(0, 100).map((v) => (
                  <tr key={v.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-2.5 truncate max-w-[200px]">
                      {v.product_name ?? "Untitled"}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-muted)]">
                      {engineLabel(v.source_type)}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-muted)]">
                      {v.render_duration_ms ? `${(v.render_duration_ms / 1000).toFixed(1)}s` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-muted)]">
                      {v.output_bytes ? `${(v.output_bytes / 1024 / 1024).toFixed(1)} MB` : "—"}
                    </td>
                    <td className="px-4 py-2.5 font-medium">{money(v.total_cost_estimate)}</td>
                    <td className="px-4 py-2.5 text-[var(--text-muted)]">
                      {new Date(v.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
