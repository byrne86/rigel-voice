import Link from "next/link";
import { notFound } from "next/navigation";
import CampaignForm from "@/components/CampaignForm";
import { Badge, PageHeader, Stat } from "@/components/ui";
import { isManager, requireProfile } from "@/lib/auth";
import { twilioNumbers } from "@/lib/twilio";
import type { Campaign } from "@/lib/types";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, profile } = await requireProfile();
  if (!isManager(profile)) notFound();
  const [{ data }, { data: templates }, { data: lists }, numbers, ...counts] = await Promise.all([
    supabase.from("campaigns").select("*").eq("id", id).single(),
    supabase.from("scorecard_templates").select("id, name").order("created_at"),
    supabase.from("call_lists").select("id, name").eq("campaign_id", id),
    twilioNumbers(),
    ...[["pending", "retry"], ["completed"], ["dnc"]].map((s) =>
      supabase.from("contacts").select("id", { count: "exact", head: true }).eq("campaign_id", id).in("status", s),
    ),
  ]);
  if (!data) notFound();
  const c = data as Campaign;
  const [waiting, completed, dnc] = counts.map((r) => r.count ?? 0);

  return (
    <>
      <PageHeader title={c.name} subtitle={c.mode === "broadcast" ? "AI caller campaign" : "Dialler campaign"}>
        <Badge>{c.status}</Badge>
        <Link href="/campaigns" className="btn-secondary">All campaigns</Link>
      </PageHeader>
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Call lists" value={(lists ?? []).length} />
        <Stat label="Waiting to call" value={waiting} />
        <Stat label="Completed" value={completed} />
        <Stat label="Do not call" value={dnc} />
      </div>
      <CampaignForm campaign={c} templates={templates ?? []} numbers={numbers} />
      <div className="mt-5 flex gap-3 text-sm">
        <Link href={`/scripts/${c.id}`} className="text-brand hover:underline">Edit the call script</Link>
        <Link href="/call-lists" className="text-brand hover:underline">Manage call lists</Link>
      </div>
    </>
  );
}
