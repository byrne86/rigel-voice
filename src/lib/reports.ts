import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "./auth";

const TZ = "Europe/Dublin";

/** Today's date (YYYY-MM-DD) in Irish time. */
export function todayIrish() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

/** The UTC instant of midnight Irish time at the start of a YYYY-MM-DD date. */
export function irishMidnight(day: string) {
  const guess = new Date(`${day}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(guess);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const shown = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  return new Date(guess.getTime() - (shown - guess.getTime()));
}

function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const PRESETS = ["today", "yesterday", "this_week", "last_week", "this_month", "last_month", "last_30"] as const;
export const PRESET_LABELS: Record<string, string> = {
  today: "Today", yesterday: "Yesterday", this_week: "This week", last_week: "Last week",
  this_month: "This month", last_month: "Last month", last_30: "Last 30 days",
};

export function presetRange(preset: string): { from: string; to: string } {
  const t = todayIrish();
  const dow = (new Date(`${t}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const monthStart = `${t.slice(0, 8)}01`;
  switch (preset) {
    case "today": return { from: t, to: t };
    case "yesterday": return { from: addDays(t, -1), to: addDays(t, -1) };
    case "last_week": return { from: addDays(t, -dow - 7), to: addDays(t, -dow - 1) };
    case "this_month": return { from: monthStart, to: t };
    case "last_month": {
      const end = addDays(monthStart, -1);
      return { from: `${end.slice(0, 8)}01`, to: end };
    }
    case "last_30": return { from: addDays(t, -29), to: t };
    default: return { from: addDays(t, -dow), to: t };
  }
}

export interface ReportRange {
  from: string;
  to: string;
  preset: string | null;
  campaignId: string | null;
  agentId: string | null;
  startIso: string;
  endIso: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function parseRange(sp: Record<string, string | undefined>): ReportRange {
  let preset: string | null = sp.preset && (PRESETS as readonly string[]).includes(sp.preset) ? sp.preset : null;
  let { from, to } = presetRange(preset ?? "this_week");
  if (!preset && sp.from && sp.to && DAY.test(sp.from) && DAY.test(sp.to)) {
    from = sp.from <= sp.to ? sp.from : sp.to;
    to = sp.from <= sp.to ? sp.to : sp.from;
  } else if (!preset) preset = "this_week";
  return {
    from,
    to,
    preset,
    campaignId: isUuid(sp.campaign) ? sp.campaign! : null,
    agentId: isUuid(sp.agent) ? sp.agent! : sp.agent === "ai" ? "ai" : null,
    startIso: irishMidnight(from).toISOString(),
    endIso: irishMidnight(addDays(to, 1)).toISOString(),
  };
}

export function rangeQuery(r: ReportRange) {
  const q = new URLSearchParams();
  if (r.preset) q.set("preset", r.preset);
  else {
    q.set("from", r.from);
    q.set("to", r.to);
  }
  if (r.campaignId) q.set("campaign", r.campaignId);
  if (r.agentId) q.set("agent", r.agentId);
  return q.toString();
}

export interface ReportCall {
  id: string;
  created_at: string;
  direction: string;
  kind: string;
  status: string;
  to_number: string | null;
  duration_seconds: number | null;
  disposition: string | null;
  reached_dm: boolean;
  notes: string | null;
  agent_id: string | null;
  campaign_id: string | null;
  recording_url: string | null;
  recording_storage_path: string | null;
  processing_status: string;
  campaigns: { name: string } | { name: string }[] | null;
  contacts: { first_name: string | null; last_name: string | null; company: string | null } | { first_name: string | null; last_name: string | null; company: string | null }[] | null;
  profiles: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
  scorecards: { percent: number; passed: boolean | null; summary: string | null; compliance_flags: string[] | null; results: unknown } | { percent: number; passed: boolean | null; summary: string | null; compliance_flags: string[] | null; results: unknown }[] | null;
}

export async function fetchReportCalls(supabase: SupabaseClient, r: ReportRange) {
  let q = supabase
    .from("calls")
    .select(
      "id, created_at, direction, kind, status, to_number, duration_seconds, disposition, reached_dm, notes, agent_id, campaign_id, recording_url, recording_storage_path, processing_status, campaigns(name), contacts(first_name, last_name, company), profiles(full_name, email), scorecards(percent, passed, summary, compliance_flags, results)",
    )
    .gte("created_at", r.startIso)
    .lt("created_at", r.endIso)
    .order("created_at", { ascending: false })
    .limit(20000);
  if (r.campaignId) q = q.eq("campaign_id", r.campaignId);
  if (r.agentId === "ai") q = q.eq("kind", "broadcast");
  else if (r.agentId) q = q.eq("agent_id", r.agentId);
  const { data } = await q;
  return (data ?? []) as unknown as ReportCall[];
}

export const first = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/** Connected = 15 seconds or more; a conversation = a minute or more. */
export function reportSummary(calls: ReportCall[]) {
  const connected = calls.filter((c) => (c.duration_seconds ?? 0) >= 15);
  const scored = calls.map((c) => first(c.scorecards)).filter((s): s is NonNullable<typeof s> => !!s);
  return {
    calls: calls.length,
    outbound: calls.filter((c) => c.direction !== "inbound").length,
    inbound: calls.filter((c) => c.direction === "inbound").length,
    connected: connected.length,
    conversations: calls.filter((c) => (c.duration_seconds ?? 0) >= 60).length,
    reachedDm: calls.filter((c) => c.reached_dm).length,
    meetings: calls.filter((c) => c.disposition === "meeting").length,
    callbacks: calls.filter((c) => c.disposition === "callback").length,
    sales: calls.filter((c) => c.disposition === "sale").length,
    voicemails: calls.filter((c) => c.disposition === "voicemail").length,
    talkSeconds: connected.reduce((a, c) => a + (c.duration_seconds ?? 0), 0),
    scored: scored.length,
    avgScore: scored.length ? scored.reduce((a, s) => a + Number(s.percent), 0) / scored.length : null,
    passRate: scored.length ? (scored.filter((s) => s.passed ?? Number(s.percent) >= 70).length / scored.length) * 100 : null,
    notRecorded: calls.filter((c) => (c.duration_seconds ?? 0) >= 15 && !c.recording_url && !c.recording_storage_path).length,
  };
}

export function callStatusLabel(c: Pick<ReportCall, "status" | "disposition" | "processing_status" | "recording_url" | "recording_storage_path" | "duration_seconds">) {
  if (c.disposition === "voicemail") return "Voicemail left";
  if (["no-answer", "busy", "failed", "canceled"].includes(c.status)) return `Not connected (${c.status.replace("-", " ")})`;
  if (c.status === "completed" && !(c.duration_seconds ?? 0)) return "Not connected (no answer)";
  if (!c.recording_url && !c.recording_storage_path) return c.status === "completed" ? "Not recorded" : c.status;
  const p: Record<string, string> = {
    pending: "Queued", transcribing: "Transcribing", scoring: "Scoring", done: "Scored", skipped: "Too short to score", failed: "Scoring failed", none: "Recorded",
  };
  return p[c.processing_status] ?? c.processing_status;
}
