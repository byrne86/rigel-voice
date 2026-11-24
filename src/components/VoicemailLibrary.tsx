"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { VOICES, voiceName, voicemailAudioUrl, type VoicemailDrop } from "@/lib/types";
import { WavRecorder } from "@/lib/wavRecorder";

type Kind = "record" | "upload" | "tts";

export default function VoicemailLibrary({
  drops,
  campaigns,
  people,
  me,
  orgId,
  manager,
}: {
  drops: VoicemailDrop[];
  campaigns: { id: string; name: string }[];
  people: Record<string, string>;
  me: string;
  orgId: string;
  manager: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [shared, setShared] = useState(false);
  const [kind, setKind] = useState<Kind>("record");
  const [audio, setAudio] = useState<{ blob: Blob; seconds: number; url: string; ext: string } | null>(null);
  const [message, setMessage] = useState("");
  const [voice, setVoice] = useState("Polly.Amy-Neural");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<WavRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function startRecording() {
    setError(null);
    try {
      rec.current = new WavRecorder();
      await rec.current.start();
      setRecording(true);
      setElapsed(0);
      timer.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch {
      setError("Couldn't use the microphone. Allow microphone access for this site and try again.");
    }
  }

  async function stopRecording() {
    if (timer.current) clearInterval(timer.current);
    setRecording(false);
    const out = await rec.current?.stop();
    if (out) setAudio({ ...out, url: URL.createObjectURL(out.blob), ext: "wav" });
  }

  function pickFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setError("Recordings must be under 5 MB.");
    const url = URL.createObjectURL(file);
    const el = new Audio(url);
    el.onloadedmetadata = () =>
      setAudio({ blob: file, seconds: el.duration, url, ext: file.name.toLowerCase().endsWith(".wav") ? "wav" : "mp3" });
  }

  async function save() {
    setError(null);
    if (!name.trim()) return setError("Give the message a name.");
    if (kind === "tts" && !message.trim()) return setError("Type what the AI voice should say.");
    if (kind !== "tts" && !audio) return setError(kind === "record" ? "Record your message first." : "Choose an MP3 or WAV file.");
    setBusy(true);
    const supabase = createClient();
    let audioPath: string | null = null;
    if (kind !== "tts" && audio) {
      audioPath = `${orgId}/${me}/${crypto.randomUUID()}.${audio.ext}`;
      const { error: up } = await supabase.storage
        .from("voicemails")
        .upload(audioPath, audio.blob, { contentType: audio.ext === "wav" ? "audio/wav" : "audio/mpeg" });
      if (up) {
        setBusy(false);
        return setError(up.message);
      }
    }
    const { error: insErr } = await supabase.from("voicemail_drops").insert({
      name: name.trim(),
      kind: kind === "tts" ? "tts" : "audio",
      message: kind === "tts" ? message.trim() : null,
      tts_voice: voice,
      audio_path: audioPath,
      campaign_id: campaignId || null,
      shared,
      owner_id: me,
      duration_seconds: kind === "tts" ? null : Math.round((audio?.seconds ?? 0) * 10) / 10,
    });
    setBusy(false);
    if (insErr) return setError(insErr.message);
    setName("");
    setAudio(null);
    setMessage("");
    setShared(false);
    router.refresh();
  }

  async function remove(d: VoicemailDrop) {
    if (!window.confirm(`Remove “${d.name}”?`)) return;
    const supabase = createClient();
    const { error: delErr } = await supabase.from("voicemail_drops").delete().eq("id", d.id);
    if (delErr) return setError(delErr.message);
    if (d.audio_path) await supabase.storage.from("voicemails").remove([d.audio_path]);
    router.refresh();
  }

  const campaignName = (id: string | null) => (id ? campaigns.find((c) => c.id === id)?.name ?? "—" : "Any campaign");

  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <div className="xl:col-span-2">
        <div className="card overflow-x-auto p-0">
          <table className="w-full">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="th">Message</th>
                <th className="th">Belongs to</th>
                <th className="th">Campaign</th>
                <th className="th">Listen</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {drops.length === 0 ? (
                <tr><td colSpan={5} className="td py-10 text-center text-slate-500">No messages yet. Record one on the right.</td></tr>
              ) : (
                drops.map((d) => (
                  <tr key={d.id}>
                    <td className="td">
                      <div className="font-medium">{d.name}</div>
                      <div className="text-xs text-slate-500">
                        {d.created_at && new Date(d.created_at).toLocaleString("en-IE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        {d.duration_seconds ? ` · ${Math.round(d.duration_seconds)}s` : ""}
                        {d.kind === "tts" ? ` · AI voice (${voiceName(d.tts_voice)})` : ""}
                      </div>
                    </td>
                    <td className="td">{d.shared ? "Everyone" : people[d.owner_id ?? ""] ?? "—"}</td>
                    <td className="td">{campaignName(d.campaign_id)}</td>
                    <td className="td">
                      {d.kind === "audio" && d.audio_path ? (
                        <audio controls preload="none" className="h-9 w-56" src={voicemailAudioUrl(d.audio_path)} />
                      ) : (
                        <span className="line-clamp-2 max-w-xs text-xs text-slate-600">{d.message}</span>
                      )}
                    </td>
                    <td className="td text-right">
                      {(manager || d.owner_id === me) && (
                        <button className="text-xs text-red-700 hover:underline" onClick={() => remove(d)}>Remove</button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          In the dialler, wait for the beep, then click Drop voicemail (or press V). Your own message for the campaign is offered first, then shared ones.
        </p>
      </div>

      <div className="space-y-5">
        <section className="card space-y-4">
          <h2 className="font-semibold">New message</h2>
          <div>
            <label className="label" htmlFor="vm-name">Name</label>
            <input id="vm-name" className="input" placeholder="e.g. Intro, short" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="vm-campaign">Campaign</label>
            <select id="vm-campaign" className="input" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              <option value="">Any campaign</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
            Shared message for all agents on this campaign
          </label>

          <div className="flex flex-wrap items-center gap-3">
            {kind !== "tts" && (
              recording ? (
                <button className="btn-danger" onClick={stopRecording}>■ Stop · {elapsed}s</button>
              ) : (
                <button className="btn-danger" onClick={() => { setKind("record"); void startRecording(); }}>● Record</button>
              )
            )}
            <span className="text-sm text-slate-500">or</span>
            <label className="cursor-pointer text-sm font-medium text-brand hover:underline">
              upload an MP3 or WAV
              <input type="file" accept="audio/mpeg,audio/wav,.mp3,.wav" className="sr-only"
                onChange={(e) => { setKind("upload"); pickFile(e.target.files?.[0]); }} />
            </label>
            <button type="button" className="text-sm text-slate-600 underline" onClick={() => { setKind(kind === "tts" ? "record" : "tts"); setAudio(null); }}>
              {kind === "tts" ? "record instead" : "or let the AI voice say it"}
            </button>
          </div>

          {kind === "tts" ? (
            <div className="space-y-2">
              <textarea className="input" rows={4} aria-label="Message for the AI voice" value={message} onChange={(e) => setMessage(e.target.value)}
                placeholder="Hi {{first_name}}, it's Sarah from Acme. Sorry I missed you…" />
              <select className="input" aria-label="Voice" value={voice} onChange={(e) => setVoice(e.target.value)}>
                {VOICES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </div>
          ) : (
            audio && <audio controls className="w-full" src={audio.url} />
          )}

          {error && <p className="text-sm text-red-700">{error}</p>}
          <button className="btn" onClick={save} disabled={busy || recording}>{busy ? "Saving…" : "Save message"}</button>
        </section>

        <section className="card text-sm text-slate-600">
          <strong className="text-slate-800">Tips for a message that gets callbacks:</strong> keep it under 25 seconds, say your name and company early,
          give one reason to call back, and say the number slowly twice. Smile while you record.
        </section>
      </div>
    </div>
  );
}
