import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { analyzeProductLink } from "@/lib/ai/analyze-product-link";

export async function POST(request: Request) {
  const { productId } = await request.json();
  if (!productId) return NextResponse.json({ error: "productId is required" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: product } = await supabase.from("products").select("user_id").eq("id", productId).single();
  if (!product || product.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const analysis = await analyzeProductLink(productId);
  return NextResponse.json({ analysis });
}
