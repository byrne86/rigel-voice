import Link from "next/link";
import { notFound } from "next/navigation";
import BroadcastLauncher from "@/components/BroadcastLauncher";
import CampaignForm from "@/components/CampaignForm";
import ContactImport from "@/components/ContactImport";
import { Badge, Empty, PageHeader, Stat } from "@/components/ui";
import { isManager, requireProfile } from "@/lib/auth";
import { contactName, dispositionLabel, type Campaign, type Contact } from "@/lib/types";

const STATUSES = ["pending", "retry", "in_progress", "completed", "dnc", "failed"] as const;

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, profile } = await requireProfile();

  const { data: campaign } = await supabase.from("campaigns").select("*").eq("id", id).single();
  if (!campaign) notFound();
  const c = campaign as Campaign;

  const [{ data: templates }, { data: contacts }, ...counts] = await Promise.all([
    supabase.from("scorecard_templates").select("id, name").order("created_at"),
    supabase.from("contacts").select("*").eq("campaign_id", id).order("created_at", { ascending: false }).limit(100),
    ...STATUSES.map((s) =>
      supabase.from("contacts").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("status", s),
    ),
  ]);
  const n = Object.fromEntries(STATUSES.map((s, i) => [s, counts[i].count ?? 0])) as Record<(typeof STATUSES)[number], number>;
  const total = Object.values(n).reduce((a, b) => a + b, 0);
  const waiting = n.pending + n.retry;
  const manager = isManager(profile);

  return (
    <>
      <PageHeader title={c.name} subtitle={c.mode === "agent" ? "Agent dialer campaign" : "AI voice broadcast campaign"}>
        <Badge>{c.status}</Badge>
        {c.mode === "agent" && c.status === "active" && (
          <Link href={`/dialer?campaign=${c.id}`} className="btn">Dial this campaign</Link>
        )}
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Contacts" value={total} />
        <Stat label="Waiting to call" value={waiting} hint={`${n.retry} retries`} />
        <Stat label="Completed" value={n.completed} />
        <Stat label="Do not call" value={n.dnc} hint={n.failed ? `${n.failed} failed` : undefined} />
      </div>

      {manager && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="card">
            <h3 className="mb-3 font-semibold">Contacts</h3>
            <ContactImport campaignId={c.id} />
          </div>
          {c.mode === "broadcast" && <BroadcastLauncher campaignId={c.id} waiting={waiting} />}
        </div>
      )}

      {manager && (
        <>
          <h2 className="mb-3 mt-8 text-lg font-semibold">Settings</h2>
          <CampaignForm campaign={c} templates={templates ?? []} />
        </>
      )}

      <h2 className="mb-3 mt-8 text-lg font-semibold">Latest contacts</h2>
      {(contacts ?? []).length === 0 ? (
        <Empty>No contacts yet. Import a CSV to get started.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="th">Name</th>
                <th className="th">Company</th>
                <th className="th">Phone</th>
                <th className="th">Status</th>
                <th className="th">Attempts</th>
                <th className="th">Last outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {((contacts ?? []) as Contact[]).map((p) => (
                <tr key={p.id}>
                  <td className="td font-medium">{contactName(p)}</td>
                  <td className="td">{p.company ?? "—"}</td>
                  <td className="td">{p.phone}</td>
                  <td className="td"><Badge>{p.status}</Badge></td>
                  <td className="td">{p.attempts}</td>
                  <td className="td">{dispositionLabel(p.last_disposition)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
