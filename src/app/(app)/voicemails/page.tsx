import Link from "next/link";
import CampaignFieldEditor from "@/components/CampaignFieldEditor";
import { Empty, PageHeader, one } from "@/components/ui";
import { isManager, requireProfile } from "@/lib/auth";
import { contactName, type Campaign } from "@/lib/types";

export default async function VoicemailsPage() {
  const { supabase, profile } = await requireProfile();
  const [{ data: campaigns }, { data: calls }] = await Promise.all([
    supabase.from("campaigns").select("*").eq("mode", "agent").order("name"),
    supabase
      .from("calls")
      .select("id, created_at, to_number, kind, disposition, answered_by, campaigns(name), contacts(first_name, last_name, phone)")
      .or("disposition.eq.voicemail,answered_by.like.machine%")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  const manager = isManager(profile);

  return (
    <>
      <PageHeader
        title="Voicemails"
        subtitle="The message the AI voice leaves when an agent clicks “Drop voicemail” in the dialler"
      />
      {(campaigns ?? []).length === 0 ? (
        <Empty>No dialler campaigns yet.</Empty>
      ) : (
        <div className="space-y-5">
          {((campaigns ?? []) as Campaign[]).map((c) => (
            <section key={c.id} className="card">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="font-semibold">{c.name}</h2>
                <span className="text-xs text-slate-500">Voice: {c.tts_voice.replace("Polly.", "").replace("-Neural", "")}</span>
              </div>
              <CampaignFieldEditor
                campaignId={c.id}
                field="voicemail_message"
                value={c.voicemail_message}
                canEdit={manager}
                rows={3}
                placeholder="Hi {{first_name}}, this is Sarah from Acme. Sorry I missed you, I'll try again later, or call us back on …"
              />
            </section>
          ))}
          <p className="text-xs text-slate-500">
            Use {"{{first_name}}"}, {"{{last_name}}"} and {"{{company}}"} to personalise. Change the voice in the campaign’s settings.
          </p>
        </div>
      )}

      <h2 className="mb-3 mt-8 text-lg font-semibold">Recent voicemails left</h2>
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
                <th className="th">Left by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(calls ?? []).map((c) => (
                <tr key={c.id}>
                  <td className="td whitespace-nowrap">
                    <Link href={`/calls/${c.id}`} className="text-brand hover:underline">
                      {new Date(c.created_at).toLocaleString("en-IE", { dateStyle: "short", timeStyle: "short" })}
                    </Link>
                  </td>
                  <td className="td">{contactName(one(c.contacts) ?? { phone: c.to_number })}</td>
                  <td className="td">{one(c.campaigns)?.name ?? "—"}</td>
                  <td className="td">{c.kind === "broadcast" ? "AI caller" : "Voicemail drop"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
