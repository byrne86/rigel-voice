import Link from "next/link";
import PeriodTabs from "@/components/PeriodTabs";
import { Empty, PageHeader, ScoreBadge } from "@/components/ui";
import { isManager, requireProfile } from "@/lib/auth";
import { formatHours, parsePeriod, periodBounds, summarise, type CallRow } from "@/lib/stats";
import type { Profile } from "@/lib/types";

export default async function AgentsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const days = parsePeriod((await searchParams).days);
  const { supabase, profile } = await requireProfile();
  const { start } = periodBounds(days);

  const [{ data: team }, { data }] = await Promise.all([
    supabase.from("profiles").select("*").order("full_name"),
    supabase
      .from("calls")
      .select("id, created_at, status, kind, duration_seconds, disposition, agent_id, campaign_id, scorecards(percent, passed, results, objections, agent_talk_ratio, template_id)")
      .eq("kind", "agent")
      .gte("created_at", start.toISOString())
      .limit(10000),
  ]);
  const calls = (data ?? []) as unknown as CallRow[];
  const rows = ((team ?? []) as Profile[])
    .map((p) => ({ p, s: summarise(calls.filter((c) => c.agent_id === p.id)) }))
    .sort((a, b) => b.s.calls - a.s.calls);

  return (
    <>
      <PageHeader title="Agents" subtitle={`Performance over the last ${days} days`}>
        <PeriodTabs current={days} base="/agents" />
      </PageHeader>
      {isManager(profile) && (
        <p className="mb-4 text-sm text-slate-600">
          To add an agent, share your team join code from <Link href="/settings" className="text-brand underline">Settings</Link>.
        </p>
      )}
      {rows.length === 0 ? (
        <Empty>No agents yet.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="th">Agent</th>
                <th className="th">Role</th>
                <th className="th text-right">Calls</th>
                <th className="th text-right">Connected</th>
                <th className="th text-right">Talk time</th>
                <th className="th text-right">Sales</th>
                <th className="th text-right">Scored</th>
                <th className="th text-right">Avg score</th>
                <th className="th text-right">Pass rate</th>
                <th className="th text-right">Agent talk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ p, s }) => (
                <tr key={p.id}>
                  <td className="td font-medium">{p.full_name || p.email}</td>
                  <td className="td capitalize text-slate-600">{p.role}</td>
                  <td className="td text-right">{s.calls}</td>
                  <td className="td text-right">{s.connected}</td>
                  <td className="td text-right">{formatHours(s.talkSeconds)}</td>
                  <td className="td text-right">{s.sales}</td>
                  <td className="td text-right">{s.scored}</td>
                  <td className="td text-right"><ScoreBadge percent={s.avgScore} /></td>
                  <td className="td text-right">{s.passRate === null ? "—" : `${Math.round(s.passRate)}%`}</td>
                  <td className="td text-right">{s.agentTalk === null ? "—" : `${Math.round(s.agentTalk)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
