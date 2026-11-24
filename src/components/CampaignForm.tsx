"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LANGUAGES, VOICES, type Campaign, type ScorecardTemplate } from "@/lib/types";

const DISCLOSURE = "Just so you know, calls are recorded for training and quality purposes. Is that OK with you?";

export default function CampaignForm({
  campaign,
  templates,
  numbers,
  defaultMode = "agent",
}: {
  campaign?: Campaign;
  templates: Pick<ScorecardTemplate, "id" | "name">[];
  numbers: { number: string; name: string }[];
  defaultMode?: "agent" | "broadcast";
  drops?: unknown;
}) {
  const router = useRouter();
  const [f, setF] = useState({
    name: campaign?.name ?? "",
    mode: campaign?.mode ?? defaultMode,
    status: campaign?.status ?? "active",
    caller_id: campaign?.caller_id ?? "",
    scorecard_template_id: campaign?.scorecard_template_id ?? "",
    call_language: campaign?.call_language ?? "en",
    feedback_language: campaign?.feedback_language ?? "en",
    ai_context: campaign?.ai_context ?? "",
    recording_disclosure: campaign?.recording_disclosure ?? DISCLOSURE,
    crm_match_field: campaign?.crm_match_field ?? "",
    crm_match_value: campaign?.crm_match_value ?? "",
    ring_agents_on_callback: campaign?.ring_agents_on_callback ?? false,
    inbound_fallback: campaign?.inbound_fallback ?? "voicemail",
    forward_to: campaign?.forward_to ?? "",
    ring_seconds: campaign?.ring_seconds ?? 20,
    crm_note: campaign?.crm_note ?? true,
    is_default_inbound: campaign?.is_default_inbound ?? false,
    allow_voicemail_drops: campaign?.allow_voicemail_drops ?? true,
    record_calls: campaign?.record_calls ?? true,
    default_country: campaign?.default_country ?? "IE",
    max_attempts: campaign?.max_attempts ?? 3,
    retry_minutes: campaign?.retry_minutes ?? 240,
    tts_voice: campaign?.tts_voice ?? "Polly.Amy-Neural",
    broadcast_message: campaign?.broadcast_message ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  type Key = keyof typeof f;
  const set = (k: Key) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const t = e.target as HTMLInputElement;
    setMsg(null);
    setF({ ...f, [k]: t.type === "checkbox" ? t.checked : t.type === "number" ? Number(t.value) : t.value });
  };
  const active = f.status === "active";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return setMsg({ ok: false, text: "Give the campaign a name." });
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const row = {
      ...f,
      name: f.name.trim(),
      caller_id: f.caller_id || null,
      scorecard_template_id: f.scorecard_template_id || null,
      ai_context: f.ai_context.trim() || null,
      recording_disclosure: f.recording_disclosure.trim() || null,
      crm_match_field: f.crm_match_field.trim() || null,
      crm_match_value: f.crm_match_value.trim() || null,
      forward_to: f.forward_to.trim() || null,
      default_country: f.default_country.trim().toUpperCase() || "IE",
      broadcast_message: f.broadcast_message.trim() || null,
    };
    if (row.is_default_inbound) {
      await supabase.from("campaigns").update({ is_default_inbound: false }).eq("is_default_inbound", true);
    }
    const res = campaign
      ? await supabase.from("campaigns").update(row).eq("id", campaign.id)
      : await supabase.from("campaigns").insert(row).select("id").single();
    setBusy(false);
    if (res.error) return setMsg({ ok: false, text: res.error.message });
    setMsg({ ok: true, text: campaign ? "Saved" : "Campaign added" });
    if (!campaign) {
      setF({ ...f, name: "", ai_context: "" });
    }
    router.refresh();
  }

  return (
    <form onSubmit={save} className="card space-y-5">
      <h2 className="font-semibold">{campaign ? "Campaign settings" : "Add a campaign"}</h2>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="label" htmlFor="c-name">Campaign name</label>
          <input id="c-name" className="input" placeholder="e.g. Acme renewals Q1" value={f.name} onChange={set("name")} />
        </div>
        <div>
          <label className="label" htmlFor="c-caller">Dialler caller ID (Twilio)</label>
          <select id="c-caller" className="input" value={f.caller_id} onChange={set("caller_id")}>
            <option value="">{numbers.length ? "Account default" : "Account default (connect Twilio to choose)"}</option>
            {f.caller_id && !numbers.some((n) => n.number === f.caller_id) && <option value={f.caller_id}>{f.caller_id}</option>}
            {numbers.map((n) => <option key={n.number} value={n.number}>{n.number}{n.name && n.name !== n.number ? ` · ${n.name}` : ""}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="c-score">Scorecard</label>
          <select id="c-score" className="input" value={f.scorecard_template_id} onChange={set("scorecard_template_id")}>
            <option value="">Default active scorecard</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="c-lang">Calls are in</label>
          <select id="c-lang" className="input" value={f.call_language} onChange={set("call_language")}>
            {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}{l.value === "en" ? " (default)" : ""}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="c-fb">Agent feedback in</label>
          <select id="c-fb" className="input" value={f.feedback_language} onChange={set("feedback_language")}>
            {LANGUAGES.filter((l) => l.value !== "multi").map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>
        <p className="self-end text-xs text-slate-500">Summaries are always in English. Quotes from the call stay in the original language with a translation.</p>
      </div>

      <div>
        <label className="label" htmlFor="c-ctx">Context for the AI</label>
        <textarea id="c-ctx" className="input" rows={3} placeholder="Who the client is, what they sell, who we call and what a good outcome looks like" value={f.ai_context} onChange={set("ai_context")} />
      </div>
      <div>
        <label className="label" htmlFor="c-disc">Recording disclosure line agents say</label>
        <input id="c-disc" className="input" value={f.recording_disclosure} onChange={set("recording_disclosure")} />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div>
          <label className="label" htmlFor="c-country">Numbers starting 0 are from</label>
          <select id="c-country" className="input" value={f.default_country} onChange={set("default_country")}>
            {[["IE", "Ireland"], ["GB", "United Kingdom"], ["US", "United States"], ["DE", "Germany"], ["FR", "France"], ["ES", "Spain"], ["NL", "Netherlands"]].map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="c-att">Attempts per contact</label>
          <input id="c-att" className="input" type="number" min={1} max={10} value={f.max_attempts} onChange={set("max_attempts")} />
        </div>
        <div>
          <label className="label" htmlFor="c-retry">Minutes before retrying</label>
          <input id="c-retry" className="input" type="number" min={5} value={f.retry_minutes} onChange={set("retry_minutes")} />
        </div>
        <div>
          <label className="label" htmlFor="c-voice">AI voice (voicemails, AI caller)</label>
          <select id="c-voice" className="input" value={f.tts_voice} onChange={set("tts_voice")}>
            {VOICES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="c-mf">Rigel CRM match field (optional)</label>
          <input id="c-mf" className="input" placeholder="e.g. Tag or Account number" value={f.crm_match_field} onChange={set("crm_match_field")} />
        </div>
        <div>
          <label className="label" htmlFor="c-mv">Match value</label>
          <input id="c-mv" className="input" placeholder="e.g. Acme2026" value={f.crm_match_value} onChange={set("crm_match_value")} />
        </div>
      </div>

      <fieldset className="rounded-lg border border-slate-200 p-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={f.ring_agents_on_callback} onChange={set("ring_agents_on_callback")} />
          Ring agents when people call the dialler caller ID back
        </label>
        <p className="mt-1 text-xs text-slate-500">
          Rings the agent who last called them first, then everyone who has worked this campaign in the last 30 days, then the fallback. Agents need Rigel Voice open in their browser.
        </p>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <div>
            <label className="label" htmlFor="c-fall">If nobody answers</label>
            <select id="c-fall" className="input" value={f.inbound_fallback} onChange={set("inbound_fallback")}>
              <option value="voicemail">Take a voicemail</option>
              <option value="forward">Forward to a number</option>
              <option value="hangup">Say we&apos;re unavailable</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="c-fwd">Forward to</label>
            <input id="c-fwd" className="input" placeholder="087 123 4567" disabled={f.inbound_fallback !== "forward"} value={f.forward_to} onChange={set("forward_to")} />
          </div>
          <div>
            <label className="label" htmlFor="c-ring">Ring each step for (seconds)</label>
            <input id="c-ring" className="input" type="number" min={5} max={60} value={f.ring_seconds} onChange={set("ring_seconds")} />
          </div>
        </div>
      </fieldset>

      {f.mode === "broadcast" && (
        <div>
          <label className="label" htmlFor="c-bm">AI caller message</label>
          <textarea id="c-bm" className="input" rows={3} value={f.broadcast_message} onChange={set("broadcast_message")} />
        </div>
      )}

      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.crm_note} onChange={set("crm_note")} /> Add summary note to Rigel CRM</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.is_default_inbound} onChange={set("is_default_inbound")} /> Default for unmatched calls</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.allow_voicemail_drops} onChange={set("allow_voicemail_drops")} /> Allow voicemail drops</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.record_calls} onChange={set("record_calls")} /> Record calls</label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={active} onChange={(e) => setF({ ...f, status: e.target.checked ? "active" : "paused" })} /> Active
        </label>
      </div>

      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p>}
      <div className="flex justify-end">
        <button className="btn" disabled={busy}>{busy ? "Saving…" : campaign ? "Save campaign" : "Add campaign"}</button>
      </div>
    </form>
  );
}
