import { normaliseNumber } from "./dialing";

export interface ContactRow {
  first_name?: string;
  last_name?: string;
  company?: string;
  phone?: string;
  email?: string;
  notes?: string;
}

function clip(v: unknown, max: number) {
  const t = typeof v === "string" ? v.trim() : v === null || v === undefined ? "" : String(v).trim();
  return t ? t.slice(0, max) : null;
}

/** Cleans uploaded rows: valid numbers only, international format, no duplicates. */
export function cleanContacts(rows: ContactRow[], country: string) {
  const seen = new Set<string>();
  const clean = [];
  let invalid = 0;
  for (const row of rows) {
    const phone = normaliseNumber(String(row.phone ?? ""), country);
    if (!phone) {
      invalid++;
      continue;
    }
    if (seen.has(phone)) continue;
    seen.add(phone);
    clean.push({
      phone,
      first_name: clip(row.first_name, 100),
      last_name: clip(row.last_name, 100),
      company: clip(row.company, 200),
      email: clip(row.email, 200),
      notes: clip(row.notes, 2000),
    });
  }
  return { clean, invalid };
}
