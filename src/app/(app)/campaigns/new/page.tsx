import { redirect } from "next/navigation";

export default async function NewCampaignPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  redirect(mode === "broadcast" ? "/ai-caller" : "/campaigns");
}
