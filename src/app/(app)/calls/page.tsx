import Link from "next/link";
import UploadRecording from "@/components/UploadRecording";
import { PageHeader, ScoreBadge } from "@/components/ui";
import { isManager, requireProfile } from "@/lib/auth";
import { callStatusLabel, first, type ReportCall } from "@/lib/reports";
import { formatSeconds } from "@/lib/stats";
import { contactName, dispositionLabel, DISPOSITIONS } from "@/lib/types";

const PERIODS: Record<string, number> = { today: 1, "7": 7, "30": 30, "90": 90 };
const STATUSES = [
  ["scored", "Scored"], ["not_recorded", "Not recorded"], ["not_connected", "Not connected"], ["processing", "Being scored"], ["failed", "Scoring failed"],
] as const;

export default async function CallsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireProfile();
  const manager = isManager(profile);
  const [{ data: campaigns }, { data: team }] = await Promise.all([
    supabase.from("campaigns").select("id, name").order("name"),
    supabase.from("profiles").select("id, full_name, email").order("full_name"),
  ]);
  const agents = (team ?? []).map((p) => ({ id: p.id, name: p.full_name || p.email || "Agent" }));

  let q = supabase
    .from("calls")
    .select("id, created_at, direction, kind, status, to_number, duration_seconds, disposition, reached_dm, notes, agent_id, campaign_id, recording_url, recording_storage_path, processing_status, campaigns(name), contacts(first_name, last_name, company), profiles(full_name, email), scorecards(percent, passed, summary, compliance_flags, results)")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (sp.agent === "ai") q = q.eq("kind", "broadcast");
  else if (sp.agent) q = q.eq("agent_id", sp.agent);
  if (sp.campaign) q = q.eq("campaign_id", sp.campaign);
  if (sp.result) q = q.eq("disposition", sp.result);
  if (sp.status === "processing") q = q.in("processing_status", ["pending", "transcribing", "scoring"]);
  if (sp.status === "failed") q = q.eq("processing_status", "failed");
  if (sp.status === "scored") q = q.eq("processing_status", "done");
  if (sp.period && PERIODS[sp.period]) {
    q = q.gte("created_at", new Date(new Date().setHours(0, 0, 0, 0) - (PERIODS[sp.period] - 1) * 86400_000).toISOString());
  }
  const { data } = await q;
  let calls = (data ?? []) as unknown as ReportCall[];
  if (sp.status === "not_recorded") calls = calls.filter((c) => (c.duration_seconds ?? 0) > 0 && !c.recording_url && !c.recording_storage_path);
  if (sp.status === "not_connected") calls = calls.filter((c) => !(c.duration_seconds ?? 0));
  const term = (sp.q ?? "").trim().toLowerCase();
  if (term) {
    calls = calls.filter((c) =>
      [contactName(first(c.contacts) ?? { phone: "" }), first(c.contacts)?.company, c.to_number, c.notes, first(c.scorecards)?.summary]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }

  return (
    <>
      <PageHeader title="Calls" subtitle={`${calls.length}${calls.length === 1000 ? "+" : ""} calls${manager ? "" : " · your calls only"}`}>
        {manager && <UploadRecording orgId={profile.org_id} campaigns={campaigns ?? []} agents={agents} />}
      </PageHeader>

      <form method="get" className="card mb-5 grid gap-3 md:grid-cols-3 xl:grid-cols-7 xl:items-end">
        <div className="xl:col-span-2">
          <label className="label" htmlFor="q">Search</label>
          <input id="q" name="q" className="input" placeholder="Name, number or anything said on the call" defaultValue={sp.q ?? ""} />
        </div>
        {manager && (
          <div>
            <label className="label" htmlFor="agent">Agent</label>
            <select id="agent" name="agent" className="input" defaultValue={sp.agent ?? ""}>
              <option value="">All agents</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              <option value="ai">AI caller</option>
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="campaign">Campaign</label>
          <select id="campaign" name="campaign" className="input" defaultValue={sp.campaign ?? ""}>
            <option value="">All campaigns</option>
            {(campaigns ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="result">Result</label>
          <select id="result" name="result" className="input" defaultValue={sp.result ?? ""}>
            <option value="">Any</option>
            {DISPOSITIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            <option value="incoming">Incoming call</option>
            <option value="voicemail_received">Voicemail received</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" className="input" defaultValue={sp.status ?? ""}>
            <option value="">Any</option>
            {STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="period">Period</label>
          <select id="period" name="period" className="input" defaultValue={sp.period ?? ""}>
            <option value="">All time</option>
            <option value="today">Today</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>
        <div className="flex gap-2 xl:col-span-7">
          <button className="btn">Apply</button>
          <Link href="/calls" className="btn-secondary">Reset</Link>
        </div>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-slate-200">
            <tr><th className="th">Date</th><th className="th">Agent</th><th className="th">Customer</th><th className="th">Campaign</th><th className="th text-right">Length</th><th className="th">Outcome</th><th className="th">Score</th><th className="th">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {calls.length === 0 ? (
              <tr><td colSpan={8} className="td py-10 text-center text-slate-500">Nothing matches those filters. Try widening the period.</td></tr>
            ) : (
              calls.map((c) => {
                const ct = first(c.contacts);
                return (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="td whitespace-nowrap">
                      <Link href={`/calls/${c.id}`} className="font-medium text-brand hover:underline">
                        {new Date(c.created_at).toLocaleString("en-IE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Dublin" })}
                      </Link>
                    </td>
                    <td className="td">{c.kind === "broadcast" ? "AI caller" : first(c.profiles)?.full_name ?? <span className="text-slate-400">Unknown</span>}</td>
                    <td className="td">
                      <div>{ct ? contactName({ ...ct, phone: "" }) || "—" : "—"}</div>
                      <div className="text-xs text-slate-500">{c.to_number}</div>
                    </td>
                    <td className="td">{first(c.campaigns)?.name ?? "—"}</td>
                    <td className="td text-right">{formatSeconds(c.duration_seconds ?? 0)}</td>
                    <td className="td">{dispositionLabel(c.disposition)}</td>
                    <td className="td"><ScoreBadge percent={first(c.scorecards)?.percent} /></td>
                    <td className="td text-xs text-slate-600">{callStatusLabel(c)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
