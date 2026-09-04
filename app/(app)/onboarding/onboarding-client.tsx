"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createOnboardingChannel, createOnboardingProduct } from "./actions";
import { Film, Clapperboard, GalleryHorizontalEnd, Loader2, ArrowRight } from "lucide-react";

type Step = 1 | 2 | 3;

export default function OnboardingClient() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [channelName, setChannelName] = useState("");
  const [channelId, setChannelId] = useState<string | null>(null);

  const [productName, setProductName] = useState("");
  const [shopLink, setShopLink] = useState("");

  async function handleChannelSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const id = await createOnboardingChannel(channelName);
      setChannelId(id);
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleProductSubmit() {
    if (!channelId) return;
    setError(null);
    setSubmitting(true);
    try {
      await createOnboardingProduct({ channelId, name: productName, shopLink });
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  function goToEngine(path: string) {
    router.push(path);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-1.5 mb-8 justify-center">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all ${
                s === step ? "w-8 bg-[var(--accent)]" : s < step ? "w-4 bg-[var(--accent)]" : "w-4 bg-[var(--border)]"
              }`}
            />
          ))}
        </div>

        {step === 1 && (
          <div>
            <h1 className="font-display text-2xl font-semibold mb-2 text-center">
              What&apos;s your TikTok channel called?
            </h1>
            <p className="text-[var(--text-muted)] text-sm mb-8 text-center">
              This keeps your assets, products, and videos organized — you can add more later.
            </p>
            <input
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder="e.g. Emily's Picks"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleChannelSubmit()}
              className="w-full rounded-lg bg-[var(--surface)] border border-[var(--border)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)] mb-3"
            />
            {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
            <button
              onClick={handleChannelSubmit}
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-[var(--accent)] text-white py-3 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
              Continue
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <h1 className="font-display text-2xl font-semibold mb-2 text-center">
              What&apos;s your first product?
            </h1>
            <p className="text-[var(--text-muted)] text-sm mb-8 text-center">
              Add a TikTok Shop link and PromoFlow reads it automatically — or just skip that part.
            </p>
            <input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="Product name"
              autoFocus
              className="w-full rounded-lg bg-[var(--surface)] border border-[var(--border)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)] mb-3"
            />
            <input
              value={shopLink}
              onChange={(e) => setShopLink(e.target.value)}
              placeholder="TikTok Shop link (optional)"
              onKeyDown={(e) => e.key === "Enter" && handleProductSubmit()}
              className="w-full rounded-lg bg-[var(--surface)] border border-[var(--border)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)] mb-3"
            />
            {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
            <button
              onClick={handleProductSubmit}
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-[var(--accent)] text-white py-3 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
              Continue
            </button>
          </div>
        )}

        {step === 3 && (
          <div>
            <h1 className="font-display text-2xl font-semibold mb-2 text-center">
              How do you want to create your first video?
            </h1>
            <p className="text-[var(--text-muted)] text-sm mb-8 text-center">
              You can always try the others later — this just picks where you start.
            </p>

            <div className="space-y-3">
              <button
                onClick={() => goToEngine("/generate")}
                className="w-full text-left rounded-xl border-2 border-[var(--accent)] bg-[var(--accent-soft)] p-5 hover:opacity-90 transition-opacity"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <Film size={18} className="text-[var(--accent)]" />
                    <span className="font-semibold">Generate</span>
                  </div>
                  <span className="text-[10px] uppercase tracking-wide font-semibold text-[var(--accent)] bg-white/10 px-2 py-1 rounded-full">
                    Recommended
                  </span>
                </div>
                <p className="text-sm text-[var(--text-muted)]">
                  Before/after transformations — the proven format for products with a visible
                  result. Pick a mode, PromoFlow assembles the rest.
                </p>
              </button>

              <button
                onClick={() => goToEngine("/storyboard")}
                className="w-full text-left rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 hover:border-[var(--accent)] transition-colors"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <GalleryHorizontalEnd size={18} />
                  <span className="font-semibold">Storyboard</span>
                </div>
                <p className="text-sm text-[var(--text-muted)]">
                  Have a batch of product photos? Upload them and PromoFlow turns them into a
                  slideshow ad.
                </p>
              </button>

              <button
                onClick={() => goToEngine("/ad-remix")}
                className="w-full text-left rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 hover:border-[var(--accent)] transition-colors"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Clapperboard size={18} />
                  <span className="font-semibold">Ad Remix</span>
                </div>
                <p className="text-sm text-[var(--text-muted)]">
                  Already have a video that used to convert? Upload it and get fresh hook
                  variations without re-shooting.
                </p>
              </button>
            </div>
          </div>
        )}

        {step < 3 && (
          <p className="text-center mt-6">
            <Link href="/dashboard" className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]">
              Skip for now
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
