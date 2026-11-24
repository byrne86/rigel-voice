import Link from "next/link";
import CampaignForm from "@/components/CampaignForm";
import { Badge, PageHeader } from "@/components/ui";
import { isManager, requireProfile } from "@/lib/auth";
import { twilioNumbers } from "@/lib/twilio";
import { LANGUAGES, type Campaign } from "@/lib/types";

export default async function CampaignsPage() {
  const { supabase, profile } = await requireProfile();
  const manager = isManager(profile);
  const [{ data }, { data: templates }, numbers] = await Promise.all([
    supabase.from("campaigns").select("*").order("name"),
    supabase.from("scorecard_templates").select("id, name").order("created_at"),
    manager ? twilioNumbers() : Promise.resolve([]),
  ]);
  const campaigns = (data ?? []) as Campaign[];
  const tplName = (id: string | null) => templates?.find((t) => t.id === id)?.name ?? "default scorecard";

  return (
    <>
      <PageHeader title="Campaigns" subtitle="Each campaign sets the caller ID, scorecard, script, recording line and how callbacks are handled." />
      <div className="space-y-3">
        {campaigns.length === 0 && <div className="card text-sm text-slate-500">No campaigns yet. Add your first one below.</div>}
        {campaigns.map((c) => (
          <section key={c.id} className="card flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">
                {c.name} <Badge>{c.status}</Badge> {c.mode === "broadcast" && <span className="badge bg-indigo-100 text-indigo-800">AI caller</span>}
              </h2>
              <p className="text-sm text-slate-500">
                {[
                  c.caller_id ? `calls from ${c.caller_id}` : "account default caller ID",
                  tplName(c.scorecard_template_id),
                  LANGUAGES.find((l) => l.value === c.call_language)?.label,
                  c.ring_agents_on_callback ? "callbacks ring agents" : null,
                  c.crm_note ? "CRM notes on" : null,
                  c.is_default_inbound ? "default for unmatched calls" : null,
                ].filter(Boolean).join(" · ")}
              </p>
            </div>
            {manager && <Link href={`/campaigns/${c.id}`} className="text-sm font-medium text-brand hover:underline">Edit</Link>}
          </section>
        ))}
      </div>
      {manager && (
        <div className="mt-8">
          <CampaignForm templates={templates ?? []} numbers={numbers} />
          <p className="mt-2 text-xs text-slate-500">
            Incoming calls join a campaign by the number they dialled (its caller ID). To take callbacks, set each Twilio number&apos;s “A call comes in” webhook to /api/twilio/inbound.
          </p>
        </div>
      )}
    </>
  );
}
