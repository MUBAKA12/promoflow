import { createClient } from "@/lib/supabase/server";
import { createChannel } from "./actions";

export default async function ChannelsPage() {
  const supabase = await createClient();
  const { data: channels } = await supabase
    .from("channels")
    .select("id, name, handle, archived, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="p-10 max-w-3xl">
      <h1 className="font-display text-2xl font-semibold mb-1">Channels</h1>
      <p className="text-[var(--text-muted)] mb-8">
        Each channel is a fully isolated TikTok account — its own assets, products, and generation history.
      </p>
      <form action={createChannel} className="flex gap-3 mb-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <input name="name" required placeholder="Channel name (e.g. Emily)" className="flex-1 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] px-3.5 py-2 text-sm outline-none focus:border-[var(--accent)]" />
        <input name="handle" placeholder="@handle (optional)" className="flex-1 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] px-3.5 py-2 text-sm outline-none focus:border-[var(--accent)]" />
        <button type="submit" className="rounded-lg bg-[var(--accent)] text-white px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity whitespace-nowrap">Add channel</button>
      </form>
      {!channels?.length ? (
        <div className="text-center py-16 text-[var(--text-muted)] text-sm">No channels yet — add your first one above.</div>
      ) : (
        <div className="space-y-2">
          {channels.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
              <div>
                <div className="font-medium">{c.name}</div>
                {c.handle && <div className="text-sm text-[var(--text-muted)]">{c.handle}</div>}
              </div>
              <div className="text-xs text-[var(--text-muted)]">{new Date(c.created_at).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
