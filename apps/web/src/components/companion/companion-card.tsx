import { Clock, Flame } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCompanion } from "@/components/companion/companion-provider.tsx";
import { Nibbles } from "@/components/ui/nibbles.tsx";
import { COMPANION_NAME } from "@/lib/brand-marks.ts";
import { prefersReducedMotion } from "@/lib/cheer.ts";
import { cn } from "@/lib/utils";

const RING_R = 35;
const RING_C = 2 * Math.PI * RING_R;

/**
 * The sidebar companion: Nibbles inside today's-goal ring, streak and minutes, and a speech bubble.
 * Eyes follow the pointer; hover twitches an ear; click squishes and says another line.
 */
export function CompanionCard() {
  const { line, lineId, mood, activity, next } = useCompanion();
  const [typing, setTyping] = useState(false);
  const [twitch, setTwitch] = useState(false);
  const [squish, setSquish] = useState(0);
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

  useEffect(() => {
    if (!twitch) return;
    const timer = window.setTimeout(() => setTwitch(false), 750);
    return () => window.clearTimeout(timer);
  }, [twitch]);

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
          onMouseEnter={() => setTwitch(true)}
          onClick={() => {
            setSquish((n) => n + 1);
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
          <Nibbles
            key={squish}
            size={64}
            mood={mood}
            track
            className={cn(twitch && "twitch", squish > 0 && "squish")}
          />
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
