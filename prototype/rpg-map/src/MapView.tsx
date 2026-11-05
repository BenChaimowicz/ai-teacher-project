import { useEffect, useMemo, useRef, useState } from "react";
import { MarkerArt } from "./MarkerArt";
import { createDomSampler, lengthAt, placeOnSampler, subPath, splitRegions } from "./route";
import { stopBadge, stopSubtitle } from "./stopText";
import type { ArtName } from "./assets";
import type { PlacementMode, Stop } from "./types";

/** Map units per second that the path draws itself at. */
const DRAW_SPEED = 900;
/** Shortest and longest time a draw may take, in milliseconds. */
const MIN_DRAW_MS = 250;
const MAX_DRAW_MS = 3500;

/**
 * Animates a number (the drawn length of the route) towards a target at a steady speed.
 * Linear on purpose: locations pop in exactly when the path head passes them.
 * @param target - The length the path should reach
 * @param replayKey - Changing this restarts the draw from zero
 * @returns The length drawn right now
 */
function useDrawnLength(target: number, replayKey: number): number {
  const [drawn, setDrawn] = useState(0);
  const current = useRef(0);
  const lastReplay = useRef(replayKey);
  useEffect(() => {
    if (lastReplay.current !== replayKey) {
      lastReplay.current = replayKey;
      current.current = 0;
    }
    const from = current.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ms = reduce ? 0 : Math.min(MAX_DRAW_MS, Math.max(MIN_DRAW_MS, (Math.abs(target - from) / DRAW_SPEED) * 1000));
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const k = ms === 0 ? 1 : Math.min(1, (now - start) / ms);
      current.current = from + (target - from) * k;
      setDrawn(current.current);
      if (k < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, replayKey]);
  return drawn;
}

/** The drawn size of each marker in CSS pixels at a given map width: small on a phone, bigger on a desktop. */
function markerSizes(width: number) {
  const k = Math.min(1, Math.max(0, (width - 390) / (760 - 390)));
  const mix = (a: number, b: number) => a + (b - a) * k;
  return { reading: mix(18, 28), boss: mix(28, 42), finalBoss: mix(34, 54), hero: mix(30, 44) };
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
  replayKey: number;
  /** Index of the stop whose card is open (hovered or pinned), or null. */
  inspected: number | null;
  /** Called when the pointer enters or leaves a marker. */
  onHover: (index: number | null) => void;
  /** Called when a marker is tapped or clicked. */
  onPin: (index: number) => void;
};

/**
 * The map: base image, the whole route faint underneath, the path drawing itself up to the current stop,
 * and a marker per stop that pops in when the path reaches it. The hero walks at the head of the path.
 * @param props - See {@link MapViewProps}
 */
export function MapView(props: MapViewProps) {
  const { routeD, mapUrl, stops, mode, current, replayKey, inspected, onHover, onPin } = props;
  const frameRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(390);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || 390));
    ro.observe(el);
    setWidth(el.clientWidth || 390);
    return () => ro.disconnect();
  }, []);

  const sampler = useMemo(() => createDomSampler(routeD), [routeD]);
  const placements = useMemo(() => placeOnSampler(sampler, stops, mode), [sampler, stops, mode]);
  const regions = useMemo(
    () =>
      mode === "clustered"
        ? splitRegions(stops)
            .filter((r) => r.last > r.first)
            .map((r) => subPath(sampler, placements[r.first].t, placements[r.last].t))
        : [],
    [mode, stops, sampler, placements],
  );

  const safeCurrent = Math.min(current, stops.length - 1);
  const targetLen = lengthAt(sampler, placements[safeCurrent]?.t ?? 0);
  const drawn = useDrawnLength(targetLen, replayKey);

  const unit = 1024 / Math.max(width, 1); // map units per CSS pixel
  const sizes = markerSizes(width);
  const head = sampler.pointAt(Math.min(drawn, sampler.length));
  const heroW = sizes.hero * unit;
  const heroH = heroW * (80 / 64);

  const labelled = new Set<number>([safeCurrent]);
  if (inspected !== null) labelled.add(inspected);

  return (
    <div className="map-frame" ref={frameRef}>
      <svg viewBox="0 0 1024 1024" className="map-svg" role="img" aria-label="Course map">
        <image href={mapUrl} x={0} y={0} width={1024} height={1024} />

        {regions.map((d, i) => (
          <path key={i} d={d} className="region-halo" strokeWidth={Math.max(64, sizes.reading * unit * 2.4)} />
        ))}

        <path
          d={routeD}
          className="route-faint"
          strokeWidth={3 * unit}
          strokeDasharray={`${0.1 * unit} ${9 * unit}`}
        />
        {drawn > 0.5 && (
          <>
            <path
              d={routeD}
              className="route-progress-edge"
              strokeWidth={8 * unit}
              strokeDasharray={`${sampler.length} ${sampler.length}`}
              strokeDashoffset={sampler.length - drawn}
            />
            <path
              d={routeD}
              className="route-progress"
              strokeWidth={4.5 * unit}
              strokeDasharray={`${sampler.length} ${sampler.length}`}
              strokeDashoffset={sampler.length - drawn}
            />
          </>
        )}

        {stops.map((stop, i) => {
          const p = placements[i];
          const reached = p.t * sampler.length <= drawn + 0.5;
          const state = i < safeCurrent ? "visited" : i === safeCurrent ? "current" : "locked";
          const shown = reached ? state : "locked";
          const isBoss = stop.kind !== "reading";
          const size = (stop.kind === "goal_check" ? sizes.finalBoss : isBoss ? sizes.boss : sizes.reading) * unit;
          const art: ArtName =
            stop.kind === "goal_check"
              ? "final-boss"
              : stop.kind === "quiz"
                ? "boss"
                : shown === "locked"
                  ? "location-locked"
                  : shown === "visited"
                    ? "location-visited"
                    : "location";
          const hit = Math.max(size, 26 * unit) / 2;
          return (
            <g
              key={i}
              transform={`translate(${p.x} ${p.y})`}
              className={`marker marker-${stop.kind} is-${shown}${inspected === i ? " is-inspected" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={`${stopBadge(stop)}: ${stop.title}`}
              onMouseEnter={() => onHover(i)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(i)}
              onBlur={() => onHover(null)}
              onClick={() => onPin(i)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onPin(i)}
            >
              <circle r={hit} className="hit" />
              {shown === "current" && <circle r={size * 0.78} className="current-ring" />}
              <g transform={`translate(${-size / 2} ${-size / 2})`}>
                <g className={reached && shown !== "locked" ? "art pop" : "art"}>
                  <MarkerArt name={art} width={size} height={size} />
                </g>
              </g>
            </g>
          );
        })}

        {drawn > 0.5 && (
          <g transform={`translate(${head.x} ${head.y})`} className="hero" pointerEvents="none">
            <g transform={`translate(${-heroW / 2} ${-heroH})`}>
              <MarkerArt name="hero" width={heroW} height={heroH} />
            </g>
          </g>
        )}
      </svg>

      {[...labelled].map((i) => {
        const p = placements[i];
        const stop = stops[i];
        const full = i === inspected;
        const xPct = (p.x / 1024) * 100;
        const yPct = (p.y / 1024) * 100;
        // The current stop's short label sits below its marker so the hero stays visible; full cards go above.
        const below = p.y < 300 || (!full && i === safeCurrent);
        return (
          <div
            key={i}
            className={`map-label${full ? " is-full" : ""}${below ? " is-below" : ""}`}
            style={{ left: `${xPct}%`, top: `${yPct}%`, transform: `translate(-${xPct}%, ${below ? "20px" : "calc(-100% - 28px)"})` }}
          >
            {full ? (
              <>
                <span className={`badge badge-${stop.kind}`}>{stopBadge(stop)}</span>
                <strong>{stop.title}</strong>
                <span>{stopSubtitle(stop)}</span>
              </>
            ) : (
              <span>{stopSubtitle(stop)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
