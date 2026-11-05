import { useMemo, useState } from "react";
import mapUrl from "../art/map-01.png";
import { COURSES, ROUTES, sliceCourse } from "./assets";
import { MapView, type Visual } from "./MapView";
import { StopCard } from "./StopCard";
import type { DemoCourse, PlacementMode } from "./types";

/** The Lesson counts the picker offers. */
type Lessons = 3 | 16 | 30;
/** Which hand-drawn route the map uses. */
type RouteName = "main" | "long";

/**
 * The Course for a Lesson count: 3 is a slice of the real Course, 16 the real Course, 30 the long crowding test.
 * @param lessons - How many Lessons
 */
function courseFor(lessons: Lessons): DemoCourse {
  return lessons === 16 ? COURSES.norse16 : lessons === 30 ? COURSES.norse30 : sliceCourse(COURSES.norse16, 3);
}

/**
 * The route a Course starts on: `long` for the 30-Lesson test, `main` otherwise (design.md). The Route control can override.
 * @param lessons - How many Lessons
 */
function defaultRoute(lessons: Lessons): RouteName {
  return lessons === 30 ? "long" : "main";
}

/**
 * Where the current Lesson starts when a Course is picked: a little under halfway, so visited, current and locked all show.
 * @param stopCount - Number of stops in the Course
 * @returns A stop index
 */
function startIndex(stopCount: number): number {
  return Math.min(stopCount - 1, Math.max(0, Math.round(stopCount * 0.4)));
}

/** A segmented control: a raised track with one selected segment. */
function Segmented<T extends string | number>(props: {
  label: string;
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="field">
      <span className="field-label" id={`lbl-${props.label}`}>
        {props.label}
      </span>
      <div className="segmented" role="group" aria-labelledby={`lbl-${props.label}`}>
        {props.options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={o.value === props.value ? "on" : ""}
            aria-pressed={o.value === props.value}
            title={o.title}
            onClick={() => props.onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The demo: the Course title, the map, then the stop card and controls.
 */
export function App() {
  const [lessons, setLessons] = useState<Lessons>(16);
  const [mode, setMode] = useState<PlacementMode>("clustered");
  const [route, setRoute] = useState<RouteName>(defaultRoute(16));
  const [phone, setPhone] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const [current, setCurrent] = useState(() => startIndex(17));
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);

  const course = useMemo(() => courseFor(lessons), [lessons]);
  const stops = course.stops;
  const routeD = ROUTES[route];
  const drawKey = `${replayKey}|${lessons}|${mode}|${route}`;
  // A stale index (a Course with fewer stops was just picked) is ignored.
  const inspectedRaw = hover ?? pinned;
  const inspected = inspectedRaw !== null && inspectedRaw < stops.length ? inspectedRaw : null;
  const shownIndex = inspected ?? Math.min(current, stops.length - 1);
  const shownVisual: Visual = shownIndex < current ? "visited" : shownIndex === current ? "current" : "locked";

  /** Switches Course, puts the current Lesson at a sensible start and picks the route that suits it. */
  const pickCourse = (n: Lessons) => {
    setLessons(n);
    setRoute(defaultRoute(n));
    setCurrent(startIndex(courseFor(n).stops.length));
    setPinned(null);
    setHover(null);
  };

  /** Moves the current Lesson by one step, staying inside the Course. */
  const step = (delta: number) => {
    setCurrent((c) => Math.min(stops.length - 1, Math.max(0, c + delta)));
    setPinned(null);
  };

  const where = current === stops.length - 1 ? "Goal Check" : `Lesson ${current + 1} of ${stops.length - 1}`;

  return (
    <div className={`page${phone ? " is-phone" : ""}`}>
      <header className="head">
        <h1>{course.title}</h1>
        <p className="note">Prototype · throwaway · SEN-144 RPG map demo</p>
      </header>

      <div className="layout">
        <div className="map-frame">
          <MapView
            routeD={routeD}
            mapUrl={mapUrl}
            stops={stops}
            mode={mode}
            current={current}
            drawKey={drawKey}
            inspected={inspected}
            onHover={setHover}
            onPin={(i) => setPinned((p) => (p === i ? null : i))}
          />
        </div>

        <aside className="side">
          <StopCard stop={stops[shownIndex]} index={shownIndex} total={stops.length} visual={shownVisual} />

          <section className="controls" aria-label="Controls">
            <Segmented
              label="Course"
              value={lessons}
              options={[
                { value: 3, label: "3", title: "3 Lessons (the first three of the real Course)" },
                { value: 16, label: "16", title: "16 Lessons: the real Course" },
                { value: 30, label: "30", title: "30 Lessons: long test for crowding" },
              ]}
              onChange={pickCourse}
            />
            <Segmented
              label="Placement"
              value={mode}
              options={[
                { value: "even", label: "Even" },
                { value: "clustered", label: "Clustered" },
              ]}
              onChange={setMode}
            />
            <Segmented
              label="Route"
              value={route}
              options={[
                { value: "main", label: "Main" },
                { value: "long", label: "Long" },
              ]}
              onChange={setRoute}
            />
            <Segmented
              label="Width"
              value={phone ? "phone" : "desktop"}
              options={[
                { value: "desktop", label: "Desktop" },
                { value: "phone", label: "Phone" },
              ]}
              onChange={(v) => setPhone(v === "phone")}
            />
            <div className="button-row">
              <button type="button" className="btn ghost" onClick={() => step(-1)} disabled={current === 0}>
                Back
              </button>
              <button type="button" className="btn primary" onClick={() => step(1)} disabled={current === stops.length - 1}>
                Next
              </button>
              <button type="button" className="btn ghost" onClick={() => setReplayKey((k) => k + 1)}>
                Replay
              </button>
            </div>
            <p className="where" aria-live="polite">
              {where}
            </p>
          </section>
          <p className="hint">Hover or tap a marker to read its card.</p>
        </aside>
      </div>
    </div>
  );
}
