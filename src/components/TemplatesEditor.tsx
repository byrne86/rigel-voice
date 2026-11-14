"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Criterion, ScorecardTemplate } from "@/lib/types";

const blank = (): ScorecardTemplate => ({
  id: "",
  name: "",
  description: "",
  criteria: [{ id: crypto.randomUUID().slice(0, 8), name: "", description: "", max_points: 10 }],
});

export default function TemplatesEditor({ templates, canEdit }: { templates: ScorecardTemplate[]; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<ScorecardTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const setCriterion = (i: number, patch: Partial<Criterion>) =>
    setEditing((t) => t && { ...t, criteria: t.criteria.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  async function save() {
    if (!editing) return;
    const criteria = editing.criteria.filter((c) => c.name.trim());
    if (!editing.name.trim() || criteria.length === 0) {
      setError("Give the scorecard a name and at least one criterion.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const row = { name: editing.name.trim(), description: editing.description || null, criteria };
    const { error } = editing.id
      ? await supabase.from("scorecard_templates").update(row).eq("id", editing.id)
      : await supabase.from("scorecard_templates").insert(row);
    setBusy(false);
    if (error) return setError(error.message);
    setEditing(null);
    router.refresh();
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this scorecard? Calls already scored keep their results.")) return;
    const { error } = await createClient().from("scorecard_templates").delete().eq("id", id);
    if (error) setError(error.message);
    router.refresh();
  }

  if (editing) {
    const total = editing.criteria.reduce((s, c) => s + (Number(c.max_points) || 0), 0);
    return (
      <div className="card space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Scorecard name</label>
            <input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Description</label>
            <input className="input" value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
          </div>
        </div>
        <div>
          <div className="label">Criteria ({total} points in total)</div>
          <div className="space-y-3">
            {editing.criteria.map((c, i) => (
              <div key={c.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex gap-2">
                  <input className="input" placeholder="Criterion, e.g. Greeting" value={c.name} onChange={(e) => setCriterion(i, { name: e.target.value })} />
                  <input className="input w-24" type="number" min={1} value={c.max_points} onChange={(e) => setCriterion(i, { max_points: Number(e.target.value) })} />
                  <button className="btn-secondary" onClick={() => setEditing({ ...editing, criteria: editing.criteria.filter((_, j) => j !== i) })}>✕</button>
                </div>
                <textarea
                  className="input mt-2"
                  placeholder="What does a good call look like for this? The AI scores against this description."
                  value={c.description}
                  onChange={(e) => setCriterion(i, { description: e.target.value })}
                />
              </div>
            ))}
          </div>
          <button
            className="btn-secondary mt-3"
            onClick={() => setEditing({ ...editing, criteria: [...editing.criteria, { id: crypto.randomUUID().slice(0, 8), name: "", description: "", max_points: 10 }] })}
          >
            Add criterion
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button className="btn" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save scorecard"}</button>
          <button className="btn-secondary" onClick={() => { setEditing(null); setError(null); }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canEdit && <button className="btn" onClick={() => setEditing(blank())}>New scorecard</button>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {templates.map((t) => (
        <div key={t.id} className="card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">{t.name}</h3>
              {t.description && <p className="text-sm text-slate-500">{t.description}</p>}
            </div>
            {canEdit && (
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={() => setEditing(t)}>Edit</button>
                <button className="btn-secondary" onClick={() => remove(t.id)}>Delete</button>
              </div>
            )}
          </div>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {t.criteria.map((c) => (
              <li key={c.id} className="flex justify-between gap-4 py-2">
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-slate-500">{c.description}</div>
                </div>
                <div className="shrink-0 font-semibold">{c.max_points} pts</div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
