import Nav from "@/components/Nav";
import { requireProfile } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireProfile();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Nav
        name={profile.full_name || profile.email || "Account"}
        org={profile.organizations?.name ?? ""}
        role={profile.role === "owner" ? "Admin" : profile.role}
      />
      <main className="flex-1 overflow-x-hidden p-5 md:p-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
