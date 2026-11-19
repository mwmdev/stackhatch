"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  HERO_EDGES,
  HERO_EXITS,
  HERO_NODE,
  HERO_NODES,
  HERO_VIEWBOX,
  STACK_NODE,
  TONE_LABEL,
  layoutStack,
  type Band,
  type Box,
  type PageGeometry,
  type PlacedNode,
  type StackLayout,
} from "./landing-lens-map";
import styles from "./landing.module.css";

/* The landing lens: the architecture map rests just visible behind the page, and wherever a
   mouse pointer is, a soft window shows it in full. Each band holds one masked layer under its
   content, plus one overlay over all content; the provider measures the bands, lays out the map
   in page coordinates and moves every layer's mask to the eased pointer. The map renders at
   900 px and wider; the lens follows only a fine hovering pointer without reduced motion. */

const MAP_QUERY = "(min-width: 900px)";
const LENS_QUERY =
  "(hover: hover) and (pointer: fine) and (min-width: 900px) and (prefers-reduced-motion: no-preference)";
const IDLE_MS = 2500;
const EASE = 0.2;

type LayerKey = Band | "hero" | "overlay";

interface LensContextValue {
  /** Whether the map is drawn at all; the lens itself may still be off. */
  mapShown: boolean;
  geometry: PageGeometry | null;
  layout: StackLayout | null;
  register: (key: LayerKey, el: Element | null) => void;
}

const LensContext = createContext<LensContextValue | null>(null);

function useLens(): LensContextValue {
  const value = useContext(LensContext);
  if (!value) throw new Error("Lens layers must render inside LensProvider");
  return value;
}

function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia?.(query);
      list?.addEventListener("change", onChange);
      return () => list?.removeEventListener("change", onChange);
    },
    [query]
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia?.(query).matches ?? false,
    () => false
  );
}

function toPage(rect: DOMRect): Box {
  return {
    left: rect.left + window.scrollX,
    top: rect.top + window.scrollY,
    width: rect.width,
    height: rect.height,
  };
}

/** How far a waiting or playing reveal has moved an element down, so the lens measures where it rests. */
function revealOffset(el: Element): number {
  // Computed `translate` is "none", "0px 24px" or "0px calc(100% + 30.4px)"; x is always 0.
  const value = getComputedStyle(el).translate;
  if (value === "none") return 0;
  const y = value.replace(/^\S+\s+/, "").replace(/\s-\s/g, " + -");
  let px = 0;
  let percent = 0;
  for (const [, amount, unit] of y.matchAll(/(-?[\d.]+)(px|%)/g)) {
    if (unit === "%") percent += Number(amount);
    else px += Number(amount);
  }
  return px + (percent / 100) * el.getBoundingClientRect().height;
}

export function LensProvider({ children }: { children: ReactNode }) {
  const mapShown = useMediaQuery(MAP_QUERY);
  const lensOn = useMediaQuery(LENS_QUERY);
  const layers = useRef(new Map<LayerKey, Element>());
  const offsets = useRef(new Map<LayerKey, { left: number; top: number }>());
  const [geometry, setGeometry] = useState<PageGeometry | null>(null);

  const register = useCallback((key: LayerKey, el: Element | null) => {
    if (el) layers.current.set(key, el);
    else layers.current.delete(key);
  }, []);

  // Measure every band whenever anything on the page changes size.
  useEffect(() => {
    if (!mapShown) return;
    const measure = () => {
      const next: PageGeometry = { bands: {} };
      offsets.current.clear();
      for (const [key, el] of layers.current) {
        const box = toPage(el.getBoundingClientRect());
        offsets.current.set(key, box);
        if (key === "overlay") {
          next.overlay = box;
          continue;
        }
        if (key === "hero") {
          // Hidden below 1200 px: no box, so no connectors from the page's top-left corner.
          if (box.width === 0 || box.height === 0) continue;
          next.hero = box;
          const scale = Math.min(box.width / HERO_VIEWBOX.width, box.height / HERO_VIEWBOX.height);
          const originX = box.left + box.width - HERO_VIEWBOX.width * scale;
          const bottom = box.top + box.height;
          next.heroExits = {
            left: { x: originX + HERO_EXITS.left * scale, y: bottom },
            right: { x: originX + HERO_EXITS.right * scale, y: bottom },
          };
          continue;
        }
        const section = el.parentElement;
        const obstacles: Box[] = [];
        let headY = box.top + 80;
        const heading = section?.querySelector("h2");
        if (heading) {
          const range = document.createRange();
          range.selectNodeContents(heading);
          const text = toPage(range.getBoundingClientRect());
          text.top -= revealOffset(heading);
          obstacles.push(text);
          headY = text.top + text.height / 2;
        }
        section?.querySelectorAll("a.btn").forEach((a) => {
          const button = toPage(a.getBoundingClientRect());
          button.top -= revealOffset(a);
          obstacles.push(button);
        });
        next.bands[key] = { box, headY, obstacles };
      }
      setGeometry(next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(document.documentElement);
    for (const el of layers.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [mapShown]);

  // Follow the pointer: ease toward it in viewport coordinates once per frame, then move every
  // layer's mask. Scrolling only re-projects, so the lens stays under a still pointer.
  useEffect(() => {
    if (!lensOn) return;
    let targetX = 0;
    let targetY = 0;
    let x = 0;
    let y = 0;
    let tracking = false;
    let frame = 0;
    let idle = 0;

    const setActive = (on: boolean) => {
      for (const el of layers.current.values()) el.toggleAttribute("data-active", on);
    };
    const draw = () => {
      frame = 0;
      x += (targetX - x) * EASE;
      y += (targetY - y) * EASE;
      if (Math.abs(targetX - x) < 0.5 && Math.abs(targetY - y) < 0.5) {
        x = targetX;
        y = targetY;
      } else {
        frame = requestAnimationFrame(draw);
      }
      const pageX = x + window.scrollX;
      const pageY = y + window.scrollY;
      for (const [key, el] of layers.current) {
        const offset = offsets.current.get(key);
        if (!offset || !(el instanceof HTMLElement || el instanceof SVGElement)) continue;
        el.style.setProperty("--lx", `${pageX - offset.left}px`);
        el.style.setProperty("--ly", `${pageY - offset.top}px`);
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const wake = () => {
      setActive(true);
      window.clearTimeout(idle);
      idle = window.setTimeout(() => setActive(false), IDLE_MS);
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      targetX = event.clientX;
      targetY = event.clientY;
      if (!tracking) {
        x = targetX;
        y = targetY;
        tracking = true;
      }
      wake();
      schedule();
    };
    const onScroll = () => {
      if (!tracking) return;
      wake();
      schedule();
    };
    const onLeave = (event: MouseEvent) => {
      if (event.relatedTarget) return;
      tracking = false;
      setActive(false);
    };
    const onHidden = () => {
      if (document.hidden) setActive(false);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("mouseout", onLeave);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("mouseout", onLeave);
      document.removeEventListener("visibilitychange", onHidden);
      window.clearTimeout(idle);
      cancelAnimationFrame(frame);
      setActive(false);
    };
  }, [lensOn]);

  const layout = useMemo(() => (geometry ? layoutStack(geometry) : null), [geometry]);
  const value = useMemo(
    () => ({ mapShown, geometry, layout, register }),
    [mapShown, geometry, layout, register]
  );
  return <LensContext.Provider value={value}>{children}</LensContext.Provider>;
}

function StackNodeShape({ node }: { node: PlacedNode }) {
  const { width: w, height: h } = STACK_NODE;
  const left = node.x - w / 2;
  const top = node.y - h / 2;
  const label = TONE_LABEL[node.tone];
  const tagWidth = label.length * 5.6 + 12;
  return (
    <g className={styles.lensNode} data-tone={node.tone}>
      <rect x={left} y={top} width={w} height={h} rx={4} />
      <rect
        className={styles.lensTone}
        x={left + 8}
        y={top - 7}
        width={tagWidth}
        height={14}
        rx={2}
      />
      <text className={styles.lensTag} x={left + 14} y={top + 3.5}>
        {label}
      </text>
      <text className={styles.lensName} x={left + 10} y={top + 24}>
        {node.name}
      </text>
      <text className={styles.lensTech} x={left + 10} y={top + 39}>
        {node.tech}
      </text>
    </g>
  );
}

function StackMap({ layout }: { layout: StackLayout }) {
  return (
    <>
      {layout.edges.map(({ d, wire }) => (
        <path key={d} className={styles.lensEdge} data-wire={wire} d={d} />
      ))}
      {layout.nodes.map((node) => (
        <StackNodeShape key={node.id} node={node} />
      ))}
    </>
  );
}

/** The hero backdrop in full, in hero viewBox units: names, tags and coloured connectors. */
function HeroMap() {
  const { width: w, height: h } = HERO_NODE;
  return (
    <>
      {HERO_EDGES.map((d) => (
        <path key={d} className={styles.lensEdge} data-wire="http" d={d} />
      ))}
      {HERO_NODES.map(({ x, y, name, tech, tone }) => (
        <g key={name} className={styles.lensNode} data-tone={tone}>
          <rect x={x} y={y} width={w} height={h} rx={4} />
          <rect className={styles.lensTone} x={x + 8} y={y - 4} width={34} height={8} rx={2} />
          <text className={styles.lensName} x={x + 8} y={y + 20}>
            {name}
          </text>
          <text className={styles.lensTech} x={x + 8} y={y + 32}>
            {tech}
          </text>
        </g>
      ))}
    </>
  );
}

const HERO_VIEWBOX_ATTR = `0 0 ${HERO_VIEWBOX.width} ${HERO_VIEWBOX.height}`;

/** The detailed stack map behind one band's content, drawn in page coordinates. */
export function LensLayer({ band }: { band: Band }) {
  const { mapShown, geometry, layout, register } = useLens();
  const ref = useCallback((el: HTMLDivElement | null) => register(band, el), [band, register]);
  const box = geometry?.bands[band]?.box;
  return (
    <div ref={ref} className={styles.lensLayer} aria-hidden="true">
      {mapShown && layout && box && (
        <svg
          width={box.width}
          height={box.height}
          viewBox={`${box.left} ${box.top} ${box.width} ${box.height}`}
          focusable="false"
        >
          <StackMap layout={layout} />
        </svg>
      )}
    </div>
  );
}

/** The hero backdrop in full, exactly over the faint one and under the headline. */
export function HeroLens() {
  const { register } = useLens();
  const ref = useCallback((el: SVGSVGElement | null) => register("hero", el), [register]);
  return (
    <svg
      ref={ref}
      className={`${styles.heroLens} ${styles.heroMap}`}
      viewBox={HERO_VIEWBOX_ATTR}
      preserveAspectRatio="xMaxYMax meet"
      aria-hidden="true"
      focusable="false"
    >
      <HeroMap />
    </svg>
  );
}

/**
 * The whole map once more, over all of the page's content at low opacity, so the lens also reads
 * across cards, text and the tour plate without competing with them. Under the band layers, gaps
 * show the map at full strength.
 */
export function LensOverlay() {
  const { mapShown, geometry, layout, register } = useLens();
  const ref = useCallback((el: HTMLDivElement | null) => register("overlay", el), [register]);
  const box = geometry?.overlay;
  const hero = geometry?.hero;
  return (
    <div ref={ref} className={styles.lensOverlay} aria-hidden="true">
      {mapShown && layout && box && (
        <svg
          width={box.width}
          height={box.height}
          viewBox={`${box.left} ${box.top} ${box.width} ${box.height}`}
          focusable="false"
        >
          {hero && (
            <svg
              className={styles.heroMap}
              x={hero.left}
              y={hero.top}
              width={hero.width}
              height={hero.height}
              viewBox={HERO_VIEWBOX_ATTR}
              preserveAspectRatio="xMaxYMax meet"
            >
              <HeroMap />
            </svg>
          )}
          <StackMap layout={layout} />
        </svg>
      )}
    </div>
  );
}
