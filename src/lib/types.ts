export type Role = "owner" | "manager" | "agent";

export interface Profile {
  id: string;
  org_id: string;
  full_name: string | null;
  email: string | null;
  role: Role;
  organizations?: { id: string; name: string; join_code: string } | null;
}

export interface Criterion {
  id: string;
  name: string;
  description: string;
  max_points: number;
}

export interface ScorecardTemplate {
  id: string;
  name: string;
  description: string | null;
  criteria: Criterion[];
}

export interface Campaign {
  id: string;
  name: string;
  mode: "agent" | "broadcast";
  status: "draft" | "active" | "paused" | "completed";
  caller_id: string | null;
  script: string | null;
  voicemail_message: string | null;
  broadcast_message: string | null;
  tts_voice: string;
  max_attempts: number;
  retry_minutes: number;
  record_calls: boolean;
  default_country: string;
  scorecard_template_id: string | null;
  created_at: string;
}

export interface Contact {
  id: string;
  campaign_id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  phone: string;
  email: string | null;
  notes: string | null;
  status: string;
  attempts: number;
  last_disposition: string | null;
}

export interface Utterance {
  speaker: string;
  start: number;
  end: number;
  text: string;
}

export interface ScoreResult {
  criterion_id: string;
  name: string;
  score: number;
  max_points: number;
  evidence: string;
  comment: string;
}

export const DISPOSITIONS: { value: string; label: string; outcome: "completed" | "retry" | "dnc" }[] = [
  { value: "sale", label: "Sale / converted", outcome: "completed" },
  { value: "interested", label: "Interested", outcome: "completed" },
  { value: "callback", label: "Call back later", outcome: "retry" },
  { value: "not_interested", label: "Not interested", outcome: "completed" },
  { value: "no_answer", label: "No answer", outcome: "retry" },
  { value: "busy", label: "Busy", outcome: "retry" },
  { value: "voicemail", label: "Voicemail", outcome: "retry" },
  { value: "wrong_number", label: "Wrong number", outcome: "completed" },
  { value: "dnc", label: "Do not call", outcome: "dnc" },
];

export function dispositionLabel(value: string | null | undefined) {
  if (!value) return "—";
  return DISPOSITIONS.find((d) => d.value === value)?.label ?? value;
}

export function contactName(c: { first_name?: string | null; last_name?: string | null; phone?: string } | null) {
  if (!c) return "Unknown";
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
  return name || c.phone || "Unknown";
}

export function formatDuration(seconds: number | null | undefined) {
  if (!seconds && seconds !== 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 24 * 3600_000).toISOString();
}
