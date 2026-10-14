import { createBrowserClient } from "@supabase/ssr";
import { supabasePublishableKey, supabaseUrl } from "./env";

// Browser client for Client Components. createBrowserClient keeps one instance.
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabasePublishableKey());
}
