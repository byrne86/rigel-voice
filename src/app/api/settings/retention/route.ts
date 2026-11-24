import { getContext, isManager } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED = [null, 30, 90, 180, 365, 730];

/** Sets how long call recordings are kept (managers). */
export async function PUT(req: Request) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Not signed in" }, { status: 401 });
  if (!isManager(ctx.profile)) return Response.json({ error: "Managers only" }, { status: 403 });
  const { days } = await req.json().catch(() => ({}));
  const value = days === null || days === "" ? null : Number(days);
  if (!ALLOWED.includes(value)) return Response.json({ error: "Choose one of the options" }, { status: 400 });
  await createAdminClient().from("organizations").update({ recording_retention_days: value }).eq("id", ctx.profile.org_id);
  await logActivity(ctx.profile.org_id, ctx.user.id, "settings.retention", { days: value });
  return Response.json({ ok: true });
}
