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
  const tplName = (id: string | null) => templates?.find((t) => t.id === id)?.name ?? templates?.[0]?.name ?? "your scorecard";

  return (
    <>
      <PageHeader title="Campaigns" subtitle="A campaign is one calling job: who you ring, the number they see, how calls are marked and what happens when they ring back." />
      <div className="space-y-3">
        {campaigns.length === 0 && <div className="card text-sm text-slate-500">You haven&apos;t set up a campaign yet. Start with the form below.</div>}
        {campaigns.map((c) => (
          <section key={c.id} className="card flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">
                {c.name} <Badge>{c.status}</Badge> {c.mode === "broadcast" && <span className="badge bg-brand/10 text-brand">AI caller</span>}
              </h2>
              <p className="text-sm text-slate-500">
                Shows {c.caller_id ?? "your main number"}, marked with {tplName(c.scorecard_template_id)}, in {LANGUAGES.find((l) => l.value === c.call_language)?.label ?? "English"}.
                {c.ring_agents_on_callback ? " Callbacks ring agents." : ""}
              </p>
            </div>
            {manager && <Link href={`/campaigns/${c.id}`} className="btn-secondary px-3 py-1.5">Open</Link>}
          </section>
        ))}
      </div>
      {manager && (
        <div className="mt-8">
          <CampaignForm templates={templates ?? []} numbers={numbers} />
          <p className="mt-2 text-xs text-slate-500">
            Callbacks are matched to a campaign by the number the person rang. For that to work, point each Twilio number&apos;s incoming-call webhook at /api/twilio/inbound.
          </p>
        </div>
      )}
    </>
  );
}
