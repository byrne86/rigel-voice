import CampaignForm from "@/components/CampaignForm";
import { PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";

export default async function NewCampaignPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const mode = (await searchParams).mode === "broadcast" ? "broadcast" : "agent";
  const { supabase } = await requireProfile();
  const [{ data: templates }, { data: drops }] = await Promise.all([
    supabase.from("scorecard_templates").select("id, name").order("created_at"),
    supabase.from("voicemail_drops").select("id, name, is_default").order("name"),
  ]);
  return (
    <>
      <PageHeader title={mode === "broadcast" ? "New AI caller campaign" : "New campaign"} />
      <CampaignForm templates={templates ?? []} defaultMode={mode} drops={drops ?? []} />
    </>
  );
}
