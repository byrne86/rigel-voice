import { DncPanel } from "@/components/SettingsPanels";
import { ProcessNow, Retention, SignOutButtons } from "@/components/SettingsActions";
import { PageHeader } from "@/components/ui";
import { isManager, requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const CONNECTIONS: [string, string, string[]][] = [
  ["Database and sign-in", "Supabase", ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]],
  ["Twilio dialler", "TWILIO_ACCOUNT_SID / AUTH_TOKEN / API_KEY_SID / API_KEY_SECRET / TWIML_APP_SID", ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_API_KEY_SID", "TWILIO_API_KEY_SECRET", "TWILIO_TWIML_APP_SID"]],
  ["Transcription", "DEEPGRAM_API_KEY", ["DEEPGRAM_API_KEY"]],
  ["Anthropic (Claude)", "ANTHROPIC_API_KEY", ["ANTHROPIC_API_KEY"]],
  ["Daily housekeeping", "CRON_SECRET", ["CRON_SECRET"]],
  ["Public address", "APP_BASE_URL", ["APP_BASE_URL"]],
];

export default async function SettingsPage() {
  const { supabase, profile } = await requireProfile();
  const manager = isManager(profile);
  const admin = createAdminClient();
  const [{ data: dnc }, { data: org }, { data: pipeline }, { count: stored }, { data: oldest }, { data: lastScored }] = await Promise.all([
    supabase.from("dnc_numbers").select("phone, reason, created_at").order("created_at", { ascending: false }).limit(500),
    admin.from("organizations").select("join_code, recording_retention_days, calling_enabled").eq("id", profile.org_id).single(),
    admin.from("calls").select("processing_status").eq("org_id", profile.org_id).limit(50000),
    admin.from("calls").select("id", { count: "exact", head: true }).eq("org_id", profile.org_id).or("recording_url.not.is.null,recording_storage_path.not.is.null"),
    admin.from("calls").select("created_at").eq("org_id", profile.org_id).or("recording_url.not.is.null,recording_storage_path.not.is.null").order("created_at").limit(1),
    admin.from("scorecards").select("created_at").eq("org_id", profile.org_id).order("created_at", { ascending: false }).limit(1),
  ]);
  const counts: Record<string, number> = {};
  for (const r of pipeline ?? []) counts[r.processing_status] = (counts[r.processing_status] ?? 0) + 1;
  const fmt = (d?: string) => (d ? new Date(d).toLocaleString("en-IE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Dublin" }) : "never");

  return (
    <>
      <PageHeader title="Settings" subtitle="Accounts Rigel Voice relies on, call scoring, and who can sign in." />
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 text-lg font-bold text-night">Accounts</h2>
          <ul className="divide-y divide-slate-100">
            {CONNECTIONS.map(([name, hint, keys]) => {
              const ok = keys.every((k) => !!process.env[k]);
              return (
                <li key={name} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <div className="text-sm font-medium">{name}</div>
                    <div className="text-xs text-slate-500">{hint}</div>
                  </div>
                  <span className={`text-sm font-medium ${ok ? "text-emerald-700" : "text-red-700"}`}>{ok ? "Connected" : "Not set up"}</span>
                </li>
              );
            })}
            <li className="flex items-center justify-between gap-3 py-2.5">
              <div>
                <div className="text-sm font-medium">Calling for {profile.organizations?.name}</div>
                <div className="text-xs text-slate-500">We switch this on once your account is checked</div>
              </div>
              <span className={`text-sm font-medium ${org?.calling_enabled ? "text-emerald-700" : "text-amber-700"}`}>{org?.calling_enabled ? "On" : "Waiting"}</span>
            </li>
          </ul>
          <p className="mt-3 text-xs text-slate-500">Scored by {process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5"}. Calls shorter than {process.env.MIN_SCORING_SECONDS ?? 20} seconds aren&apos;t scored.</p>
        </section>

        <section className="card">
          <h2 className="mb-1 text-lg font-bold text-night">Scoring</h2>
          <p className="text-sm text-slate-600">Last call marked {fmt(lastScored?.[0]?.created_at)}.</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {[["pending", "Waiting"], ["transcribing", "Transcribing"], ["scoring", "Marking"], ["done", "Done"], ["skipped", "Too short"], ["failed", "Failed"]].map(([k, l]) => (
              <span key={k} className={`badge ${k === "failed" && counts[k] ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700"}`}>{l} {counts[k] ?? 0}</span>
            ))}
          </div>
          {manager && <div className="mt-4"><ProcessNow /></div>}
        </section>

        <section className="card">
          <h2 className="mb-1 text-lg font-bold text-night">Keeping recordings</h2>
          <p className="mb-3 text-sm text-slate-600">
            Older recordings are removed for good each night, from Twilio too. You keep the transcripts and scores.
          </p>
          {manager ? <Retention days={org?.recording_retention_days ?? null} /> : <p className="text-sm">{org?.recording_retention_days ? `${org.recording_retention_days} days` : "Kept forever"}</p>}
          <p className="mt-3 text-xs text-slate-500">You have {stored ?? 0} recordings{oldest?.[0] ? `, going back to ${fmt(oldest[0].created_at)}` : ""}.</p>
        </section>

        <section className="card">
          <h2 className="mb-1 text-lg font-bold text-night">Signing in</h2>
          <p className="mb-3 text-sm text-slate-600">
            People can use a password, or their Microsoft or Google account. Those accounts bring their own two-step checks with them.
          </p>
          <SignOutButtons manager={manager} />
        </section>

        {manager && (
          <section className="card">
            <h2 className="mb-1 text-lg font-bold text-night">Join code</h2>
            <p className="text-sm text-slate-600">
              Inviting people from Agents is easiest. They can also sign up and type this code:
              <span className="ml-2 rounded bg-slate-100 px-2 py-1 font-mono font-semibold">{org?.join_code}</span>
            </p>
          </section>
        )}
      </div>

      <h2 className="mb-3 mt-8 text-lg font-bold text-night">Never call these numbers</h2>
      <DncPanel numbers={dnc ?? []} canEdit={manager} />
    </>
  );
}
