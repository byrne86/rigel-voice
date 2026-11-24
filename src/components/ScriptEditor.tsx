"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Campaign } from "@/lib/types";

export default function ScriptEditor({ campaign }: { campaign: Campaign }) {
  const router = useRouter();
  const [script, setScript] = useState(campaign.script ?? "");
  const [flow, setFlow] = useState<string[]>(campaign.script_flow?.length ? campaign.script_flow : [""]);
  const [objections, setObjections] = useState(campaign.script_objections?.length ? campaign.script_objections : [{ objection: "", answer: "" }]);
  const [status, setStatus] = useState(campaign.script_status);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const touch = () => { setDirty(true); setMessage(null); };

  async function save(approve: boolean) {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/scripts/${campaign.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script, flow, objections, approve }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setMessage({ ok: false, text: json.error ?? "Could not save" });
    setStatus(json.status);
    setDirty(false);
    setMessage({ ok: true, text: approve ? "Approved. It's in the dialler now." : "Draft saved. Approve it when it's ready." });
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`badge ${status === "approved" && !dirty ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
          {status === "approved" && !dirty ? "Approved: agents can see it" : dirty && status === "approved" ? "Changed: saving makes it a draft again" : "Draft: agents can't see it yet"}
        </span>
      </div>

      <section className="card">
        <h2 className="text-lg font-bold text-night">Steps of a good call</h2>
        <p className="mb-3 text-sm text-slate-500">In order. Agents tick these off during the call, and the AI checks each one when scoring.</p>
        <ol className="space-y-2">
          {flow.map((step, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-2 w-6 shrink-0 text-right text-sm text-slate-400">{i + 1}.</span>
              <input className="input" aria-label={`Step ${i + 1}`} value={step} placeholder="e.g. Confirm you're speaking to the person who manages…"
                onChange={(e) => { const f = [...flow]; f[i] = e.target.value; setFlow(f); touch(); }} />
              <button className="btn-secondary px-3" aria-label={`Remove step ${i + 1}`} onClick={() => { setFlow(flow.filter((_, j) => j !== i)); touch(); }}>✕</button>
            </li>
          ))}
        </ol>
        <button className="btn-secondary mt-3" onClick={() => { setFlow([...flow, ""]); touch(); }}>Add step</button>
      </section>

      <section className="card">
        <h2 className="text-lg font-bold text-night">Full wording</h2>
        <textarea className="input mt-3" rows={10} aria-label="Script" value={script} onChange={(e) => { setScript(e.target.value); touch(); }}
          placeholder={"Opening: Hi {{first_name}}, it's … from …\nReason for the call: …\nQuestions to ask: …\nClose: …"} />
      </section>

      <section className="card">
        <h2 className="text-lg font-bold text-night">When they push back</h2>
        <p className="mb-3 text-sm text-slate-500">Common objections and what agents should say. They open with one tap in the dialler.</p>
        <div className="space-y-3">
          {objections.map((o, i) => (
            <div key={i} className="rounded-lg border border-slate-200 p-3">
              <div className="flex gap-2">
                <input className="input" aria-label={`Objection ${i + 1}`} placeholder="e.g. We already have a supplier" value={o.objection}
                  onChange={(e) => { const x = [...objections]; x[i] = { ...o, objection: e.target.value }; setObjections(x); touch(); }} />
                <button className="btn-secondary px-3" aria-label={`Remove objection ${i + 1}`} onClick={() => { setObjections(objections.filter((_, j) => j !== i)); touch(); }}>✕</button>
              </div>
              <textarea className="input mt-2" rows={2} aria-label={`Answer ${i + 1}`} placeholder="What to say back" value={o.answer}
                onChange={(e) => { const x = [...objections]; x[i] = { ...o, answer: e.target.value }; setObjections(x); touch(); }} />
            </div>
          ))}
        </div>
        <button className="btn-secondary mt-3" onClick={() => { setObjections([...objections, { objection: "", answer: "" }]); touch(); }}>Add another</button>
      </section>

      {message && <p className={`text-sm ${message.ok ? "text-emerald-700" : "text-red-700"}`}>{message.text}</p>}
      <div className="flex gap-2">
        <button className="btn-secondary" disabled={busy} onClick={() => save(false)}>Save draft</button>
        <button className="btn" disabled={busy} onClick={() => save(true)}>Approve for agents</button>
      </div>
    </div>
  );
}
