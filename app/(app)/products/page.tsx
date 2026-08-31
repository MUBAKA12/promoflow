import { createClient } from "@/lib/supabase/server";
import { createProduct } from "./actions";
import ProductCard from "./product-card";

export default async function ProductsPage() {
  const supabase = await createClient();
  const { data: channels } = await supabase.from("channels").select("id, name").order("created_at", { ascending: true });
  if (!channels?.length) {
    return (<div className="p-10"><h1 className="font-display text-2xl font-semibold mb-2">Products</h1><p className="text-[var(--text-muted)]">Add a channel first — products belong to a channel.</p></div>);
  }
  const { data: products } = await supabase.from("products")
    .select("id, name, category, notes, shop_link, active, channel_id, ai_link_analysis, link_analyzed_at, created_at")
    .order("created_at", { ascending: false });
  const { data: productAssets } = await supabase.from("assets")
    .select("id, name, kind, storage_path, ai_tags, product_id").not("product_id", "is", null);

  const clipsByProduct = new Map<string, typeof productAssets>();
  (productAssets ?? []).forEach((a) => {
    if (!a.product_id) return;
    const list = clipsByProduct.get(a.product_id) ?? [];
    list.push(a);
    clipsByProduct.set(a.product_id, list);
  });

  return (
    <div className="p-10 max-w-4xl">
      <h1 className="font-display text-2xl font-semibold mb-1">Products</h1>
      <p className="text-[var(--text-muted)] mb-8">Add a TikTok Shop link and PromoFlow reads it.</p>
      <form action={createProduct} className="grid grid-cols-2 gap-3 mb-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <select name="channelId" required className="col-span-2 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] px-3.5 py-2 text-sm outline-none focus:border-[var(--accent)]">
          {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input name="name" required placeholder="Product name" className="rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] px-3.5 py-2 text-sm outline-none focus:border-[var(--accent)]" />
        <input name="category" placeholder="Category (e.g. Skincare)" className="rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] px-3.5 py-2 text-sm outline-none focus:border-[var(--accent)]" />
        <input name="shopLink" placeholder="TikTok Shop link — PromoFlow will read it" className="col-span-2 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] px-3.5 py-2 text-sm outline-none focus:border-[var(--accent)]" />
        <textarea name="notes" placeholder="Notes / key benefits (optional)" rows={2} className="col-span-2 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] px-3.5 py-2 text-sm outline-none focus:border-[var(--accent)] resize-none" />
        <button type="submit" className="col-span-2 rounded-lg bg-[var(--accent)] text-white py-2 text-sm font-medium hover:opacity-90 transition-opacity">Add product</button>
      </form>
      {!products?.length ? (
        <div className="text-center py-16 text-[var(--text-muted)] text-sm">No products yet — add your first one above.</div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} channelId={p.channel_id} initialClips={clipsByProduct.get(p.id) ?? []} />
          ))}
        </div>
      )}
    </div>
  );
}
