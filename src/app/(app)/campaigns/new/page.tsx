import CampaignForm from "@/components/CampaignForm";
import { PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";

export default async function NewCampaignPage() {
  const { supabase } = await requireProfile();
  const { data: templates } = await supabase.from("scorecard_templates").select("id, name").order("created_at");
  return (
    <>
      <PageHeader title="New campaign" />
      <CampaignForm templates={templates ?? []} />
    </>
  );
}
