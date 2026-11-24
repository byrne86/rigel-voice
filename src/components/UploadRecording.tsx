"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function UploadRecording({
  orgId,
  campaigns,
  agents,
}: {
  orgId: string;
  campaigns: { id: string; name: string }[];
  agents: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({ campaignId: "", agentId: "", customer: "", number: "", date: "", direction: "outbound" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setError("Choose a recording.");
    if (file.size > 100 * 1024 * 1024) return setError("Recordings must be under 100 MB.");
    setBusy(true);
    setError(null);
    const ext = (file.name.split(".").pop() ?? "mp3").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${orgId}/${crypto.randomUUID()}.${ext}`;
    const { error: up } = await createClient().storage.from("recordings").upload(path, file, { contentType: file.type || "audio/mpeg" });
    if (up) {
      setBusy(false);
      return setError(up.message);
    }
    const res = await fetch("/api/calls/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, ...form, date: form.date ? new Date(form.date).toISOString() : null }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "Upload failed");
    router.push(`/calls/${json.callId}`);
  }

  if (!open) return <button className="btn-secondary" onClick={() => setOpen(true)}>Upload a recording</button>;
  return (
    <form onSubmit={upload} className="card w-full space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Upload a recording</h2>
        <button type="button" className="text-sm text-slate-500" onClick={() => setOpen(false)}>Close</button>
      </div>
      <p className="text-xs text-slate-500">For calls made on another phone system. It is transcribed and scored like any other call.</p>
      <input type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm" aria-label="Recording file" className="block text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <div className="grid gap-3 sm:grid-cols-3">
        <select className="input" aria-label="Campaign" value={form.campaignId} onChange={set("campaignId")}>
          <option value="">No campaign</option>
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input" aria-label="Agent" value={form.agentId} onChange={set("agentId")}>
          <option value="">Agent unknown</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select className="input" aria-label="Direction" value={form.direction} onChange={set("direction")}>
          <option value="outbound">Outbound call</option>
          <option value="inbound">Inbound call</option>
        </select>
        <input className="input" placeholder="Customer name (optional)" aria-label="Customer name" value={form.customer} onChange={set("customer")} />
        <input className="input" placeholder="Customer number (optional)" aria-label="Customer number" value={form.number} onChange={set("number")} />
        <input className="input" type="datetime-local" aria-label="When the call happened" value={form.date} onChange={set("date")} />
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button className="btn" disabled={busy}>{busy ? "Uploading…" : "Upload and score"}</button>
    </form>
  );
}
