export type RoutingTraceProps = {
  variant?: "shell" | "resolver" | "compact";
  className?: string;
};

/**
 * The observatory's single decorative datum line.
 *
 * Keep this outside interactive and graph viewports: it communicates no data and
 * must never compete with the architecture map's real edges.
 */
export default function RoutingTrace({ className, variant = "shell" }: RoutingTraceProps) {
  return (
    <div
      className={["routing-trace-clip", className].filter(Boolean).join(" ")}
      data-routing-trace-clip="true"
      data-variant={variant}
      aria-hidden="true"
    >
      <svg
        className="routing-trace"
        data-routing-trace="true"
        viewBox="0 0 1440 120"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
        style={{ pointerEvents: "none" }}
      >
        <path className="routing-trace__path" d="M-8 78H176V33H426V92H704V50H982V83H1204V25H1448" />
        <g className="routing-trace__nodes">
          <circle cx="176" cy="78" r="4" />
          <circle cx="426" cy="33" r="4" />
          <circle cx="704" cy="92" r="4" />
          <circle cx="982" cy="50" r="4" />
          <circle cx="1204" cy="83" r="4" />
        </g>
      </svg>
    </div>
  );
}
