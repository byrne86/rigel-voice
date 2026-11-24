/** Small server-rendered charts. Single brand hue; hover shows the exact value. */

export function DailyBars({ data, label, unit = "", max: fixedMax }: { data: { day: string; value: number | null }[]; label: string; unit?: string; max?: number }) {
  const max = fixedMax ?? Math.max(1, ...data.map((d) => d.value ?? 0));
  const nice = fixedMax ?? (max <= 4 ? 4 : Math.ceil(max / 4) * 4);
  const ticks = [nice, nice / 2, 0];
  const showEvery = Math.ceil(data.length / 8);
  const fmt = (d: string) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString("en-IE", { day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <figure className="m-0" aria-label={label}>
      <div className="flex h-56 gap-2">
        <div className="flex flex-col justify-between pb-6 text-right text-[11px] text-slate-400">
          {ticks.map((t) => <span key={t}>{t}{unit}</span>)}
        </div>
        <div className="relative flex-1">
          <div className="absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between">
            {ticks.map((t) => <div key={t} className="border-t border-slate-100" />)}
          </div>
          <div className="absolute inset-x-0 top-0 bottom-6 flex items-end gap-[2px]">
            {data.map((d) => (
              <div key={d.day} className="group relative flex h-full flex-1 items-end justify-center">
                <div
                  className="w-full max-w-7 rounded-t-[4px] bg-brand transition-[height] duration-300 group-hover:bg-flare"
                  style={{ height: `${((d.value ?? 0) / nice) * 100}%`, minHeight: d.value ? 3 : 0 }}
                />
                <div className="pointer-events-none absolute bottom-full mb-1 hidden whitespace-nowrap rounded-md bg-night px-2 py-1 text-xs text-white shadow group-hover:block">
                  {fmt(d.day)}: <strong>{d.value === null ? "no calls" : `${Math.round(d.value)}${unit}`}</strong>
                </div>
              </div>
            ))}
          </div>
          <div className="absolute inset-x-0 bottom-0 flex gap-[2px]">
            {data.map((d, i) => (
              <div key={d.day} className="flex-1 text-center text-[11px] text-slate-400">
                {i % showEvery === 0 ? fmt(d.day) : ""}
              </div>
            ))}
          </div>
        </div>
      </div>
      <figcaption className="sr-only">
        {data.map((d) => `${fmt(d.day)}: ${d.value ?? "none"}${unit}`).join(", ")}
      </figcaption>
    </figure>
  );
}

export function Meter({ percent, tone = "brand" }: { percent: number; tone?: "brand" | "good" | "warn" | "bad" }) {
  const color = { brand: "bg-brand", good: "bg-good", warn: "bg-flare", bad: "bg-bad" }[tone];
  return (
    <div className="h-2 w-full rounded-full bg-slate-100">
      <div className={`h-2 rounded-full transition-[width] duration-500 ${color}`} style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
    </div>
  );
}

export function Delta({ value, unit = "", invert = false }: { value: number | null; unit?: string; invert?: boolean }) {
  if (value === null || !isFinite(value)) return <span className="text-xs text-slate-400">nothing to compare yet</span>;
  if (Math.abs(value) < 0.05) return <span className="text-xs text-slate-500">same as before</span>;
  const up = value > 0;
  const good = invert ? !up : up;
  return (
    <span className={`text-xs font-medium ${good ? "text-emerald-700" : "text-red-700"}`}>
      {up ? "▲" : "▼"} {Math.abs(Math.round(value * 10) / 10)}
      {unit} on the period before
    </span>
  );
}
