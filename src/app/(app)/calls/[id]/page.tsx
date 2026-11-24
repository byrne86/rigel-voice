import Link from "next/link";
import { notFound } from "next/navigation";
import ReprocessButton from "@/components/ReprocessButton";
import { Badge, PageHeader, ScoreBadge, one } from "@/components/ui";
import { isManager, requireProfile } from "@/lib/auth";
import { contactName, dispositionLabel, formatDuration, type ScoreResult, type Utterance } from "@/lib/types";

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, profile } = await requireProfile();

  const { data: call } = await supabase
    .from("calls")
    .select("*, campaigns(id, name), contacts(first_name, last_name, company, phone), profiles(full_name, email), transcripts(utterances), scorecards(*)")
    .eq("id", id)
    .single();
  if (!call) notFound();

  const contact = one(call.contacts);
  const agent = one(call.profiles);
  const campaign = one(call.campaigns);
  const transcript = one(call.transcripts);
  const score = one(call.scorecards);
  const utterances = (transcript?.utterances ?? []) as Utterance[];
  const results = (score?.results ?? []) as ScoreResult[];
  const coaching = (score?.coaching ?? []) as string[];
  const flags = (score?.compliance_flags ?? []) as string[];

  return (
    <>
      <PageHeader
        title={contactName(contact ?? { phone: call.to_number })}
        subtitle={new Date(call.created_at).toLocaleString("en-IE", { dateStyle: "full", timeStyle: "short" })}
      >
        <Link href="/calls" className="btn-secondary">Back to calls</Link>
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-1">
          <div className="card space-y-2 text-sm">
            <Row label="Number" value={call.to_number} />
            <Row label="Company" value={contact?.company ?? "—"} />
            <Row label="Campaign" value={campaign?.name ?? "—"} />
            <Row label="Agent" value={call.kind === "broadcast" ? "AI voice" : agent?.full_name || agent?.email || "—"} />
            <Row label="Status" value={<Badge>{call.status}</Badge>} />
            <Row label="Length" value={formatDuration(call.duration_seconds)} />
            <Row label="Outcome" value={dispositionLabel(call.disposition)} />
            {call.notes && <p className="border-t border-slate-100 pt-2 text-slate-700">{call.notes}</p>}
          </div>

          {call.recording_url && (
            <div className="card">
              <h3 className="mb-2 font-semibold">Recording</h3>
              <audio controls preload="none" className="w-full" src={`/api/calls/${call.id}/recording`} />
            </div>
          )}

          {isManager(profile) && call.recording_url && <ReprocessButton callId={call.id} />}
          {call.processing_error && <p className="text-xs text-slate-500">{call.processing_error}</p>}
        </div>

        <div className="space-y-5 lg:col-span-2">
          <div className="card">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">AI scorecard</h3>
              {score ? (
                <div className="flex items-center gap-2 text-sm">
                  <Badge>{score.sentiment}</Badge>
                  <span className="text-slate-500">{Number(score.total_score)} / {Number(score.max_score)}</span>
                  <ScoreBadge percent={Number(score.percent)} />
                </div>
              ) : (
                <Badge>{call.processing_status === "none" ? "not scored" : call.processing_status}</Badge>
              )}
            </div>
            {score ? (
              <>
                <p className="mt-3 text-sm leading-relaxed text-slate-700">{score.summary}</p>
                {flags.length > 0 && (
                  <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                    <div className="font-medium">Compliance flags</div>
                    <ul className="ml-4 list-disc">{flags.map((f, i) => <li key={i}>{f}</li>)}</ul>
                  </div>
                )}
                <div className="mt-4 divide-y divide-slate-100">
                  {results.map((r) => (
                    <div key={r.criterion_id} className="py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium">{r.name}</div>
                        <div className="shrink-0 text-sm font-semibold">{r.score} / {r.max_points}</div>
                      </div>
                      <div className="mt-1.5 h-1.5 rounded-full bg-slate-100">
                        <div
                          className={`h-1.5 rounded-full ${r.score / r.max_points >= 0.8 ? "bg-green-500" : r.score / r.max_points >= 0.6 ? "bg-amber-400" : "bg-red-500"}`}
                          style={{ width: `${r.max_points ? (r.score / r.max_points) * 100 : 0}%` }}
                        />
                      </div>
                      <p className="mt-1.5 text-sm text-slate-600">{r.comment}</p>
                      {r.evidence && <p className="mt-1 text-xs italic text-slate-500">“{r.evidence}”</p>}
                    </div>
                  ))}
                </div>
                {coaching.length > 0 && (
                  <div className="mt-3 rounded-lg bg-brand/5 px-3 py-2 text-sm text-brand">
                    <div className="font-medium">Coaching tips</div>
                    <ul className="ml-4 list-disc">{coaching.map((t, i) => <li key={i}>{t}</li>)}</ul>
                  </div>
                )}
              </>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                {call.recording_url
                  ? "This call has not been scored yet. Scoring usually finishes within a minute of the call ending."
                  : "No recording, so there is nothing to score."}
              </p>
            )}
          </div>

          <div className="card">
            <h3 className="font-semibold">Transcript</h3>
            {utterances.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No transcript.</p>
            ) : (
              <div className="mt-3 space-y-2.5">
                {utterances.map((u, i) => (
                  <div key={i} className={`flex ${u.speaker === "Agent" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${u.speaker === "Agent" ? "bg-brand/5" : "bg-slate-100"}`}>
                      <div className="mb-0.5 text-xs text-slate-500">{u.speaker} · {formatDuration(u.start)}</div>
                      {u.text}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
