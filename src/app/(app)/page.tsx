import Link from "next/link";
import { Meter } from "@/components/Charts";
import { CoachingList, KpiBoard, type Series } from "@/components/DashboardInteractive";
import PeriodTabs from "@/components/PeriodTabs";
import { requireProfile } from "@/lib/auth";
import {
  coachingOpportunities,
  dayKeys,
  didPass,
  formatSeconds,
  parsePeriod,
  periodBounds,
  scoreOf,
  summarise,
  topObjections,
  type CallRow,
} from "@/lib/stats";
import { dispositionLabel, type Criterion } from "@/lib/types";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const days = parsePeriod((await searchParams).days);
  const { supabase } = await requireProfile();
  const { start, prevStart } = periodBounds(days);

  const [{ data }, { data: tpl }, { data: team }] = await Promise.all([
    supabase
      .from("calls")
      .select("id, created_at, status, kind, duration_seconds, disposition, agent_id, campaign_id, scorecards(percent, passed, results, objections, agent_talk_ratio, template_id)")
      .gte("created_at", prevStart.toISOString())
      .order("created_at", { ascending: false })
      .limit(10000),
    supabase.from("scorecard_templates").select("id, name, criteria"),
    supabase.from("profiles").select("id, full_name, email"),
  ]);
  const all = (data ?? []) as unknown as CallRow[];
  const current = all.filter((c) => new Date(c.created_at) >= start);
  const prior = all.filter((c) => new Date(c.created_at) < start);
  const now = summarise(current);
  const before = summarise(prior);

  const templates = new Map(
    (tpl ?? []).map((t) => [
      t.id as string,
      { name: t.name as string, critical: new Set(((t.criteria ?? []) as Criterion[]).filter((c) => c.critical).map((c) => c.id)) },
    ]),
  );
  const names = new Map((team ?? []).map((p) => [p.id as string, (p.full_name || p.email || "Agent") as string]));

  const byDay = new Map(dayKeys(days).map((d) => [d, [] as CallRow[]]));
  for (const c of current) byDay.get(c.created_at.slice(0, 10))?.push(c);
  const series: Series[] = [...byDay.entries()].map(([day, list]) => {
    const sc = list.map(scoreOf).filter((s): s is NonNullable<typeof s> => !!s);
    return {
      day,
      calls: list.length,
      scored: sc.length,
      avgScore: sc.length ? sc.reduce((a, s) => a + Number(s.percent), 0) / sc.length : null,
      passRate: sc.length ? (sc.filter(didPass).length / sc.length) * 100 : null,
    };
  });

  const outcomes = new Map<string, number>();
  for (const c of current) if (c.disposition) outcomes.set(c.disposition, (outcomes.get(c.disposition) ?? 0) + 1);
  const outcomeTotal = [...outcomes.values()].reduce((a, b) => a + b, 0);
  const outcomeRows = [...outcomes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const coaching = coachingOpportunities(current, templates, names).slice(0, 6);
  const objections = topObjections(current).slice(0, 8);
  const diff = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);
  const pct = (v: number | null) => (v === null ? "–" : `${Math.round(v)}%`);

  return (
    <>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold leading-tight text-night">How the team is doing</h1>
          <p className="mt-1.5 text-[15px] text-slate-600">The last {days} days, compared with the {days} before.</p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodTabs current={days} base="/" />
          <Link href="/dialer" className="btn">Open the dialler</Link>
        </div>
      </div>

      <KpiBoard
        series={series}
        totals={{ calls: String(now.calls), scored: String(now.scored), avgScore: pct(now.avgScore), passRate: pct(now.passRate) }}
        deltas={{
          calls: { value: now.calls - before.calls, unit: "" },
          scored: { value: now.scored - before.scored, unit: "" },
          avgScore: { value: diff(now.avgScore, before.avgScore), unit: " pts" },
          passRate: { value: diff(now.passRate, before.passRate), unit: " pts" },
        }}
        extra={[
          { label: "Typical call", value: now.avgLength === null ? "–" : formatSeconds(now.avgLength), note: `${now.connected} of ${now.calls} calls connected` },
          { label: "Agent talk share", value: pct(now.agentTalk), note: "of each call, on average" },
        ]}
      />

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className="card">
          <h2 className="text-lg font-bold text-night">Where to coach next</h2>
          <p className="mb-2 text-sm text-slate-500">Scorecard points the team scores lowest on. Open one to see who needs help.</p>
          {coaching.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">Once a few calls are scored, the weakest points show up here.</p>
          ) : (
            <CoachingList items={coaching} />
          )}
        </section>

        <div className="space-y-5">
          <section className="card">
            <h2 className="mb-3 text-lg font-bold text-night">How calls ended</h2>
            {outcomeRows.length === 0 ? (
              <p className="text-sm text-slate-500">No outcomes saved in this period.</p>
            ) : (
              <ul className="space-y-3">
                {outcomeRows.map(([d, n]) => (
                  <li key={d}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>{dispositionLabel(d)}</span>
                      <span className="text-slate-500">{n} ({Math.round((n / outcomeTotal) * 100)}%)</span>
                    </div>
                    <Meter percent={(n / outcomeTotal) * 100} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h2 className="mb-3 text-lg font-bold text-night">What prospects push back on</h2>
            {objections.length === 0 ? (
              <p className="text-sm text-slate-500">The AI lists objections here as it scores calls.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {objections.map((o) => (
                  <li key={o.objection} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-night">“{o.objection}”</div>
                      <div className="text-xs capitalize text-slate-500">{o.category} · heard {o.times}×</div>
                    </div>
                    <span className={`badge shrink-0 ${o.resolved / o.times >= 0.6 ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "bg-amber-50 text-amber-800 ring-1 ring-amber-200"}`}>
                      {Math.round((o.resolved / o.times) * 100)}% handled
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
