import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";
import type { Database } from "./database.types";
import { supabaseUrl } from "./env";

// The secret-key client: bypasses row level security, so it stays on the server
// (leads, uploads, notifications). Create one per request; never cache it.
export function createAdminClient() {
  return createClient<Database>(supabaseUrl(), requireEnv("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type AdminClient = ReturnType<typeof createAdminClient>;
