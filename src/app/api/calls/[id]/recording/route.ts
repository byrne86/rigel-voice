import { getContext, isUuid } from "@/lib/auth";
import { isTwilioRecordingUrl } from "@/lib/twilio";

/** Streams a call recording to signed-in members of the organisation that owns it. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  if (!ctx) return new Response("Not signed in", { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });

  // Row level security means this only finds calls in the user's own organisation.
  const { data: call } = await ctx.supabase.from("calls").select("recording_url, recording_storage_path").eq("id", id).single();
  if (call?.recording_storage_path) {
    // Uploaded recording: hand out a short-lived private link.
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { data: signed } = await createAdminClient().storage.from("recordings").createSignedUrl(call.recording_storage_path, 300);
    return signed?.signedUrl ? Response.redirect(signed.signedUrl, 302) : new Response("Not found", { status: 404 });
  }
  if (!isTwilioRecordingUrl(call?.recording_url)) return new Response("Not found", { status: 404 });

  const auth = Buffer.from(
    `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`,
  ).toString("base64");
  const headers: Record<string, string> = { Authorization: `Basic ${auth}` };
  const range = req.headers.get("range");
  if (range) headers.Range = range;

  const upstream = await fetch(`${call.recording_url}.mp3`, { headers });
  if (!upstream.ok && upstream.status !== 206) return new Response("Recording unavailable", { status: 502 });

  const out = new Headers({ "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" });
  for (const h of ["content-length", "content-range", "accept-ranges"]) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
