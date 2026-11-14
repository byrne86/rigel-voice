import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { Empty, PageHeader, ScoreBadge, Stat, one } from "@/components/ui";
import { daysAgoIso, formatDuration } from "@/lib/types";

export default async function Dashboard() {
  const { supabase, profile } = await requireProfile();
  const since = daysAgoIso(7);

  const { data } = await supabase
    .from("calls")
    .select("id, status, duration_seconds, disposition, agent_id, kind, profiles(full_name, email), scorecards(percent)")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5000);
  const calls = data ?? [];

  const connected = calls.filter((c) => c.status === "completed" && (c.duration_seconds ?? 0) > 0);
  const talk = connected.reduce((s, c) => s + (c.duration_seconds ?? 0), 0);
  const scores = calls.map((c) => one(c.scorecards)?.percent).filter((p): p is number => p !== null && p !== undefined);
  const avg = scores.length ? scores.reduce((a, b) => a + Number(b), 0) / scores.length : null;
  const sales = calls.filter((c) => c.disposition === "sale").length;

  const byAgent = new Map<string, { name: string; calls: number; connected: number; talk: number; scores: number[] }>();
  for (const c of calls) {
    if (!c.agent_id) continue;
    const p = one(c.profiles);
    const row =
      byAgent.get(c.agent_id) ??
      { name: p?.full_name || p?.email || "Agent", calls: 0, connected: 0, talk: 0, scores: [] as number[] };
    row.calls++;
    if (c.status === "completed" && (c.duration_seconds ?? 0) > 0) {
      row.connected++;
      row.talk += c.duration_seconds ?? 0;
    }
    const pct = one(c.scorecards)?.percent;
    if (pct !== null && pct !== undefined) row.scores.push(Number(pct));
    byAgent.set(c.agent_id, row);
  }
  const agents = [...byAgent.values()].sort((a, b) => b.calls - a.calls);

  return (
    <>
      <PageHeader title={`Hello${profile.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}`} subtitle="Last 7 days">
        <Link href="/dialer" className="btn">Start dialing</Link>
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Calls made" value={calls.length} />
        <Stat
          label="Connect rate"
          value={calls.length ? `${Math.round((connected.length / calls.length) * 100)}%` : "—"}
          hint={`${connected.length} connected`}
        />
        <Stat label="Talk time" value={formatDuration(talk)} hint={`${sales} sales`} />
        <Stat label="Average AI score" value={avg === null ? "—" : `${Math.round(avg)}%`} hint={`${scores.length} calls scored`} />
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Agents</h2>
      {agents.length === 0 ? (
        <Empty>No calls yet. Create a campaign, import contacts and start dialing.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="th">Agent</th>
                <th className="th">Calls</th>
                <th className="th">Connected</th>
                <th className="th">Talk time</th>
                <th className="th">Avg score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {agents.map((a) => (
                <tr key={a.name}>
                  <td className="td font-medium">{a.name}</td>
                  <td className="td">{a.calls}</td>
                  <td className="td">{a.connected}</td>
                  <td className="td">{formatDuration(a.talk)}</td>
                  <td className="td">
                    <ScoreBadge percent={a.scores.length ? a.scores.reduce((x, y) => x + y, 0) / a.scores.length : null} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
