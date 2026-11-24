import Link from "next/link";
import { Delta, DailyBars, Meter } from "@/components/Charts";
import PeriodTabs from "@/components/PeriodTabs";
import { Badge, Empty } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import {
  coachingOpportunities,
  dayKeys,
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

  const [{ data }, { data: tpl }] = await Promise.all([
    supabase
      .from("calls")
      .select(
        "id, created_at, status, kind, duration_seconds, disposition, agent_id, campaign_id, scorecards(percent, passed, results, objections, agent_talk_ratio, template_id)",
      )
      .gte("created_at", prevStart.toISOString())
      .order("created_at", { ascending: false })
      .limit(10000),
    supabase.from("scorecard_templates").select("id, name, criteria"),
  ]);
  const all = (data ?? []) as unknown as CallRow[];
  const current = all.filter((c) => new Date(c.created_at) >= start);
  const prior = all.filter((c) => new Date(c.created_at) < start);
  const now = summarise(current);
  const before = summarise(prior);

  const templates = new Map(
    (tpl ?? []).map((t) => [
      t.id as string,
      {
        name: t.name as string,
        critical: new Set(((t.criteria ?? []) as Criterion[]).filter((c) => c.critical).map((c) => c.id)),
      },
    ]),
  );

  // Calls scored per day
  const perDay = new Map(dayKeys(days).map((d) => [d, 0]));
  for (const c of current) {
    if (!scoreOf(c)) continue;
    const d = c.created_at.slice(0, 10);
    if (perDay.has(d)) perDay.set(d, (perDay.get(d) ?? 0) + 1);
  }

  // Call outcomes
  const outcomes = new Map<string, number>();
  for (const c of current) {
    if (!c.disposition) continue;
    outcomes.set(c.disposition, (outcomes.get(c.disposition) ?? 0) + 1);
  }
  const outcomeTotal = [...outcomes.values()].reduce((a, b) => a + b, 0);
  const outcomeRows = [...outcomes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  const coaching = coachingOpportunities(current, templates).slice(0, 6);
  const objections = topObjections(current).slice(0, 8);

  const diff = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Last {days} days compared with the {days} days before
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodTabs current={days} base="/" />
          <Link href="/dialer" className="btn">Start dialling</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi label="Calls scored" value={String(now.scored)} delta={<Delta value={now.scored - before.scored} />} />
        <Kpi
          label="Average score"
          value={now.avgScore === null ? "—" : `${now.avgScore.toFixed(1)}%`}
          delta={<Delta value={diff(now.avgScore, before.avgScore)} unit="pts" />}
        />
        <Kpi
          label="Pass rate"
          value={now.passRate === null ? "—" : `${Math.round(now.passRate)}%`}
          delta={<Delta value={diff(now.passRate, before.passRate)} unit="pts" />}
        />
        <Kpi label="Avg call length" value={formatSeconds(now.avgLength)} delta={<span className="text-xs text-slate-500">{now.connected} connected of {now.calls} calls</span>} />
        <Kpi
          label="Agent talk time"
          value={now.agentTalk === null ? "—" : `${Math.round(now.agentTalk)}%`}
          delta={<span className="text-xs text-slate-500">of each call, on average</span>}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="mb-4 font-semibold">Calls scored per day</h2>
          <DailyBars data={[...perDay.entries()].map(([day, value]) => ({ day, value }))} label="Calls scored per day" />
        </section>
        <section className="card">
          <h2 className="mb-4 font-semibold">Call outcomes</h2>
          {outcomeRows.length === 0 ? (
            <p className="text-sm text-slate-500">No outcomes recorded in this period.</p>
          ) : (
            <ul className="space-y-4">
              {outcomeRows.map(([d, n]) => (
                <li key={d}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span>{dispositionLabel(d)}</span>
                    <span className="text-slate-500">
                      {n} · {Math.round((n / outcomeTotal) * 100)}%
                    </span>
                  </div>
                  <Meter percent={(n / outcomeTotal) * 100} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="card">
          <h2 className="font-semibold">Biggest coaching opportunities</h2>
          <p className="mb-4 text-xs text-slate-500">Scorecard criteria with the lowest achievement across all agents</p>
          {coaching.length === 0 ? (
            <Empty>No scored calls in this period yet.</Empty>
          ) : (
            <ul className="space-y-4">
              {coaching.map((c) => {
                const tone = c.achievement >= 80 ? "good" : c.achievement >= 60 ? "warn" : "bad";
                return (
                  <li key={`${c.template}:${c.name}`}>
                    <div className="mb-1.5 flex items-start justify-between gap-3 text-sm">
                      <span>
                        {c.name}
                        {c.critical && <span className="ml-2"><Badge tone="red">critical</Badge></span>}
                        <span className="ml-2 text-xs text-slate-400">{c.template}</span>
                      </span>
                      <span className="shrink-0 text-xs text-slate-500">
                        {Math.round(c.achievement)}% · missed {c.missed}×
                      </span>
                    </div>
                    <Meter percent={c.achievement} tone={tone} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card">
          <h2 className="mb-4 font-semibold">Top objections</h2>
          {objections.length === 0 ? (
            <Empty>No objections recorded in this period.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-200">
                  <tr>
                    <th className="th pl-0">Objection</th>
                    <th className="th">Category</th>
                    <th className="th text-right">Times</th>
                    <th className="th text-right">Resolved</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {objections.map((o) => (
                    <tr key={o.objection}>
                      <td className="td pl-0">{o.objection}</td>
                      <td className="td capitalize text-slate-600">{o.category}</td>
                      <td className="td text-right">{o.times}</td>
                      <td className="td text-right">{Math.round((o.resolved / o.times) * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function Kpi({ label, value, delta }: { label: string; value: string; delta: React.ReactNode }) {
  return (
    <div className="card">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1">{delta}</div>
    </div>
  );
}
