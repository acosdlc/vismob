"use server";

import { updateTag } from "next/cache";
import { getAdminSession } from "@/lib/admin/auth";
import { ADMIN_MESSAGES, type AdminActionState } from "@/lib/admin/types";
import { parsePricingForm } from "@/lib/configurator/pricing-schema";
import type { Json } from "@/lib/supabase/database.types";
import { createClient, type ServerClient } from "@/lib/supabase/server";

/**
 * „Salvează” on /admin/preturi (PLAN PR-8), for `useActionState`. Re-checks the admin
 * role, validates the whole grid, writes `pricing` row 1 (insert or update: the row
 * does not exist until the workshop's first save) through the signed-in user's
 * cookie client (RLS: `admin_all`), then expires the "pricing" tag so the site
 * prices with the new grid on its next request (ARHITECTURA §8).
 */
export async function savePricing(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const admin = await getAdminSession();
  if (!admin) return { status: "error", message: ADMIN_MESSAGES.forbidden };

  const parsed = parsePricingForm(formData);
  if (!parsed.ok) return { status: "error", message: ADMIN_MESSAGES.invalid, fieldErrors: parsed.fieldErrors };

  let supabase: ServerClient;
  try {
    supabase = await createClient();
  } catch (err) {
    console.error("savePricing: createClient", err);
    return { status: "error", message: ADMIN_MESSAGES.unavailable };
  }

  try {
    const { data, error } = await supabase
      .from("pricing")
      // Pricing is an interface (no index signature), so it needs the cast into Json.
      .upsert({ id: 1, data: parsed.data as unknown as Json, updated_at: new Date().toISOString() })
      .select("id");
    if (error) {
      console.error(`savePricing: ${error.message}`);
      return { status: "error", message: ADMIN_MESSAGES.generic };
    }
    // RLS does not refuse an update it filters out: without the admin role the
    // statement touches 0 rows and comes back without an error.
    if (!data || data.length !== 1) return { status: "error", message: ADMIN_MESSAGES.forbidden };
  } catch (err) {
    console.error("savePricing", err);
    return { status: "error", message: ADMIN_MESSAGES.generic };
  }

  updateTag("pricing");
  return { status: "ok", message: ADMIN_MESSAGES.saved };
}
