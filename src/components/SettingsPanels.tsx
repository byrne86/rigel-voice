"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Role } from "@/lib/types";

export function TeamPanel({ team, me, canEdit }: { team: Profile[]; me: string; canEdit: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function setRole(id: string, role: Role) {
    const { error } = await createClient().from("profiles").update({ role }).eq("id", id);
    setError(error?.message ?? null);
    router.refresh();
  }

  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full">
        <thead className="border-b border-slate-200">
          <tr>
            <th className="th">Name</th>
            <th className="th">Email</th>
            <th className="th">Role</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {team.map((p) => (
            <tr key={p.id}>
              <td className="td font-medium">{p.full_name || "—"}</td>
              <td className="td">{p.email}</td>
              <td className="td">
                {canEdit && p.id !== me && p.role !== "owner" ? (
                  <select className="input w-auto" value={p.role} onChange={(e) => setRole(p.id, e.target.value as Role)}>
                    <option value="agent">Agent</option>
                    <option value="manager">Manager</option>
                  </select>
                ) : (
                  <span className="capitalize">{p.role}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && <p className="p-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}

export function DncPanel({ numbers, canEdit }: { numbers: { phone: string; reason: string | null; created_at: string }[]; canEdit: boolean }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const clean = phone.replace(/[^\d+]/g, "");
    if (!/^\+\d{7,15}$/.test(clean)) {
      setError("Enter the number in international format, e.g. +353871234567");
      return;
    }
    const { error } = await createClient().from("dnc_numbers").upsert({ phone: clean, reason: "Added manually" }, { ignoreDuplicates: true });
    setError(error?.message ?? null);
    if (!error) setPhone("");
    router.refresh();
  }

  async function remove(p: string) {
    const { error } = await createClient().from("dnc_numbers").delete().eq("phone", p);
    setError(error?.message ?? null);
    router.refresh();
  }

  return (
    <div className="card">
      <form onSubmit={add} className="flex gap-2">
        <input className="input" placeholder="+353871234567" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <button className="btn shrink-0">Add number</button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {numbers.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No numbers on the list. Numbers are added automatically when an agent marks “Do not call” or someone opts out of a broadcast.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {numbers.map((n) => (
            <li key={n.phone} className="flex items-center justify-between py-2">
              <span>
                <span className="font-medium">{n.phone}</span>
                <span className="ml-2 text-slate-500">{n.reason}</span>
              </span>
              {canEdit && <button className="text-xs text-slate-500 hover:text-red-600" onClick={() => remove(n.phone)}>Remove</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
