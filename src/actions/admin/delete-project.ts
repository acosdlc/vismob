"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/auth";
import { isMediaPath, MEDIA_BUCKET, mediaSlug, removeMediaObject } from "@/lib/admin/media";
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
 * "Every photo object" is the rows' paths plus whatever else the bucket holds under the
 * project's id (uploadedObjects): the confirmation says „și pozele lui”.
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

  // A Set: an object the listing names and a row stored goes once.
  const paths = new Set(photos.data.map((photo) => photo.path));
  for (const path of await uploadedObjects(supabase, id)) paths.add(path);
  for (const path of paths) {
    await removeMediaObject(supabase.storage, path);
  }
  return { ok: true };
}

/**
 * The objects PhotoField uploaded for this project, on a row or not. The field uploads at
 * the pick, so a photo that was picked and never saved sits in the public bucket with no
 * row to name it, and this delete is the last that can know it belonged here. Only the
 * project's own screen uploads under its id (`projects/<id>-<stamp>.webp`, mediaObjectPath),
 * so the name tells whose an object is. Best effort, like the removal itself: a listing
 * that fails is logged and the rows' paths go alone.
 */
async function uploadedObjects(supabase: ServerClient, id: string): Promise<string[]> {
  // As the names carry it: mediaObjectPath lowercases the id, and a posted uuid may be in capitals.
  const prefix = `${mediaSlug(id)}-`;
  try {
    const { data, error } = await supabase.storage.from(MEDIA_BUCKET).list("projects", { search: prefix, limit: 1000 });
    if (error) {
      console.error(`deleteProject: could not list the objects of ${id}: ${error.message}`);
      return [];
    }
    // `search` only narrows the listing; whose the object is and what made it are checked here.
    return data
      .filter((object) => object.name.startsWith(prefix))
      .map((object) => `projects/${object.name}`)
      .filter((path) => isMediaPath(path, "projects"));
  } catch (err) {
    console.error(`deleteProject: could not list the objects of ${id}`, err);
    return [];
  }
}
