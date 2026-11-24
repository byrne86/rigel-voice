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

const GROUPS = [
  {
    title: "Work",
    links: [
      { href: "/", label: "Dashboard", icon: "dashboard" },
      { href: "/dialer", label: "Dialler", icon: "dialler" },
      { href: "/call-lists", label: "Call lists", icon: "lists" },
      { href: "/voicemails", label: "Voicemails", icon: "voicemail" },
      { href: "/scripts", label: "Call scripts", icon: "scripts" },
    ],
  },
  {
    title: "Insight",
    links: [
      { href: "/calls", label: "Calls", icon: "calls" },
      { href: "/reports", label: "Reports", icon: "reports" },
      { href: "/agents", label: "Agents", icon: "agents" },
      { href: "/scorecards", label: "Scorecards", icon: "scorecards" },
    ],
  },
  {
    title: "Setup",
    links: [
      { href: "/campaigns", label: "Campaigns", icon: "campaigns" },
      { href: "/ai-caller", label: "AI caller", icon: "ai" },
      { href: "/settings", label: "Settings", icon: "settings" },
    ],
  },
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
    <aside className="flex shrink-0 flex-col bg-night text-slate-300 md:sticky md:top-0 md:h-screen md:w-60">
      <div className="flex items-center gap-3 px-5 pb-4 pt-5">
        <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden="true">
          <circle cx="16" cy="16" r="15" fill="#2f5bea" />
          <path d="M16 6l2.2 7.8L26 16l-7.8 2.2L16 26l-2.2-7.8L6 16l7.8-2.2z" fill="#fff" />
          <circle cx="16" cy="16" r="2.2" fill="#f2a31b" />
        </svg>
        <div className="min-w-0">
          <div className="font-display text-[17px] font-bold leading-tight text-white">Rigel Voice</div>
          <div className="truncate text-xs text-slate-400">{org || "Call coaching"}</div>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:gap-0 md:overflow-y-auto" aria-label="Main">
        {GROUPS.map((g) => (
          <div key={g.title} className="flex gap-1 md:mb-3 md:block">
            <div className="hidden px-3 pb-1 pt-2 text-xs font-medium text-slate-500 md:block">{g.title}</div>
            {g.links.map((l) => {
              const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`group relative flex items-center gap-3 whitespace-nowrap rounded-[10px] px-3 py-[7px] text-sm font-medium transition ${
                    active ? "bg-white/[0.09] text-white" : "text-slate-300 hover:bg-white/[0.05] hover:text-white"
                  }`}
                >
                  {active && <span className="absolute left-0 top-1/2 hidden h-5 w-[3px] -translate-y-1/2 rounded-r bg-flare md:block" />}
                  <span className={active ? "text-flare" : "text-slate-400 group-hover:text-slate-200"}><Icon name={l.icon} /></span>
                  {l.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="hidden items-center gap-3 border-t border-white/10 px-5 py-4 md:flex">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/30 text-sm font-semibold text-white">
          {name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">{name}</div>
          <div className="text-xs capitalize text-slate-400">{role}</div>
        </div>
        <button onClick={signOut} className="text-xs text-slate-400 hover:text-white">Sign out</button>
      </div>
    </aside>
  );
}
