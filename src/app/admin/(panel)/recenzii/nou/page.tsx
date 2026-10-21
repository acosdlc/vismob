import type { Metadata } from "next";
import { ReviewForm } from "@/components/admin/ReviewForm";
import { AdminPage } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Recenzie nouă" };

// PLAN PR-9 „Recenzii”: the empty form. Nothing is read; the Server Action writes
// the row and redirects to the new review's screen.
export default function RecenzieNouaPage() {
  return (
    <AdminPage title="Recenzie nouă">
      <ReviewForm review={null} />
    </AdminPage>
  );
}
