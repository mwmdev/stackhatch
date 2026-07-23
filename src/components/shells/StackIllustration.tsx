export type StackIllustrationProps = {
  variant?: "shell" | "resolver" | "compact";
  className?: string;
};

/**
 * A decorative exploded-plan view of a software stack.
 *
 * It stays outside interactive and graph viewports so its architectural layers
 * cannot be mistaken for real nodes, edges, or project data.
 */
export default function StackIllustration({
  className,
  variant = "shell",
}: StackIllustrationProps) {
  return (
    <div
      className={["stack-illustration-clip", className].filter(Boolean).join(" ")}
      data-stack-illustration-clip="true"
      data-variant={variant}
      aria-hidden="true"
    >
      <svg
        className="stack-illustration"
        data-stack-illustration="true"
        viewBox="0 0 720 180"
        preserveAspectRatio="xMaxYMid meet"
        aria-hidden="true"
        focusable="false"
        style={{ pointerEvents: "none" }}
      >
        <g className="stack-illustration__sheets">
          <path
            className="stack-illustration__sheet stack-illustration__sheet--back"
            d="M242 20h321l115 62H357z"
          />
          <path
            className="stack-illustration__sheet stack-illustration__sheet--middle"
            d="M206 53h321l115 62H321z"
          />
          <path
            className="stack-illustration__sheet stack-illustration__sheet--front"
            d="M169 86h321l115 62H284z"
          />
        </g>

        <g className="stack-illustration__modules">
          <path d="M318 34h94l44 24h-94z" />
          <path d="M466 34h71l44 24h-71z" />
          <path d="M285 67h160l45 24H330z" />
          <path d="M247 100h108l45 24H292z" />
        </g>

        <path className="stack-illustration__cut" d="M420 100h47l45 24h-47z" />

        <g className="stack-illustration__hatch">
          <path d="m187 96 38 21" />
          <path d="m202 94 50 27" />
          <path d="m220 94 53 29" />
          <path d="m239 94 52 28" />
        </g>
      </svg>
    </div>
  );
}
