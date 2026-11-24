import { getContext, isManager } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { createAdminClient } from "@/lib/supabase/admin";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Adds an agent by email (managers): records the invite, then emails them a sign-in link. */
export async function POST(req: Request) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Not signed in" }, { status: 401 });
  if (!isManager(ctx.profile)) return Response.json({ error: "Managers only" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const email = String(b.email ?? "").trim().toLowerCase();
  const fullName = String(b.name ?? "").trim().slice(0, 120) || null;
  const role = b.role === "manager" ? "manager" : "agent";
  if (!EMAIL.test(email)) return Response.json({ error: "Enter a valid email address" }, { status: 400 });

  const admin = createAdminClient();
  const { data: existing } = await admin.from("profiles").select("id, org_id").ilike("email", email).maybeSingle();
  if (existing) {
    return Response.json(
      { error: existing.org_id === ctx.profile.org_id ? "They're already on your team" : "That email already has a Rigel Voice account with another company" },
      { status: 409 },
    );
  }

  // Replace any earlier invite for this email, then record the new one.
  await ctx.supabase.from("invites").delete().ilike("email", email).is("accepted_at", null);
  const { error: invErr } = await ctx.supabase.from("invites").insert({ email, full_name: fullName, role });
  if (invErr) return Response.json({ error: invErr.message }, { status: 500 });

  const origin = new URL(req.url).origin;
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: `${origin}/auth/welcome`,
  });
  if (error) return Response.json({ error: `Couldn't send the invite: ${error.message}` }, { status: 502 });
  await logActivity(ctx.profile.org_id, ctx.user.id, "agent.invited", { email, role });
  return Response.json({ ok: true });
}
