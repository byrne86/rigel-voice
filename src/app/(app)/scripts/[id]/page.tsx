import Link from "next/link";
import { notFound } from "next/navigation";
import ScriptEditor from "@/components/ScriptEditor";
import { PageHeader } from "@/components/ui";
import { isManager, requireProfile } from "@/lib/auth";
import type { Campaign } from "@/lib/types";

export default async function ScriptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, profile } = await requireProfile();
  const { data } = await supabase.from("campaigns").select("*").eq("id", id).single();
  if (!data) notFound();
  const c = data as Campaign;
  const manager = isManager(profile);
  if (!manager && c.script_status !== "approved") notFound();

  return (
    <>
      <PageHeader title={`Script: ${c.name}`}>
        <Link href="/scripts" className="btn-secondary">All scripts</Link>
      </PageHeader>
      {manager ? (
        <ScriptEditor campaign={c} />
      ) : (
        <div className="space-y-5">
          <section className="card">
            <h2 className="font-semibold">Call flow</h2>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">{c.script_flow.map((s, i) => <li key={i}>{s}</li>)}</ol>
          </section>
          {c.script && <section className="card whitespace-pre-wrap text-sm">{c.script}</section>}
          <section className="card">
            <h2 className="font-semibold">If they say…</h2>
            {c.script_objections.map((o, i) => (
              <div key={i} className="mt-3 text-sm"><div className="font-medium">{o.objection}</div><p className="text-slate-700">{o.answer}</p></div>
            ))}
          </section>
        </div>
      )}
    </>
  );
}
