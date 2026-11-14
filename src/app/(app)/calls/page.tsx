import Link from "next/link";
import { Badge, Empty, PageHeader, ScoreBadge, one } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { contactName, dispositionLabel, formatDuration } from "@/lib/types";

export default async function CallsPage() {
  const { supabase } = await requireProfile();
  const { data } = await supabase
    .from("calls")
    .select(
      "id, created_at, to_number, status, kind, duration_seconds, disposition, processing_status, campaigns(name), contacts(first_name, last_name, phone), profiles(full_name, email), scorecards(percent)",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  const calls = data ?? [];

  return (
    <>
      <PageHeader title="Calls" subtitle="Recordings, transcripts and AI scorecards. Showing the latest 200." />
      {calls.length === 0 ? (
        <Empty>No calls yet.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="th">When</th>
                <th className="th">Contact</th>
                <th className="th">Campaign</th>
                <th className="th">Agent</th>
                <th className="th">Length</th>
                <th className="th">Outcome</th>
                <th className="th">AI score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {calls.map((c) => {
                const agent = one(c.profiles);
                const score = one(c.scorecards);
                const working = ["pending", "transcribing", "scoring"].includes(c.processing_status);
                return (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="td whitespace-nowrap">
                      <Link href={`/calls/${c.id}`} className="text-brand hover:underline">
                        {new Date(c.created_at).toLocaleString("en-IE", { dateStyle: "short", timeStyle: "short" })}
                      </Link>
                    </td>
                    <td className="td font-medium">{contactName(one(c.contacts) ?? { phone: c.to_number })}</td>
                    <td className="td">{one(c.campaigns)?.name ?? "—"}</td>
                    <td className="td">{c.kind === "broadcast" ? "AI voice" : agent?.full_name || agent?.email || "—"}</td>
                    <td className="td">{formatDuration(c.duration_seconds)}</td>
                    <td className="td">{c.disposition ? dispositionLabel(c.disposition) : <Badge>{c.status}</Badge>}</td>
                    <td className="td">
                      {working ? <Badge tone="amber">Scoring…</Badge> : c.processing_status === "failed" ? <Badge tone="red">Failed</Badge> : <ScoreBadge percent={score?.percent} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
