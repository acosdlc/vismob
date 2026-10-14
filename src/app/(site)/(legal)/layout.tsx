// DESIGN §4.6: plain text, max-width 720px, H1 + H2 + 17px paragraphs, lists.
export default function LegalLayout({ children }: LayoutProps<"/">) {
  return (
    <article className="container-site section">
      <div className="legal mx-auto flex max-w-[720px] flex-col gap-6">
        {children}
      </div>
    </article>
  );
}
