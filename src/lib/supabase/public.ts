import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabasePublishableKey, supabaseUrl } from "./env";

// The cookie-less publishable client for the cached content readers in
// src/lib/data (docs/PLAN.md PR-5). Row level security applies, so it sees only
// the public_read rows. It touches no request data, which is what makes it safe
// inside a "use cache" scope: server.ts (the cookie client) must never be
// imported from src/lib/data. Create one per call; it holds no session.
export function createPublicClient() {
  return createClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type PublicClient = ReturnType<typeof createPublicClient>;
