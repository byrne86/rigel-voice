import { DncPanel, TeamPanel } from "@/components/SettingsPanels";
import { PageHeader } from "@/components/ui";
import { isManager, requireProfile } from "@/lib/auth";
import type { Profile } from "@/lib/types";

export default async function SettingsPage() {
  const { supabase, profile } = await requireProfile();
  const [{ data: team }, { data: dnc }] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at"),
    supabase.from("dnc_numbers").select("phone, reason, created_at").order("created_at", { ascending: false }).limit(500),
  ]);
  const manager = isManager(profile);

  return (
    <>
      <PageHeader title="Settings" subtitle={profile.organizations?.name} />

      <h2 className="mb-3 text-lg font-semibold">Team</h2>
      {manager && (
        <div className="card mb-4 text-sm">
          To add an agent, ask them to create an account and choose “Joining an existing team”, then enter this join code:
          <span className="ml-2 rounded bg-slate-100 px-2 py-1 font-mono font-semibold">{profile.organizations?.join_code}</span>
        </div>
      )}
      <TeamPanel team={(team ?? []) as Profile[]} me={profile.id} canEdit={manager} />

      <h2 className="mb-3 mt-8 text-lg font-semibold">Do not call list</h2>
      <DncPanel numbers={dnc ?? []} canEdit={manager} />
    </>
  );
}
