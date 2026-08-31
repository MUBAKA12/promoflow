"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard,
  Tv,
  Images,
  Package,
  Sparkles,
  Film,
  ShieldCheck,
  LogOut,
  Clapperboard,
  GalleryHorizontalEnd,
} from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/channels", label: "Channels", icon: Tv },
  { href: "/characters", label: "Characters", icon: Sparkles },
  { href: "/assets", label: "Asset library", icon: Images },
  { href: "/products", label: "Products", icon: Package },
  { href: "/generate", label: "Generate", icon: Film },
  { href: "/ad-remix", label: "Ad Remix", icon: Clapperboard },
  { href: "/storyboard", label: "Storyboard", icon: GalleryHorizontalEnd },
  { href: "/library", label: "Video library", icon: Film },
  { href: "/admin", label: "Admin", icon: ShieldCheck },
];

export default function Sidebar({
  email,
  credits,
}: {
  email: string;
  credits: number;
}) {
  const pathname = usePathname();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <aside className="w-60 shrink-0 border-r border-[var(--border)] flex flex-col p-4">
      <div className="flex items-center gap-2 px-2 mb-8">
        <div className="w-7 h-7 rounded-lg bg-[var(--accent)]" />
        <span className="font-display font-semibold">PromoFlow</span>
      </div>

      <nav className="flex-1 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-[var(--accent-dim)] text-white"
                  : "text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
              }`}
            >
              <Icon size={16} strokeWidth={2} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[var(--border)] pt-4 mt-4 space-y-3">
        <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-[var(--surface)] text-sm">
          <span className="text-[var(--text-muted)]">Credits</span>
          <span className="font-medium">{credits}</span>
        </div>
        <div className="px-2.5 text-xs text-[var(--text-muted)] truncate">{email}</div>
        <button
          onClick={signOut}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)] transition-colors"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
