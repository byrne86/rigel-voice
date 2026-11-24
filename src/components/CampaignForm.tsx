"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { VOICES, type Campaign, type ScorecardTemplate, type VoicemailDrop } from "@/lib/types";



export default function CampaignForm({
  campaign,
  templates,
  defaultMode = "agent",
  drops = [],
}: {
  drops?: Pick<VoicemailDrop, "id" | "name" | "is_default">[];
  defaultMode?: "agent" | "broadcast";
  campaign?: Campaign;
  templates: Pick<ScorecardTemplate, "id" | "name">[];
}) {
  const router = useRouter();
  const [f, setF] = useState({
    name: campaign?.name ?? "",
    mode: campaign?.mode ?? defaultMode,
    status: campaign?.status ?? "draft",
    caller_id: campaign?.caller_id ?? "",
    script: campaign?.script ?? "",
    voicemail_drop_id: campaign?.voicemail_drop_id ?? "",
    broadcast_message: campaign?.broadcast_message ?? "",
    tts_voice: campaign?.tts_voice ?? "Polly.Amy-Neural",
    max_attempts: campaign?.max_attempts ?? 3,
    retry_minutes: campaign?.retry_minutes ?? 240,
    record_calls: campaign?.record_calls ?? true,
    default_country: campaign?.default_country ?? "IE",
    scorecard_template_id: campaign?.scorecard_template_id ?? templates[0]?.id ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setSaved(false);
    setF({ ...f, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value });
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const row = {
      ...f,
      caller_id: f.caller_id.trim() || null,
      default_country: f.default_country.trim().toUpperCase() || "IE",
      scorecard_template_id: f.scorecard_template_id || null,
      voicemail_drop_id: f.voicemail_drop_id || null,
    };
    if (campaign) {
      const { error } = await supabase.from("campaigns").update(row).eq("id", campaign.id);
      if (error) setError(error.message);
      else {
        setSaved(true);
        router.refresh();
      }
    } else {
      const { data, error } = await supabase.from("campaigns").insert(row).select("id").single();
      if (error) setError(error.message);
      else router.push(`/campaigns/${data.id}`);
    }
    setBusy(false);
  }

  return (
    <form onSubmit={save} className="card space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Campaign name</label>
          <input className="input" required value={f.name} onChange={set("name")} />
        </div>
        <div>
          <label className="label">Type</label>
          <select className="input" value={f.mode} onChange={set("mode")} disabled={!!campaign}>
            <option value="agent">Agent dialer (people make the calls)</option>
            <option value="broadcast">AI voice broadcast (automated message)</option>
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select className="input" value={f.status} onChange={set("status")}>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div>
          <label className="label">Caller ID (your Twilio number)</label>
          <input className="input" placeholder="+35312345678 (blank = account default)" value={f.caller_id} onChange={set("caller_id")} />
        </div>
        <div>
          <label className="label">Max attempts per contact</label>
          <input className="input" type="number" min={1} max={10} value={f.max_attempts} onChange={set("max_attempts")} />
        </div>
        <div>
          <label className="label">Minutes before retrying</label>
          <input className="input" type="number" min={1} value={f.retry_minutes} onChange={set("retry_minutes")} />
        </div>
        <div>
          <label className="label">Default country for phone numbers</label>
          <input className="input" maxLength={2} value={f.default_country} onChange={set("default_country")} />
        </div>
        <div>
          <label className="label">AI voice</label>
          <select className="input" value={f.tts_voice} onChange={set("tts_voice")}>
            {VOICES.map((v) => (
              <option key={v.value} value={v.value}>{v.label}</option>
            ))}
          </select>
        </div>
      </div>

      {f.mode === "agent" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">AI scorecard</label>
              <select className="input" value={f.scorecard_template_id} onChange={set("scorecard_template_id")}>
                <option value="">Organisation default</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input
                type="checkbox"
                checked={f.record_calls}
                onChange={(e) => setF({ ...f, record_calls: e.target.checked })}
              />
              Record calls (needed for transcripts and AI scoring)
            </label>
          </div>
          <div>
            <label className="label">Agent script</label>
            <textarea className="input min-h-32" value={f.script} onChange={set("script")}
              placeholder="Shown to agents on the dialer, and given to the AI as context when scoring." />
          </div>
          <div>
            <label className="label" htmlFor="vm-drop">Voicemail drop</label>
            <select id="vm-drop" className="input" value={f.voicemail_drop_id} onChange={set("voicemail_drop_id")}>
              <option value="">{drops.find((d) => d.is_default) ? `Company default (${drops.find((d) => d.is_default)?.name})` : "None"}</option>
              {drops.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Left when an agent clicks “Drop voicemail”. Create and record them under <Link href="/voicemails" className="text-brand underline">Voicemails</Link>.
            </p>
          </div>
        </>
      ) : (
        <div>
          <label className="label">Broadcast message (spoken by the AI voice)</label>
          <textarea className="input min-h-28" required value={f.broadcast_message} onChange={set("broadcast_message")}
            placeholder="Hello {{first_name}}, this is a reminder from Acme that…" />
          <p className="mt-1 text-xs text-slate-500">
            You can use {"{{first_name}}"}, {"{{last_name}}"} and {"{{company}}"}. Listeners are offered 1 for a call back and 9 to opt out.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-3">
        <button className="btn" disabled={busy}>{busy ? "Saving…" : campaign ? "Save changes" : "Create campaign"}</button>
        {saved && <span className="text-sm text-green-700">Saved</span>}
      </div>
    </form>
  );
}
