import Link from "next/link";
import DeleteButton from "@/components/DeleteButton";
import NewCallList from "@/components/NewCallList";
import { PageHeader, one } from "@/components/ui";
import { isManager, requireProfile } from "@/lib/auth";
import { nowIso } from "@/lib/stats";

export default async function CallListsPage() {
  const { supabase, profile } = await requireProfile();
  const manager = isManager(profile);
  const [{ data: lists }, { data: campaigns }, { data: team }] = await Promise.all([
    supabase.from("call_lists").select("*, campaigns(name), profiles(full_name, email)").order("created_at", { ascending: false }),
    supabase.from("campaigns").select("id, name").eq("mode", "agent").order("name"),
    supabase.from("profiles").select("id, full_name, email").order("full_name"),
  ]);
  const visible = (lists ?? []).filter((l) => manager || !l.agent_id || l.agent_id === profile.id);
  const now = nowIso();

  const counts = await Promise.all(
    visible.map(async (l) => {
      const base = () => supabase.from("contacts").select("id", { count: "exact", head: true }).eq("list_id", l.id);
      const [ready, callbacks, later, done] = await Promise.all([
        base().or(`status.eq.pending,and(status.eq.retry,last_disposition.neq.callback,next_attempt_at.lte.${now})`),
        base().eq("status", "retry").eq("last_disposition", "callback"),
        base().eq("status", "retry").neq("last_disposition", "callback").gt("next_attempt_at", now),
        base().in("status", ["completed", "dnc", "failed"]),
      ]);
      return { ready: ready.count ?? 0, callbacks: callbacks.count ?? 0, later: later.count ?? 0, done: done.count ?? 0 };
    }),
  );

  return (
    <>
      <PageHeader
        title="Call lists"
        subtitle="Power dialling works through a list for you: it dials the next person as soon as you've logged the outcome of the last call."
      />
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-slate-200">
            <tr>
              <th className="th">List</th>
              <th className="th">Agent</th>
              <th className="th">Campaign</th>
              <th className="th text-right">Ready</th>
              <th className="th text-right">Callbacks</th>
              <th className="th text-right">Later</th>
              <th className="th text-right">Done</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={8} className="td py-10 text-center text-slate-500">
                  No lists yet. {manager ? "Create one below from a spreadsheet." : "Ask a manager to create one for you."}
                </td>
              </tr>
            ) : (
              visible.map((l, i) => {
                const agent = one(l.profiles);
                const n = counts[i];
                return (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="td font-medium">{l.name}</td>
                    <td className="td">{agent ? agent.full_name || agent.email : <span className="text-slate-400">Anyone</span>}</td>
                    <td className="td">{one(l.campaigns)?.name}</td>
                    <td className="td text-right font-semibold">{n.ready}</td>
                    <td className="td text-right">{n.callbacks}</td>
                    <td className="td text-right">{n.later}</td>
                    <td className="td text-right">{n.done}</td>
                    <td className="td whitespace-nowrap text-right">
                      <Link href={`/dialer?list=${l.id}`} className="mr-4 text-sm font-medium text-brand hover:underline">Dial</Link>
                      {manager && (
                        <DeleteButton url={`/api/call-lists/${l.id}`} confirmText={`Delete the list “${l.name}” and its contacts? Calls already made are kept.`} />
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Ready: due to be called now. Callbacks: people who asked to be called back. Later: tried, waiting for the retry time. Done: finished, opted out or invalid.
      </p>

      {manager && (
        <div className="mt-8">
          <NewCallList
            campaigns={campaigns ?? []}
            agents={(team ?? []).map((t) => ({ id: t.id, name: t.full_name || t.email || "Agent" }))}
          />
        </div>
      )}
    </>
  );
}
