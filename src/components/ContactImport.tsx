"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";

const ALIASES: Record<string, string[]> = {
  first_name: ["first_name", "firstname", "first name", "first", "name", "full name", "contact"],
  last_name: ["last_name", "lastname", "last name", "surname", "last"],
  company: ["company", "business", "organisation", "organization", "account"],
  phone: ["phone", "phone number", "mobile", "telephone", "tel", "number", "phone_number", "mobile number"],
  email: ["email", "e-mail", "email address"],
  notes: ["notes", "note", "comments"],
};

export default function ContactImport({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setResult(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (parsed) => {
        const headers = parsed.meta.fields ?? [];
        const map: Record<string, string> = {};
        for (const [field, names] of Object.entries(ALIASES)) {
          const hit = headers.find((h) => names.includes(h.trim().toLowerCase()));
          if (hit) map[field] = hit;
        }
        if (!map.phone) {
          setResult("Could not find a phone column. Name it “phone” or “mobile” and try again.");
          setBusy(false);
          return;
        }
        const rows = parsed.data.map((r) =>
          Object.fromEntries(Object.entries(map).map(([field, header]) => [field, r[header]])),
        );
        let imported = 0, invalid = 0, duplicates = 0;
        for (let i = 0; i < rows.length; i += 2000) {
          const res = await fetch(`/api/campaigns/${campaignId}/contacts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rows: rows.slice(i, i + 2000) }),
          });
          const json = await res.json();
          if (!res.ok) {
            setResult(json.error ?? "Import failed");
            setBusy(false);
            return;
          }
          imported += json.imported;
          invalid += json.invalid;
          duplicates += json.duplicates;
        }
        setResult(`Imported ${imported}. Skipped ${invalid} invalid numbers and ${duplicates} duplicates.`);
        setBusy(false);
        router.refresh();
      },
      error: (err) => {
        setResult(err.message);
        setBusy(false);
      },
    });
    e.target.value = "";
  }

  return (
    <div>
      <label className={`btn-secondary cursor-pointer ${busy ? "pointer-events-none opacity-50" : ""}`}>
        {busy ? "Importing…" : "Import contacts (CSV)"}
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
      </label>
      {result && <p className="mt-2 text-sm text-slate-600">{result}</p>}
      <p className="mt-2 text-xs text-slate-500">
        Columns: phone (required), first_name, last_name, company, email, notes.
      </p>
    </div>
  );
}
