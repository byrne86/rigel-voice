import TemplatesEditor from "@/components/TemplatesEditor";
import { PageHeader } from "@/components/ui";
import { isManager, requireProfile } from "@/lib/auth";
import type { ScorecardTemplate } from "@/lib/types";

export default async function ScorecardsPage() {
  const { supabase, profile } = await requireProfile();
  const { data } = await supabase.from("scorecard_templates").select("*").order("created_at");
  return (
    <>
      <PageHeader title="Scorecards" subtitle="What the AI checks for on every recorded call" />
      <TemplatesEditor templates={(data ?? []) as ScorecardTemplate[]} canEdit={isManager(profile)} />
    </>
  );
}
