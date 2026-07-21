import { createClient as createSupabaseClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createClient as createCookieClient } from "@/lib/supabase/server";

// API routes are called from two kinds of clients:
//  - the web app, which authenticates via Supabase session cookies
//  - the mobile app, which sends `Authorization: Bearer <supabase access token>`
// Returns a client scoped to the caller (RLS applies) plus the resolved user.
export async function authenticateRequest(
  request: Request
): Promise<{ supabase: SupabaseClient; user: User } | null> {
  const authHeader = request.headers.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length);
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      }
    );
    const {
      data: { user },
    } = await supabase.auth.getUser(token);
    if (!user) return null;
    return { supabase, user };
  }

  const supabase = await createCookieClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, user };
}
