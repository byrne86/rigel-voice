import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { getContext, isManager, isUuid } from "@/lib/auth";

interface Row {
  first_name?: string;
  last_name?: string;
  company?: string;
  phone?: string;
  email?: string;
  notes?: string;
}

/** Imports contacts into a campaign. Numbers are cleaned to international format; bad and duplicate rows are skipped. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Not signed in" }, { status: 401 });
  if (!isManager(ctx.profile)) return Response.json({ error: "Managers only" }, { status: 403 });
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const { rows } = ((await req.json().catch(() => ({}))) ?? {}) as { rows: Row[] };
  if (!Array.isArray(rows) || rows.length === 0) return Response.json({ error: "No rows" }, { status: 400 });
  if (rows.length > 5000) return Response.json({ error: "Import up to 5,000 contacts at a time" }, { status: 400 });

  const { data: campaign } = await ctx.supabase.from("campaigns").select("id, default_country").eq("id", id).single();
  if (!campaign) return Response.json({ error: "Campaign not found" }, { status: 404 });

  const seen = new Set<string>();
  const clean = [];
  let invalid = 0;
  for (const row of rows) {
    const parsed = parsePhoneNumberFromString(String(row.phone ?? ""), campaign.default_country as CountryCode);
    if (!parsed || !parsed.isValid()) {
      invalid++;
      continue;
    }
    const phone = parsed.number;
    if (seen.has(phone)) continue;
    seen.add(phone);
    clean.push({
      campaign_id: id,
      phone,
      first_name: clip(row.first_name, 100),
      last_name: clip(row.last_name, 100),
      company: clip(row.company, 200),
      email: clip(row.email, 200),
      notes: clip(row.notes, 2000),
    });
  }

  let imported = 0;
  for (let i = 0; i < clean.length; i += 500) {
    const { data, error } = await ctx.supabase
      .from("contacts")
      .upsert(clean.slice(i, i + 500), { onConflict: "campaign_id,phone", ignoreDuplicates: true })
      .select("id");
    if (error) return Response.json({ error: error.message }, { status: 500 });
    imported += data?.length ?? 0;
  }
  return Response.json({ imported, invalid, duplicates: rows.length - invalid - imported });
}

function clip(v: unknown, max: number) {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? t.slice(0, max) : null;
}
