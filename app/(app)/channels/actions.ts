"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createChannel(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const name = String(formData.get("name") ?? "").trim();
  const handle = String(formData.get("handle") ?? "").trim() || null;
  if (!name) throw new Error("Channel name is required");
  const { error } = await supabase.from("channels").insert({ user_id: user.id, name, handle });
  if (error) throw new Error(error.message);
  revalidatePath("/channels");
}
