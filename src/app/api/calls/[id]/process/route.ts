import { after } from "next/server";
import { getContext, isManager } from "@/lib/auth";
import { processCall } from "@/lib/processing";

export const maxDuration = 300;

/** Re-runs transcription and scoring for a call (managers only). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Not signed in" }, { status: 401 });
  if (!isManager(ctx.profile)) return Response.json({ error: "Managers only" }, { status: 403 });
  const { id } = await params;

  const { data: call } = await ctx.supabase.from("calls").select("id, recording_url").eq("id", id).single();
  if (!call) return Response.json({ error: "Call not found" }, { status: 404 });
  if (!call.recording_url) return Response.json({ error: "This call has no recording" }, { status: 409 });

  await ctx.supabase.from("calls").update({ processing_status: "pending", processing_error: null }).eq("id", id);
  after(() => processCall(id));
  return Response.json({ ok: true });
}
