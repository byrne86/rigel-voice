import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { isManager, requireProfile } from "@/lib/auth";
import type { Campaign } from "@/lib/types";

export default async function ScriptsPage() {
  const { supabase, profile } = await requireProfile();
  const { data } = await supabase.from("campaigns").select("*").eq("mode", "agent").order("name");
  const campaigns = (data ?? []) as Campaign[];
  const manager = isManager(profile);

  return (
    <>
      <PageHeader
        title="Call scripts"
        subtitle="What agents should say on each campaign. The steps become a tick-list in the dialler, and the AI scores calls against them."
      />
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-slate-200">
            <tr>
              <th className="th">Campaign</th>
              <th className="th">Status</th>
              <th className="th text-right">Steps</th>
              <th className="th text-right">Objections</th>
              <th className="th">Approved</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {campaigns.length === 0 ? (
              <tr><td colSpan={6} className="td py-10 text-center text-slate-500">No campaigns yet.</td></tr>
            ) : (
              campaigns.map((c) => {
                const has = !!c.script || c.script_flow?.length > 0 || c.script_objections?.length > 0;
                return (
                  <tr key={c.id}>
                    <td className="td font-medium">{c.name}</td>
                    <td className="td">
                      {!has ? (
                        <span className="text-slate-400">Not written</span>
                      ) : c.script_status === "approved" ? (
                        <span className="badge bg-emerald-100 text-emerald-800">Approved</span>
                      ) : (
                        <span className="badge bg-amber-100 text-amber-800">Draft</span>
                      )}
                    </td>
                    <td className="td text-right">{c.script_flow?.length || "–"}</td>
                    <td className="td text-right">{c.script_objections?.length || "–"}</td>
                    <td className="td text-slate-600">
                      {c.script_approved_at ? new Date(c.script_approved_at).toLocaleDateString("en-IE", { day: "numeric", month: "short" }) : "–"}
                    </td>
                    <td className="td text-right">
                      {(manager || (has && c.script_status === "approved")) && (
                        <Link href={`/scripts/${c.id}`} className="text-sm font-medium text-brand hover:underline">
                          {has ? (manager ? "Edit" : "Read") : "Write script"}
                        </Link>
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
        Agents see a script once you approve it. If you change an approved script, it goes back to draft and agents keep seeing nothing until you approve it again.
      </p>
    </>
  );
}
