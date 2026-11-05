import { HERO_EDGES, HERO_NODE, HERO_NODES, HERO_VIEWBOX } from "./landing-lens-map";
import styles from "./landing.module.css";

/* A faint architecture map behind the headline. It draws itself once on load (under 5 s, so no
   pause control is needed) and then rests; reduced motion shows the finished map. Two connectors
   run off the bottom edge into the tour plate below. The lens shows the same map in full. */

export default function HeroBackdrop() {
  return (
    <svg
      className={styles.backdrop}
      viewBox={`0 0 ${HERO_VIEWBOX.width} ${HERO_VIEWBOX.height}`}
      preserveAspectRatio="xMaxYMax meet"
      aria-hidden="true"
      focusable="false"
    >
      {HERO_EDGES.map((d) => (
        <path key={d} className={styles.mapEdge} d={d} pathLength={1} />
      ))}
      {HERO_NODES.map(({ x, y }) => (
        <g key={`${x}-${y}`} className={styles.mapNode}>
          <rect x={x} y={y} width={HERO_NODE.width} height={HERO_NODE.height} rx={4} />
          <rect className={styles.mapTag} x={x + 8} y={y - 4} width={34} height={8} rx={2} />
        </g>
      ))}
      <circle className={styles.mapPacket} r={3.5} />
    </svg>
  );
}
