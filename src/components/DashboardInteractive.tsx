"use client";

import { useState } from "react";
import { DailyBars, Delta, Meter } from "./Charts";

type Metric = "scored" | "avgScore" | "passRate" | "calls";

export interface Series {
  day: string;
  calls: number;
  scored: number;
  avgScore: number | null;
  passRate: number | null;
}

const METRICS: { key: Metric; label: string; chart: string; unit: string; max?: number }[] = [
  { key: "calls", label: "Calls made", chart: "Calls made per day", unit: "" },
  { key: "scored", label: "Calls scored", chart: "Calls scored per day", unit: "" },
  { key: "avgScore", label: "Average score", chart: "Average score per day", unit: "%", max: 100 },
  { key: "passRate", label: "Pass rate", chart: "Pass rate per day", unit: "%", max: 100 },
];

export function KpiBoard({
  series,
  totals,
  deltas,
  extra,
}: {
  series: Series[];
  totals: Record<Metric, string>;
  deltas: Record<Metric, { value: number | null; unit: string }>;
  extra: { label: string; value: string; note: string }[];
}) {
  const [metric, setMetric] = useState<Metric>("scored");
  const m = METRICS.find((x) => x.key === metric)!;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {METRICS.map((x) => (
          <button key={x.key} onClick={() => setMetric(x.key)} aria-pressed={metric === x.key}
            className={`rounded-2xl border p-4 text-left transition ${
              metric === x.key ? "border-brand bg-white shadow-[0_8px_24px_-12px_rgba(47,91,234,.45)] ring-1 ring-brand" : "border-slate-200/80 bg-white hover:border-brand/40"}`}>
            <div className="text-sm text-slate-500">{x.label}</div>
            <div className="font-display mt-1 text-[28px] font-bold leading-none text-night">{totals[x.key]}</div>
            <div className="mt-2"><Delta value={deltas[x.key].value} unit={deltas[x.key].unit} /></div>
          </button>
        ))}
        {extra.map((x) => (
          <div key={x.label} className="rounded-2xl border border-slate-200/80 bg-white p-4">
            <div className="text-sm text-slate-500">{x.label}</div>
            <div className="font-display mt-1 text-[28px] font-bold leading-none text-night">{x.value}</div>
            <div className="mt-2 text-xs text-slate-500">{x.note}</div>
          </div>
        ))}
      </div>
      <section className="card">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-bold text-night">{m.chart}</h2>
          <span className="text-xs text-slate-500">Pick a figure above to change the chart</span>
        </div>
        <DailyBars data={series.map((d) => ({ day: d.day, value: d[metric] }))} label={m.chart} unit={m.unit} max={m.max} />
      </section>
    </div>
  );
}

export interface Opportunity {
  name: string;
  template: string;
  critical: boolean;
  achievement: number;
  missed: number;
  agents: { name: string; achievement: number; calls: number }[];
}

export function CoachingList({ items }: { items: Opportunity[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((c) => {
        const key = `${c.template}:${c.name}`;
        const isOpen = open === key;
        const tone = c.achievement >= 80 ? "good" : c.achievement >= 60 ? "warn" : "bad";
        return (
          <li key={key}>
            <button className="w-full py-3 text-left" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : key)}>
              <div className="mb-1.5 flex items-start justify-between gap-3 text-sm">
                <span className="font-medium text-night">
                  {c.name}
                  {c.critical && <span className="badge ml-2 bg-red-50 text-red-800 ring-1 ring-red-200">must pass</span>}
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                  {Math.round(c.achievement)}% · missed on {c.missed} {c.missed === 1 ? "call" : "calls"}
                  <svg viewBox="0 0 20 20" className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="currentColor" aria-hidden="true"><path d="M5.2 7.2a1 1 0 0 1 1.4 0L10 10.6l3.4-3.4a1 1 0 1 1 1.4 1.4l-4.1 4.1a1 1 0 0 1-1.4 0L5.2 8.6a1 1 0 0 1 0-1.4z" /></svg>
                </span>
              </div>
              <Meter percent={c.achievement} tone={tone} />
            </button>
            {isOpen && (
              <div className="mb-3 rounded-xl bg-slate-50 p-3">
                <div className="mb-2 text-xs text-slate-500">{c.template} · by agent, weakest first</div>
                {c.agents.length === 0 ? (
                  <p className="text-sm text-slate-500">Only AI caller calls so far.</p>
                ) : (
                  <ul className="space-y-2">
                    {c.agents.map((a) => (
                      <li key={a.name} className="grid grid-cols-[8rem_1fr_5rem] items-center gap-3 text-sm">
                        <span className="truncate">{a.name}</span>
                        <Meter percent={a.achievement} tone={a.achievement >= 80 ? "good" : a.achievement >= 60 ? "warn" : "bad"} />
                        <span className="text-right text-xs text-slate-500">{Math.round(a.achievement)}% of {a.calls}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
