import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component: proxy.ts refreshes sessions instead.
          }
        },
      },
    },
  );
}

/** Resolve the signed-in finance user, or null. */
export async function currentUser() {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const { data: profile } = await sb
    .from("fin_profiles")
    .select("id,email,name,role,color,active")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !profile.active) return null;
  return { sb, user, profile };
}
