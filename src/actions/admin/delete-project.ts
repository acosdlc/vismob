"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/auth";
import { removeMediaObject } from "@/lib/admin/media";
import { isUuid } from "@/lib/admin/projects";
import { ADMIN_MESSAGES, type AdminActionState } from "@/lib/admin/types";
import { createClient, type ServerClient } from "@/lib/supabase/server";

/** Where the admin lands once the project is gone, with the „Șters.” notice. */
const PROJECTS_PATH = "/admin/lucrari?sters=1";

type Outcome = { ok: true } | { ok: false; state: AdminActionState };

const refused = (message: string): Outcome => ({ ok: false, state: { status: "error", message } });

/**
 * „Șterge proiectul” on /admin/lucrari/[id], for `useActionState` (PLAN PR-9). Re-checks
 * the admin role, reads the project and the paths of its photos, deletes the row through
 * the signed-in user's cookie client (RLS: `admin_all`; `project_photos` cascades), then
 * removes every photo object (best effort: the rows are already gone), expires the
 * "projects" tag and redirects to the overview; only an error ever comes back as state.
 * The row goes before the objects so a refused delete leaves the project whole.
 */
export async function deleteProject(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const admin = await getAdminSession();
  if (!admin) return { status: "error", message: ADMIN_MESSAGES.forbidden };

  const id = formData.get("id");
  if (!isUuid(id)) return { status: "error", message: ADMIN_MESSAGES.invalid };

  let supabase: ServerClient;
  try {
    supabase = await createClient();
  } catch (err) {
    console.error("deleteProject: createClient", err);
    return { status: "error", message: ADMIN_MESSAGES.unavailable };
  }

  let outcome: Outcome;
  try {
    outcome = await removeProject(supabase, id);
  } catch (err) {
    console.error("deleteProject", err);
    return { status: "error", message: ADMIN_MESSAGES.generic };
  }
  if (!outcome.ok) return outcome.state;

  updateTag("projects");
  // redirect() throws to perform the navigation, so it stays outside the try.
  redirect(PROJECTS_PATH);
}

async function removeProject(supabase: ServerClient, id: string): Promise<Outcome> {
  const project = await supabase.from("projects").select("id").eq("id", id).maybeSingle();
  if (project.error) throw new Error(`projects ${id}: ${project.error.message}`);
  if (!project.data) return refused(ADMIN_MESSAGES.notFound);

  // Read before the delete: the cascade takes the rows, and with them the paths.
  const photos = await supabase.from("project_photos").select("path").eq("project_id", id);
  if (photos.error) throw new Error(`project_photos of ${id}: ${photos.error.message}`);

  const { data, error } = await supabase.from("projects").delete().eq("id", id).select("id");
  if (error) {
    console.error(`deleteProject: ${error.message}`);
    return refused(ADMIN_MESSAGES.generic);
  }
  // RLS filters silently: 0 rows means no admin role or a project already gone.
  if (!data || data.length !== 1) return refused(ADMIN_MESSAGES.forbidden);

  for (const photo of photos.data) {
    await removeMediaObject(supabase.storage, photo.path);
  }
  return { ok: true };
}
