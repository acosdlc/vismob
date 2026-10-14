import Link from "next/link";
import { Photo } from "@/components/site/Photo";
import { SectionHeader } from "@/components/site/SectionHeader";
import { projectCaption, type Project } from "@/lib/data/projects";
import { Section } from "./Section";

// DESIGN §4.1, 05 — Lucrări: six featured projects as §3.12 tiles, linking to /lucrari.
export function Gallery({ projects }: { projects: Project[] }) {
  return (
    <Section id="lucrari">
      <SectionHeader
        eyebrow="05 — Lucrări"
        title="Paturi livrate. Fiecare a pornit de la o discuție."
        aside="Proiecte reale, fotografiate la clienți acasă, cu dimensiunile și materialele folosite."
      />
      <ul className="mt-[clamp(32px,4vw,56px)] grid list-none grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-[clamp(16px,2vw,24px)] p-0">
        {projects.slice(0, 6).map((p) => (
          <li key={p.slug}>
            <Link href={`/lucrari?model=${p.modelId}`} className="flex flex-col gap-[10px] no-underline">
              <Photo
                src={p.photo?.src}
                alt={p.title}
                ratio="4:3"
                sizes="(min-width: 960px) 33vw, 100vw"
                label={p.photo?.label}
                frame={p.photo?.frame}
              />
              <span className="mono-12 text-ink-2">{projectCaption(p)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
