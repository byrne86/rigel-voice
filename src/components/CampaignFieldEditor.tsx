"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Edits one text field on a campaign (script, voicemail or broadcast message). */
export default function CampaignFieldEditor({
  campaignId,
  field,
  value,
  canEdit,
  placeholder,
  rows = 6,
}: {
  campaignId: string;
  field: "script" | "voicemail_message" | "broadcast_message";
  value: string | null;
  canEdit: boolean;
  placeholder?: string;
  rows?: number;
}) {
  const router = useRouter();
  const [text, setText] = useState(value ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  if (!canEdit) {
    return <p className="whitespace-pre-wrap text-sm text-slate-700">{value || <span className="text-slate-400">Nothing set.</span>}</p>;
  }

  async function save() {
    setState("saving");
    setError(null);
    const { error } = await createClient()
      .from("campaigns")
      .update({ [field]: text.trim() || null })
      .eq("id", campaignId);
    if (error) {
      setError(error.message);
      setState("idle");
      return;
    }
    setState("saved");
    router.refresh();
  }

  return (
    <div>
      <textarea
        className="input"
        rows={rows}
        value={text}
        placeholder={placeholder}
        aria-label={field.replace("_", " ")}
        onChange={(e) => {
          setText(e.target.value);
          setState("idle");
        }}
      />
      <div className="mt-2 flex items-center gap-3">
        <button className="btn" onClick={save} disabled={state === "saving" || text === (value ?? "")}>
          {state === "saving" ? "Saving…" : "Save"}
        </button>
        {state === "saved" && <span className="text-sm text-emerald-700">Saved</span>}
        {error && <span className="text-sm text-red-700">{error}</span>}
      </div>
    </div>
  );
}
