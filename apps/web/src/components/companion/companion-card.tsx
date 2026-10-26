import { Clock, Flame } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCompanion } from "@/components/companion/companion-provider.tsx";
import { Jongi, type JongiHandle } from "@/components/companion/jongi.tsx";
import { COMPANION_NAME } from "@/lib/brand-marks.ts";
import { prefersReducedMotion } from "@/lib/cheer.ts";
import { cn } from "@/lib/utils";

const RING_R = 35;
const RING_C = 2 * Math.PI * RING_R;

/**
 * The sidebar companion: Jongi inside today's-goal ring, streak and minutes, and a speech bubble.
 * Eyes follow the pointer; hover flicks an ear; click squashes and says another line.
 * A "cheer" mood from the provider plays Jongi's Win once.
 */
export function CompanionCard() {
  const { line, lineId, mood, activity, next } = useCompanion();
  const [typing, setTyping] = useState(false);
  const jongi = useRef<JongiHandle>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (prefersReducedMotion()) return;
    setTyping(true);
    const timer = window.setTimeout(() => setTyping(false), 420);
    return () => window.clearTimeout(timer);
  }, [lineId]);

  const goal = Math.min(1, activity.minutesToday / activity.goalMinutes);

  return (
    <section className={cn("k-buddy", mood === "cheer" && "cheer")} aria-label={COMPANION_NAME}>
      <span className="spk" style={{ top: 10, left: 10 }} aria-hidden="true">✦</span>
      <span className="spk" style={{ top: 6, left: 62, animationDelay: "0.2s" }} aria-hidden="true">✦</span>
      <span className="spk" style={{ top: 54, left: 4, animationDelay: "0.4s" }} aria-hidden="true">✦</span>
      <div className="top">
        <button
          type="button"
          className="av"
          aria-label={`${COMPANION_NAME}: say something else`}
          title={`Today: ${activity.minutesToday} of ${activity.goalMinutes} minutes`}
          onMouseEnter={() => jongi.current?.flick()}
          onClick={() => {
            jongi.current?.poke();
            next();
          }}
        >
          <svg className="goal" viewBox="0 0 76 76" aria-hidden="true">
            <defs>
              <linearGradient id="k-goal-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" style={{ stopColor: "var(--a)" }} />
                <stop offset="1" style={{ stopColor: "var(--b)" }} />
              </linearGradient>
            </defs>
            <circle className="track" cx="38" cy="38" r={RING_R} />
            <circle
              className="val"
              cx="38"
              cy="38"
              r={RING_R}
              stroke="url(#k-goal-grad)"
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - goal)}
            />
          </svg>
          <Jongi ref={jongi} size={56} mood={mood} track tile="round" />
        </button>
        <div className="id">
          <p className="nm">{COMPANION_NAME}</p>
          <div className="brow">
            <span title="Day streak">
              <Flame aria-hidden="true" />
              <b>{activity.streakDays}</b>
              <small>{activity.streakDays === 1 ? "day" : "days"}</small>
            </span>
            <span title="Today's goal">
              <Clock aria-hidden="true" />
              <b>{activity.minutesToday}</b>
              <small>/{activity.goalMinutes} min</small>
            </span>
          </div>
        </div>
      </div>
      <div className="say-wrap">
        <div className="say" aria-live="polite">
          {typing ? (
            <span className="dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          ) : (
            <span className="text" key={lineId}>
              {line}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
