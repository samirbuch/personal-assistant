import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

export default class UserContextualSupabase {

  public readonly client: SupabaseClient;

  constructor(req: Bun.BunRequest) {

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      throw new Error("Missing supabase env variables");
    }

    const c = createServerClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            const cookies: { name: string, value: string }[] = [];
            for (const c of req.cookies) {
              console.log("cookie:", c);
              cookies.push({
                name: c[0],
                value: c[1]
              });
            }
            return cookies;
          },
          // Not supported. Okay to omit.
          // setAll(cookiesToSet) {
          //   cookiesToSet.forEach(({ name, value }) =>
          //     res.appendHeader('Set-Cookie', serializeCookieHeader(name, value))
          //   )
          // },
          // IMPORTANT: Because we're not setting cookies, it's extremely important
          // that we do not call any supabase auth methods that modify the user.
          // Please offload all user modification to the frontend, or use the
          // supabase.auth.admin namespace with the service_role key.
        },
      }
    );

    this.client = c;
  }

}