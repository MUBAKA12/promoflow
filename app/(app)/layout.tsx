import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/sidebar";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("credits, display_name, email")
    .eq("id", user.id)
    .single();

  return (
    <div className="min-h-screen flex bg-[var(--bg)]">
      <Sidebar
        email={profile?.email ?? user.email ?? ""}
        credits={profile?.credits ?? 0}
      />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
