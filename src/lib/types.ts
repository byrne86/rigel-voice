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
  /** Failing this criterion (under half marks) fails the whole call. */
  critical?: boolean;
}

export interface ScorecardTemplate {
  id: string;
  name: string;
  description: string | null;
  criteria: Criterion[];
  pass_mark?: number;
}

export interface Objection {
  objection: string;
  category: string;
  resolved: boolean;
}

export const OBJECTION_CATEGORIES = ["price", "timing", "need", "authority", "competitor", "trust", "other"] as const;

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
  voicemail_drop_id: string | null;
  ai_context: string | null;
  call_language: string;
  feedback_language: string;
  recording_disclosure: string | null;
  allow_voicemail_drops: boolean;
  crm_note: boolean;
  crm_match_field: string | null;
  crm_match_value: string | null;
  is_default_inbound: boolean;
  ring_agents_on_callback: boolean;
  inbound_fallback: "voicemail" | "forward" | "hangup";
  forward_to: string | null;
  ring_seconds: number;
  script_status: "draft" | "approved";
  script_flow: string[];
  script_objections: { objection: string; answer: string }[];
  script_approved_at: string | null;
  created_at: string;
}

export interface CallList {
  id: string;
  campaign_id: string;
  agent_id: string | null;
  name: string;
  source: string;
  created_at: string;
}

export const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "multi", label: "Mixed / auto-detect" },
  { value: "ga", label: "Irish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "es", label: "Spanish" },
  { value: "it", label: "Italian" },
  { value: "nl", label: "Dutch" },
  { value: "pl", label: "Polish" },
  { value: "pt", label: "Portuguese" },
];

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
  { value: "meeting", label: "Meeting booked", outcome: "completed" },
  { value: "sale", label: "Sale / converted", outcome: "completed" },
  { value: "interested", label: "Interested", outcome: "completed" },
  { value: "callback", label: "Call back later", outcome: "retry" },
  { value: "not_interested", label: "Not interested", outcome: "completed" },
  { value: "no_answer", label: "No answer", outcome: "retry" },
  { value: "busy", label: "Busy", outcome: "retry" },
  { value: "voicemail", label: "Voicemail left", outcome: "retry" },
  { value: "gatekeeper", label: "Gatekeeper, try later", outcome: "retry" },
  { value: "wrong_number", label: "Wrong number", outcome: "completed" },
  { value: "dnc", label: "Do not call", outcome: "dnc" },
];

const OTHER_LABELS: Record<string, string> = {
  message_played: "Message played",
  incoming: "Incoming call",
  voicemail_received: "Voicemail received",
  forwarded: "Forwarded",
  missed: "Missed",
};

export function dispositionLabel(value: string | null | undefined) {
  if (!value) return "—";
  return DISPOSITIONS.find((d) => d.value === value)?.label ?? OTHER_LABELS[value] ?? value.replace(/_/g, " ");
}

export const ROLE_LABELS: Record<string, string> = {
  agent: "Agent: own calls only",
  manager: "Manager: all calls",
  owner: "Admin",
};

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

export interface VoicemailDrop {
  id: string;
  owner_id: string | null;
  campaign_id: string | null;
  shared: boolean;
  duration_seconds: number | null;
  created_at?: string;
  name: string;
  kind: "tts" | "audio";
  message: string | null;
  tts_voice: string;
  audio_path: string | null;
  is_default: boolean;
}

export const VOICES = [
  { value: "Polly.Amy-Neural", label: "Amy (British English, female)" },
  { value: "Polly.Brian-Neural", label: "Brian (British English, male)" },
  { value: "Polly.Niamh-Neural", label: "Niamh (Irish English, female)" },
  { value: "Polly.Joanna-Neural", label: "Joanna (US English, female)" },
  { value: "Polly.Matthew-Neural", label: "Matthew (US English, male)" },
];

export function voiceName(v: string) {
  return v.replace("Polly.", "").replace("-Neural", "");
}

/** Public link to a recorded voicemail in Supabase Storage. */
export function voicemailAudioUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/voicemails/${path}`;
}
