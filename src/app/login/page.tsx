"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Sign-in providers switched on in Supabase, e.g. "azure,google".
const PROVIDERS = (process.env.NEXT_PUBLIC_OAUTH_PROVIDERS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [joining, setJoining] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", fullName: "", orgName: "", joinCode: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function oauth(provider: "azure" | "google") {
    setMessage(null);
    const { error } = await createClient().auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: provider === "azure" ? "email openid profile" : undefined,
      },
    });
    if (error) setMessage(error.message);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
      if (error) setMessage(error.message);
      else {
        await fetch("/api/activity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "signed_in" }) });
        router.push("/");
        router.refresh();
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            full_name: form.fullName,
            org_name: joining ? "" : form.orgName,
            join_code: joining ? form.joinCode.trim().toLowerCase() : "",
          },
        },
      });
      if (error) {
        setMessage(
          error.message.includes("Database error")
            ? "Could not create the account. If you are joining a team, check the join code."
            : error.message,
        );
      } else if (data.session) {
        router.push("/");
        router.refresh();
      } else {
        setMessage("Check your email to confirm your account, then sign in.");
        setMode("signin");
      }
    }
    setBusy(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-5">
      <div className="card w-full max-w-sm">
        <h1 className="text-xl font-semibold text-brand">Rigel Voice</h1>
        <p className="mt-1 text-sm text-slate-500">
          {mode === "signin" ? "Sign in to your account" : "Create your account"}
        </p>
        <form onSubmit={submit} className="mt-5 space-y-3">
          {mode === "signup" && (
            <>
              <div>
                <label className="label">Your name</label>
                <input className="input" required value={form.fullName} onChange={set("fullName")} />
              </div>
              {joining ? (
                <div>
                  <label className="label">Team join code</label>
                  <input className="input" required value={form.joinCode} onChange={set("joinCode")} />
                </div>
              ) : (
                <div>
                  <label className="label">Company name</label>
                  <input className="input" required value={form.orgName} onChange={set("orgName")} />
                </div>
              )}
              <button type="button" className="text-xs text-brand" onClick={() => setJoining(!joining)}>
                {joining ? "Setting up a new company instead?" : "Joining an existing team? Use a join code"}
              </button>
            </>
          )}
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" required value={form.email} onChange={set("email")} />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" required minLength={8} value={form.password} onChange={set("password")} />
          </div>
          {message && <p className="text-sm text-amber-700">{message}</p>}
          <button className="btn w-full" disabled={busy}>
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
        {PROVIDERS.length > 0 && (
          <div className="mt-5 space-y-2 border-t border-slate-200 pt-5">
            {PROVIDERS.includes("azure") && (
              <button className="btn-secondary w-full" onClick={() => oauth("azure")}>Continue with Microsoft</button>
            )}
            {PROVIDERS.includes("google") && (
              <button className="btn-secondary w-full" onClick={() => oauth("google")}>Continue with Google</button>
            )}
            <p className="text-center text-xs text-slate-500">New here? Signing in this way creates your account, or joins your team if you were invited.</p>
          </div>
        )}
        <button
          className="mt-4 text-sm text-slate-600 hover:text-slate-900"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setMessage(null);
          }}
        >
          {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
