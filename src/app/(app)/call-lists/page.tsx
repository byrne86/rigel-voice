import Link from "next/link";
import DeleteButton from "@/components/DeleteButton";
import NewCallList from "@/components/NewCallList";
import { PageHeader, one } from "@/components/ui";
import { isManager, requireProfile } from "@/lib/auth";
import { nowIso } from "@/lib/stats";

function ListProgress({ ready, callbacks, later, done }: { ready: number; callbacks: number; later: number; done: number }) {
  const total = ready + callbacks + later + done;
  if (!total) return <span className="text-xs text-slate-400">Empty</span>;
  const parts = [
    { n: done, c: "bg-good", t: "finished" },
    { n: later, c: "bg-slate-300", t: "waiting to retry" },
    { n: callbacks, c: "bg-flare", t: "call backs" },
    { n: ready, c: "bg-brand", t: "to call now" },
  ];
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100" role="img"
        aria-label={parts.map((p) => `${p.n} ${p.t}`).join(", ")}>
        {parts.map((p) => p.n > 0 && <div key={p.t} title={`${p.n} ${p.t}`} className={`${p.c} border-r-2 border-white last:border-r-0`} style={{ width: `${(p.n / total) * 100}%` }} />)}
      </div>
      <div className="mt-1 text-xs text-slate-500">{Math.round((done / total) * 100)}% finished of {total}</div>
    </div>
  );
}

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
        subtitle="The people each agent will ring. Pick a list in the dialler and it rings the next person for you after every call."
      />
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-slate-200">
            <tr>
              <th className="th">List</th>
              <th className="th">Agent</th>
              <th className="th">Campaign</th>
              <th className="th">Progress</th>
              <th className="th text-right">To call now</th>
              <th className="th text-right">Call backs</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={8} className="td py-10 text-center text-slate-500">
                  No lists yet. {manager ? "Upload a spreadsheet below to make your first one." : "Your manager hasn't given you a list yet."}
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
                    <td className="td w-[30%] min-w-48">
                      <ListProgress ready={n.ready} callbacks={n.callbacks} later={n.later} done={n.done} />
                    </td>
                    <td className="td text-right font-display text-lg font-bold text-night">{n.ready}</td>
                    <td className="td text-right">{n.callbacks}</td>
                    <td className="td whitespace-nowrap text-right">
                      <Link href={`/dialer?list=${l.id}`} className="btn mr-3 px-3 py-1.5">Start calling</Link>
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
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-brand" />To call now</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-flare" />Asked for a call back</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-slate-300" />Tried, waiting to retry</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-good" />Finished</span>
      </div>

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
