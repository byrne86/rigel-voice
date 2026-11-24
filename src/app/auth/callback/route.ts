import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";

/** Where the confirmation email link lands: finishes sign-in, then opens the app. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const supabase = await createClient();

  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  }

  if (ok) {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      const { data: p } = await supabase.from("profiles").select("org_id").eq("id", data.user.id).maybeSingle();
      if (p) await logActivity(p.org_id, data.user.id, "signed_in", { via: code ? "link or provider" : "email link" });
    }
  }

  const dest = url.clone();
  dest.search = "";
  dest.pathname = ok ? "/" : "/login";
  return NextResponse.redirect(dest);
}
