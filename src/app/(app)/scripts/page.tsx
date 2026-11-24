import CampaignFieldEditor from "@/components/CampaignFieldEditor";
import { Badge, Empty, PageHeader } from "@/components/ui";
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
        subtitle="Shown to agents in the dialler, and given to the AI as context when it scores each call"
      />
      {campaigns.length === 0 ? (
        <Empty>No dialler campaigns yet. Each campaign has its own script.</Empty>
      ) : (
        <div className="space-y-5">
          {campaigns.map((c) => (
            <section key={c.id} className="card">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="font-semibold">{c.name}</h2>
                <Badge>{c.status}</Badge>
              </div>
              <CampaignFieldEditor
                campaignId={c.id}
                field="script"
                value={c.script}
                canEdit={manager}
                rows={8}
                placeholder={"Opening: Hi {{first_name}}, it's … from …, calling about …\nQuestions to ask: …\nHandling objections: …\nClose: …"}
              />
            </section>
          ))}
        </div>
      )}
    </>
  );
}
