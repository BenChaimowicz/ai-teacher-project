import { useEffect, useState, type CSSProperties } from "react";
import { BookOpen, Check, Star } from "lucide-react";
import { Jongi, type JongiMood } from "@/components/companion/jongi.tsx";
import { Logo } from "@/components/ui/logo.tsx";
import { PRODUCT_NAME } from "@/lib/brand-marks.ts";

/** What Jongi is doing on a signed-out screen: waiting, thinking while a request runs, or cheering when it worked. */
export type AuthMood = Extract<JongiMood, "idle" | "think" | "cheer">;

/** Below this width the panel shrinks to a band above the form (matches `.k-auth` in account.css). */
const BAND = "(max-width: 899px)";

/**
 * Jongi's size for the current window, in a few steps so a resize doesn't restart his player every pixel.
 * Wide panel: as big as the panel's width and the window's height allow. Band: small.
 */
function pickSize() {
  if (typeof window === "undefined") return 420;
  if (window.matchMedia(BAND).matches) return 132;
  const byWidth = window.innerWidth >= 1280 ? 420 : window.innerWidth >= 1100 ? 360 : 300;
  const byHeight = window.innerHeight >= 860 ? 420 : window.innerHeight >= 720 ? 340 : 280;
  return Math.min(byWidth, byHeight);
}

/**
 * Tracks Jongi's size as the window changes.
 * @returns The size in px
 */
function useStageSize() {
  const [size, setSize] = useState(pickSize);
  useEffect(() => {
    const update = () => setSize(pickSize());
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return size;
}

/**
 * The left panel of every signed-out screen: the mark, the pitch, three small promises, and a large
 * Jongi standing on his book on a paper desk. It is the same on every screen, so moving between them
 * doesn't jump. On a phone it shrinks to a band with the mark and a small Jongi.
 * @param mood - Jongi's mood: `think` while a request runs, `cheer` when it worked
 */
export function AuthStage({ mood }: { mood: AuthMood }) {
  const size = useStageSize();
  return (
    <aside className="k-auth-stage" style={{ "--j": `${size}px` } as CSSProperties}>
      <div className="k-auth-brand">
        <Logo size={40} />
        <span className="k-wordmark" aria-hidden="true">
          {PRODUCT_NAME.toLowerCase()}
        </span>
      </div>
      <div className="k-auth-pitch">
        <p className="k-auth-pitch-title">Learn anything, starting from what you already know.</p>
        <p className="k-auth-pitch-sub">
          Tell Jongi what you want to learn. He checks where you are, then builds a course of short lessons with real
          sources.
        </p>
      </div>
      <div className="k-auth-desk" aria-hidden="true" />
      <ul className="k-auth-chips">
        <li>
          <Star className="gold" aria-hidden="true" />
          Built around your goal
        </li>
        <li>
          <Check className="good" aria-hidden="true" />
          Starts at your level
        </li>
        <li>
          <BookOpen className="apricot" aria-hidden="true" />
          Every fact has a source
        </li>
      </ul>
      <Jongi className="k-auth-jongi" framing="full" size={size} mood={mood} track />
    </aside>
  );
}
