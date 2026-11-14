import Link from "next/link";
import { requireProfile, isManager } from "@/lib/auth";
import { Badge, Empty, PageHeader } from "@/components/ui";
import type { Campaign } from "@/lib/types";

export default async function CampaignsPage() {
  const { supabase, profile } = await requireProfile();
  const { data } = await supabase.from("campaigns").select("*").order("created_at", { ascending: false });
  const campaigns = (data ?? []) as Campaign[];

  return (
    <>
      <PageHeader title="Campaigns" subtitle="Calling lists for your agents and AI voice broadcasts">
        {isManager(profile) && <Link href="/campaigns/new" className="btn">New campaign</Link>}
      </PageHeader>
      {campaigns.length === 0 ? (
        <Empty>No campaigns yet.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="th">Name</th>
                <th className="th">Type</th>
                <th className="th">Status</th>
                <th className="th">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {campaigns.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="td font-medium">
                    <Link href={`/campaigns/${c.id}`} className="text-brand hover:underline">{c.name}</Link>
                  </td>
                  <td className="td">{c.mode === "agent" ? "Agent dialer" : "AI voice broadcast"}</td>
                  <td className="td"><Badge>{c.status}</Badge></td>
                  <td className="td text-slate-500">{new Date(c.created_at).toLocaleDateString("en-IE")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
