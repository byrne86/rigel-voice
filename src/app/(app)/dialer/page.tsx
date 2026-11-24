import Dialer from "@/components/Dialer";
import { PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import type { Campaign, CallList, VoicemailDrop } from "@/lib/types";

export default async function DialerPage({ searchParams }: { searchParams: Promise<{ campaign?: string; list?: string }> }) {
  const { campaign, list } = await searchParams;
  const { supabase, profile } = await requireProfile();
  const [{ data: campaigns }, { data: lists }, { data: drops }] = await Promise.all([
    supabase.from("campaigns").select("*").eq("mode", "agent").eq("status", "active").order("name"),
    supabase.from("call_lists").select("*").order("created_at", { ascending: false }),
    supabase.from("voicemail_drops").select("*").order("name"),
  ]);
  const mine = ((lists ?? []) as CallList[]).filter((l) => !l.agent_id || l.agent_id === profile.id);
  const ready = await Promise.all(
    mine.map(
      async (l) =>
        (await supabase.from("contacts").select("id", { count: "exact", head: true }).eq("list_id", l.id).in("status", ["pending", "retry"]))
          .count ?? 0,
    ),
  );

  return (
    <>
      <PageHeader title="Dialler" subtitle="Type a number or work through a list. Every call is recorded, transcribed and scored." />
      {(campaigns ?? []).length === 0 ? (
        <div className="card text-sm text-slate-600">You need an active campaign before you can call. Add one under Campaigns.</div>
      ) : (
        <Dialer
          me={{ id: profile.id, name: profile.full_name || profile.email || "You" }}
          campaigns={(campaigns ?? []) as Campaign[]}
          lists={mine.map((l, i) => ({ ...l, ready: ready[i] }))}
          drops={(drops ?? []) as VoicemailDrop[]}
          initialCampaignId={campaign}
          initialListId={list}
        />
      )}
    </>
  );
}
