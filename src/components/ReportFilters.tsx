import Link from "next/link";
import { PRESET_LABELS, PRESETS, type ReportRange } from "@/lib/reports";

/** Date presets, from/to, campaign and agent filters. Plain links and a GET form, so it works without scripts. */
export default function ReportFilters({
  range,
  base,
  campaigns,
  agents,
  tab,
}: {
  range: ReportRange;
  base: string;
  campaigns: { id: string; name: string }[];
  agents: { id: string; name: string }[];
  tab?: string;
}) {
  const keep = (preset: string) => {
    const q = new URLSearchParams({ preset });
    if (range.campaignId) q.set("campaign", range.campaignId);
    if (range.agentId) q.set("agent", range.agentId);
    if (tab) q.set("tab", tab);
    return `${base}?${q}`;
  };
  return (
    <div className="card mb-5">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Link key={p} href={keep(p)}
            className={`rounded-full border px-3 py-1 text-sm ${range.preset === p ? "border-brand bg-indigo-50 font-medium text-brand" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {PRESET_LABELS[p]}
          </Link>
        ))}
      </div>
      <form method="get" action={base} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        {tab && <input type="hidden" name="tab" value={tab} />}
        <div>
          <label className="label" htmlFor="from">From</label>
          <input id="from" name="from" type="date" className="input" defaultValue={range.from} />
        </div>
        <div>
          <label className="label" htmlFor="to">To</label>
          <input id="to" name="to" type="date" className="input" defaultValue={range.to} />
        </div>
        <div>
          <label className="label" htmlFor="campaign">Campaign</label>
          <select id="campaign" name="campaign" className="input" defaultValue={range.campaignId ?? ""}>
            <option value="">All campaigns</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="agent">Agent</label>
          <select id="agent" name="agent" className="input" defaultValue={range.agentId ?? ""}>
            <option value="">All agents</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            <option value="ai">AI caller</option>
          </select>
        </div>
        <button className="btn">Show</button>
      </form>
    </div>
  );
}
