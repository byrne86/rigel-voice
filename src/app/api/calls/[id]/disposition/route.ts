import { getContext, isManager, isUuid } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { DISPOSITIONS } from "@/lib/types";

/** Saves the agent's outcome for a call and moves the contact on in the campaign. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: "Call not found" }, { status: 404 });
  const { disposition, notes, callbackAt } = await req.json().catch(() => ({}));

  const outcome = DISPOSITIONS.find((d) => d.value === disposition);
  if (!outcome) return Response.json({ error: "Unknown outcome" }, { status: 400 });

  // Read as the user, so row level security confirms the call is in their company.
  const { data: call } = await ctx.supabase
    .from("calls")
    .select("*, campaigns(retry_minutes, max_attempts), contacts(attempts)")
    .eq("id", id)
    .single();
  if (!call) return Response.json({ error: "Call not found" }, { status: 404 });
  if (call.agent_id !== ctx.user.id && !isManager(ctx.profile)) {
    return Response.json({ error: "This is not your call" }, { status: 403 });
  }

  const db = createAdminClient();
  const cleanNotes = typeof notes === "string" && notes.trim() ? notes.trim().slice(0, 5000) : null;
  await db.from("calls").update({ disposition, notes: cleanNotes }).eq("id", id).eq("org_id", ctx.profile.org_id);

  if (call.contact_id) {
    const update: Record<string, unknown> = { last_disposition: disposition };
    if (outcome.outcome === "dnc") {
      update.status = "dnc";
      await db
        .from("dnc_numbers")
        .upsert({ org_id: ctx.profile.org_id, phone: call.to_number, reason: "Requested on call" }, { ignoreDuplicates: true });
    } else if (outcome.outcome === "retry") {
      const attemptsLeft = (call.contacts?.attempts ?? 0) < (call.campaigns?.max_attempts ?? 3);
      const isCallback = disposition === "callback";
      update.status = attemptsLeft || isCallback ? "retry" : "completed";
      let when = new Date(Date.now() + (call.campaigns?.retry_minutes ?? 240) * 60_000);
      if (isCallback && callbackAt) {
        const asked = new Date(callbackAt);
        if (!isNaN(asked.getTime())) when = asked;
      }
      update.next_attempt_at = when.toISOString();
      // A requested call back is always honoured, even on the last attempt.
      if (isCallback && !attemptsLeft) update.attempts = Math.max(0, (call.contacts?.attempts ?? 1) - 1);
    } else {
      update.status = "completed";
    }
    await db.from("contacts").update(update).eq("id", call.contact_id).eq("org_id", ctx.profile.org_id);
  }
  return Response.json({ ok: true });
}
