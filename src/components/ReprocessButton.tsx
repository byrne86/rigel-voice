"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ReprocessButton({ callId }: { callId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "started">("idle");
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setState("busy");
    setError(null);
    const res = await fetch(`/api/calls/${callId}/process`, { method: "POST" });
    if (!res.ok) {
      setError((await res.json()).error ?? "Failed");
      setState("idle");
      return;
    }
    setState("started");
    setTimeout(() => router.refresh(), 20000);
  }

  return (
    <div>
      <button className="btn-secondary" onClick={run} disabled={state !== "idle"}>
        {state === "started" ? "Scoring started — refresh shortly" : state === "busy" ? "Starting…" : "Re-run transcript and score"}
      </button>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
