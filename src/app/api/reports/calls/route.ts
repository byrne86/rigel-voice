import { getContext } from "@/lib/auth";
import { csv, parsePeriod, periodBounds } from "@/lib/stats";
import { dispositionLabel } from "@/lib/types";

/** CSV export of calls for the chosen period (only the signed-in user's company). */
export async function GET(req: Request) {
  const ctx = await getContext();
  if (!ctx) return new Response("Not signed in", { status: 401 });
  const days = parsePeriod(new URL(req.url).searchParams.get("days") ?? undefined);
  const { start } = periodBounds(days);

  const { data } = await ctx.supabase
    .from("calls")
    .select("created_at, to_number, kind, status, duration_seconds, disposition, notes, campaigns(name), contacts(first_name, last_name, company), profiles(full_name, email), scorecards(percent, passed)")
    .gte("created_at", start.toISOString())
    .order("created_at", { ascending: false })
    .limit(20000);

  const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
  const header = ["Date", "Campaign", "Agent", "Contact", "Company", "Number", "Status", "Seconds", "Outcome", "AI score %", "Passed", "Notes"];
  const lines = [header.join(",")];
  for (const c of data ?? []) {
    const contact = one(c.contacts);
    const agent = one(c.profiles);
    const score = one(c.scorecards);
    lines.push(
      [
        c.created_at,
        one(c.campaigns)?.name,
        c.kind === "broadcast" ? "AI caller" : agent?.full_name || agent?.email,
        [contact?.first_name, contact?.last_name].filter(Boolean).join(" "),
        contact?.company,
        c.to_number,
        c.status,
        c.duration_seconds,
        c.disposition ? dispositionLabel(c.disposition) : "",
        score ? Math.round(Number(score.percent)) : "",
        score ? (score.passed ?? Number(score.percent) >= 70 ? "Yes" : "No") : "",
        c.notes,
      ]
        .map(csv)
        .join(","),
    );
  }
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rigel-voice-calls-${days}d.csv"`,
    },
  });
}
