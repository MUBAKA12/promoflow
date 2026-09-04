"use server";

import { createClient } from "@/lib/supabase/server";
import { analyzeProductLink } from "@/lib/ai/analyze-product-link";
import { revalidatePath } from "next/cache";

export async function createOnboardingChannel(name: string): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const trimmed = name.trim() || "My Channel";

  const { data, error } = await supabase
    .from("channels")
    .insert({ user_id: user.id, name: trimmed })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function createOnboardingProduct(input: {
  channelId: string;
  name: string;
  shopLink?: string;
}): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const trimmed = input.name.trim() || "My First Product";

  const { data, error } = await supabase
    .from("products")
    .insert({
      user_id: user.id,
      channel_id: input.channelId,
      name: trimmed,
      shop_link: input.shopLink?.trim() || null,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  if (input.shopLink?.trim()) {
    // Don't block onboarding on this — let it happen in the background.
    analyzeProductLink(data.id).catch(() => {});
  }

  revalidatePath("/dashboard");
  return data.id as string;
}
