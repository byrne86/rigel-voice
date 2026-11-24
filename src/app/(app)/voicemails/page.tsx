import Link from "next/link";
import VoicemailLibrary from "@/components/VoicemailLibrary";
import { Empty, PageHeader, one } from "@/components/ui";
import { isManager, requireProfile } from "@/lib/auth";
import { contactName, type VoicemailDrop } from "@/lib/types";

export default async function VoicemailsPage() {
  const { supabase, profile } = await requireProfile();
  const [{ data: drops }, { data: campaigns }, { data: calls }] = await Promise.all([
    supabase.from("voicemail_drops").select("*").order("is_default", { ascending: false }).order("name"),
    supabase.from("campaigns").select("name, voicemail_drop_id").eq("mode", "agent"),
    supabase
      .from("calls")
      .select("id, created_at, to_number, kind, voicemail_drop_id, campaigns(name), contacts(first_name, last_name, phone), profiles(full_name, email), voicemail_drops(name)")
      .or("voicemail_drop_id.not.is.null,disposition.eq.voicemail,answered_by.like.machine%")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const list = (drops ?? []) as VoicemailDrop[];
  const fallback = list.find((d) => d.is_default)?.id;
  const usage: Record<string, string[]> = {};
  for (const c of campaigns ?? []) {
    const id = c.voicemail_drop_id ?? fallback;
    if (id) (usage[id] ??= []).push(c.name);
  }

  return (
    <>
      <PageHeader
        title="Voicemails"
        subtitle="Your voicemail drops. When an agent reaches an answering machine they click “Drop voicemail” and move on; the message is left for them."
      />
      <VoicemailLibrary drops={list} usage={usage} orgId={profile.org_id} canEdit={isManager(profile)} />

      <h2 className="mb-3 mt-10 text-lg font-semibold">Recently left</h2>
      {(calls ?? []).length === 0 ? (
        <Empty>No voicemails left yet.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="th">When</th>
                <th className="th">Contact</th>
                <th className="th">Campaign</th>
                <th className="th">Voicemail</th>
                <th className="th">Agent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(calls ?? []).map((c) => {
                const agent = one(c.profiles);
                return (
                  <tr key={c.id}>
                    <td className="td whitespace-nowrap">
                      <Link href={`/calls/${c.id}`} className="text-brand hover:underline">
                        {new Date(c.created_at).toLocaleString("en-IE", { dateStyle: "short", timeStyle: "short" })}
                      </Link>
                    </td>
                    <td className="td">{contactName(one(c.contacts) ?? { phone: c.to_number })}</td>
                    <td className="td">{one(c.campaigns)?.name ?? "—"}</td>
                    <td className="td">{one(c.voicemail_drops)?.name ?? (c.kind === "broadcast" ? "AI caller message" : "—")}</td>
                    <td className="td">{c.kind === "broadcast" ? "AI caller" : agent?.full_name || agent?.email || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
