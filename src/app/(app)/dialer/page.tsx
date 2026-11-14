import Dialer from "@/components/Dialer";
import { PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import type { Campaign } from "@/lib/types";

export default async function DialerPage({ searchParams }: { searchParams: Promise<{ campaign?: string }> }) {
  const { campaign } = await searchParams;
  const { supabase } = await requireProfile();
  const { data } = await supabase.from("campaigns").select("*").eq("mode", "agent").eq("status", "active").order("name");
  return (
    <>
      <PageHeader title="Dialer" subtitle="Work through a campaign one call at a time" />
      <Dialer campaigns={(data ?? []) as Campaign[]} initialCampaignId={campaign} />
    </>
  );
}
