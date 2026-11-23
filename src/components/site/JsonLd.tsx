import { jsonLdScript } from "@/lib/seo/json-ld";

// ARHITECTURA §10: structured data on Acasă. A Server Component; it renders
// nothing while furnitureStoreJsonLd() has no real name to describe.
export function JsonLd({ data }: { data: Record<string, unknown> | null }) {
  if (!data) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(data) }} />;
}
