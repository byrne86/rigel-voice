import Link from "next/link";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { isManager, requireProfile } from "@/lib/auth";
import type { Campaign } from "@/lib/types";

const STATUSES = ["pending", "retry", "in_progress", "completed", "dnc", "failed"] as const;

export default async function CallListsPage() {
  const { supabase, profile } = await requireProfile();
  const { data } = await supabase.from("campaigns").select("*").order("created_at", { ascending: false });
  const campaigns = (data ?? []) as Campaign[];

  const counts = await Promise.all(
    campaigns.map(async (c) => {
      const res = await Promise.all(
        STATUSES.map((s) =>
          supabase.from("contacts").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).eq("status", s),
        ),
      );
      return Object.fromEntries(STATUSES.map((s, i) => [s, res[i].count ?? 0])) as Record<(typeof STATUSES)[number], number>;
    }),
  );

  return (
    <>
      <PageHeader title="Call lists" subtitle="The contacts in each campaign and how far through them you are">
        {isManager(profile) && <Link href="/campaigns/new" className="btn">New list</Link>}
      </PageHeader>
      {campaigns.length === 0 ? (
        <Empty>No call lists yet. Create a campaign, then import a CSV of contacts into it.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="th">List</th>
                <th className="th">Status</th>
                <th className="th text-right">Contacts</th>
                <th className="th text-right">To call</th>
                <th className="th text-right">Completed</th>
                <th className="th text-right">Do not call</th>
                <th className="th">Progress</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {campaigns.map((c, i) => {
                const n = counts[i];
                const total = Object.values(n).reduce((a, b) => a + b, 0);
                const done = n.completed + n.dnc + n.failed;
                const pct = total ? Math.round((done / total) * 100) : 0;
                return (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="td font-medium">
                      <Link href={`/campaigns/${c.id}`} className="text-brand hover:underline">{c.name}</Link>
                      <div className="text-xs text-slate-400">{c.mode === "broadcast" ? "AI caller" : "Dialler"}</div>
                    </td>
                    <td className="td"><Badge>{c.status}</Badge></td>
                    <td className="td text-right">{total}</td>
                    <td className="td text-right">{n.pending + n.retry}</td>
                    <td className="td text-right">{n.completed}</td>
                    <td className="td text-right">{n.dnc}</td>
                    <td className="td w-40">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 rounded-full bg-slate-100">
                          <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-9 text-right text-xs text-slate-500">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">Open a list to import contacts from a CSV or see who is next.</p>
    </>
  );
}
