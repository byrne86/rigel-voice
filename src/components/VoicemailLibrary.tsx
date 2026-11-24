"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { VOICES, voiceName, voicemailAudioUrl, type VoicemailDrop } from "@/lib/types";

type Draft = { id?: string; name: string; kind: "tts" | "audio"; message: string; tts_voice: string; audio_path: string | null; is_default: boolean };

const blank = (first: boolean): Draft => ({
  name: "",
  kind: "tts",
  message: "",
  tts_voice: "Polly.Amy-Neural",
  audio_path: null,
  is_default: first,
});

export default function VoicemailLibrary({
  drops,
  usage,
  orgId,
  canEdit,
}: {
  drops: VoicemailDrop[];
  usage: Record<string, string[]>;
  orgId: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function edit(d: VoicemailDrop) {
    setDraft({ ...d, message: d.message ?? "" });
    setFile(null);
    setError(null);
  }

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) return setError("Give the voicemail a name.");
    if (draft.kind === "tts" && !draft.message.trim()) return setError("Type the message the AI voice will read.");
    if (draft.kind === "audio" && !file && !draft.audio_path) return setError("Choose an MP3 or WAV recording.");
    if (file && file.size > 5 * 1024 * 1024) return setError("Recordings must be under 5 MB.");

    setBusy(true);
    setError(null);
    const supabase = createClient();
    let audioPath = draft.audio_path;
    const oldAudio = draft.audio_path;

    if (draft.kind === "audio" && file) {
      const ext = file.name.toLowerCase().endsWith(".wav") ? "wav" : "mp3";
      audioPath = `${orgId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("voicemails")
        .upload(audioPath, file, { contentType: file.type || (ext === "wav" ? "audio/wav" : "audio/mpeg") });
      if (upErr) {
        setBusy(false);
        return setError(upErr.message);
      }
    }

    if (draft.is_default) {
      // Only one default per company.
      await supabase.from("voicemail_drops").update({ is_default: false }).eq("is_default", true).neq("id", draft.id ?? "00000000-0000-0000-0000-000000000000");
    }

    const row = {
      name: draft.name.trim(),
      kind: draft.kind,
      message: draft.kind === "tts" ? draft.message.trim() : null,
      tts_voice: draft.tts_voice,
      audio_path: draft.kind === "audio" ? audioPath : null,
      is_default: draft.is_default,
    };
    const { error } = draft.id
      ? await supabase.from("voicemail_drops").update(row).eq("id", draft.id)
      : await supabase.from("voicemail_drops").insert(row);
    setBusy(false);
    if (error) return setError(error.message);

    // Tidy up a replaced recording.
    if (oldAudio && oldAudio !== row.audio_path) await supabase.storage.from("voicemails").remove([oldAudio]);
    setDraft(null);
    setFile(null);
    router.refresh();
  }

  async function remove(d: VoicemailDrop) {
    const used = usage[d.id]?.length ?? 0;
    const warn = used ? ` It is used by ${used} campaign${used > 1 ? "s" : ""}, which will fall back to your default.` : "";
    if (!window.confirm(`Delete “${d.name}”?${warn}`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("voicemail_drops").delete().eq("id", d.id);
    if (error) return setError(error.message);
    if (d.audio_path) await supabase.storage.from("voicemails").remove([d.audio_path]);
    router.refresh();
  }

  if (draft) {
    return (
      <div className="card space-y-4">
        <h2 className="font-semibold">{draft.id ? "Edit voicemail" : "New voicemail"}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="vm-name">Name</label>
            <input id="vm-name" className="input" value={draft.name} placeholder="e.g. Renewal reminder"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <fieldset>
            <legend className="label">Type</legend>
            <div className="flex gap-2">
              {(["tts", "audio"] as const).map((k) => (
                <label key={k} className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-sm ${draft.kind === k ? "border-brand bg-indigo-50 font-medium text-brand" : "border-slate-300"}`}>
                  <input type="radio" name="vm-kind" className="sr-only" checked={draft.kind === k} onChange={() => setDraft({ ...draft, kind: k })} />
                  {k === "tts" ? "AI voice reads a message" : "Upload a recording"}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        {draft.kind === "tts" ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="vm-msg">Message</label>
              <textarea id="vm-msg" className="input" rows={4} value={draft.message}
                placeholder="Hi {{first_name}}, it's Sarah from Acme. Sorry I missed you. I'll try you again later, or you can reach us on …"
                onChange={(e) => setDraft({ ...draft, message: e.target.value })} />
              <p className="mt-1 text-xs text-slate-500">{"{{first_name}}"}, {"{{last_name}}"} and {"{{company}}"} are filled in for each contact.</p>
            </div>
            <div>
              <label className="label" htmlFor="vm-voice">Voice</label>
              <select id="vm-voice" className="input" value={draft.tts_voice} onChange={(e) => setDraft({ ...draft, tts_voice: e.target.value })}>
                {VOICES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </div>
          </div>
        ) : (
          <div>
            <label className="label" htmlFor="vm-file">Recording (MP3 or WAV, under 5 MB)</label>
            {draft.audio_path && !file && (
              <audio controls preload="none" className="mb-2 w-full max-w-md" src={voicemailAudioUrl(draft.audio_path)} />
            )}
            <input id="vm-file" type="file" accept="audio/mpeg,audio/mp3,audio/wav,.mp3,.wav"
              className="block text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <p className="mt-1 text-xs text-slate-500">Record on your phone’s voice recorder, then upload. A recording plays the same for every contact.</p>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.is_default} onChange={(e) => setDraft({ ...draft, is_default: e.target.checked })} />
          Default voicemail (used by campaigns that don’t pick one)
        </label>

        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          <button className="btn" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save voicemail"}</button>
          <button className="btn-secondary" onClick={() => { setDraft(null); setError(null); }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canEdit && <button className="btn" onClick={() => setDraft(blank(drops.length === 0))}>New voicemail</button>}
      {error && <p className="text-sm text-red-700">{error}</p>}
      {drops.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          No voicemails yet. Add one so agents can drop it with one click when they reach an answering machine.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {drops.map((d) => (
            <section key={d.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">
                    {d.name}
                    {d.is_default && <span className="badge ml-2 bg-indigo-100 text-indigo-800">default</span>}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {d.kind === "audio" ? "Recording" : `AI voice · ${voiceName(d.tts_voice)}`}
                    {usage[d.id]?.length ? ` · used by ${usage[d.id].join(", ")}` : ""}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 gap-2">
                    <button className="btn-secondary px-3 py-1.5" onClick={() => edit(d)}>Edit</button>
                    <button className="btn-secondary px-3 py-1.5" onClick={() => remove(d)}>Delete</button>
                  </div>
                )}
              </div>
              {d.kind === "audio" && d.audio_path ? (
                <audio controls preload="none" className="mt-3 w-full" src={voicemailAudioUrl(d.audio_path)} />
              ) : (
                <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{d.message}</p>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
