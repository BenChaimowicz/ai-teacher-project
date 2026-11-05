import { useMemo, useState } from "react";
import mapUrl from "../art/map-01.png";
import { loadCourses, loadRoutes, sliceCourse } from "./assets";
import { MapView } from "./MapView";
import { StopCard } from "./StopCard";
import type { PlacementMode } from "./types";

const routes = loadRoutes();
const courses = loadCourses();

/** The Lesson counts the picker offers. */
const COURSE_CHOICES = [
  { lessons: 3, label: "3 Lessons" },
  { lessons: 16, label: "16 · real Course" },
  { lessons: 30, label: "30 · long test" },
] as const;

/**
 * Where the current Lesson starts when a Course is picked: a little under halfway, so visited, current and locked all show.
 * @param stopCount - Number of stops in the Course
 * @returns A stop index
 */
function startIndex(stopCount: number): number {
  return Math.min(stopCount - 1, Math.max(0, Math.round(stopCount * 0.4)));
}

/**
 * The demo: controls above a map with a stop card beneath it.
 */
export function App() {
  const [lessons, setLessons] = useState<3 | 16 | 30>(16);
  const [mode, setMode] = useState<PlacementMode>("clustered");
  const [variant, setVariant] = useState<"main" | "long">("main");
  const [phone, setPhone] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const [current, setCurrent] = useState(() => startIndex(17));
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);

  const course = useMemo(
    () => (lessons === 16 ? courses.norse16 : lessons === 30 ? courses.norse30 : sliceCourse(courses.norse16, 3)),
    [lessons],
  );
  const stops = course.stops;
  const routeD = variant === "long" && routes.long ? routes.long : routes.main;
  // A stale index (a Course with fewer stops was just picked) is ignored.
  const inspectedRaw = hover ?? pinned;
  const inspected = inspectedRaw !== null && inspectedRaw < stops.length ? inspectedRaw : null;
  const shownIndex = inspected ?? current;

  /** Switches Course and puts the current Lesson back at a sensible start. */
  const pickCourse = (n: 3 | 16 | 30) => {
    const next = n === 16 ? courses.norse16 : n === 30 ? courses.norse30 : sliceCourse(courses.norse16, 3);
    setLessons(n);
    setCurrent(startIndex(next.stops.length));
    setPinned(null);
    setHover(null);
    setReplayKey((k) => k + 1);
  };

  /** Moves the current Lesson by one step, staying inside the Course. */
  const step = (delta: number) => {
    setCurrent((c) => Math.min(stops.length - 1, Math.max(0, c + delta)));
    setPinned(null);
  };

  const state = shownIndex < current ? "visited" : shownIndex === current ? "current" : "locked";

  return (
    <div className="app">
      <header className="topbar">
        <h1>RPG Course map</h1>
        <span className="note">PROTOTYPE · throwaway · {course.subject}</span>
      </header>

      <section className="controls" aria-label="Controls">
        <div className="group" role="group" aria-label="Course">
          <span className="group-label">Course</span>
          {COURSE_CHOICES.map((c) => (
            <button key={c.lessons} className={lessons === c.lessons ? "on" : ""} onClick={() => pickCourse(c.lessons)}>
              {c.label}
            </button>
          ))}
        </div>
        <div className="group" role="group" aria-label="Placement">
          <span className="group-label">Placement</span>
          {(["even", "clustered"] as const).map((m) => (
            <button key={m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>
              {m}
            </button>
          ))}
        </div>
        <div className="group" role="group" aria-label="Current Lesson">
          <span className="group-label">Lesson</span>
          <button onClick={() => step(-1)} disabled={current === 0}>
            ← Back
          </button>
          <span className="count">
            {current + 1} / {stops.length}
          </span>
          <button onClick={() => step(1)} disabled={current === stops.length - 1}>
            Next →
          </button>
          <button onClick={() => setReplayKey((k) => k + 1)}>↻ Replay</button>
        </div>
        {routes.long && (
          <div className="group" role="group" aria-label="Route">
            <span className="group-label">Route</span>
            {(["main", "long"] as const).map((v) => (
              <button key={v} className={variant === v ? "on" : ""} onClick={() => setVariant(v)}>
                {v}
              </button>
            ))}
          </div>
        )}
        <div className="group" role="group" aria-label="Width">
          <span className="group-label">Width</span>
          <button className={phone ? "on" : ""} onClick={() => setPhone(true)}>
            Phone 390
          </button>
          <button className={!phone ? "on" : ""} onClick={() => setPhone(false)}>
            Desktop
          </button>
        </div>
      </section>

      <main className={`stage${phone ? " is-phone" : ""}`}>
        <MapView
          routeD={routeD}
          mapUrl={mapUrl}
          stops={stops}
          mode={mode}
          current={current}
          replayKey={replayKey}
          inspected={inspected}
          onHover={setHover}
          onPin={(i) => setPinned((p) => (p === i ? null : i))}
        />
        <StopCard stop={stops[shownIndex]} index={shownIndex} total={stops.length} state={state} />
        <p className="hint">Hover or tap a marker to read its card. {!courses.fromFile && "Placeholder data in use."}</p>
      </main>
    </div>
  );
}
