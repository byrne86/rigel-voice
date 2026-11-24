import Link from "next/link";
import BroadcastLauncher from "@/components/BroadcastLauncher";
import CampaignFieldEditor from "@/components/CampaignFieldEditor";
import CampaignForm from "@/components/CampaignForm";
import { twilioNumbers } from "@/lib/twilio";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { isManager, requireProfile } from "@/lib/auth";
import type { Campaign } from "@/lib/types";

export default async function AiCallerPage() {
  const { supabase, profile } = await requireProfile();
  const [{ data }, { data: templates }, numbers] = await Promise.all([
    supabase.from("campaigns").select("*").eq("mode", "broadcast").order("created_at", { ascending: false }),
    supabase.from("scorecard_templates").select("id, name"),
    twilioNumbers(),
  ]);
  const campaigns = (data ?? []) as Campaign[];
  const manager = isManager(profile);

  const waiting = await Promise.all(
    campaigns.map(
      async (c) =>
        (
          await supabase
            .from("contacts")
            .select("id", { count: "exact", head: true })
            .eq("campaign_id", c.id)
            .in("status", ["pending", "retry"])
        ).count ?? 0,
    ),
  );

  return (
    <>
      <PageHeader
        title="AI caller"
        subtitle="Automated calls where an AI voice delivers your message. Listeners can press 1 for a call back or 9 to opt out."
      >
      </PageHeader>

      <p className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Automated marketing calls need the person’s prior consent in Ireland and the UK. Use the AI caller for customers who have agreed to hear from you, such as reminders and renewals.
      </p>

      {campaigns.length === 0 ? (
        <Empty>No AI caller campaigns yet.</Empty>
      ) : (
        <div className="space-y-5">
          {campaigns.map((c, i) => (
            <section key={c.id} className="card">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Link href={`/campaigns/${c.id}`} className="font-semibold text-brand hover:underline">{c.name}</Link>
                  <div className="text-xs text-slate-500">
                    Voice: {c.tts_voice.replace("Polly.", "").replace("-Neural", "")} · {waiting[i]} waiting to be called
                  </div>
                </div>
                <Badge>{c.status}</Badge>
              </div>
              <div className="grid gap-5 lg:grid-cols-2">
                <div>
                  <div className="label">Message</div>
                  <CampaignFieldEditor campaignId={c.id} field="broadcast_message" value={c.broadcast_message} canEdit={manager} rows={4} />
                </div>
                {manager && <BroadcastLauncher campaignId={c.id} waiting={waiting[i]} />}
              </div>
            </section>
          ))}
        </div>
      )}
      {manager && (
        <div className="mt-8">
          <CampaignForm templates={templates ?? []} numbers={numbers} defaultMode="broadcast" />
        </div>
      )}
    </>
  );
}
