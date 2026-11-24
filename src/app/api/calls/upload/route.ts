import { after } from "next/server";
import { getContext, isManager, isUuid } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { normaliseNumber } from "@/lib/dialing";
import { processCall } from "@/lib/processing";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

/** A manager uploaded a call recording (already in storage): create the call and score it. */
export async function POST(req: Request) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Not signed in" }, { status: 401 });
  if (!isManager(ctx.profile)) return Response.json({ error: "Managers only" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const path = String(b.path ?? "");
  if (!path.startsWith(`${ctx.profile.org_id}/`) || path.includes("..")) {
    return Response.json({ error: "Invalid upload" }, { status: 400 });
  }
  const campaignId = isUuid(b.campaignId) ? b.campaignId : null;
  const agentId = isUuid(b.agentId) ? b.agentId : null;
  if (agentId) {
    const { data: agent } = await ctx.supabase.from("profiles").select("id").eq("id", agentId).maybeSingle();
    if (!agent) return Response.json({ error: "Unknown agent" }, { status: 400 });
  }
  let country = "IE";
  if (campaignId) {
    const { data: c } = await ctx.supabase.from("campaigns").select("default_country").eq("id", campaignId).maybeSingle();
    if (!c) return Response.json({ error: "Unknown campaign" }, { status: 400 });
    country = c.default_country;
  }
  const number = b.number ? normaliseNumber(String(b.number), country) : null;
  const when = b.date && !isNaN(new Date(b.date).getTime()) ? new Date(b.date).toISOString() : new Date().toISOString();

  const db = createAdminClient();
  const { data: call, error } = await db
    .from("calls")
    .insert({
      org_id: ctx.profile.org_id,
      campaign_id: campaignId,
      agent_id: agentId,
      kind: "agent",
      direction: b.direction === "inbound" ? "inbound" : "outbound",
      source: "upload",
      to_number: number,
      status: "completed",
      notes: b.customer ? `Customer: ${String(b.customer).slice(0, 120)}` : null,
      recording_storage_path: path,
      processing_status: "pending",
      created_at: when,
      started_at: when,
    })
    .select("id")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  await logActivity(ctx.profile.org_id, ctx.user.id, "recording.uploaded", { callId: call.id });
  after(() => processCall(call.id));
  return Response.json({ callId: call.id });
}
