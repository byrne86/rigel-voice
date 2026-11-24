import Link from "next/link";
import ReportFilters from "@/components/ReportFilters";
import { Badge, PageHeader, ScoreBadge } from "@/components/ui";
import { isManager, requireProfile } from "@/lib/auth";
import { callStatusLabel, fetchReportCalls, first, parseRange, rangeQuery, reportSummary, type ReportCall } from "@/lib/reports";
import { formatSeconds } from "@/lib/stats";
import { contactName, dispositionLabel, type ScoreResult } from "@/lib/types";

const TABS = [
  ["summary", "Summary"],
  ["quality", "Quality"],
  ["calls", "All calls"],
] as const;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const range = parseRange(sp);
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "summary";
  const { supabase, profile } = await requireProfile();
  const [calls, { data: campaigns }, { data: team }] = await Promise.all([
    fetchReportCalls(supabase, range),
    supabase.from("campaigns").select("id, name").order("name"),
    supabase.from("profiles").select("id, full_name, email").order("full_name"),
  ]);
  const agents = (team ?? []).map((p) => ({ id: p.id, name: p.full_name || p.email || "Agent" }));
  const s = reportSummary(calls);
  const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
  const q = rangeQuery(range);

  return (
    <>
      <PageHeader title="Reports" subtitle={`${fmtDay(range.from)} to ${fmtDay(range.to)}, Irish time${isManager(profile) ? "" : " · your calls only"}`}>
        <a className="btn-secondary" href={`/api/reports/excel?${q}`}>Export to Excel</a>
      </PageHeader>
      <ReportFilters range={range} base="/reports" campaigns={campaigns ?? []} agents={agents} tab={tab} />

      <div className="mb-5 flex gap-6 border-b border-slate-200" role="tablist">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/reports?${q}&tab=${k}`} role="tab" aria-selected={tab === k}
            className={`-mb-px border-b-2 pb-2 text-sm font-medium ${tab === k ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            {label}
          </Link>
        ))}
      </div>

      {tab === "summary" && <Summary calls={calls} s={s} agents={agents} campaigns={campaigns ?? []} />}
      {tab === "quality" && <Quality calls={calls} />}
      {tab === "calls" && <AllCalls calls={calls} />}

      <p className="mt-4 text-xs text-slate-500">
        A call counts as connected at 15 seconds and as a conversation at one minute. Decision makers are counted when the agent marks them in the dialler.
        Only recorded calls long enough to judge get a score.
      </p>
    </>
  );
}

function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="card">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

function Summary({ calls, s, agents, campaigns }: {
  calls: ReportCall[];
  s: ReturnType<typeof reportSummary>;
  agents: { id: string; name: string }[];
  campaigns: { id: string; name: string }[];
}) {
  const groups = (key: (c: ReportCall) => string | null, names: Map<string, string>) => {
    const m = new Map<string, ReportCall[]>();
    for (const c of calls) {
      const k = key(c) ?? "_";
      m.set(k, [...(m.get(k) ?? []), c]);
    }
    return [...m.entries()].map(([k, list]) => ({ name: names.get(k) ?? "—", s: reportSummary(list) })).sort((a, b) => b.s.calls - a.s.calls);
  };
  const byAgent = groups((c) => (c.kind === "broadcast" ? "ai" : c.agent_id), new Map([...agents.map((a) => [a.id, a.name] as [string, string]), ["ai", "AI caller"]]));
  const byCampaign = groups((c) => c.campaign_id, new Map(campaigns.map((c) => [c.id, c.name])));

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <Kpi label="Calls" value={s.calls} hint={`${s.outbound} out, ${s.inbound} in`} />
        <Kpi label="Connected" value={s.connected} />
        <Kpi label="Decision makers" value={s.reachedDm} hint={`${s.conversations} conversations`} />
        <Kpi label="Meetings" value={s.meetings} hint={`${s.callbacks} callbacks`} />
        <Kpi label="Talk time" value={formatSeconds(s.talkSeconds)} />
        <Kpi label="Avg score" value={s.avgScore === null ? "—" : `${Math.round(s.avgScore)}%`} hint={s.scored ? `${s.scored} scored calls` : "no scored calls"} />
      </div>
      {calls.length === 0 ? (
        <div className="card mt-5 py-10 text-center text-sm text-slate-500">No calls in this period.</div>
      ) : (
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <BreakdownTable title="By agent" rows={byAgent} />
          <BreakdownTable title="By campaign" rows={byCampaign} />
        </div>
      )}
    </>
  );
}

function BreakdownTable({ title, rows }: { title: string; rows: { name: string; s: ReturnType<typeof reportSummary> }[] }) {
  return (
    <section className="card overflow-x-auto p-0">
      <h2 className="px-4 pt-4 font-semibold">{title}</h2>
      <table className="mt-2 w-full">
        <thead className="border-b border-slate-200">
          <tr>
            <th className="th">Name</th>
            <th className="th text-right">Calls</th>
            <th className="th text-right">Connected</th>
            <th className="th text-right">Decision makers</th>
            <th className="th text-right">Meetings</th>
            <th className="th text-right">Talk time</th>
            <th className="th text-right">Avg score</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.name}>
              <td className="td font-medium">{r.name}</td>
              <td className="td text-right">{r.s.calls}</td>
              <td className="td text-right">{r.s.connected}</td>
              <td className="td text-right">{r.s.reachedDm}</td>
              <td className="td text-right">{r.s.meetings}</td>
              <td className="td text-right">{formatSeconds(r.s.talkSeconds)}</td>
              <td className="td text-right"><ScoreBadge percent={r.s.avgScore} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Quality({ calls }: { calls: ReportCall[] }) {
  const scored = calls.filter((c) => first(c.scorecards));
  const crit = new Map<string, { sum: number; n: number }>();
  for (const c of scored) {
    for (const r of ((first(c.scorecards)?.results ?? []) as ScoreResult[])) {
      if (!r.max_points) continue;
      const row = crit.get(r.name) ?? { sum: 0, n: 0 };
      row.sum += r.score / r.max_points;
      row.n++;
      crit.set(r.name, row);
    }
  }
  const criteria = [...crit.entries()].map(([name, v]) => ({ name, pct: (v.sum / v.n) * 100 })).sort((a, b) => a.pct - b.pct);

  if (scored.length === 0) return <div className="card py-10 text-center text-sm text-slate-500">No scored calls in this period.</div>;
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <section className="card">
        <h2 className="mb-3 text-lg font-bold text-night">Scorecard points, weakest first</h2>
        <ul className="space-y-3">
          {criteria.map((c) => (
            <li key={c.name}>
              <div className="mb-1 flex justify-between text-sm"><span>{c.name}</span><span className="text-slate-500">{Math.round(c.pct)}%</span></div>
              <div className="h-2 rounded-full bg-slate-100">
                <div className={`h-2 rounded-full ${c.pct >= 80 ? "bg-emerald-600" : c.pct >= 60 ? "bg-amber-500" : "bg-red-600"}`} style={{ width: `${c.pct}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="card overflow-x-auto p-0 xl:col-span-2">
        <table className="w-full">
          <thead className="border-b border-slate-200">
            <tr><th className="th">Call</th><th className="th">Agent</th><th className="th">Score</th><th className="th">Result</th><th className="th">Compliance</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {scored.map((c) => {
              const sc = first(c.scorecards)!;
              const passed = sc.passed ?? Number(sc.percent) >= 70;
              const flags = sc.compliance_flags ?? [];
              return (
                <tr key={c.id}>
                  <td className="td">
                    <Link href={`/calls/${c.id}`} className="font-medium text-brand hover:underline">{contactName(first(c.contacts) ?? { phone: c.to_number ?? "" })}</Link>
                    <div className="text-xs text-slate-500">{new Date(c.created_at).toLocaleString("en-IE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Dublin" })}</div>
                  </td>
                  <td className="td">{c.kind === "broadcast" ? "AI caller" : first(c.profiles)?.full_name ?? "—"}</td>
                  <td className="td"><ScoreBadge percent={Number(sc.percent)} /></td>
                  <td className="td"><Badge tone={passed ? "green" : "red"}>{passed ? "Pass" : "Fail"}</Badge></td>
                  <td className="td text-xs text-red-700">{flags.length ? flags.join("; ") : <span className="text-slate-400">None</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function AllCalls({ calls }: { calls: ReportCall[] }) {
  if (calls.length === 0) return <div className="card py-10 text-center text-sm text-slate-500">No calls in this period.</div>;
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full">
        <thead className="border-b border-slate-200">
          <tr><th className="th">Date</th><th className="th">Agent</th><th className="th">Customer</th><th className="th">Campaign</th><th className="th text-right">Length</th><th className="th">Outcome</th><th className="th">Score</th><th className="th">Status</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {calls.map((c) => (
            <tr key={c.id}>
              <td className="td whitespace-nowrap">
                <Link href={`/calls/${c.id}`} className="text-brand hover:underline">
                  {new Date(c.created_at).toLocaleString("en-IE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Dublin" })}
                </Link>
              </td>
              <td className="td">{c.kind === "broadcast" ? "AI caller" : first(c.profiles)?.full_name ?? "Unknown"}</td>
              <td className="td">{contactName(first(c.contacts) ?? { phone: c.to_number ?? "" })}</td>
              <td className="td">{first(c.campaigns)?.name ?? "—"}</td>
              <td className="td text-right">{formatSeconds(c.duration_seconds ?? 0)}</td>
              <td className="td">{dispositionLabel(c.disposition)}</td>
              <td className="td"><ScoreBadge percent={first(c.scorecards)?.percent} /></td>
              <td className="td text-xs text-slate-600">{callStatusLabel(c)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
