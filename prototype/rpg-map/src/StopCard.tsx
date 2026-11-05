import { stopBadge, stopSubtitle } from "./stopText";
import type { Stop } from "./types";

/**
 * The card for one stop: Reading → title with location-name subtitle; Quiz → Boss battle badge, Quiz title and
 * boss name; Goal Check → Final boss badge, title and boss name.
 * @param props.stop - The stop to show
 * @param props.index - Its position in the Course (0-based)
 * @param props.total - How many stops the Course has
 * @param props.state - Whether the Learner has finished it, is on it, or has not reached it
 */
export function StopCard({ stop, index, total, state }: { stop: Stop; index: number; total: number; state: string }) {
  const kicker = stop.kind === "goal_check" ? "Goal Check" : `Lesson ${index + 1} of ${total - 1}`;
  return (
    <article className={`stop-card card-${stop.kind}`}>
      <div className="card-top">
        <span className={`badge badge-${stop.kind}`}>{stopBadge(stop)}</span>
        <span className="kicker">{kicker}</span>
        <span className={`state state-${state}`}>{state}</span>
      </div>
      <h2>{stop.title}</h2>
      <p className="subtitle">
        {stop.kind === "reading" ? "" : "Boss: "}
        {stopSubtitle(stop)}
      </p>
    </article>
  );
}
