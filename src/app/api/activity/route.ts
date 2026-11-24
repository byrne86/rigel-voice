import { getContext } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

/** Lets the browser record a sign-in in the activity log. */
export async function POST(req: Request) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { action } = await req.json().catch(() => ({}));
  if (action !== "signed_in" && action !== "signed_out_everywhere") return Response.json({ error: "Unknown action" }, { status: 400 });
  await logActivity(ctx.profile.org_id, ctx.user.id, action, {
    ip: req.headers.get("x-forwarded-for")?.split(",")[0] ?? null,
    agent: req.headers.get("user-agent")?.slice(0, 200) ?? null,
  });
  return Response.json({ ok: true });
}
