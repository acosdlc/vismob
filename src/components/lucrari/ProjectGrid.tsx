import { Photo } from "@/components/site/Photo";
import { projectCaption, type Project } from "@/lib/data/projects";

// DESIGN §3.12 tiles: photo 4:3 and the mono caption, in the auto-fit grid of §6
// (minmax 300px: three columns on desktop, one on mobile). The lightbox of §4.4 is
// phase 6, so the tiles are not links yet.
export function ProjectGrid({ projects }: { projects: Project[] }) {
  return (
    <ul className="grid list-none grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-[clamp(16px,2vw,24px)] p-0">
      {projects.map((project) => (
        <li key={project.slug}>
          <Photo
            src={project.photo?.src}
            alt={project.title}
            ratio="4:3"
            sizes="(min-width: 960px) 33vw, 100vw"
            label={project.photo?.label}
            frame={project.photo?.frame}
            caption={projectCaption(project)}
          />
        </li>
      ))}
    </ul>
  );
}
