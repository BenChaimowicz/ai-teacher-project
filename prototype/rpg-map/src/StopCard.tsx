import { ART_URL } from "./assets";
import type { ArtName } from "./design";
import type { Visual } from "./MapView";
import { stopBadge, stopSubtitle } from "./stopText";
import type { Stop } from "./types";

/**
 * The card for one stop. Left: the stop's art in its state. Right: Reading → title and location name; Quiz → "Boss
 * battle" tag, Quiz title, boss name; Goal Check → "Final boss" tag, title, boss name. Readings and Quizzes carry a
 * "Lesson n of N" line; the Goal Check has none.
 * @param props.stop - The stop to show
 * @param props.index - Its position in the Course (0-based)
 * @param props.total - How many stops the Course has (Lessons plus the Goal Check)
 * @param props.visual - Whether the Learner has finished it, is on it, or has not reached it
 */
export function StopCard({ stop, index, total, visual }: { stop: Stop; index: number; total: number; visual: Visual }) {
  const art: ArtName =
    stop.kind === "goal_check"
      ? "final-boss"
      : stop.kind === "quiz"
        ? "boss"
        : visual === "locked"
          ? "location-locked"
          : visual === "visited"
            ? "location-visited"
            : "location";
  const tone =
    stop.kind === "quiz" ? (visual === "locked" ? "tone-locked-boss" : visual === "visited" ? "tone-defeated" : "") : "";
  return (
    <article className={`stop-card card-${stop.kind}`} aria-live="polite">
      <div className={`card-art ${tone}`}>
        <img src={ART_URL[art]} alt="" width={48} />
      </div>
      <div className="card-text">
        {stop.kind !== "reading" && <span className={`paper-tag tag-${stop.kind}`}>{stopBadge(stop)}</span>}
        <h2>{stop.title}</h2>
        <p className={`card-sub sub-${stop.kind}`}>{stopSubtitle(stop)}</p>
        {stop.kind !== "goal_check" && (
          <p className="card-meta">
            Lesson {index + 1} of {total - 1}
          </p>
        )}
      </div>
    </article>
  );
}
