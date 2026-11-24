"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ProcessNow() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      <button className="btn" onClick={async () => {
        setMsg("Starting…");
        const res = await fetch("/api/settings/process-now", { method: "POST" });
        const json = await res.json();
        setMsg(res.ok ? (json.queued ? `Retrying ${json.queued} calls` : "Nothing is stuck") : json.error);
        setTimeout(() => router.refresh(), 15000);
      }}>Retry stuck calls</button>
      {msg && <span className="text-sm text-slate-600">{msg}</span>}
    </div>
  );
}

export function Retention({ days }: { days: number | null }) {
  const router = useRouter();
  const [value, setValue] = useState(days === null ? "" : String(days));
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-end gap-2">
      <div>
        <label className="label" htmlFor="ret">Keep for</label>
        <select id="ret" className="input" value={value} onChange={(e) => { setValue(e.target.value); setMsg(null); }}>
          <option value="">Always</option>
          <option value="30">30 days</option>
          <option value="90">90 days</option>
          <option value="180">6 months</option>
          <option value="365">1 year</option>
          <option value="730">2 years</option>
        </select>
      </div>
      <button className="btn-secondary" onClick={async () => {
        const res = await fetch("/api/settings/retention", {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days: value === "" ? null : Number(value) }),
        });
        setMsg(res.ok ? "Saved" : (await res.json()).error);
        router.refresh();
      }}>Save</button>
      {msg && <span className="pb-2 text-sm text-emerald-700">{msg}</span>}
    </div>
  );
}

export function SignOutButtons({ manager }: { manager: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="btn-secondary" onClick={async () => {
        await fetch("/api/activity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "signed_out_everywhere" }) });
        await createClient().auth.signOut({ scope: "global" });
        router.push("/login");
      }}>Sign me out everywhere</button>
      {manager && (
        <button className="btn-secondary" onClick={async () => {
          if (!window.confirm("Sign everyone in your company out of every device? They'll need to sign in again.")) return;
          const res = await fetch("/api/settings/sign-out-everyone", { method: "POST" });
          setMsg(res.ok ? "Done. Anyone still on a page is logged out within the hour." : (await res.json()).error);
        }}>Sign the whole team out</button>
      )}
      {manager && <a className="btn-secondary" href="/settings/activity">See who did what</a>}
      {msg && <p className="w-full text-sm text-slate-600">{msg}</p>}
    </div>
  );
}
