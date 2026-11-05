import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ART_URL } from "./assets";
import { ART_BOX, haloEllipse, markerPx, type ArtName, type MarkerPx } from "./design";
import { prefersReducedMotion, useRouteDraw } from "./motion";
import { angleAt, createDomSampler, lengthAt, placeOnSampler, splitRegions } from "./route";
import { stopBadge, stopSubtitle } from "./stopText";
import type { PlacementMode, Stop } from "./types";

/** Whether a stop is behind the Learner, under their feet, or still ahead. */
export type Visual = "visited" | "current" | "locked";

/** Where a rectangle of art sits relative to its stop, in map pixels. */
type Rect = { x: number; y: number; w: number; h: number };

/** Everything needed to draw one marker, in map pixels relative to the stop. */
type Layout = {
  art: ArtName;
  rect: Rect;
  /** Style class for the art: locked, visited and current treatments from design.md. */
  tone: string;
  /** The visited flag planted at a defeated boss's foot, for visited Quizzes only. */
  flag?: Rect;
  /** Where the hero stands (feet), for the current stop. */
  hero: { x: number; y: number };
  /** Top of the whole current group (marker and hero) relative to the stop, for the map tag. */
  top: number;
  /** Lowest point of the marker, hero and ring relative to the stop, for a tag placed below. */
  bottom: number;
  /** Ring under the current stop. */
  ring: { cx: number; cy: number; rx: number; ry: number };
};

/**
 * Rectangle of an art file with its anchor on the stop, shifted right by a fraction of its width.
 * @param art - Which art file
 * @param width - Width in map pixels
 * @param shift - Shift to the right as a fraction of the width
 */
function artRect(art: ArtName, width: number, shift = 0): Rect {
  const box = ART_BOX[art];
  const h = (width * box.h) / box.w;
  return { x: -width / 2 + shift * width, y: -h * box.anchorY, w: width, h };
}

/**
 * Works out the art, its rectangle and the treatment for one stop in one state, following design.md's table.
 * @param stop - The stop
 * @param visual - Visited, current or locked
 * @param sz - Marker widths in map pixels
 */
function layoutFor(stop: Stop, visual: Visual, sz: MarkerPx): Layout {
  const wr = sz.reading;
  const heroH = (sz.hero * ART_BOX.hero.h) / ART_BOX.hero.w;
  let hero = { x: -0.3 * wr, y: 0.08 * wr };
  let art: ArtName;
  let rect: Rect;
  let tone = "";
  let flag: Rect | undefined;
  let ring = { cx: -0.08 * wr, cy: -0.02 * wr, rx: 0.9 * wr, ry: 0.32 * wr };

  if (stop.kind === "reading") {
    art = visual === "locked" ? "location-locked" : visual === "visited" ? "location-visited" : "location";
    rect = artRect(art, wr, visual === "current" ? 0.22 : 0);
    tone = visual === "locked" ? "tone-locked-reading" : "";
  } else if (stop.kind === "quiz") {
    art = "boss";
    const wb = sz.boss;
    rect = artRect(art, wb, visual === "current" ? 0.2 : 0);
    tone = visual === "locked" ? "tone-locked-boss" : visual === "visited" ? "tone-defeated" : "";
    if (visual === "visited") {
      const fl = artRect("location-visited", sz.flag);
      flag = { ...fl, x: 0.12 * wb - sz.flag / 2 };
    }
    hero = { x: rect.x + 0.02 * wb - 0.1 * sz.hero, y: 0.08 * wr };
    ring = { cx: -0.1 * wb, cy: -0.02 * wr, rx: 0.9 * wb, ry: 0.32 * wb };
  } else {
    art = "final-boss";
    const wf = sz.finalBoss;
    rect = artRect(art, wf);
    tone = visual === "locked" ? "tone-locked-final" : "";
    hero = { x: -0.34 * wf, y: 0.08 * wr };
    ring = { cx: -0.1 * wf, cy: -0.02 * wr, rx: 0.8 * wf, ry: 0.28 * wf };
  }
  const heroTop = hero.y - heroH * ART_BOX.hero.anchorY;
  return { art, rect, tone, flag, hero, top: Math.min(rect.y, heroTop), bottom: Math.max(hero.y, ring.cy + ring.ry), ring };
}

/** The art of one marker: the main image plus, for a defeated boss, the planted flag. */
function MarkerBody({ layout }: { layout: Layout }) {
  const { art, rect, tone, flag } = layout;
  return (
    <>
      <g className={`tone ${tone}`}>
        <image href={ART_URL[art]} x={rect.x} y={rect.y} width={rect.w} height={rect.h} />
      </g>
      {flag && <image href={ART_URL["location-visited"]} x={flag.x} y={flag.y} width={flag.w} height={flag.h} />}
    </>
  );
}

/**
 * Pops an element in from its origin: scale 0.4 → 1.08 → 1 over 320 ms and a fade over the first 120 ms (a boss gets
 * one more bump after landing). With reduced motion it only fades in over 120 ms.
 * @param el - The element to animate
 * @param boss - Whether to add the extra bump
 */
function popIn(el: Element, boss: boolean): void {
  if (typeof el.animate !== "function") return;
  if (prefersReducedMotion()) {
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: "linear" });
    return;
  }
  el.animate(
    [
      { transform: "scale(0.4)", opacity: 0, offset: 0, easing: "cubic-bezier(.34,1.56,.64,1)" },
      { opacity: 1, offset: 0.375 },
      { transform: "scale(1.08)", opacity: 1, offset: 0.7, easing: "ease-out" },
      { transform: "scale(1)", opacity: 1, offset: 1 },
    ],
    { duration: 320 },
  );
  if (boss) {
    el.animate([{ transform: "scale(1)" }, { transform: "scale(1.12)", offset: 0.5 }, { transform: "scale(1)" }], {
      duration: 220,
      delay: 320,
      easing: "ease-in-out",
    });
  }
}

/** Props of one marker. */
type MarkerProps = {
  stop: Stop;
  index: number;
  x: number;
  y: number;
  visual: Visual;
  /** The path has reached this stop, so it shows its real state; until then it is the faint locked art. */
  reached: boolean;
  sz: MarkerPx;
  hit: number;
  raised: boolean;
  onHover: (index: number | null) => void;
  onPin: (index: number) => void;
};

/** One interactive marker: a focusable button with the art for its stop kind and state. */
function Marker({ stop, index, x, y, visual, reached, sz, hit, raised, onHover, onPin }: MarkerProps) {
  const shown: Visual = reached ? visual : "locked";
  const layout = layoutFor(stop, shown, sz);
  const popRef = useRef<SVGGElement>(null);
  const wasReached = useRef(false);
  useEffect(() => {
    if (reached && !wasReached.current && popRef.current) popIn(popRef.current, stop.kind !== "reading");
    wasReached.current = reached;
  }, [reached, stop.kind]);

  return (
    <g
      transform={`translate(${x} ${y})`}
      className={`marker marker-${stop.kind} is-${shown}${raised ? " is-raised" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={`${stopBadge(stop)}: ${stop.title}`}
      onMouseEnter={() => onHover(index)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(index)}
      onBlur={() => onHover(null)}
      onClick={() => onPin(index)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onPin(index)}
    >
      <circle r={hit} className="hit" />
      <circle r={hit} className="focus-ring" />
      <g ref={popRef}>
        <g className="lift visual">
          <MarkerBody layout={layout} />
        </g>
      </g>
    </g>
  );
}

/** Props of the map. */
export type MapViewProps = {
  /** The route as SVG path data in map pixel coordinates. */
  routeD: string;
  /** The map image URL. */
  mapUrl: string;
  /** The Course stops, Goal Check last. */
  stops: Stop[];
  /** How stops are spread along the route. */
  mode: PlacementMode;
  /** Index of the current stop. */
  current: number;
  /** Changing this redraws the path from the start. */
  drawKey: string;
  /** Index of the stop whose card is open (hovered or pinned), or null. */
  inspected: number | null;
  /** Called when the pointer enters or leaves a marker. */
  onHover: (index: number | null) => void;
  /** Called when a marker is tapped or clicked. */
  onPin: (index: number) => void;
};

/**
 * The map: base image, region halos, the route (dots ahead, a cream ribbon behind), a marker per stop that pops in when
 * the path reaches it, the ring under the current stop and the hero. Layers follow design.md ("Map layers").
 * @param props - See {@link MapViewProps}
 */
export function MapView(props: MapViewProps) {
  const { routeD, mapUrl, stops, mode, current, drawKey, inspected, onHover, onPin } = props;
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(390);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || 390));
    ro.observe(el);
    setWidth(el.clientWidth || 390);
    return () => ro.disconnect();
  }, []);

  const sampler = useMemo(() => createDomSampler(routeD), [routeD]);
  const placements = useMemo(() => placeOnSampler(sampler, stops, mode), [sampler, stops, mode]);
  const stopLengths = useMemo(() => placements.map((p) => lengthAt(sampler, p.t)), [placements, sampler]);
  const halos = useMemo(() => {
    if (mode !== "clustered") return [];
    const regions = splitRegions(stops);
    if (regions.length < 2) return [];
    return regions
      .map((r) => ({ first: r.first, last: stops[r.last].kind === "goal_check" ? r.last - 1 : r.last }))
      .filter((r) => r.last > r.first)
      .map((r) => haloEllipse(placements.slice(r.first, r.last + 1)));
  }, [mode, stops, placements]);

  const safeCurrent = Math.min(current, stops.length - 1);
  const target = stopLengths[safeCurrent] ?? 0;
  const { drawn, moving } = useRouteDraw(stopLengths, target, drawKey);

  const unit = 1024 / Math.max(width, 1); // map pixels per CSS pixel
  const px = markerPx(width);
  const sz: MarkerPx = {
    reading: px.reading * unit,
    boss: px.boss * unit,
    finalBoss: px.finalBoss * unit,
    hero: px.hero * unit,
    flag: px.flag * unit,
  };
  const hit = (Math.max(px.reading, 22) / 2) * unit;
  const total = sampler.length;

  const visualOf = (i: number): Visual => (i < safeCurrent ? "visited" : i === safeCurrent ? "current" : "locked");
  const reachedOf = (i: number) => stopLengths[i] <= drawn + 0.5;

  // Painter's order: lower stops cover the ones behind them; the current stop is drawn last, on top.
  const order = stops.map((_, i) => i).filter((i) => i !== safeCurrent).sort((a, b) => placements[a].y - placements[b].y);

  const currentLayout = layoutFor(stops[safeCurrent], reachedOf(safeCurrent) ? "current" : "locked", sz);
  const cp = placements[safeCurrent];
  const settled = !moving && reachedOf(safeCurrent);

  // The hero walks at the head of the path while it draws, then stands beside the current stop.
  const head = sampler.pointAt(Math.min(drawn, total));
  const heroX = settled ? cp.x + currentLayout.hero.x : head.x;
  const heroY = settled ? cp.y + currentLayout.hero.y : head.y;
  const walkAngle = angleAt(sampler, drawn) + (drawn > target ? 180 : 0);
  const faceLeft = !settled && Math.cos((walkAngle * Math.PI) / 180) < 0;
  const heroW = sz.hero;
  const heroH = (heroW * ART_BOX.hero.h) / ART_BOX.hero.w;
  const heroRef = useRef<SVGGElement>(null);
  const wasSettled = useRef(false);
  useEffect(() => {
    if (settled && !wasSettled.current && heroRef.current) popIn(heroRef.current, false);
    wasSettled.current = settled;
  }, [settled]);

  // One keyed list so a stop's marker keeps its state when it stops being the current one: the others by y, then the
  // ring under the current stop, then the current marker on top.
  const marker = (i: number, visual: Visual) => (
    <Marker
      key={`m${i}`}
      stop={stops[i]}
      index={i}
      x={placements[i].x}
      y={placements[i].y}
      visual={visual}
      reached={reachedOf(i)}
      sz={sz}
      hit={hit}
      raised={i === inspected && i !== safeCurrent}
      onHover={onHover}
      onPin={onPin}
    />
  );
  const layers = [
    ...order.map((i) => marker(i, visualOf(i))),
    reachedOf(safeCurrent) && (
      <ellipse
        key="ring"
        className="current-ring"
        cx={cp.x + currentLayout.ring.cx}
        cy={cp.y + currentLayout.ring.cy}
        rx={currentLayout.ring.rx}
        ry={currentLayout.ring.ry}
      />
    ),
    marker(safeCurrent, "current"),
  ];

  const tagged = new Set<number>([safeCurrent]);
  if (inspected !== null) tagged.add(inspected);
  const raisedIndex = inspected !== null && inspected !== safeCurrent ? inspected : null;

  const style = { "--lift": `${2 * unit}px`, "--ring-w": `${2.5 * unit}px` } as CSSProperties;

  return (
    <div className="map-box" ref={boxRef}>
      <svg viewBox="0 0 1024 1024" className="map-svg" role="img" aria-label="Course map" style={style}>
        <image href={mapUrl} x={0} y={0} width={1024} height={1024} />

        {halos.map((h, i) => (
          <ellipse
            key={i}
            className="region-halo"
            cx={h.cx}
            cy={h.cy}
            rx={h.rx}
            ry={h.ry}
            transform={`rotate(${h.angle} ${h.cx} ${h.cy})`}
          />
        ))}

        <path d={routeD} className="route-base" />
        <path d={routeD} className="route-ahead" />
        {drawn > 0.5 && (
          <>
            <path d={routeD} className="route-rim" strokeDasharray={`${total} ${total}`} strokeDashoffset={total - drawn} />
            <path d={routeD} className="route-ribbon" strokeDasharray={`${total} ${total}`} strokeDashoffset={total - drawn} />
          </>
        )}

        {layers}

        {drawn > 0.5 && (
          <g className={`hero${settled ? " is-settled" : ""}`} pointerEvents="none" style={{ transform: `translate(${heroX}px, ${heroY}px)` }}>
            <g ref={heroRef}>
              <g transform={faceLeft ? "scale(-1 1)" : undefined}>
                <image
                  href={ART_URL.hero}
                  x={-heroW / 2}
                  y={-heroH * ART_BOX.hero.anchorY}
                  width={heroW}
                  height={heroH}
                />
              </g>
            </g>
          </g>
        )}

        {raisedIndex !== null && (
          <g
            transform={`translate(${placements[raisedIndex].x} ${placements[raisedIndex].y - 2 * unit})`}
            pointerEvents="none"
            className="raised-copy"
          >
            <MarkerBody layout={layoutFor(stops[raisedIndex], reachedOf(raisedIndex) ? visualOf(raisedIndex) : "locked", sz)} />
          </g>
        )}
      </svg>

      {[...tagged].map((i) => {
        const stop = stops[i];
        const p = placements[i];
        const layout = i === safeCurrent ? currentLayout : layoutFor(stop, reachedOf(i) ? visualOf(i) : "locked", sz);
        const topPx = ((p.y + layout.top) / 1024) * width;
        const below = topPx < 28;
        const xPct = ((p.x + layout.rect.x + layout.rect.w / 2) / 1024) * 100;
        const yPct = ((p.y + (below ? layout.bottom : layout.top)) / 1024) * 100;
        return (
          <div
            key={i}
            className={`map-tag tag-${stop.kind}${below ? " is-below" : ""}`}
            style={{ left: `clamp(80px, ${xPct}%, calc(100% - 80px))`, top: `calc(${yPct}% ${below ? "+" : "-"} 4px)` }}
          >
            {stopSubtitle(stop)}
          </div>
        );
      })}
    </div>
  );
}
