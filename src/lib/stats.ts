import type { Objection, ScoreResult } from "./types";

export const PERIODS = [7, 30, 90] as const;
export type Period = (typeof PERIODS)[number];

export function parsePeriod(v: string | undefined): Period {
  const n = Number(v);
  return (PERIODS as readonly number[]).includes(n) ? (n as Period) : 7;
}

/** Start of the current period and of the one before it. */
export function periodBounds(days: number) {
  const now = Date.now();
  const start = new Date(now - days * 86400_000);
  const prevStart = new Date(now - 2 * days * 86400_000);
  return { now: new Date(now), start, prevStart };
}

/** Day labels (YYYY-MM-DD) for the last `days` days, oldest first. */
export function dayKeys(days: number) {
  const out: string[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    out.push(new Date(today.getTime() - i * 86400_000).toISOString().slice(0, 10));
  }
  return out;
}

export interface CallRow {
  id: string;
  created_at: string;
  status: string;
  kind: string;
  duration_seconds: number | null;
  disposition: string | null;
  agent_id: string | null;
  campaign_id: string | null;
  scorecards:
    | {
        percent: number;
        passed: boolean | null;
        results: ScoreResult[] | null;
        objections: Objection[] | null;
        agent_talk_ratio: number | null;
        template_id: string | null;
      }
    | { percent: number; passed: boolean | null; results: ScoreResult[] | null; objections: Objection[] | null; agent_talk_ratio: number | null; template_id: string | null }[]
    | null;
}

export function scoreOf(c: CallRow) {
  const s = Array.isArray(c.scorecards) ? c.scorecards[0] : c.scorecards;
  return s ?? null;
}

export const isConnected = (c: CallRow) => c.status === "completed" && (c.duration_seconds ?? 0) > 0;
export const didPass = (s: NonNullable<ReturnType<typeof scoreOf>>) =>
  s.passed ?? Number(s.percent) >= 70;

export function summarise(calls: CallRow[]) {
  const scored = calls.map(scoreOf).filter((s): s is NonNullable<typeof s> => !!s);
  const connected = calls.filter(isConnected);
  const ratios = scored.map((s) => s.agent_talk_ratio).filter((r): r is number => r !== null && r !== undefined);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + Number(b), 0) / xs.length : null);
  return {
    calls: calls.length,
    connected: connected.length,
    talkSeconds: connected.reduce((a, c) => a + (c.duration_seconds ?? 0), 0),
    scored: scored.length,
    avgScore: mean(scored.map((s) => Number(s.percent))),
    passRate: scored.length ? (scored.filter(didPass).length / scored.length) * 100 : null,
    avgLength: mean(connected.map((c) => c.duration_seconds ?? 0)),
    agentTalk: ratios.length ? (mean(ratios.map(Number)) as number) * 100 : null,
    sales: calls.filter((c) => c.disposition === "sale").length,
  };
}

/** Scorecard criteria ranked from lowest average achievement. */
export function coachingOpportunities(
  calls: CallRow[],
  templates: Map<string, { name: string; critical: Set<string> }>,
) {
  const agg = new Map<string, { name: string; template: string; critical: boolean; sum: number; n: number; missed: number }>();
  for (const c of calls) {
    const s = scoreOf(c);
    if (!s?.results) continue;
    const t = s.template_id ? templates.get(s.template_id) : undefined;
    for (const r of s.results) {
      if (!r.max_points) continue;
      const key = `${s.template_id}:${r.criterion_id}`;
      const row = agg.get(key) ?? {
        name: r.name,
        template: t?.name ?? "",
        critical: t?.critical.has(r.criterion_id) ?? false,
        sum: 0,
        n: 0,
        missed: 0,
      };
      row.sum += r.score / r.max_points;
      row.n++;
      if (r.score < r.max_points / 2) row.missed++;
      agg.set(key, row);
    }
  }
  return [...agg.values()]
    .map((r) => ({ ...r, achievement: (r.sum / r.n) * 100 }))
    .sort((a, b) => a.achievement - b.achievement || b.missed - a.missed);
}

export function topObjections(calls: CallRow[]) {
  const agg = new Map<string, { objection: string; category: string; times: number; resolved: number }>();
  for (const c of calls) {
    for (const o of scoreOf(c)?.objections ?? []) {
      const key = o.objection.trim().toLowerCase();
      if (!key) continue;
      const row = agg.get(key) ?? { objection: o.objection.trim(), category: o.category, times: 0, resolved: 0 };
      row.times++;
      if (o.resolved) row.resolved++;
      agg.set(key, row);
    }
  }
  return [...agg.values()].sort((a, b) => b.times - a.times);
}

export function formatSeconds(s: number | null | undefined) {
  if (s === null || s === undefined) return "—";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m ? `${m}m ${sec}s` : `${sec}s`;
}

export function formatHours(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

/** Quote a value for CSV. */
export function csv(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
