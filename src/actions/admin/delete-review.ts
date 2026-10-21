"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin/auth";
import { ADMIN_MESSAGES, type AdminActionState } from "@/lib/admin/types";
import { createClient, type ServerClient } from "@/lib/supabase/server";

/** Where the admin lands once the review is gone, with the „Șters.” notice. */
const REVIEWS_PATH = "/admin/recenzii?sters=1";

/** The hidden `id`: the table's uuid primary key. */
const idSchema = z.uuid();

/**
 * „Șterge recenzia” on /admin/recenzii/[id], for `useActionState` (PLAN PR-9).
 * Re-checks the admin role, then removes the row through the signed-in user's cookie
 * client (RLS: `admin_all`), expires the "reviews" tag and redirects to the list; only
 * an error ever comes back as state. Nothing references a review, so there is no
 * refusal to make (unlike materials and bases).
 */
export async function deleteReview(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const admin = await getAdminSession();
  if (!admin) return { status: "error", message: ADMIN_MESSAGES.forbidden };

  const parsed = idSchema.safeParse(formData.get("id"));
  if (!parsed.success) return { status: "error", message: ADMIN_MESSAGES.invalid };
  const id = parsed.data;

  let supabase: ServerClient;
  try {
    supabase = await createClient();
  } catch (err) {
    console.error("deleteReview: createClient", err);
    return { status: "error", message: ADMIN_MESSAGES.unavailable };
  }

  try {
    const { data, error } = await supabase.from("reviews").delete().eq("id", id).select("id");
    if (error) {
      console.error(`deleteReview: ${id}: ${error.message}`);
      return { status: "error", message: ADMIN_MESSAGES.generic };
    }
    // RLS filters silently: 0 rows means no admin role, or a review already gone.
    if (!data || data.length !== 1) return { status: "error", message: ADMIN_MESSAGES.forbidden };
  } catch (err) {
    console.error("deleteReview", err);
    return { status: "error", message: ADMIN_MESSAGES.generic };
  }

  updateTag("reviews");
  // redirect() throws to perform the navigation, so it stays outside the try.
  redirect(REVIEWS_PATH);
}
