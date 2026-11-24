import CampaignForm from "@/components/CampaignForm";
import { PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";

export default async function NewCampaignPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const mode = (await searchParams).mode === "broadcast" ? "broadcast" : "agent";
  const { supabase } = await requireProfile();
  const { data: templates } = await supabase.from("scorecard_templates").select("id, name").order("created_at");
  return (
    <>
      <PageHeader title={mode === "broadcast" ? "New AI caller campaign" : "New campaign"} />
      <CampaignForm templates={templates ?? []} defaultMode={mode} />
    </>
  );
}
