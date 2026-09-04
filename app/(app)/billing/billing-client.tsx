"use client";

import { useState } from "react";
import { Loader2, Check } from "lucide-react";

const PLAN_DISPLAY = {
  starter: { name: "Starter", price: "$19/mo", credits: 20 },
  growth: { name: "Growth", price: "$49/mo", credits: 70 },
  agency: { name: "Agency", price: "$119/mo", credits: 200 },
} as const;

type PlanId = keyof typeof PLAN_DISPLAY;

export default function BillingClient({
  currentPlan,
  subscriptionStatus,
  credits,
}: {
  currentPlan: string | null;
  subscriptionStatus: string | null;
  credits: number;
}) {
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubscribe(planId: PlanId) {
    setError(null);
    setLoadingPlan(planId);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Could not start checkout");
      }
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setLoadingPlan(null);
    }
  }

  return (
    <div className="p-10 max-w-3xl">
      <h1 className="font-display text-2xl font-semibold mb-1">Billing</h1>
      <p className="text-[var(--text-muted)] mb-8">
        Manage your plan and see how many credits you have left this month.
      </p>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 mb-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-[var(--text-muted)] mb-1">Current plan</p>
            <p className="text-lg font-semibold capitalize">
              {currentPlan ? PLAN_DISPLAY[currentPlan as PlanId]?.name ?? currentPlan : "No active plan"}
            </p>
            {subscriptionStatus && subscriptionStatus !== "active" && (
              <p className="text-xs text-[var(--warn)] mt-1 capitalize">{subscriptionStatus}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-[var(--text-muted)] mb-1">Credits remaining</p>
            <p className="text-lg font-semibold">{credits}</p>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      <div className="grid grid-cols-3 gap-4">
        {(Object.keys(PLAN_DISPLAY) as PlanId[]).map((planId) => {
          const plan = PLAN_DISPLAY[planId];
          const isCurrent = currentPlan === planId && subscriptionStatus === "active";
          return (
            <div
              key={planId}
              className={`rounded-xl border p-5 flex flex-col ${
                planId === "growth"
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                  : "border-[var(--border)] bg-[var(--surface)]"
              }`}
            >
              <p className="font-semibold">{plan.name}</p>
              <p className="text-2xl font-bold mt-2">{plan.price}</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">{plan.credits} videos / month</p>
              <button
                onClick={() => handleSubscribe(planId)}
                disabled={loadingPlan !== null || isCurrent}
                className={`mt-5 rounded-lg py-2 text-sm font-medium transition-opacity flex items-center justify-center gap-1.5 ${
                  isCurrent
                    ? "bg-[var(--surface-raised)] text-[var(--text-muted)] cursor-default"
                    : "bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50"
                }`}
              >
                {loadingPlan === planId ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : isCurrent ? (
                  <Check size={14} />
                ) : null}
                {isCurrent ? "Current plan" : loadingPlan === planId ? "Redirecting…" : `Start ${plan.name}`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
