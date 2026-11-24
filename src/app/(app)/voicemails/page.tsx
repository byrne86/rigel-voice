import VoicemailLibrary from "@/components/VoicemailLibrary";
import { PageHeader } from "@/components/ui";
import { isManager, requireProfile } from "@/lib/auth";
import type { VoicemailDrop } from "@/lib/types";

export default async function VoicemailsPage() {
  const { supabase, profile } = await requireProfile();
  const [{ data: drops }, { data: campaigns }, { data: team }] = await Promise.all([
    supabase.from("voicemail_drops").select("*").order("created_at", { ascending: false }),
    supabase.from("campaigns").select("id, name").eq("mode", "agent").order("name"),
    supabase.from("profiles").select("id, full_name, email"),
  ]);
  const people = Object.fromEntries((team ?? []).map((p) => [p.id, p.full_name || p.email || "Agent"]));

  return (
    <>
      <PageHeader
        title="Voicemails"
        subtitle="Pre-recorded messages for answering machines. Leave one with a single click in the dialler, then get on with your next call."
      />
      <VoicemailLibrary
        drops={(drops ?? []) as VoicemailDrop[]}
        campaigns={campaigns ?? []}
        people={people}
        me={profile.id}
        orgId={profile.org_id}
        manager={isManager(profile)}
      />
    </>
  );
}
