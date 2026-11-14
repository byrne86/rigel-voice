import { getContext } from "@/lib/auth";
import { DISPOSITIONS } from "@/lib/types";

/** Saves the agent's outcome for a call and moves the contact on in the campaign. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  const { disposition, notes, callbackAt } = await req.json();

  const outcome = DISPOSITIONS.find((d) => d.value === disposition);
  if (!outcome) return Response.json({ error: "Unknown outcome" }, { status: 400 });

  const { data: call } = await ctx.supabase
    .from("calls")
    .select("*, campaigns(retry_minutes, max_attempts), contacts(attempts)")
    .eq("id", id)
    .single();
  if (!call) return Response.json({ error: "Call not found" }, { status: 404 });

  await ctx.supabase.from("calls").update({ disposition, notes: notes || null }).eq("id", id);

  if (call.contact_id) {
    const update: Record<string, unknown> = { last_disposition: disposition };
    if (outcome.outcome === "dnc") {
      update.status = "dnc";
      await ctx.supabase
        .from("dnc_numbers")
        .upsert({ phone: call.to_number, reason: "Requested on call" }, { ignoreDuplicates: true });
    } else if (outcome.outcome === "retry") {
      const attemptsLeft = (call.contacts?.attempts ?? 0) < (call.campaigns?.max_attempts ?? 3);
      const isCallback = disposition === "callback";
      update.status = attemptsLeft || isCallback ? "retry" : "completed";
      const when =
        isCallback && callbackAt
          ? new Date(callbackAt)
          : new Date(Date.now() + (call.campaigns?.retry_minutes ?? 240) * 60_000);
      update.next_attempt_at = when.toISOString();
      // A requested call back is always honoured, even on the last attempt.
      if (isCallback && !attemptsLeft) update.attempts = Math.max(0, (call.contacts?.attempts ?? 1) - 1);
    } else {
      update.status = "completed";
    }
    await ctx.supabase.from("contacts").update(update).eq("id", call.contact_id);
  }
  return Response.json({ ok: true });
}
