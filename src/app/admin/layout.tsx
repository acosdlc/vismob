import type { Metadata } from "next";

// The outermost /admin segment, the login screen included: never indexed
// (ARHITECTURA §8; robots.txt disallows it from PR-10). The root layout brings
// <html>, <body>, the fonts and the paper background; the guarded shell lives in
// (panel)/layout.tsx so that /admin/login stays outside it.
export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <>{children}</>;
}
