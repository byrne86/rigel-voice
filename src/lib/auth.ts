import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { Profile } from "./types";

/** For pages: returns the signed-in user's profile or sends them to /login. */
export async function requireProfile() {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/** For API routes: returns null when the caller is not signed in. */
export async function getContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("*, organizations(id, name, join_code)")
    .eq("id", user.id)
    .single();
  if (!profile) return null;
  return { supabase, user, profile: profile as Profile };
}

export function isManager(profile: Profile) {
  return profile.role === "owner" || profile.role === "manager";
}
