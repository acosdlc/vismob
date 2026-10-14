import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

// Only the signed-in areas need a session refresh. The public site stays static.
export const config = {
  matcher: ["/admin/:path*", "/auth/:path*"],
};
