"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/dialer", label: "Dialer" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/calls", label: "Calls" },
  { href: "/scorecards", label: "Scorecards" },
  { href: "/settings", label: "Settings" },
];

export default function Nav({ name, org }: { name: string; org: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex shrink-0 flex-col border-b border-slate-200 bg-white md:h-screen md:w-56 md:border-b-0 md:border-r">
      <div className="px-5 py-4">
        <div className="text-lg font-semibold tracking-tight text-brand">Rigel Voice</div>
        <div className="truncate text-xs text-slate-500">{org}</div>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:pb-0">
        {LINKS.map((l) => {
          const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
                active ? "bg-indigo-50 text-brand" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
      <div className="hidden border-t border-slate-200 p-4 md:block">
        <div className="truncate text-sm font-medium">{name}</div>
        <button onClick={signOut} className="mt-1 text-xs text-slate-500 hover:text-slate-900">
          Sign out
        </button>
      </div>
    </aside>
  );
}
