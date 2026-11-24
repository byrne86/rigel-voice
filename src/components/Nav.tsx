"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Simple stroke icons (24x24 grid).
const ICONS: Record<string, string> = {
  dashboard: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
  dialler: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z",
  lists: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  voicemail: "M6.5 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM17.5 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM6.5 15.5h11",
  scripts: "M7 3h7l5 5v13H7zM14 3v5h5M10 12h6M10 16h6",
  ai: "M12 3v3M8 7h8a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3zM9.5 12h.01M14.5 12h.01M9.5 15.5h5",
  reports: "M5 20V10M12 20V4M19 20v-7",
  calls: "M4 6h16M4 12h16M4 18h10",
  agents: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a6 6 0 0 1 3 6",
  scorecards: "M5 4h14v16H5zM9 12l2 2 4-4",
  campaigns: "M4 10v4h3l6 4V6L7 10zM17 9a4 4 0 0 1 0 6",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.8 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.8-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.8H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.8-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.8 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.8H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
};

const LINKS = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/dialer", label: "Dialler", icon: "dialler" },
  { href: "/call-lists", label: "Call lists", icon: "lists" },
  { href: "/voicemails", label: "Voicemails", icon: "voicemail" },
  { href: "/scripts", label: "Call scripts", icon: "scripts" },
  { href: "/ai-caller", label: "AI caller", icon: "ai" },
  { href: "/reports", label: "Reports", icon: "reports" },
  { href: "/calls", label: "Calls", icon: "calls" },
  { href: "/agents", label: "Agents", icon: "agents" },
  { href: "/scorecards", label: "Scorecards", icon: "scorecards" },
  { href: "/campaigns", label: "Campaigns", icon: "campaigns" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export function Icon({ name, className = "h-[18px] w-[18px]" }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

export default function Nav({ name, org, role }: { name: string; org: string; role: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex shrink-0 flex-col bg-[#1e1b4b] text-indigo-100 md:sticky md:top-0 md:h-screen md:w-60">
      <div className="px-6 pb-4 pt-6">
        <div className="flex items-center gap-2.5">
          <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true">
            <rect width="32" height="32" rx="8" fill="#6366f1" />
            <path d="M8 20a8 8 0 0 1 16 0" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
            <path d="M16 20l5-6" stroke="#fbbf24" strokeWidth="2.6" strokeLinecap="round" />
          </svg>
          <div className="text-lg font-bold tracking-wide text-white">RIGEL VOICE</div>
        </div>
        <div className="mt-1 truncate text-[11px] font-medium uppercase tracking-wider text-indigo-300">{org || "Call coach"}</div>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-y-auto">
        {LINKS.map((l) => {
          const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                active ? "bg-white/15 text-white" : "text-indigo-200 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon name={l.icon} />
              {l.label}
            </Link>
          );
        })}
      </nav>
      <div className="hidden items-end justify-between border-t border-white/10 px-6 py-4 md:flex">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{name}</div>
          <div className="text-xs capitalize text-indigo-300">{role}</div>
        </div>
        <button onClick={signOut} className="text-xs text-indigo-300 hover:text-white">Sign out</button>
      </div>
    </aside>
  );
}
