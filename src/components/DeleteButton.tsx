"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Small confirm-then-delete link for table rows. */
export default function DeleteButton({ url, confirmText, label = "Delete" }: { url: string; confirmText: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="text-xs text-red-700 hover:underline disabled:opacity-50"
      disabled={busy}
      onClick={async () => {
        if (!window.confirm(confirmText)) return;
        setBusy(true);
        const res = await fetch(url, { method: "DELETE" });
        setBusy(false);
        if (!res.ok) window.alert((await res.json().catch(() => ({}))).error ?? "Could not delete");
        router.refresh();
      }}
    >
      {label}
    </button>
  );
}
