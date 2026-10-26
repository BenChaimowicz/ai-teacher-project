import { useCallback, useEffect, useId, useImperativeHandle, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import { prefersReducedMotion } from "@/lib/cheer.ts";
import { cn } from "@/lib/utils";
import "./jongi.css";

/*
 * Jongi, the companion: a hamster cut from the same paper as the app, with a tilted scholar cap
 * and a bookmark ribbon for a tail. Ported layer by layer from docs/uis/redesign/10-papercraft-jongi.html
 * (the hero stage and the pose tiles). The parts are character art, so their colours are fixed paper
 * tones here rather than theme tokens.
 *
 * Rive contract. A Rive file can replace this SVG behind the same props later. It needs:
 *   State machine "Jongi" with states
 *     - Idle      loop: breathing, a head bob, random blinks, an ear flick, the tassel swaying
 *     - Thinking  loop: paw to chin, eyes up and darting, head tilt, three thinking diamonds
 *     - Win       trigger: a one-shot hop with arms up, cap toss and happy eyes, then back to Idle
 *     - Resting   loop: eyes closed, slow breathing, a doze nod, cap slipped, drifting Zs
 *   Inputs
 *     - lookX, lookY   number, -1..1: where the pointer is relative to Jongi (0,0 = straight ahead)
 *     - win            trigger: fires the Win one-shot
 *     - mood           number or the states above: idle 0, think 1, rest 2 ("cheer" fires `win`)
 *   Mapping from props: mood "idle" | "think" | "rest" selects the loop; mood "cheer" (or
 *   `ref.win()`) fires the Win trigger; `track` feeds lookX/lookY from the pointer; reduced motion
 *   holds the state's still pose and skips Win's hop (happy eyes only).
 */

export type JongiMood = "idle" | "think" | "cheer" | "rest";

/**
 * How much of Jongi shows.
 * - `bust`: head and shoulders, for avatars (chat lines, the sidebar card).
 * - `full`: the whole hamster on its open book.
 * - `scene`: the whole hamster with the paper discs behind it (the mock's pose tiles).
 */
export type JongiFraming = "bust" | "full" | "scene";

export type JongiHandle = {
  /** The Win one-shot: a hop with arms up and a cap toss, then back to the current mood. */
  win: () => void;
  /** A small squash, for a click or tap. */
  poke: () => void;
  /** A quick ear flick, for hover. */
  flick: () => void;
};

type JongiProps = {
  /** Pixel size (square). */
  size?: number;
  /** "cheer" plays the Win one-shot once each time it is set, then shows idle. */
  mood?: JongiMood;
  framing?: JongiFraming;
  /** Eyes follow the pointer, and the layers shift a little (parallax). */
  track?: boolean;
  /** Parallax strength, 0..1. Capped at 0.5: the mock's hero stage is a showcase, the product is calm. */
  parallax?: number;
  /** Sit on a small paper tile (the mock's avatar). `"round"` makes the tile a circle. */
  tile?: boolean | "round";
  /** Accessible label; omit when decorative. */
  label?: string;
  className?: string;
  style?: CSSProperties;
  /** Called when a Win one-shot finishes. */
  onWinEnd?: () => void;
  ref?: Ref<JongiHandle>;
};

const PARALLAX_CAP = 0.5;
/** Below this size the paper-edge filters are sub-pixel, so they are skipped. */
const DETAIL_MIN_SIZE = 40;
const WIN_MS = 2000;

const C = {
  ink: "#141726", apr: "#d8955c", aprL: "#e8b07a", aprD: "#b06f3c", cream: "#f0e0c2", creamD: "#d4bc95",
  pink: "#e3ad98", pinkD: "#c48a77", earIn: "#b96d7e", earInD: "#8f4c5e", blush: "#e3705f", nose: "#c25f72",
  ribbon: "#c8473b", ribbonL: "#e0604b", ribbonD: "#962f26", gold: "#e7b250", goldD: "#b5832c",
  capL: "#313b67", capD: "#222949", capBand: "#161b2f", capEdge: "#4d5a93", lilac: "#9a7bb0",
};

const VIEWBOX: Record<JongiFraming, string> = {
  bust: "100 50 200 200",
  full: "30 40 340 360",
  scene: "0 0 400 420",
};

/* ---------------------------------------------------------------------------------------------
 * Pointer look-at: one shared loop eases every tracked Jongi toward the pointer, and drifts
 * gently when the pointer has been still for a while (as in the mock's hero).
 * ------------------------------------------------------------------------------------------- */

type Tracked = {
  root: HTMLElement;
  look: SVGGElement;
  heads: SVGGElement[];
  back: SVGGElement | null;
  parallax: number;
  cur: { x: number; y: number };
};

const tracked = new Set<Tracked>();
const pointer = { x: 0, y: 0, last: -1e9 };
let loopRunning = false;
let listening = false;

/**
 * Records the pointer position for the look loop.
 * @param event - Pointer move
 */
function onPointerMove(event: PointerEvent) {
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  pointer.last = performance.now();
}

/**
 * Eases each tracked Jongi's eyes and layers toward its target.
 * @param now - Frame timestamp
 */
function lookTick(now: number) {
  if (tracked.size === 0) {
    loopRunning = false;
    return;
  }
  const still = now - pointer.last > 2500;
  tracked.forEach((t) => {
    const rect = t.root.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight || rect.width === 0) return;
    let tx: number;
    let ty: number;
    if (still) {
      tx = Math.sin(now / 2300) * 0.28;
      ty = Math.sin(now / 3100) * 0.18;
    } else {
      const dx = pointer.x - (rect.left + rect.width / 2);
      const dy = pointer.y - (rect.top + rect.height * 0.45);
      const distance = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, distance / 240);
      tx = (dx / distance) * k;
      ty = (dy / distance) * k;
    }
    const dx = tx - t.cur.x;
    const dy = ty - t.cur.y;
    if (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) return;
    t.cur.x += dx * 0.08;
    t.cur.y += dy * 0.08;
    place(t);
  });
  requestAnimationFrame(lookTick);
}

/**
 * Applies a tracked Jongi's current look to its eyes and layers (viewBox units).
 * @param t - The tracked instance
 */
function place(t: Tracked) {
  const { x, y } = t.cur;
  t.look.setAttribute("transform", `translate(${(x * 5).toFixed(2)} ${(y * 4).toFixed(2)})`);
  const p = t.parallax;
  const head = `translate(${(x * 8 * p).toFixed(2)} ${(y * 5 * p).toFixed(2)})`;
  t.heads.forEach((g) => g.setAttribute("transform", head));
  t.back?.setAttribute("transform", `translate(${(-x * 10 * p).toFixed(2)} ${(-y * 6 * p).toFixed(2)})`);
  t.root.style.setProperty("--j-ry", `${(x * 10 * p).toFixed(2)}deg`);
  t.root.style.setProperty("--j-rx", `${(-y * 7 * p).toFixed(2)}deg`);
}

/**
 * Registers a Jongi with the shared loop while mounted.
 * @param t - Its elements and parallax strength
 */
function track(t: Tracked) {
  if (prefersReducedMotion()) return () => undefined;
  tracked.add(t);
  if (!listening) {
    addEventListener("pointermove", onPointerMove, { passive: true });
    listening = true;
  }
  if (!loopRunning) {
    loopRunning = true;
    requestAnimationFrame(lookTick);
  }
  return () => {
    tracked.delete(t);
  };
}

/* ---------------------------------------------------------------------------------------------
 * The Win one-shot, ported from the mock's hero `win()`. Distances are in viewBox units
 * (the hero's px values times 400/343).
 * ------------------------------------------------------------------------------------------- */

type Keys = Keyframe[];

const WIN_HOP: Keys = [
  { offset: 0, transform: "translateY(0) scale(1,1)", easing: "cubic-bezier(.45,0,.55,1)" },
  { offset: 0.187, transform: "translateY(10px) scale(1.07,.9)", easing: "cubic-bezier(.15,.75,.35,1)" },
  { offset: 0.373, transform: "translateY(-47px) scale(.95,1.07)", easing: "cubic-bezier(.3,.3,.6,1)" },
  { offset: 0.467, transform: "translateY(-51px) scale(1,1)", easing: "cubic-bezier(.5,0,.85,.45)" },
  { offset: 0.6, transform: "translateY(0) scale(.97,1.04)", easing: "cubic-bezier(.2,.6,.4,1)" },
  { offset: 0.667, transform: "translateY(5px) scale(1.09,.89)", easing: "cubic-bezier(.3,0,.4,1)" },
  { offset: 0.78, transform: "translateY(-8px) scale(.98,1.03)", easing: "cubic-bezier(.5,0,.6,1)" },
  { offset: 0.88, transform: "translateY(0) scale(1.02,.985)", easing: "ease-out" },
  { offset: 1, transform: "translateY(0) scale(1,1)" },
];
const WIN_SHADOW: Keys = [
  { offset: 0, transform: "scale(1)", opacity: 0.6 },
  { offset: 0.187, transform: "scale(1.08,1)", opacity: 0.6 },
  { offset: 0.373, transform: "scale(.62)", opacity: 0.3 },
  { offset: 0.467, transform: "scale(.58)", opacity: 0.28 },
  { offset: 0.6, transform: "scale(1)", opacity: 0.6 },
  { offset: 0.667, transform: "scale(1.1,1)", opacity: 0.65 },
  { offset: 0.78, transform: "scale(.95)", opacity: 0.55 },
  { offset: 1, transform: "scale(1)", opacity: 0.6 },
];
const WIN_ARM: Keys = [
  { offset: 0, transform: "rotate(135deg)", easing: "ease-in-out" },
  { offset: 0.14, transform: "rotate(150deg)", easing: "cubic-bezier(.2,.9,.3,1.2)" },
  { offset: 0.32, transform: "rotate(356deg)", easing: "ease-in-out" },
  { offset: 0.42, transform: "rotate(366deg)", easing: "ease-in-out" },
  { offset: 0.5, transform: "rotate(350deg)", easing: "ease-in-out" },
  { offset: 0.6, transform: "rotate(358deg)" },
  { offset: 0.78, transform: "rotate(358deg)", easing: "cubic-bezier(.5,0,.3,1)" },
  { offset: 1, transform: "rotate(135deg)" },
];
const WIN_CAP: Keys = [
  { offset: 0, transform: "translate(0,0) rotate(0deg)" },
  { offset: 0.187, transform: "translate(0,6px) rotate(0deg)", easing: "cubic-bezier(.2,.7,.3,1)" },
  { offset: 0.4, transform: "translate(0,9px) rotate(-2deg)", easing: "cubic-bezier(.2,.8,.3,1)" },
  { offset: 0.52, transform: "translate(-5px,-28px) rotate(-16deg)", easing: "cubic-bezier(.5,0,.7,.5)" },
  { offset: 0.66, transform: "translate(2px,-5px) rotate(9deg)", easing: "cubic-bezier(.3,.7,.4,1)" },
  { offset: 0.74, transform: "translate(0,2px) rotate(-4deg)", easing: "ease-in-out" },
  { offset: 0.86, transform: "translate(0,0) rotate(2deg)", easing: "ease-in-out" },
  { offset: 1, transform: "translate(0,0) rotate(0deg)" },
];
const WIN_EARS: Keys = [
  { offset: 0, transform: "scaleY(1)" },
  { offset: 0.187, transform: "scaleY(.8)" },
  { offset: 0.373, transform: "scaleY(1.12)" },
  { offset: 0.467, transform: "scaleY(1)" },
  { offset: 0.6, transform: "scaleY(1.06)" },
  { offset: 0.667, transform: "scaleY(.82)" },
  { offset: 0.78, transform: "scaleY(1.05)" },
  { offset: 0.88, transform: "scaleY(.98)" },
  { offset: 1, transform: "scaleY(1)" },
];
const WIN_TASSEL: Keys = [
  { offset: 0, transform: "rotate(0deg)" },
  { offset: 0.3, transform: "rotate(0deg)", easing: "ease-in-out" },
  { offset: 0.4, transform: "rotate(28deg)", easing: "ease-in-out" },
  { offset: 0.55, transform: "rotate(-34deg)", easing: "ease-in-out" },
  { offset: 0.68, transform: "rotate(22deg)", easing: "ease-in-out" },
  { offset: 0.8, transform: "rotate(-10deg)", easing: "ease-in-out" },
  { offset: 0.9, transform: "rotate(4deg)", easing: "ease-in-out" },
  { offset: 1, transform: "rotate(0deg)" },
];
const WIN_DISC: Keys = [
  { offset: 0, transform: "scale(1)" },
  { offset: 0.6, transform: "scale(1)", easing: "cubic-bezier(.2,.8,.3,1)" },
  { offset: 0.7, transform: "scale(1.05)", easing: "ease-in-out" },
  { offset: 0.85, transform: "scale(.99)" },
  { offset: 1, transform: "scale(1)" },
];
const POKE: Keys = [
  { offset: 0, transform: "translateY(0) scale(1,1)" },
  { offset: 0.3, transform: "translateY(4px) scale(1.06,.92)", easing: "cubic-bezier(.2,.7,.3,1)" },
  { offset: 0.65, transform: "translateY(-3px) scale(.98,1.03)" },
  { offset: 1, transform: "translateY(0) scale(1,1)" },
];
const FLICK_R: Keys = [
  { offset: 0, transform: "rotate(0)" },
  { offset: 0.2, transform: "rotate(16deg) scale(.9,1)" },
  { offset: 0.45, transform: "rotate(-6deg) scale(1.02,1)" },
  { offset: 0.7, transform: "rotate(4deg)" },
  { offset: 1, transform: "rotate(0)" },
];
const FLICK_L: Keys = [
  { offset: 0, transform: "rotate(0)" },
  { offset: 0.25, transform: "rotate(-9deg) scale(.94,1)" },
  { offset: 0.6, transform: "rotate(3deg)" },
  { offset: 1, transform: "rotate(0)" },
];
const BLINK: Keys = [{ transform: "scaleY(1)" }, { transform: "scaleY(.08)", offset: 0.45 }, { transform: "scaleY(1)" }];

/* ---------------------------------------------------------------------------------------------
 * Paper parts (from the mock's `P`).
 * ------------------------------------------------------------------------------------------- */

/**
 * One cut-paper layer: a paper-edge highlight plus a soft drop shadow, when detailed.
 * @param props.filter - Filter id, or undefined for flat paper
 */
function Layer({ filter, head, children }: { filter?: string; head?: boolean; children: ReactNode }) {
  return (
    <g data-j-head={head ? "" : undefined}>
      <g filter={filter ? `url(#${filter})` : undefined}>{children}</g>
    </g>
  );
}

function Tail() {
  return (
    <g className="j-tail">
      <path d="M262,316 C296,318 316,330 326,350 L340,388 L327,378 L317,394 L303,356 C297,342 284,336 258,334Z" fill={C.ribbon} />
      <path d="M326,350 L340,388 L327,378 L317,394 L303,356 Z" fill={C.ribbonD} />
      <path d="M262,316 C296,318 316,330 326,350 L319,352 C309,337 292,327 262,325Z" fill={C.ribbonL} />
    </g>
  );
}

function Body() {
  return (
    <g className="j-body">
      <path d="M200,170 C266,170 302,222 302,276 C302,326 260,350 200,350 C140,350 98,326 98,276 C98,222 134,170 200,170Z" fill={C.apr} />
      <path d="M258,186 C288,210 302,244 302,276 C302,326 260,350 200,350 C244,340 278,316 280,276 C282,240 274,208 258,186Z" fill={C.aprD} />
      <path d="M116,236 C124,208 146,186 172,176 C150,196 136,216 130,244Z" fill={C.aprL} opacity=".75" />
      <path d="M200,232 C238,232 260,262 260,296 C260,330 232,346 200,346 C168,346 140,330 140,296 C140,262 162,232 200,232Z" fill={C.cream} />
      <path d="M236,246 C252,262 260,280 260,296 C260,330 232,346 200,346 C230,336 246,318 248,294 C249,276 244,260 236,246Z" fill={C.creamD} />
      <path d="M186,300 L200,310 L214,300 M190,318 L200,325 L210,318" stroke={C.creamD} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

function Feet() {
  return (
    <g>
      <ellipse cx="166" cy="349" rx="21" ry="9" fill={C.pink} />
      <ellipse cx="234" cy="349" rx="21" ry="9" fill={C.pink} />
      <path d="M156,345 v6 M164,344 v7 M172,345 v6 M228,345 v6 M236,344 v7 M244,345 v6" stroke={C.pinkD} strokeWidth="1.4" strokeLinecap="round" />
    </g>
  );
}

function Ears() {
  return (
    <g className="j-ride">
      <g className="j-ears">
        <g className="j-ear-l">
          <polygon points="118,130 124,70 142,118" fill={C.aprL} />
          <polygon points="124,70 168,98 142,118" fill={C.aprD} />
          <polygon points="130,118 127,84 143,112" fill={C.earIn} />
          <polygon points="127,84 156,102 143,112" fill={C.earInD} />
        </g>
        <g className="j-ear-r">
          <polygon points="282,130 276,70 258,118" fill={C.aprD} />
          <polygon points="276,70 232,98 258,118" fill="#c8844d" />
          <polygon points="270,118 273,84 257,112" fill={C.earInD} />
          <polygon points="273,84 244,102 257,112" fill={C.earIn} />
        </g>
      </g>
    </g>
  );
}

function Head() {
  return (
    <g className="j-ride">
      <path d="M200,88 C254,88 290,120 292,160 C294,200 256,226 200,226 C144,226 106,200 108,160 C110,120 146,88 200,88Z" fill={C.apr} />
      <path d="M256,99 C280,116 292,138 292,160 C294,200 256,226 200,226 C238,214 268,194 271,160 C273,134 266,114 256,99Z" fill={C.aprD} />
      <polygon points="164,98 200,89 236,98 200,140" fill={C.aprL} opacity=".5" />
      <path d="M200,172 C218,172 230,178 238,186 C258,182 278,190 279,204 C280,218 250,226 200,226 C150,226 120,218 121,204 C122,190 142,182 162,186 C170,178 182,172 200,172Z" fill={C.cream} />
      <path d="M248,184 C266,186 279,194 279,204 C280,218 250,226 200,226 C240,220 262,212 264,202 C265,194 258,188 248,184Z" fill={C.creamD} />
      <ellipse cx="146" cy="203" rx="11" ry="6.5" fill={C.blush} opacity=".32" />
      <ellipse cx="254" cy="203" rx="11" ry="6.5" fill={C.blush} opacity=".32" />
      <polygon className="j-nose" points="193.5,184 206.5,184 200,191.5" fill={C.nose} />
      <path d="M200,191.5 L200,196 M192,198 Q196,201.5 200,196 Q204,201.5 208,198" stroke={C.ink} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M128,198 L96,190 M128,205 L94,208 M272,198 L304,190 M272,205 L306,208" stroke={C.cream} strokeOpacity=".5" strokeWidth="1.2" strokeLinecap="round" />
    </g>
  );
}

function Eyes({ closed, up, lookRef, blinkRef }: { closed: boolean; up: boolean; lookRef: Ref<SVGGElement>; blinkRef: Ref<SVGGElement> }) {
  return (
    <g className="j-ride">
      <g ref={lookRef}>
        <g transform={up ? "translate(3.5 -3.5)" : undefined}>
          <g className="j-look2">
            {closed ? (
              <path d="M163,166 Q172,173 181,166 M219,166 Q228,173 237,166" fill="none" stroke={C.ink} strokeWidth="3.2" strokeLinecap="round" />
            ) : (
              <>
                <g className="j-eye-open">
                  <g className="j-blink" ref={blinkRef}>
                    <circle cx="172" cy="166" r="8.5" fill={C.ink} />
                    <circle cx="228" cy="166" r="8.5" fill={C.ink} />
                    <circle cx="169" cy="162.6" r="2.8" fill="#fff4e2" />
                    <circle cx="225" cy="162.6" r="2.8" fill="#fff4e2" />
                    <circle cx="175.2" cy="169.4" r="1.1" fill="#fff4e2" opacity=".55" />
                    <circle cx="231.2" cy="169.4" r="1.1" fill="#fff4e2" opacity=".55" />
                  </g>
                </g>
                <g className="j-eye-happy">
                  <path d="M163,169 Q172,158 181,169 M219,169 Q228,158 237,169" fill="none" stroke={C.ink} strokeWidth="3.6" strokeLinecap="round" />
                </g>
              </>
            )}
          </g>
        </g>
      </g>
    </g>
  );
}

function Arm() {
  return (
    <>
      <path d="M131,242 C122,226 112,210 102,196 C99,189 107,183 114,188 C126,203 137,220 146,234 Z" fill={C.aprL} />
      <ellipse cx="106" cy="189" rx="10" ry="8.5" fill={C.cream} transform="rotate(-35 106 189)" />
      <path d="M100,186 l-3,-3 M104,183 l-2,-4 M109,182 l0,-4" stroke={C.creamD} strokeWidth="1.3" strokeLinecap="round" />
    </>
  );
}

function Arms({ left, right }: { left: number; right: number }) {
  return (
    <g className="j-ride">
      <g className="j-arm j-arm-l" style={{ transform: `rotate(${left}deg)` }}>
        <Arm />
      </g>
      <g transform="matrix(-1 0 0 1 400 0)">
        <g className="j-arm j-arm-r" style={{ transform: `rotate(${right}deg)` }}>
          <Arm />
        </g>
      </g>
    </g>
  );
}

function Cap({ slip }: { slip: boolean }) {
  return (
    <g className="j-ride">
      <g className="j-capg">
        <g transform={slip ? "rotate(17 209 96) translate(-2 9)" : "rotate(6 209 96)"}>
          <path d="M172,92 L246,92 L242,113 Q209,123 176,113 Z" fill={C.capBand} />
          <path d="M176,113 Q209,123 242,113 L243,108 Q209,118 175,108Z" fill="#2a3256" />
          <polygon points="150,84 210,64 208,104" fill={C.capL} />
          <polygon points="210,64 268,82 208,104" fill={C.capD} />
          <polyline points="150,84 210,64 268,82" fill="none" stroke={C.capEdge} strokeWidth="1.4" strokeLinejoin="round" />
          <line x1="210" y1="64" x2="208" y2="104" stroke="#3b4677" strokeWidth=".9" />
          <g className="j-tsway">
            <g className="j-tflick">
              <path d="M209,84 L266,83 L266,109" fill="none" stroke={C.gold} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
              <polygon points="261,108 271,108 274,129 258,129" fill={C.gold} />
              <polygon points="266,108 271,108 274,129 266,129" fill={C.goldD} />
              <path d="M260,113 L272,113" stroke={C.goldD} strokeWidth="1.6" />
            </g>
          </g>
          <circle cx="209" cy="84" r="3.6" fill={C.gold} />
        </g>
      </g>
    </g>
  );
}

function Book() {
  return (
    <g>
      <path d="M44,360 Q122,346 200,368 Q278,346 356,360 L352,378 Q276,366 200,388 Q124,366 48,378Z" fill="#33223f" />
      <path d="M54,352 Q126,338 200,360 Q274,338 346,352 L346,364 Q274,352 200,374 Q126,352 54,364Z" fill="#8c7f66" />
      <path d="M58,346 Q128,332 200,354 Q272,332 342,346 L346,352 Q274,338 200,360 Q126,338 54,352Z" fill="#c2b292" />
      <path d="M56,357 Q127,344 200,366 M200,366 Q273,344 344,357" stroke="#6f644f" strokeWidth=".9" fill="none" />
      <path d="M200,354 L200,388" stroke="#1d1424" strokeWidth="1.6" />
    </g>
  );
}

/** A thinking diamond (the mock's `dia`). */
function Dia({ x, y, s, c, d }: { x: number; y: number; s: number; c: string; d: number }) {
  return (
    <g className="j-td" style={{ animationDelay: `${d}s` }}>
      <polygon points={`${x},${y - s} ${x + s},${y} ${x},${y + s} ${x - s},${y}`} fill={c} />
      <polygon points={`${x},${y - s} ${x + s},${y} ${x},${y + s}`} fill="rgba(0,0,0,.22)" />
    </g>
  );
}

/** A falling paper triangle (the mock's `tri`). */
function Tri({ x, y, s, c, d, r }: { x: number; y: number; s: number; c: string; d: number; r: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r})`}>
      <g className="j-cf" style={{ animationDelay: `${d}s` }}>
        <polygon points={`0,${-s} ${s * 0.87},${s * 0.5} ${-s * 0.87},${s * 0.5}`} fill={c} />
      </g>
    </g>
  );
}

/** A drifting Z (the mock's `zz`). */
function Zz({ s, d }: { s: number; d: number }) {
  return (
    <g transform={`translate(272 104) scale(${s})`}>
      <g className="j-zz" style={{ animationDelay: `${d}s` }}>
        <polygon points="0,0 12,0 12,2.6 4.2,10 12,10 12,12.6 0,12.6 0,10 7.8,2.6 0,2.6" fill={C.cream} />
      </g>
    </g>
  );
}

/* ---------------------------------------------------------------------------------------------
 * The component.
 * ------------------------------------------------------------------------------------------- */

/**
 * Jongi, the companion. Paper layers with idle breathing, random blinks and ear flicks;
 * moods idle, think, rest, and cheer (a one-shot Win that returns to idle).
 */
export function Jongi({
  size = 36,
  mood = "idle",
  framing = "bust",
  track: follow = false,
  parallax = 0.25,
  tile = false,
  label,
  className,
  style,
  onWinEnd,
  ref,
}: JongiProps) {
  const uid = useId().replace(/:/g, "");
  const rootRef = useRef<HTMLSpanElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const lookRef = useRef<SVGGElement>(null);
  const blinkRef = useRef<SVGGElement>(null);
  const backRef = useRef<SVGGElement>(null);
  const [winning, setWinning] = useState(false);
  const [happy, setHappy] = useState(false);
  const busy = useRef(false);
  const timers = useRef<number[]>([]);
  const running = useRef<Animation[]>([]);
  const onWinEndRef = useRef(onWinEnd);
  onWinEndRef.current = onWinEnd;
  const [phase] = useState(() => `${(-Math.random() * 7).toFixed(2)}s`);

  const detail = size >= DETAIL_MIN_SIZE;
  const pose: Exclude<JongiMood, "cheer"> = mood === "cheer" ? "idle" : mood;
  const f = (id: string) => (detail ? `${uid}-${id}` : undefined);

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  const play = useCallback((selector: string, keys: Keys, options: KeyframeAnimationOptions) => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.querySelectorAll<SVGElement>(selector).forEach((el) => {
      if (typeof el.animate === "function") running.current.push(el.animate(keys, options));
    });
  }, []);

  const win = useCallback(() => {
    if (busy.current || !svgRef.current) return;
    busy.current = true;
    const end = () => {
      busy.current = false;
      setWinning(false);
      setHappy(false);
      onWinEndRef.current?.();
    };
    if (prefersReducedMotion()) {
      setHappy(true);
      later(end, 1600);
      return;
    }
    const D = 1500;
    setWinning(true);
    play(".j-hop", WIN_HOP, { duration: D });
    play(".j-gsh", WIN_SHADOW, { duration: D, easing: "ease-in-out" });
    play(".j-arm", WIN_ARM, { duration: 2000 });
    play(".j-capg", WIN_CAP, { duration: D });
    play(".j-ears", WIN_EARS, { duration: D, easing: "ease-in-out" });
    play(".j-tflick", WIN_TASSEL, { duration: 1800 });
    play(".j-disc-in", WIN_DISC, { duration: D });
    later(() => setHappy(true), 300);
    later(() => setHappy(false), 1900);
    later(end, WIN_MS);
  }, [later, play]);

  const poke = useCallback(() => {
    if (busy.current || prefersReducedMotion()) return;
    play(".j-hop", POKE, { duration: 450 });
  }, [play]);

  const flick = useCallback(() => {
    if (busy.current || prefersReducedMotion()) return;
    play(".j-ear-r", FLICK_R, { duration: 560, easing: "linear" });
    play(".j-ear-l", FLICK_L, { duration: 420, delay: 120, easing: "linear" });
  }, [play]);

  useImperativeHandle(ref, () => ({ win, poke, flick }), [win, poke, flick]);

  // mood "cheer" fires the Win one-shot each time it is set.
  useEffect(() => {
    if (mood === "cheer") win();
  }, [mood, win]);

  // Random blinks while the eyes are open (the mock's hero: every 2.2–6s, sometimes twice).
  useEffect(() => {
    if (pose === "rest" || prefersReducedMotion()) return;
    let timer = 0;
    const blink = () => {
      const g = blinkRef.current;
      if (g && typeof g.animate === "function") g.animate(BLINK, { duration: 180, easing: "ease-in-out" });
    };
    const loop = () => {
      blink();
      if (Math.random() < 0.2) window.setTimeout(blink, 260);
      timer = window.setTimeout(loop, 2200 + Math.random() * 3800);
    };
    timer = window.setTimeout(loop, 800 + Math.random() * 3000);
    return () => window.clearTimeout(timer);
  }, [pose]);

  // Pointer look-at and parallax.
  useEffect(() => {
    const root = rootRef.current;
    const svg = svgRef.current;
    const look = lookRef.current;
    if (!follow || !root || !svg || !look) return;
    const heads = Array.from(svg.querySelectorAll<SVGGElement>("[data-j-head]"));
    const t: Tracked = {
      root,
      look,
      heads,
      back: backRef.current,
      parallax: Math.max(0, Math.min(PARALLAX_CAP, parallax)),
      cur: { x: 0, y: 0 },
    };
    return track(t);
  }, [follow, parallax, pose, framing]);

  useEffect(
    () => () => {
      timers.current.forEach((id) => window.clearTimeout(id));
      running.current.forEach((a) => a.cancel());
    },
    [],
  );

  const arms: [number, number] = pose === "think" ? [135, 98] : [135, 135];
  const scene = framing === "scene";
  const book = framing !== "bust";

  return (
    <span
      ref={rootRef}
      className={cn("jongi", `j-${pose}`, `j-${framing}`, tile && "j-tile", tile === "round" && "j-round", winning && "j-winning", happy && "j-happy", follow && "j-tracking", className)}
      style={{ width: size, height: size, "--j-phase": phase, ...style } as CSSProperties}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg ref={svgRef} viewBox={VIEWBOX[framing]} aria-hidden="true" focusable="false">
        <defs>
          {detail ? (
            <>
              <filter id={`${uid}-rim`} x="-6%" y="-6%" width="112%" height="112%" colorInterpolationFilters="sRGB">
                <feOffset in="SourceAlpha" dx="1.3" dy="1.5" result="o" />
                <feComposite in="SourceAlpha" in2="o" operator="out" result="edge" />
                <feFlood floodColor="#fff1d8" floodOpacity=".3" />
                <feComposite in2="edge" operator="in" result="hl" />
                <feMerge>
                  <feMergeNode in="SourceGraphic" />
                  <feMergeNode in="hl" />
                </feMerge>
              </filter>
              <filter id={`${uid}-rimds`} x="-20%" y="-20%" width="150%" height="150%" colorInterpolationFilters="sRGB">
                <feOffset in="SourceAlpha" dx="1.3" dy="1.5" result="o" />
                <feComposite in="SourceAlpha" in2="o" operator="out" result="edge" />
                <feFlood floodColor="#fff1d8" floodOpacity=".3" />
                <feComposite in2="edge" operator="in" result="hl" />
                <feMerge result="lit">
                  <feMergeNode in="SourceGraphic" />
                  <feMergeNode in="hl" />
                </feMerge>
                <feDropShadow in="lit" dx="3" dy="6" stdDeviation="4" floodColor="#04050b" floodOpacity=".62" />
              </filter>
              <filter id={`${uid}-rimds2`} x="-20%" y="-20%" width="150%" height="150%">
                <feDropShadow dx="1.2" dy="2.2" stdDeviation="1.4" floodColor="#04050b" floodOpacity=".5" />
              </filter>
              <filter id={`${uid}-cds`} x="-20%" y="-20%" width="150%" height="160%">
                <feDropShadow dx="1.5" dy="3" stdDeviation="2.2" floodColor="#04050b" floodOpacity=".6" />
              </filter>
            </>
          ) : null}
          {book ? (
            <filter id={`${uid}-blur`} x="-30%" y="-100%" width="160%" height="300%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
          ) : null}
        </defs>

        {scene ? (
          <g ref={backRef}>
            <circle cx="200" cy="208" r="164" fill="#111628" />
            <g filter={f("cds") && `url(#${f("cds")})`}>
              <circle cx="192" cy="216" r="130" fill="#18203b" />
            </g>
            <g filter={f("cds") && `url(#${f("cds")})`}>
              <g className="j-disc-in">
                <circle cx="222" cy="178" r="90" fill={pose === "rest" ? "#221a33" : "#2a1f3c"} />
              </g>
            </g>
            {pose === "rest" ? <path d="M100,114 A16,16 0 1,0 100,141.7 A16,16 0 0,1 100,114Z" fill={C.gold} opacity=".7" /> : null}
          </g>
        ) : null}

        {book ? (
          <>
            <g filter={f("rim") && `url(#${f("rim")})`}>
              <Book />
            </g>
            <ellipse className="j-gsh" cx="200" cy="354" rx="94" ry="10" fill="#05030a" opacity=".6" filter={`url(#${uid}-blur)`} />
          </>
        ) : null}

        <g className="j-hop">
          <Layer filter={f("rimds")}>
            <Tail />
          </Layer>
          <Layer filter={f("rimds")}>
            <Body />
          </Layer>
          <Layer filter={f("rimds")}>
            <Feet />
          </Layer>
          <Layer filter={f("rimds")} head>
            <Ears />
          </Layer>
          <Layer filter={f("rimds")} head>
            <Head />
          </Layer>
          <Layer filter={f("rimds2")} head>
            <Eyes closed={pose === "rest"} up={pose === "think"} lookRef={lookRef} blinkRef={blinkRef} />
          </Layer>
          <Layer filter={f("rimds")}>
            <Arms left={arms[0]} right={arms[1]} />
          </Layer>
          <Layer filter={f("rimds")} head>
            <Cap slip={pose === "rest"} />
          </Layer>
        </g>

        {pose === "think" ? (
          <g filter={f("rimds2") && `url(#${f("rimds2")})`}>
            <Dia x={286} y={84} s={4.5} c={C.cream} d={0} />
            <Dia x={303} y={68} s={6.5} c={C.cream} d={0.22} />
            <Dia x={324} y={53} s={9} c={C.gold} d={0.44} />
          </g>
        ) : null}
        {pose === "rest" ? (
          <>
            <Zz s={1} d={0} />
            <Zz s={1.25} d={1.8} />
            <Zz s={0.85} d={3.6} />
          </>
        ) : null}
        {winning ? (
          <g className="j-confetti">
            <Tri x={96} y={100} s={7} c={C.gold} d={0.35} r={10} />
            <Tri x={312} y={76} s={6} c={C.ribbon} d={0.5} r={40} />
            <Tri x={70} y={186} s={5} c={C.cream} d={0.65} r={-20} />
            <Tri x={334} y={176} s={7} c={C.aprL} d={0.55} r={15} />
            <Tri x={150} y={56} s={5} c={C.lilac} d={0.4} r={60} />
            <Tri x={262} y={52} s={6} c={C.cream} d={0.6} r={-30} />
          </g>
        ) : null}
      </svg>
    </span>
  );
}
