"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";

const ALIASES: Record<string, string[]> = {
  first_name: ["first_name", "firstname", "first name", "first", "name", "full name", "contact", "contact name"],
  last_name: ["last_name", "lastname", "last name", "surname", "last"],
  company: ["company", "business", "organisation", "organization", "account", "account name", "company name"],
  phone: ["phone", "phone number", "mobile", "telephone", "tel", "number", "phone_number", "mobile number", "direct dial", "work phone"],
  email: ["email", "e-mail", "email address"],
  notes: ["notes", "note", "comments", "description"],
};

type Row = Record<string, string>;

async function readFile(file: File): Promise<{ headers: string[]; rows: Row[] }> {
  if (/\.xlsx$/i.test(file.name)) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) return { headers: [], rows: [] };
    const headers: string[] = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => (headers[col - 1] = String(cell.text ?? "").trim()));
    const rows: Row[] = [];
    ws.eachRow((row, i) => {
      if (i === 1) return;
      const r: Row = {};
      headers.forEach((h, c) => (r[h] = String(row.getCell(c + 1).text ?? "")));
      rows.push(r);
    });
    return { headers, rows };
  }
  return new Promise((resolve, reject) =>
    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (p) => resolve({ headers: p.meta.fields ?? [], rows: p.data }),
      error: reject,
    }),
  );
}

export default function NewCallList({
  campaigns,
  agents,
}: {
  campaigns: { id: string; name: string }[];
  agents: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [source, setSource] = useState<"upload" | "crm">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!file) return setMessage({ ok: false, text: "Choose a CSV or Excel file." });
    if (!campaignId) return setMessage({ ok: false, text: "Choose a campaign." });
    setBusy(true);
    try {
      const { headers, rows } = await readFile(file);
      const map: Record<string, string> = {};
      for (const [field, names] of Object.entries(ALIASES)) {
        const hit = headers.find((h) => names.includes(h.trim().toLowerCase()));
        if (hit) map[field] = hit;
      }
      if (!map.phone) throw new Error("Couldn't find a phone column. Name it “phone” or “mobile”.");
      const mapped = rows.map((r) => Object.fromEntries(Object.entries(map).map(([f, h]) => [f, r[h]])));
      const res = await fetch("/api/call-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || file.name.replace(/\.(csv|xlsx)$/i, ""), campaignId, agentId: agentId || null, rows: mapped }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not create the list");
      setMessage({
        ok: true,
        text: `Added ${json.imported} people. Left out ${json.invalid} numbers that weren't valid and ${json.duplicates} already in this campaign.`,
      });
      setFile(null);
      setName("");
      router.refresh();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Upload failed" });
    }
    setBusy(false);
  }

  return (
    <form onSubmit={create} className="card space-y-4">
      <h2 className="text-lg font-bold text-night">Add a call list</h2>
      <div className="flex gap-2" role="tablist">
        {([["crm", "From Rigel CRM"], ["upload", "Upload Excel or CSV"]] as const).map(([k, label]) => (
          <button type="button" key={k} role="tab" aria-selected={source === k} onClick={() => setSource(k)}
            className={`rounded-full border px-3 py-1 text-sm ${source === k ? "border-brand bg-brand/5 font-medium text-brand" : "border-slate-300 text-slate-600"}`}>
            {label}
          </button>
        ))}
      </div>

      {source === "crm" ? (
        <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Lists straight from Rigel CRM are on the way. Until then, export your contacts from the CRM and upload the file here.
        </p>
      ) : (
        <>
          <div>
            <label className="label" htmlFor="file">File</label>
            <input id="file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="block text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <p className="mt-1 text-xs text-slate-500">Needs a phone column. Name, company, email and notes columns are picked up too. For Excel files we read the first sheet.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="label" htmlFor="list-name">List name</label>
              <input id="list-name" className="input" placeholder="Uses the file name if left blank" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="list-campaign">Campaign</label>
              <select id="list-campaign" className="input" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
                <option value="">Choose…</option>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="list-agent">Agent</label>
              <select id="list-agent" className="input" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                <option value="">Shared with the whole team</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
          {message && <p className={`text-sm ${message.ok ? "text-emerald-700" : "text-red-700"}`}>{message.text}</p>}
          <button className="btn" disabled={busy}>{busy ? "Adding…" : "Add list"}</button>
        </>
      )}
    </form>
  );
}
