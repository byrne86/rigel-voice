import DeleteButton from "@/components/DeleteButton";
import PeriodTabs from "@/components/PeriodTabs";
import { AccessSelect, AddAgent } from "@/components/TeamControls";
import { PageHeader } from "@/components/ui";
import { isManager, requireProfile } from "@/lib/auth";
import { formatSeconds, parsePeriod, periodBounds } from "@/lib/stats";
import type { Profile } from "@/lib/types";

interface Row {
  agent_id: string | null;
  kind: string;
  duration_seconds: number | null;
  disposition: string | null;
  reached_dm: boolean;
  recording_url: string | null;
  recording_storage_path: string | null;
  direction: string;
  scorecards: { percent: number; passed: boolean | null; agent_talk_ratio: number | null } | { percent: number; passed: boolean | null; agent_talk_ratio: number | null }[] | null;
}

function stats(rows: Row[]) {
  const sc = rows.map((r) => (Array.isArray(r.scorecards) ? r.scorecards[0] : r.scorecards)).filter((s): s is NonNullable<typeof s> => !!s);
  const connected = rows.filter((r) => (r.duration_seconds ?? 0) >= 15);
  const ratios = sc.map((s) => s.agent_talk_ratio).filter((x): x is number => x !== null);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + Number(b), 0) / xs.length : null);
  return {
    scored: sc.length,
    avg: mean(sc.map((s) => Number(s.percent))),
    pass: sc.length ? (sc.filter((s) => s.passed ?? Number(s.percent) >= 70).length / sc.length) * 100 : null,
    talk: ratios.length ? (mean(ratios) as number) * 100 : null,
    avgLength: mean(connected.map((r) => r.duration_seconds ?? 0)),
    dialled: rows.filter((r) => r.direction !== "inbound").length,
    dm: rows.filter((r) => r.reached_dm).length,
    voicemails: rows.filter((r) => r.disposition === "voicemail").length,
    notRecorded: connected.filter((r) => !r.recording_url && !r.recording_storage_path).length,
  };
}

export default async function AgentsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const days = parsePeriod((await searchParams).days ?? "30");
  const { supabase, profile } = await requireProfile();
  const manager = isManager(profile);
  const { start } = periodBounds(days);
  const [{ data: team }, { data }, { data: invites }] = await Promise.all([
    supabase.from("profiles").select("*").order("full_name"),
    supabase
      .from("calls")
      .select("agent_id, kind, direction, duration_seconds, disposition, reached_dm, recording_url, recording_storage_path, scorecards(percent, passed, agent_talk_ratio)")
      .gte("created_at", start.toISOString())
      .limit(20000),
    manager ? supabase.from("invites").select("*").is("accepted_at", null).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  const rows = (data ?? []) as unknown as Row[];
  const people: { id: string; name: string; email: string | null; role: string; s: ReturnType<typeof stats>; ai?: boolean }[] = [];
  const ai = rows.filter((r) => r.kind === "broadcast");
  if (manager && ai.length) people.push({ id: "ai", name: "AI caller", email: null, role: "agent", s: stats(ai), ai: true });
  for (const p of (team ?? []) as Profile[]) {
    if (!manager && p.id !== profile.id) continue;
    people.push({ id: p.id, name: p.full_name || p.email || "Agent", email: p.email, role: p.role, s: stats(rows.filter((r) => r.agent_id === p.id)) });
  }

  return (
    <>
      <PageHeader title="Agents" subtitle={manager ? "Your team and how each person is doing" : "How you're doing"}>
        <PeriodTabs current={days} base="/agents" />
      </PageHeader>
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-slate-200">
            <tr>
              <th className="th">Agent</th>
              <th className="th">Access</th>
              <th className="th text-right">Calls scored</th>
              <th className="th">Average score</th>
              <th className="th text-right">Pass rate</th>
              <th className="th text-right">Talk time</th>
              <th className="th text-right">Avg length</th>
              <th className="th text-right">Dialled</th>
              <th className="th text-right">Reached DM</th>
              <th className="th text-right">Voicemails</th>
              <th className="th text-right">Not recorded</th>
              {manager && <th className="th" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {people.map(({ id, name, email, role, s, ai: isAi }) => (
              <tr key={id}>
                <td className="td">
                  <div className="font-medium">{name}</div>
                  <div className="text-xs text-slate-500">{isAi ? "no email, can't sign in" : email}</div>
                </td>
                <td className="td">{isAi ? <span className="badge bg-slate-100 text-slate-700">agent</span> : <AccessSelect id={id} role={role} editable={manager && id !== profile.id} />}</td>
                <td className="td text-right">{s.scored}</td>
                <td className="td">
                  {s.avg === null ? <span className="text-slate-400">–</span> : (
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 rounded-full bg-slate-100">
                        <div className={`h-2 rounded-full ${s.avg >= 80 ? "bg-emerald-600" : s.avg >= 60 ? "bg-amber-500" : "bg-red-600"}`} style={{ width: `${s.avg}%` }} />
                      </div>
                      <span className="text-sm">{Math.round(s.avg)}%</span>
                    </div>
                  )}
                </td>
                <td className="td text-right">{s.pass === null ? "–" : `${Math.round(s.pass)}%`}</td>
                <td className="td text-right">{s.talk === null ? "–" : `${Math.round(s.talk)}%`}</td>
                <td className="td text-right">{s.avgLength === null ? "–" : formatSeconds(s.avgLength)}</td>
                <td className="td text-right">{s.dialled || "–"}</td>
                <td className="td text-right">{s.dm || "–"}</td>
                <td className="td text-right">{s.voicemails || "–"}</td>
                <td className="td text-right">{s.notRecorded || "–"}</td>
                {manager && (
                  <td className="td text-right">
                    {!isAi && id !== profile.id && role !== "owner" && (
                      <DeleteButton url={`/api/agents/${id}`} label="Remove" confirmText={`Remove ${name} from the team? Their login is deleted; their past calls are kept.`} />
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">Talk time is the share of each call the agent spent speaking. Not recorded counts connected calls with no recording.</p>

      {manager && (
        <div className="mt-8 space-y-4">
          <AddAgent />
          {(invites ?? []).length > 0 && (
            <div className="card">
              <h2 className="mb-2 font-semibold">Waiting to join</h2>
              <ul className="divide-y divide-slate-100 text-sm">
                {(invites ?? []).map((i) => (
                  <li key={i.id} className="flex justify-between py-2">
                    <span>{i.full_name ? `${i.full_name} · ` : ""}{i.email}</span>
                    <span className="text-slate-500">{i.role === "manager" ? "Manager" : "Agent"} · invited {new Date(i.created_at).toLocaleDateString("en-IE")}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </>
  );
}
