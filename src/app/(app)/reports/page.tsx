import PeriodTabs from "@/components/PeriodTabs";
import { Empty, PageHeader, ScoreBadge } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { formatHours, parsePeriod, periodBounds, summarise, type CallRow } from "@/lib/stats";
import { dispositionLabel } from "@/lib/types";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const days = parsePeriod((await searchParams).days);
  const { supabase } = await requireProfile();
  const { start } = periodBounds(days);

  const [{ data }, { data: campaigns }] = await Promise.all([
    supabase
      .from("calls")
      .select("id, created_at, status, kind, duration_seconds, disposition, agent_id, campaign_id, scorecards(percent, passed, results, objections, agent_talk_ratio, template_id)")
      .gte("created_at", start.toISOString())
      .limit(10000),
    supabase.from("campaigns").select("id, name, mode").order("name"),
  ]);
  const calls = (data ?? []) as unknown as CallRow[];
  const total = summarise(calls);

  const byCampaign = (campaigns ?? [])
    .map((c) => ({ c, s: summarise(calls.filter((x) => x.campaign_id === c.id)) }))
    .filter((r) => r.s.calls > 0)
    .sort((a, b) => b.s.calls - a.s.calls);

  const outcomes = new Map<string, number>();
  for (const c of calls) {
    const key = c.disposition ?? (c.status === "completed" ? "no_outcome" : c.status);
    outcomes.set(key, (outcomes.get(key) ?? 0) + 1);
  }

  return (
    <>
      <PageHeader title="Reports" subtitle={`Last ${days} days`}>
        <PeriodTabs current={days} base="/reports" />
        <a className="btn-secondary" href={`/api/reports/calls?days=${days}`}>Export calls (CSV)</a>
      </PageHeader>

      {calls.length === 0 ? (
        <Empty>No calls in this period.</Empty>
      ) : (
        <>
          <h2 className="mb-3 text-lg font-semibold">By campaign</h2>
          <div className="card overflow-x-auto p-0">
            <table className="w-full">
              <thead className="border-b border-slate-200">
                <tr>
                  <th className="th">Campaign</th>
                  <th className="th text-right">Calls</th>
                  <th className="th text-right">Connected</th>
                  <th className="th text-right">Connect rate</th>
                  <th className="th text-right">Talk time</th>
                  <th className="th text-right">Sales</th>
                  <th className="th text-right">Avg score</th>
                  <th className="th text-right">Pass rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {byCampaign.map(({ c, s }) => (
                  <tr key={c.id}>
                    <td className="td font-medium">
                      {c.name} <span className="text-xs text-slate-400">{c.mode === "broadcast" ? "AI caller" : "Dialler"}</span>
                    </td>
                    <Cells s={s} />
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold">
                  <td className="td">All campaigns</td>
                  <Cells s={total} />
                </tr>
              </tbody>
            </table>
          </div>

          <h2 className="mb-3 mt-8 text-lg font-semibold">Outcomes</h2>
          <div className="card overflow-x-auto p-0">
            <table className="w-full">
              <thead className="border-b border-slate-200">
                <tr>
                  <th className="th">Outcome</th>
                  <th className="th text-right">Calls</th>
                  <th className="th text-right">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...outcomes.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => (
                  <tr key={k}>
                    <td className="td">{k === "no_outcome" ? "Connected, no outcome set" : dispositionLabel(k)}</td>
                    <td className="td text-right">{n}</td>
                    <td className="td text-right">{Math.round((n / calls.length) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function Cells({ s }: { s: ReturnType<typeof summarise> }) {
  return (
    <>
      <td className="td text-right">{s.calls}</td>
      <td className="td text-right">{s.connected}</td>
      <td className="td text-right">{s.calls ? `${Math.round((s.connected / s.calls) * 100)}%` : "—"}</td>
      <td className="td text-right">{formatHours(s.talkSeconds)}</td>
      <td className="td text-right">{s.sales}</td>
      <td className="td text-right"><ScoreBadge percent={s.avgScore} /></td>
      <td className="td text-right">{s.passRate === null ? "—" : `${Math.round(s.passRate)}%`}</td>
    </>
  );
}

