import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  return (
    <div className="landing">
      <header className="topbar">
        <div className="topbar-inner">
          <span className="wordmark">PromoFlow</span>
          <Link href="/login" className="nav-signin">
            Sign in
          </Link>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-inner">
            <div className="hero-copy">
              <h1>
                Scale winning video ads faster.
                <br />
                Zero video editing required.
              </h1>
              <p className="hero-sub">
                Turn product photos, before/afters, and existing footage into structured,
                hook-tested video ads — built on formats that already convert.
              </p>
              <div className="hero-ctas">
                <Link href="/login" className="btn-primary">
                  Get 50 free credits
                </Link>
                <a href="#how-it-works" className="btn-secondary">
                  See PromoFlow in action
                </a>
              </div>
            </div>

            <div className="hero-visual" aria-hidden="true">
              <div className="app-mock">
                <div className="app-mock-topbar">
                  <span className="app-mock-dot" />
                  <span className="app-mock-dot" />
                  <span className="app-mock-dot" />
                </div>
                <div className="app-mock-body">
                  <p className="app-mock-label">Video style</p>
                  <div className="app-mock-modes">
                    <div className="app-mock-mode active">Transformation</div>
                    <div className="app-mock-mode">Product Journey</div>
                    <div className="app-mock-mode">Viral Hook</div>
                  </div>
                  <p className="app-mock-label">Clips</p>
                  <div className="app-mock-clips">
                    <div className="app-mock-clip clip-before">
                      <img src="/examples/before.jpg" alt="Before" />
                      <span>Before</span>
                    </div>
                    <div className="app-mock-clip clip-after">
                      <img src="/examples/after.jpg" alt="After" />
                      <span>After</span>
                    </div>
                    <div className="app-mock-clip clip-product">
                      <img src="/examples/product.jpg" alt="Product" />
                      <span>Product</span>
                    </div>
                  </div>
                  <div className="app-mock-hook">
                    <b>Curiosity</b>
                    Found the ultimate fix for this
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="engines">
          <div className="engines-inner">
            <div className="featured-engine">
              <div className="featured-engine-copy">
                <h2>Generate</h2>
                <p className="engine-tag">Built-in e-commerce video structures</p>
                <p>
                  Pick your product and a video style that&apos;s already proven to convert.
                  PromoFlow pulls the right clips from your product library automatically —
                  no manual editing, no re-uploading assets per video.
                </p>
                <div className="mode-chips">
                  <span className="chip">Transformation — Before → After → Product</span>
                  <span className="chip">Product Journey — Before → Product → After</span>
                  <span className="chip">Viral Hook — instant pattern-interrupt overlay</span>
                </div>
              </div>
              <div className="featured-engine-visual" aria-hidden="true">
                <div className="mini-flow">
                  <div className="mini-frame f-before">
                    <img src="/examples/before.jpg" alt="" />
                    <span>Before</span>
                  </div>
                  <div className="mini-arrow">→</div>
                  <div className="mini-frame f-after">
                    <img src="/examples/after.jpg" alt="" />
                    <span>After</span>
                  </div>
                  <div className="mini-arrow">→</div>
                  <div className="mini-frame f-product">
                    <img src="/examples/product.jpg" alt="" />
                    <span>Product</span>
                  </div>
                </div>
              </div>
            </div>

            <p className="also-included">Also included</p>

            <div className="secondary-engines">
              <div className="secondary-engine">
                <h3>Storyboard</h3>
                <p>
                  Upload a photo sequence or a single grid image. PromoFlow auto-splits
                  collages, understands the story, and stitches it into a slideshow ad with
                  AI-written hooks.
                </p>
                <div className="storyboard-strip" aria-hidden="true">
                  <span className="sb-photo sb-1" />
                  <span className="sb-photo sb-2" />
                  <span className="sb-photo sb-3" />
                  <span className="sb-photo sb-4" />
                  <span className="sb-arrow">→</span>
                  <span className="sb-output">Slideshow</span>
                </div>
              </div>
              <div className="secondary-engine">
                <h3>Ad Remix</h3>
                <p>
                  Already have footage that used to convert? Don&apos;t re-shoot. Upload it and
                  generate fresh hook openings to beat ad fatigue.
                </p>
                <div className="remix-strip" aria-hidden="true">
                  <span className="remix-clip">Your clip</span>
                  <div className="remix-hooks">
                    <span className="remix-hook">&quot;Found the fix&quot;</span>
                    <span className="remix-hook">&quot;I tried 5, this won&quot;</span>
                    <span className="remix-hook">&quot;Wait for it...&quot;</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="pricing">
          <div className="pricing-inner">
            <h2>How credits work</h2>
            <p className="pricing-sub">
              Hook and caption generation is unlimited on every plan — write and test as many
              opening lines as you want, free. One credit renders one video.
            </p>

            <div className="pricing-table">
              <div className="plan">
                <p className="plan-name">Starter</p>
                <p className="plan-price">
                  $19<span>/mo</span>
                </p>
                <p className="plan-credits">20 videos / month</p>
                <p className="plan-for">Small brands testing their first ads</p>
                <Link href="/login" className="plan-cta">
                  Start Starter
                </Link>
              </div>

              <div className="plan plan-featured">
                <p className="plan-name">Growth</p>
                <p className="plan-price">
                  $49<span>/mo</span>
                </p>
                <p className="plan-credits">70 videos / month</p>
                <p className="plan-for">Growing DTC stores scaling output</p>
                <Link href="/login" className="plan-cta plan-cta-featured">
                  Start Growth
                </Link>
              </div>

              <div className="plan">
                <p className="plan-name">Agency</p>
                <p className="plan-price">
                  $119<span>/mo</span>
                </p>
                <p className="plan-credits">200 videos / month</p>
                <p className="plan-for">High-volume ad spend, multiple channels</p>
                <Link href="/login" className="plan-cta">
                  Start Agency
                </Link>
              </div>
            </div>

            <p className="topup-note">Instant top-ups available — $15 for 10 extra videos.</p>
          </div>
        </section>

        <section className="final-cta">
          <div className="final-cta-inner">
            <h2>Ready to stop editing and start scaling?</h2>
            <Link href="/login" className="btn-primary">
              Claim your 50 free credits
            </Link>
          </div>
        </section>
      </main>

      <footer className="footer">
        <span>PromoFlow</span>
        <span className="footer-dim">Content engine for TikTok Shop affiliates</span>
      </footer>
    </div>
  );
}
