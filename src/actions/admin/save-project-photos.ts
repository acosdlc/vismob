"use server";

import { refresh, updateTag } from "next/cache";
import { getAdminSession } from "@/lib/admin/auth";
import { removeMediaObject } from "@/lib/admin/media";
import {
  isUuid,
  parseProjectPhotosForm,
  photoCountAfterSave,
  PROJECT_MESSAGES,
  publishedHasPhoto,
  type ProjectPhotosInput,
} from "@/lib/admin/projects";
import { ADMIN_MESSAGES, type AdminActionState } from "@/lib/admin/types";
import { createClient, type ServerClient } from "@/lib/supabase/server";

type Outcome = { ok: true } | { ok: false; state: AdminActionState };

const refused = (message: string): Outcome => ({ ok: false, state: { status: "error", message } });

/**
 * „Salvează pozele” on /admin/lucrari/[id], for `useActionState` (PLAN PR-9 „Lucrări”:
 * upload, order, delete, alt). Re-checks the admin role, validates every posted row,
 * then, through the signed-in user's cookie client (RLS: `admin_all`): appends the photo
 * PhotoField uploaded (the browser put the object in the bucket; only its path arrives
 * here) after the last existing sort, then deletes the rows ticked for deletion and their
 * objects and writes the alt text and the order of the rest. The new photo is written
 * first because these are separate statements: a published project whose photos are
 * replaced has one at every step, and a save that fails halfway leaves a photo too many,
 * never none. A posted id that is not one of this project's photos is ignored, and so is
 * a new photo whose path one of them already stores. A save that would leave a published
 * project without a photo is refused before any write (the photo rule saveProject
 * applies to „Publicat”). A successful write expires the "projects" tag.
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
  const project = await supabase.from("projects").select("id, published").eq("id", projectId).maybeSingle();
  if (project.error) throw new Error(`projects ${projectId}: ${project.error.message}`);
  if (!project.data) return refused(ADMIN_MESSAGES.notFound);

  const photos = await supabase.from("project_photos").select("id, path, sort").eq("project_id", projectId);
  if (photos.error) throw new Error(`project_photos of ${projectId}: ${photos.error.message}`);
  // The photo rule, before any write: the site shows a published project through its
  // first photo, so the save has to leave it one. An unpublished project may lose them all.
  if (!publishedHasPhoto(project.data, photoCountAfterSave(photos.data, input))) return refused(PROJECT_MESSAGES.lastPhoto);
  const own = new Map(photos.data.map((photo) => [photo.id, photo]));

  // The new photo goes in before anything is deleted. The rule above counts the rows as
  // the whole save leaves them, and the writes are separate statements: with the deletes
  // first, a failed insert would leave a published project whose only photo was replaced
  // with none, its file removed. This way a save that stops halfway leaves a photo too
  // many, and the next press finishes it.
  // PhotoField keeps the path it uploaded until its block remounts, so the submit that
  // follows a successful save (or one that stopped after this insert) can post the same
  // object again: a path one of this project's rows already stores is not inserted twice.
  // The sort follows the rows as they were read, the ones ticked for deletion included.
  const { newPhoto } = input;
  if (newPhoto && !photos.data.some((photo) => photo.path === newPhoto.path)) {
    const sort = photos.data.length === 0 ? 0 : Math.max(...photos.data.map((photo) => photo.sort)) + 1;
    const { data, error } = await supabase
      .from("project_photos")
      .insert({ project_id: projectId, path: newPhoto.path, alt: newPhoto.alt, sort })
      .select("id");
    if (error) throw new Error(`project_photos insert: ${error.message}`);
    // RLS does not refuse a write it filters out: without the admin role each statement
    // touches 0 rows and comes back without an error, so every write reads back its row.
    if (!data || data.length !== 1) return refused(ADMIN_MESSAGES.forbidden);
  }

  for (const edit of input.edits) {
    const photo = own.get(edit.id);
    // A row of another project, or one already gone: not this form's to touch.
    if (!photo) continue;
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

  return { ok: true };
}
