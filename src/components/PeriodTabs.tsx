import Link from "next/link";
import { PERIODS } from "@/lib/stats";

export default function PeriodTabs({ current, base }: { current: number; base: string }) {
  return (
    <div className="inline-flex rounded-full border border-slate-200 bg-white p-1" role="tablist" aria-label="Time period">
      {PERIODS.map((p) => (
        <Link
          key={p}
          href={`${base}?days=${p}`}
          role="tab"
          aria-selected={p === current}
          className={`rounded-full px-3 py-1.5 text-sm font-medium ${
            p === current ? "bg-night text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {p} days
        </Link>
      ))}
    </div>
  );
}
