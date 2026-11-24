"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Where an invite email lands: finishes sign-in, then asks the new agent to choose a password. */
export default function WelcomePage() {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const supabase = createClient();
    (async () => {
      if (hash.get("error_description")) {
        setError(hash.get("error_description"));
        setState("error");
        return;
      }
      const access_token = hash.get("access_token");
      const refresh_token = hash.get("refresh_token");
      if (access_token && refresh_token) {
        const { error: e } = await supabase.auth.setSession({ access_token, refresh_token });
        window.history.replaceState(null, "", window.location.pathname);
        if (e) {
          setError(e.message);
          setState("error");
          return;
        }
      }
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setError("This invite link has expired or was already used. Ask your manager to send a new one.");
        setState("error");
        return;
      }
      setState("ready");
    })();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error: e2 } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (e2) return setError(e2.message);
    await fetch("/api/activity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "signed_in" }) });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-5">
      <div className="card w-full max-w-sm">
        <h1 className="text-xl font-semibold text-brand">Welcome to Rigel Voice</h1>
        {state === "loading" && <p className="mt-3 text-sm text-slate-500">Signing you in…</p>}
        {state === "error" && (
          <>
            <p className="mt-3 text-sm text-red-700">{error}</p>
            <a href="/login" className="btn mt-4 w-full">Go to sign in</a>
          </>
        )}
        {state === "ready" && (
          <form onSubmit={save} className="mt-4 space-y-3">
            <p className="text-sm text-slate-600">Choose a password for next time. You can also sign in with Microsoft or Google if your company uses them.</p>
            <label className="label" htmlFor="pw">New password</label>
            <input id="pw" type="password" className="input" minLength={10} required value={password} onChange={(e) => setPassword(e.target.value)} />
            {error && <p className="text-sm text-red-700">{error}</p>}
            <button className="btn w-full" disabled={busy}>{busy ? "Saving…" : "Save and continue"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
