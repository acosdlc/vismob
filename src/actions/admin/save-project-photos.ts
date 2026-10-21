"use server";

import { refresh, updateTag } from "next/cache";
import { getAdminSession } from "@/lib/admin/auth";
import { removeMediaObject } from "@/lib/admin/media";
import { isUuid, parseProjectPhotosForm, type ProjectPhotosInput } from "@/lib/admin/projects";
import { ADMIN_MESSAGES, type AdminActionState } from "@/lib/admin/types";
import { createClient, type ServerClient } from "@/lib/supabase/server";

type Outcome = { ok: true } | { ok: false; state: AdminActionState };

const refused = (message: string): Outcome => ({ ok: false, state: { status: "error", message } });

/**
 * „Salvează pozele” on /admin/lucrari/[id], for `useActionState` (PLAN PR-9 „Lucrări”:
 * upload, order, delete, alt). Re-checks the admin role, validates every posted row,
 * then, through the signed-in user's cookie client (RLS: `admin_all`): deletes the rows
 * ticked for deletion and their objects, writes the alt text and the order of the rest,
 * and appends the photo PhotoField uploaded (the browser put the object in the bucket;
 * only its path arrives here) after the last existing sort. A posted id that is not one
 * of this project's photos is ignored, and so is a new photo whose path one of them
 * already stores. A successful write expires the "projects" tag.
 */
export async function saveProjectPhotos(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const admin = await getAdminSession();
  if (!admin) return { status: "error", message: ADMIN_MESSAGES.forbidden };

  const projectId = formData.get("project_id");
  if (!isUuid(projectId)) return { status: "error", message: ADMIN_MESSAGES.invalid };

  const parsed = parseProjectPhotosForm(formData);
  if (!parsed.ok) return { status: "error", message: ADMIN_MESSAGES.invalid, fieldErrors: parsed.fieldErrors };

  let supabase: ServerClient;
  try {
    supabase = await createClient();
  } catch (err) {
    console.error("saveProjectPhotos: createClient", err);
    return { status: "error", message: ADMIN_MESSAGES.unavailable };
  }

  let outcome: Outcome;
  try {
    outcome = await writePhotos(supabase, projectId, parsed.data);
  } catch (err) {
    console.error("saveProjectPhotos", err);
    return { status: "error", message: ADMIN_MESSAGES.generic };
  }
  if (!outcome.ok) return outcome.state;

  updateTag("projects");
  // The screen re-reads the rows in the action's own response: the list follows the saved order.
  refresh();
  return { status: "ok", message: ADMIN_MESSAGES.saved };
}

async function writePhotos(supabase: ServerClient, projectId: string, input: ProjectPhotosInput): Promise<Outcome> {
  const project = await supabase.from("projects").select("id").eq("id", projectId).maybeSingle();
  if (project.error) throw new Error(`projects ${projectId}: ${project.error.message}`);
  if (!project.data) return refused(ADMIN_MESSAGES.notFound);

  const photos = await supabase.from("project_photos").select("id, path, sort").eq("project_id", projectId);
  if (photos.error) throw new Error(`project_photos of ${projectId}: ${photos.error.message}`);
  const own = new Map(photos.data.map((photo) => [photo.id, photo]));

  for (const edit of input.edits) {
    const photo = own.get(edit.id);
    // A row of another project, or one already gone: not this form's to touch.
    if (!photo) continue;
    // RLS does not refuse a write it filters out: without the admin role each statement
    // touches 0 rows and comes back without an error, so every write reads back its row.
    if (edit.delete) {
      const { data, error } = await supabase
        .from("project_photos")
        .delete()
        .eq("id", edit.id)
        .eq("project_id", projectId)
        .select("id");
      if (error) throw new Error(`project_photos delete ${edit.id}: ${error.message}`);
      // The object stays while its row does.
      if (!data || data.length !== 1) return refused(ADMIN_MESSAGES.forbidden);
      // The object goes once the row is gone; a failure is logged, never fatal.
      await removeMediaObject(supabase.storage, photo.path);
    } else {
      const { data, error } = await supabase
        .from("project_photos")
        .update({ alt: edit.alt, sort: edit.sort })
        .eq("id", edit.id)
        .eq("project_id", projectId)
        .select("id");
      if (error) throw new Error(`project_photos update ${edit.id}: ${error.message}`);
      if (!data || data.length !== 1) return refused(ADMIN_MESSAGES.forbidden);
    }
  }

  // PhotoField keeps the path it uploaded until its block remounts, so the submit that
  // follows a successful save can post the same object again: a path one of this
  // project's rows already stores is not inserted twice.
  const { newPhoto } = input;
  if (newPhoto && !photos.data.some((photo) => photo.path === newPhoto.path)) {
    const sort = photos.data.length === 0 ? 0 : Math.max(...photos.data.map((photo) => photo.sort)) + 1;
    const { data, error } = await supabase
      .from("project_photos")
      .insert({ project_id: projectId, path: newPhoto.path, alt: newPhoto.alt, sort })
      .select("id");
    if (error) throw new Error(`project_photos insert: ${error.message}`);
    if (!data || data.length !== 1) return refused(ADMIN_MESSAGES.forbidden);
  }

  return { ok: true };
}
