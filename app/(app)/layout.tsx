import { BottomNav } from "@/components/bottom-nav";
import { displayLogin } from "@/lib/username";
import { AppProvider } from "@/components/providers";
import { supabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NotInvited } from "./not-invited";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await sb
    .from("fin_profiles")
    .select("id,email,name,role,color,active")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !profile.active) return <NotInvited email={displayLogin(user.email)} />;

  return (
    <AppProvider profile={profile}>
      <div className="mx-auto w-full max-w-lg min-h-dvh pb-24">{children}</div>
      <BottomNav />
    </AppProvider>
  );
}
