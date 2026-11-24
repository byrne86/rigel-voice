import ExcelJS from "exceljs";
import { getContext } from "@/lib/auth";
import { callStatusLabel, fetchReportCalls, first, parseRange, reportSummary } from "@/lib/reports";
import { dispositionLabel } from "@/lib/types";

/** Excel workbook of the report: Summary, Calls and Quality sheets. */
export async function GET(req: Request) {
  const ctx = await getContext();
  if (!ctx) return new Response("Not signed in", { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const range = parseRange(sp);
  const calls = await fetchReportCalls(ctx.supabase, range);
  const s = reportSummary(calls);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Rigel Voice";
  const sum = wb.addWorksheet("Summary");
  sum.columns = [{ header: "Measure", key: "k", width: 28 }, { header: "Value", key: "v", width: 18 }];
  ([
    ["From", range.from], ["To", range.to], ["Calls", s.calls], ["Outbound", s.outbound], ["Inbound", s.inbound],
    ["Connected (15s+)", s.connected], ["Conversations (60s+)", s.conversations], ["Reached decision maker", s.reachedDm],
    ["Meetings booked", s.meetings], ["Callbacks", s.callbacks], ["Sales", s.sales], ["Voicemails left", s.voicemails],
    ["Talk time (minutes)", Math.round(s.talkSeconds / 6) / 10], ["Calls scored", s.scored],
    ["Average score %", s.avgScore === null ? "" : Math.round(s.avgScore * 10) / 10],
    ["Pass rate %", s.passRate === null ? "" : Math.round(s.passRate)],
  ] as [string, string | number][]).forEach(([k, v]) => sum.addRow({ k, v }));

  const sheet = wb.addWorksheet("Calls");
  sheet.columns = [
    { header: "Date (Irish time)", key: "date", width: 18 }, { header: "Direction", key: "dir", width: 10 },
    { header: "Agent", key: "agent", width: 20 }, { header: "Customer", key: "cust", width: 24 }, { header: "Company", key: "co", width: 22 },
    { header: "Number", key: "num", width: 16 }, { header: "Campaign", key: "camp", width: 22 }, { header: "Seconds", key: "sec", width: 9 },
    { header: "Reached DM", key: "dm", width: 11 }, { header: "Outcome", key: "out", width: 18 }, { header: "Score %", key: "score", width: 9 },
    { header: "Passed", key: "pass", width: 8 }, { header: "Status", key: "status", width: 20 }, { header: "Notes", key: "notes", width: 40 },
    { header: "AI summary", key: "summary", width: 60 },
  ];
  for (const c of calls) {
    const ct = first(c.contacts);
    const sc = first(c.scorecards);
    sheet.addRow({
      date: new Date(c.created_at).toLocaleString("en-IE", { timeZone: "Europe/Dublin" }),
      dir: c.direction,
      agent: c.kind === "broadcast" ? "AI caller" : first(c.profiles)?.full_name ?? "",
      cust: [ct?.first_name, ct?.last_name].filter(Boolean).join(" "),
      co: ct?.company ?? "",
      num: c.to_number ?? "",
      camp: first(c.campaigns)?.name ?? "",
      sec: c.duration_seconds ?? 0,
      dm: c.reached_dm ? "Yes" : "",
      out: c.disposition ? dispositionLabel(c.disposition) : "",
      score: sc ? Math.round(Number(sc.percent)) : "",
      pass: sc ? ((sc.passed ?? Number(sc.percent) >= 70) ? "Yes" : "No") : "",
      status: callStatusLabel(c),
      notes: c.notes ?? "",
      summary: sc?.summary ?? "",
    });
  }
  for (const ws of [sum, sheet]) {
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }
  sheet.autoFilter = { from: "A1", to: "O1" };

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="rigel-voice-report-${range.from}-to-${range.to}.xlsx"`,
    },
  });
}
