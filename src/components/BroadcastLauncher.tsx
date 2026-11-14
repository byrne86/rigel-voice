"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function BroadcastLauncher({ campaignId, waiting }: { campaignId: string; waiting: number }) {
  const router = useRouter();
  const [limit, setLimit] = useState(10);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function send() {
    if (!window.confirm(`Start ${Math.min(limit, waiting)} automated calls now?`)) return;
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/campaigns/${campaignId}/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit }),
    });
    const json = await res.json();
    setMessage(res.ok ? `Started ${json.started} calls${json.failed ? `, ${json.failed} failed` : ""}.` : json.error);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="card">
      <h3 className="font-semibold">Send broadcast</h3>
      <p className="mt-1 text-sm text-slate-500">
        {waiting} contacts waiting. Calls go out in batches so you stay in control of volume and cost.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <select className="input w-auto" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
          {[5, 10, 25, 50].map((n) => (
            <option key={n} value={n}>Next {n}</option>
          ))}
        </select>
        <button className="btn" onClick={send} disabled={busy || waiting === 0}>
          {busy ? "Calling…" : "Start calls"}
        </button>
      </div>
      {message && <p className="mt-2 text-sm text-slate-600">{message}</p>}
    </div>
  );
}
