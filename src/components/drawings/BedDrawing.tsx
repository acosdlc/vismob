import { configCode, drawingScene, type Resolved, type SceneDef, type SceneNode } from "@/lib/configurator";

export interface BedDrawingProps {
  resolved: Resolved;
  /** Prefix of every def id, so two drawings on one page never share them. Default "bed". */
  idPrefix?: string;
  /** Sizes the drawing (it keeps the W/180 ratio of its viewBox); also the 48px thumbnail of the mobile bar. */
  className?: string;
}

// DESIGN §5.5: the scene of src/lib/configurator/scene.ts mapped to JSX. Server-safe (no
// hooks). Decorative: aria-hidden; the values live in the figcaption and the ticket (§7).
export function BedDrawing({ resolved, idPrefix = "bed", className }: BedDrawingProps) {
  const scene = drawingScene(resolved, { idPrefix });
  return (
    <svg
      viewBox={`0 0 ${scene.width} ${scene.height}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
      className={className}
      data-code={configCode(resolved)}
    >
      {scene.defs.length > 0 && <defs>{scene.defs.map(renderDef)}</defs>}
      {scene.nodes.map(renderNode)}
    </svg>
  );
}

/** Paint of a primitive; a stroke always comes with vector-effect="non-scaling-stroke" (§5.5). */
function paint(node: Exclude<SceneNode, { type: "group" }>) {
  return {
    fill: node.fill,
    stroke: node.stroke,
    strokeWidth: node.strokeWidth,
    strokeDasharray: node.strokeDasharray,
    vectorEffect: node.stroke ? "non-scaling-stroke" : undefined,
    filter: node.filter,
    "data-role": node.role,
  };
}

function renderNode(node: SceneNode, i: number) {
  switch (node.type) {
    case "group":
      return (
        <g key={i} data-role={node.role}>
          {node.children.map(renderNode)}
        </g>
      );
    case "line":
      return <line key={i} x1={node.x1} y1={node.y1} x2={node.x2} y2={node.y2} {...paint(node)} />;
    case "rect":
      return (
        <rect key={i} x={node.x} y={node.y} width={node.width} height={node.height} rx={node.rx} {...paint(node)} />
      );
    case "circle":
      return <circle key={i} cx={node.cx} cy={node.cy} r={node.r} {...paint(node)} />;
    case "path":
      return <path key={i} d={node.d} {...paint(node)} />;
  }
}

function renderDef(def: SceneDef) {
  switch (def.type) {
    case "pattern":
      return (
        <pattern
          key={def.id}
          id={def.id}
          x={def.x}
          y={def.y}
          width={def.width}
          height={def.height}
          patternUnits="userSpaceOnUse"
        >
          {def.children.map(renderNode)}
        </pattern>
      );
    case "linearGradient":
      return (
        <linearGradient key={def.id} id={def.id} x1={def.x1} y1={def.y1} x2={def.x2} y2={def.y2}>
          {def.stops.map((stop) => (
            <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
          ))}
        </linearGradient>
      );
    case "filter":
      return (
        <filter key={def.id} id={def.id} {...def.region}>
          <feGaussianBlur stdDeviation={def.stdDeviation} />
        </filter>
      );
  }
}
