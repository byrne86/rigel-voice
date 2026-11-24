import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, one } from "@/components/ui";
import { isManager, requireProfile } from "@/lib/auth";

const LABELS: Record<string, string> = {
  signed_in: "Signed in",
  signed_out_everywhere: "Signed out on all devices",
  signed_out_everyone: "Signed everyone out",
  "agent.invited": "Invited an agent",
  "agent.access_changed": "Changed someone's access",
  "agent.removed": "Removed someone from the team",
  "script.saved": "Saved a script draft",
  "script.approved": "Approved a script",
  "call_list.created": "Created a call list",
  "call_list.deleted": "Deleted a call list",
  "recording.uploaded": "Uploaded a recording",
  "settings.retention": "Changed recording retention",
};

export default async function ActivityPage() {
  const { supabase, profile } = await requireProfile();
  if (!isManager(profile)) notFound();
  const { data } = await supabase
    .from("activity_log")
    .select("id, action, detail, created_at, profiles(full_name, email)")
    .order("created_at", { ascending: false })
    .limit(300);

  return (
    <>
      <PageHeader title="Who did what" subtitle="Sign-ins and changes across your team, newest first.">
        <Link href="/settings" className="btn-secondary">Back to settings</Link>
      </PageHeader>
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-slate-200">
            <tr><th className="th">When</th><th className="th">Who</th><th className="th">What</th><th className="th">Details</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(data ?? []).map((a) => {
              const who = one(a.profiles);
              const d = a.detail as Record<string, unknown>;
              return (
                <tr key={a.id}>
                  <td className="td whitespace-nowrap">{new Date(a.created_at).toLocaleString("en-IE", { timeZone: "Europe/Dublin" })}</td>
                  <td className="td">{who?.full_name || who?.email || "—"}</td>
                  <td className="td">{LABELS[a.action] ?? a.action}</td>
                  <td className="td text-xs text-slate-500">
                    {Object.entries(d ?? {}).filter(([k]) => k !== "agent").map(([k, v]) => `${k}: ${v}`).join(" · ")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
