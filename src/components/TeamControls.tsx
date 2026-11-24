"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AccessSelect({ id, role, editable }: { id: string; role: string; editable: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(role);
  const [error, setError] = useState<string | null>(null);
  if (!editable || role === "owner") {
    return <span className="badge bg-slate-100 capitalize text-slate-700">{role === "owner" ? "admin" : role}</span>;
  }
  return (
    <div>
      <select className="input w-auto py-1 text-xs" aria-label="Access" value={value}
        onChange={async (e) => {
          const next = e.target.value;
          setValue(next);
          const res = await fetch(`/api/agents/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: next }) });
          if (!res.ok) {
            setValue(role);
            setError((await res.json()).error ?? "Not allowed");
          }
          router.refresh();
        }}>
        <option value="agent">Agent (sees own calls)</option>
        <option value="manager">Manager (sees everyone)</option>
      </select>
      {error && <div className="text-xs text-red-700">{error}</div>}
    </div>
  );
}

export function AddAgent() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", role: "agent" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: json.error ?? "Could not add" });
    setMsg({ ok: true, text: `Invite sent to ${form.email}.` });
    setForm({ name: "", email: "", role: "agent" });
    router.refresh();
  }

  return (
    <form onSubmit={add} className="card grid gap-3 md:grid-cols-5 md:items-end">
      <div>
        <label className="label" htmlFor="ag-name">Name</label>
        <input id="ag-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="md:col-span-2">
        <label className="label" htmlFor="ag-email">Work email</label>
        <input id="ag-email" type="email" required className="input" placeholder="name@company.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor="ag-role">Access</label>
        <select id="ag-role" className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="agent">Agent (sees own calls)</option>
          <option value="manager">Manager (sees everyone)</option>
        </select>
      </div>
      <button className="btn" disabled={busy}>{busy ? "Sending…" : "Invite"}</button>
      <p className="text-xs text-slate-500 md:col-span-5">
        We email them a link to join. They can set a password or use Microsoft or Google with the same address. Agents only ever see their own calls.
      </p>
      {msg && <p className={`text-sm md:col-span-5 ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p>}
    </form>
  );
}
