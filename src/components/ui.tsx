const TONES: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  red: "bg-red-50 text-red-800 ring-1 ring-red-200",
  blue: "bg-blue-50 text-blue-800 ring-1 ring-blue-200",
  grey: "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
};

const STATUS_TONE: Record<string, string> = {
  active: "green", completed: "blue", done: "green", "in-progress": "green", sale: "green", interested: "green",
  positive: "green", draft: "grey", paused: "amber", pending: "grey", retry: "amber", callback: "amber",
  transcribing: "amber", scoring: "amber", skipped: "grey", neutral: "grey", failed: "red", dnc: "red",
  busy: "amber", "no-answer": "amber", no_answer: "amber", negative: "red", canceled: "grey",
};

export function Badge({ children, tone }: { children: React.ReactNode; tone?: string }) {
  const key = tone ?? STATUS_TONE[String(children)] ?? "grey";
  return <span className={`badge ${TONES[key] ?? TONES.grey}`}>{children}</span>;
}

export function ScoreBadge({ percent }: { percent: number | null | undefined }) {
  if (percent === null || percent === undefined) return <span className="text-slate-400">—</span>;
  const tone = percent >= 80 ? "green" : percent >= 60 ? "amber" : "red";
  return <Badge tone={tone}>{Math.round(percent)}%</Badge>;
}

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <h1 className="text-[28px] font-bold leading-tight text-night">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[15px] text-slate-600">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="card">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="font-display mt-1 text-3xl font-bold text-night">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

/** Supabase returns a joined row as an object or a one-item array; this normalises it. */
export function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}
