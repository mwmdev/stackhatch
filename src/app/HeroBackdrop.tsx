import styles from "./landing.module.css";

/* A faint architecture map behind the headline. It draws itself once on load (under 5 s, so no
   pause control is needed) and then rests; reduced motion shows the finished map. Two connectors
   run off the bottom edge into the tour plate below. */

const NODES = [
  { x: 170, y: 24 },
  { x: 470, y: 12 },
  { x: 330, y: 120 },
  { x: 600, y: 118 },
] as const;

const EDGES = [
  "M225 64 C225 95 385 90 385 120",
  "M525 52 C525 90 385 85 385 120",
  "M525 52 C525 90 655 85 655 118",
  "M385 160 C385 230 20 220 20 300",
  "M655 158 C655 230 735 220 735 300",
] as const;

export default function HeroBackdrop() {
  return (
    <svg
      className={styles.backdrop}
      viewBox="0 0 760 300"
      preserveAspectRatio="xMaxYMax meet"
      aria-hidden="true"
      focusable="false"
    >
      {EDGES.map((d) => (
        <path key={d} className={styles.mapEdge} d={d} pathLength={1} />
      ))}
      {NODES.map(({ x, y }) => (
        <g key={`${x}-${y}`} className={styles.mapNode}>
          <rect x={x} y={y} width={110} height={40} rx={4} />
          <rect className={styles.mapTag} x={x + 8} y={y - 4} width={34} height={8} rx={2} />
        </g>
      ))}
      <circle className={styles.mapPacket} r={3.5} />
    </svg>
  );
}
