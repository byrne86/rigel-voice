import Link from "next/link";
import TemplatesEditor, { type TemplateStats } from "@/components/TemplatesEditor";
import { PageHeader } from "@/components/ui";
import { isManager, requireProfile } from "@/lib/auth";
import type { ScorecardTemplate } from "@/lib/types";

export default async function ScorecardsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { supabase, profile } = await requireProfile();
  const startNew = (await searchParams).new === "1";
  const [{ data }, { data: campaigns }, { data: scores }] = await Promise.all([
    supabase.from("scorecard_templates").select("*").order("created_at"),
    supabase.from("campaigns").select("name, scorecard_template_id"),
    supabase.from("scorecards").select("template_id, percent, passed, calls(agent_id)").limit(20000),
  ]);
  const templates = (data ?? []) as ScorecardTemplate[];
  const firstId = templates[0]?.id;
  const stats: Record<string, TemplateStats> = {};
  for (const t of templates) {
    const rows = (scores ?? []).filter((s) => s.template_id === t.id);
    const agents = new Set(rows.map((r) => (Array.isArray(r.calls) ? r.calls[0] : r.calls)?.agent_id).filter(Boolean));
    stats[t.id] = {
      evaluations: rows.length,
      agents: agents.size,
      pass: rows.length ? (rows.filter((r) => r.passed ?? Number(r.percent) >= 70).length / rows.length) * 100 : null,
      avg: rows.length ? rows.reduce((a, r) => a + Number(r.percent), 0) / rows.length : null,
      campaigns: (campaigns ?? [])
        .filter((c) => (c.scorecard_template_id ?? firstId) === t.id)
        .map((c) => c.name + (c.scorecard_template_id ? "" : " (default)")),
    };
  }

  return (
    <>
      <PageHeader title="Scorecards" subtitle="What a good call looks like, point by point. Each campaign picks one, and the AI marks every recorded call against it.">
        {isManager(profile) && !startNew && <Link href="/scorecards?new=1" className="btn">New scorecard</Link>}
      </PageHeader>
      <TemplatesEditor templates={templates} canEdit={isManager(profile)} stats={stats} startNew={startNew} />
    </>
  );
}
