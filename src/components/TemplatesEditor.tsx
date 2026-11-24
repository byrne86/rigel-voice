"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Criterion, ScorecardTemplate } from "@/lib/types";

const blank = (): ScorecardTemplate => ({
  id: "",
  name: "",
  description: "",
  pass_mark: 70,
  criteria: [{ id: crypto.randomUUID().slice(0, 8), name: "", description: "", max_points: 10 }],
});

export interface TemplateStats {
  evaluations: number;
  agents: number;
  pass: number | null;
  avg: number | null;
  campaigns: string[];
}

export default function TemplatesEditor({
  templates,
  canEdit,
  stats,
  startNew = false,
}: {
  templates: ScorecardTemplate[];
  canEdit: boolean;
  stats: Record<string, TemplateStats>;
  startNew?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<ScorecardTemplate | null>(startNew ? blank() : null);
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
    const passMark = Math.max(1, Math.min(100, Math.round(Number(editing.pass_mark ?? 70))));
    const row = { name: editing.name.trim(), description: editing.description || null, criteria, pass_mark: passMark };
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
          <div>
            <label className="label" htmlFor="pass-mark">Pass mark (%)</label>
            <input
              id="pass-mark"
              className="input w-28"
              type="number"
              min={1}
              max={100}
              value={editing.pass_mark ?? 70}
              onChange={(e) => setEditing({ ...editing, pass_mark: Number(e.target.value) })}
            />
            <p className="mt-1 text-xs text-slate-500">A call passes at this score, unless it fails a critical criterion.</p>
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
                <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={!!c.critical} onChange={(e) => setCriterion(i, { critical: e.target.checked })} />
                  Must pass: under half marks here fails the call, whatever the total
                </label>
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
      {error && <p className="text-sm text-red-700">{error}</p>}
      {templates.map((t) => {
        const st = stats[t.id];
        return (
          <section key={t.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold">
                  {t.name}
                </h3>
                <p className="text-sm text-slate-500">
                  {t.criteria.length} points to check, pass at {t.pass_mark ?? 70}%. {st?.campaigns.length ? `Used on ${st.campaigns.join(", ")}.` : "No campaign uses it yet."}
                </p>
              </div>
              <dl className="grid grid-cols-4 gap-6 text-center">
                {[
                  ["Calls marked", st?.evaluations ?? 0],
                  ["Agents", st?.agents ?? 0],
                  ["Pass rate", st?.pass === null || st?.pass === undefined ? "–" : `${Math.round(st.pass)}%`],
                  ["Avg score", st?.avg === null || st?.avg === undefined ? "–" : `${Math.round(st.avg)}%`],
                ].map(([k, v]) => (
                  <div key={k as string}>
                    <dt className="text-xs text-slate-500">{k}</dt>
                    <dd className="text-lg font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-brand">See the points</summary>
              <ul className="mt-2 divide-y divide-slate-100 text-sm">
                {t.criteria.map((c) => (
                  <li key={c.id} className="flex justify-between gap-4 py-2">
                    <div>
                      <div className="font-medium">
                        {c.name}
                        {c.critical && <span className="ml-2 badge bg-red-50 text-red-800 ring-1 ring-red-200">must pass</span>}
                      </div>
                      <div className="text-slate-500">{c.description}</div>
                    </div>
                    <div className="shrink-0 font-semibold">{c.max_points} pts</div>
                  </li>
                ))}
              </ul>
            </details>
            {canEdit && (
              <div className="mt-3 flex gap-2">
                <button className="btn-secondary px-3 py-1.5" onClick={() => setEditing(t)}>Edit</button>
                <button className="btn-secondary px-3 py-1.5" onClick={() => remove(t.id)}>Delete</button>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
