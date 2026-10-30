import { useEffect, useId, useImperativeHandle, useRef, useState, type CSSProperties, type Ref } from "react";
import { prefersReducedMotion } from "@/lib/cheer.ts";
import { cn } from "@/lib/utils";
import manifest from "./frames/frames.json";
import flickBust from "./frames/flick-bust.webp";
import idleBust from "./frames/idle-bust.webp";
import idleFull from "./frames/idle-full.webp";
import poofBust from "./frames/poof-bust.webp";
import readingBust from "./frames/reading-bust.webp";
import restBust from "./frames/rest-bust.webp";
import thinkBust from "./frames/think-bust.webp";
import winBust from "./frames/win-bust.webp";
import winFull from "./frames/win-full.webp";
import "./jongi.css";

/*
 * Jongi, the companion: a raccoon cut from the same paper as the app, with a tilted scholar cap and
 * a red bookmark ribbon pinned to his chest. He is modelled and animated in jongi.blend (next to this
 * file) and ships as pre-rendered frames: one WebP sprite sheet per action and framing in ./frames,
 * plus frames.json with each sheet's timing, grid, and where his pupils sit on every frame.
 * Re-export: run the jongi_export.py text block in Blender, then `pnpm jongi:pack`.
 *
 * Actions, all at 24 fps:
 *   - idle     loop 4.2s: breathing, a head bob, blinks, an ear flick, the tassel swaying
 *   - reading  loop 8s: lying on his stomach, paw on his cheek, turning a page (bust only)
 *   - think    loop 5s: paw to chin, eyes up and darting, thought bubbles that pop
 *   - win      one-shot 2s: a hop with arms up, cap toss and happy eyes; ends on idle's first frame
 *   - rest     loop 5.6s: eyes closed, slow breathing, cap slipped, drifting Zs
 *   - flick    one-shot 0.375s: idle's first frames with an ear twitch (hover); idle carries on after
 *   - poof     overlay 0.56s: a paper smoke cloud over whatever shows; the pose swaps under it at 210 ms
 *
 * Mapping from props: mood "idle" plays idle, and in the bust framing alternates with reading every
 * 20s; "think" and "rest" play their loops; "cheer" (or `ref.win()`) plays win, then the mood's loop.
 * Every switch cuts behind the poof, except into win and from win back to idle. The full and scene
 * framings only have idle and win sheets, so think and rest show idle there.
 * The frames leave out the pupils: they are drawn here from frames.json, so `track` can slide them
 * toward the pointer. Reduced motion holds a still frame of each mood; Win shows happy eyes, no hop.
 */

export type JongiMood = "idle" | "think" | "cheer" | "rest";

/**
 * How much of Jongi shows.
 * - `bust`: head and shoulders, for avatars (chat lines, the sidebar card).
 * - `full`: the whole raccoon on his open book.
 * - `scene`: the whole raccoon with the paper discs behind him (the mock's pose tiles).
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
  /** Eyes follow the pointer, and the picture shifts a little (parallax). */
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

/* ---------------------------------------------------------------------------------------------
 * The sheets.
 * ------------------------------------------------------------------------------------------- */

/** One sprite sheet's entry in frames.json. */
type SheetMeta = {
  /** Frame width and height in the sheet, px. */
  size: number;
  frames: number;
  cols: number;
  rows: number;
  /** Transparent gap between frames in the sheet, px. */
  pad: number;
  loop: boolean;
  durationMs: number;
  /** How far the pupils may slide toward the pointer, in frame px. */
  lookRangePx: number;
  /** The poof: when the pose underneath swaps. */
  swapAtMs?: number;
  /** The flick: idle's frame (1-based) to carry on from. */
  resumeFrame?: number;
  /** Per frame: L eye, L shine, L small shine, R eye, R shine, R small shine, each cx, cy, rx, ry in frame px. */
  eyes?: number[][];
};

/** A sheet and its image URL. */
type Sheet = SheetMeta & { url: string };

/** What Jongi can be playing. */
type Clip = "idle" | "reading" | "think" | "win" | "rest" | "flick";

const META = manifest as unknown as Record<string, SheetMeta>;

/**
 * Pairs a frames.json entry with its image.
 * @param name - The sheet's name in frames.json
 * @param url - Its bundled image URL
 */
function sheet(name: string, url: string): Sheet {
  return { ...META[name], url };
}

const BUST: Record<Clip, Sheet> = {
  idle: sheet("idle-bust", idleBust),
  reading: sheet("reading-bust", readingBust),
  think: sheet("think-bust", thinkBust),
  win: sheet("win-bust", winBust),
  rest: sheet("rest-bust", restBust),
  flick: sheet("flick-bust", flickBust),
};
const FULL: Partial<Record<Clip, Sheet>> = { idle: sheet("idle-full", idleFull), win: sheet("win-full", winFull) };
const POOF = sheet("poof-bust", poofBust);

const FRAME_MS = 1000 / 24;
/** Each idle variant (sitting, reading) holds this long before the other takes over. */
const IDLE_VARIANT_MS = 20_000;
/** The next idle variant's sheet starts loading this long into the current one. */
const PRELOAD_MS = 15_000;
/** Reduced motion: the frame each loop holds (think: all three bubbles up). */
const STILL: Partial<Record<Clip, number>> = { think: 60 };
/** Reduced motion: how long Win's happy eyes show. */
const HAPPY_MS = 1600;
const PARALLAX_CAP = 0.5;
/** The frames are rendered with room for the round tile's circle; square busts zoom in to head and shoulders. */
const SQUARE_BUST_ZOOM = 4.2 / 3.7;
/** The rendered pupils' colours, sampled from Blender's lit render rather than the paper swatches. */
const EYE_INK = "#131625";
const EYE_SHINE = "#ecdcbf";

const POKE: Keyframe[] = [
  { offset: 0, transform: "translateY(0) scale(1,1)" },
  { offset: 0.3, transform: "translateY(1%) scale(1.06,.92)", easing: "cubic-bezier(.2,.7,.3,1)" },
  { offset: 0.65, transform: "translateY(-.8%) scale(.98,1.03)" },
  { offset: 1, transform: "translateY(0) scale(1,1)" },
];

const decoded = new Map<string, Promise<void>>();

/**
 * Loads and decodes a sheet once per page, so a switch can wait for it and swap without a blank frame.
 * @param url - The sheet's image URL
 * @returns Resolves when the image is ready (or failed; the browser then retries it as a background)
 */
function load(url: string): Promise<void> {
  let ready = decoded.get(url);
  if (!ready) {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    ready = img.decode().catch(() => undefined);
    decoded.set(url, ready);
  }
  return ready;
}

/**
 * The CSS that shows one frame of a sheet in a box of the given size.
 * @param s - The sheet
 * @param index - Frame index, 0-based
 * @param size - The box's size in CSS px
 */
function frameStyle(s: Sheet, index: number, size: number) {
  const k = size / s.size;
  const step = (s.size + s.pad) * k;
  return {
    backgroundImage: `url(${s.url})`,
    backgroundSize: `${(s.cols * s.size + (s.cols - 1) * s.pad) * k}px ${(s.rows * s.size + (s.rows - 1) * s.pad) * k}px`,
    backgroundPosition: `${-(index % s.cols) * step}px ${-Math.floor(index / s.cols) * step}px`,
  };
}

/**
 * The frame Win's happy eyes show on longest: its last frame with both eyes shut.
 * @param s - The win sheet
 */
function happyFrame(s: Sheet) {
  const eyes = s.eyes ?? [];
  for (let i = eyes.length - 1; i >= 0; i--) if (eyes[i][2] === 0 && eyes[i][14] === 0) return i;
  return 0;
}

/* ---------------------------------------------------------------------------------------------
 * One shared animation loop drives every mounted Jongi: frames, the poof, and the pointer look.
 * ------------------------------------------------------------------------------------------- */

type Ticker = (now: number) => void;

const tickers = new Set<Ticker>();
const pointer = { x: 0, y: 0, last: -1e9 };
let running = false;
let listening = false;

/**
 * Advances every mounted Jongi by one animation frame.
 * @param now - Frame timestamp
 */
function run(now: number) {
  if (tickers.size === 0) {
    running = false;
    return;
  }
  tickers.forEach((tick) => tick(now));
  requestAnimationFrame(run);
}

/**
 * Records the pointer position for the look-at.
 * @param event - Pointer move
 */
function onPointerMove(event: PointerEvent) {
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  pointer.last = performance.now();
}

/**
 * Adds a Jongi to the shared loop while it is mounted.
 * @param tick - Its per-frame update
 * @param follow - Whether it needs pointer positions
 * @returns A function that removes it
 */
function addTicker(tick: Ticker, follow: boolean) {
  tickers.add(tick);
  if (follow && !listening) {
    addEventListener("pointermove", onPointerMove, { passive: true });
    listening = true;
  }
  if (!running) {
    running = true;
    requestAnimationFrame(run);
  }
  return () => {
    tickers.delete(tick);
  };
}

/** The DOM a player writes to. */
type Parts = {
  root: HTMLElement;
  /** Zoom and parallax. */
  stage: HTMLElement;
  /** The click squash, pivoting at his feet. */
  body: HTMLElement;
  frame: HTMLElement;
  eyes: SVGSVGElement;
  /** The pupils' paper shadow, sized per sheet. */
  shadow: SVGFEDropShadowElement;
  look: SVGGElement;
  pupils: SVGEllipseElement[];
  puff: HTMLElement;
};

/** What the component asks of its player. */
type Player = {
  setMood: (mood: JongiMood) => void;
  win: () => void;
  poke: () => void;
  flick: () => void;
  stop: () => void;
};

type PlayerOptions = {
  size: number;
  framing: JongiFraming;
  follow: boolean;
  parallax: number;
  mood: JongiMood;
  onWinEnd: () => void;
};

/**
 * Starts playing Jongi's frames into the given elements.
 * @param parts - The elements to draw into
 * @param options - Size, framing, look-at, the starting mood, and the Win callback
 * @returns Controls for mood changes, the one-shots, and teardown
 */
function startPlayer(parts: Parts, options: PlayerOptions): Player {
  const { size, framing, follow } = options;
  const parallax = Math.max(0, Math.min(PARALLAX_CAP, options.parallax));
  const reduced = prefersReducedMotion();
  const bust = framing === "bust";
  const pick = (clip: Clip): Sheet => (bust ? BUST[clip] : (FULL[clip] ?? FULL.idle!));
  const timers: number[] = [];

  let loopClip: Clip = options.mood === "think" || options.mood === "rest" ? options.mood : "idle";
  let clip: Clip = loopClip;
  let current = pick(clip);
  let t0 = performance.now();
  let start = 0;
  let shownIndex = -1;
  let done = false;
  let variantSince = t0;
  let winning = false;
  let puffT0: number | null = null;
  let pending: Clip | null = null;
  let puffIndex = -1;
  let generation = 0;
  const look = { x: 0, y: 0, ax: NaN, ay: NaN };

  /**
   * Draws one frame of the current sheet, and its pupils.
   * @param index - Frame index, 0-based
   */
  function draw(index: number) {
    Object.assign(parts.frame.style, frameStyle(current, index, size));
    const row = current.eyes?.[index];
    parts.pupils.forEach((el, i) => {
      el.setAttribute("cx", String(row ? row[i * 4] : 0));
      el.setAttribute("cy", String(row ? row[i * 4 + 1] : 0));
      el.setAttribute("rx", String(row ? row[i * 4 + 2] : 0));
      el.setAttribute("ry", String(row ? row[i * 4 + 3] : 0));
    });
    shownIndex = index;
  }

  /**
   * Switches to a clip right away.
   * @param next - The clip
   * @param from - The frame index to start from
   * @param now - The current timestamp
   */
  function show(next: Clip, from: number, now: number) {
    clip = next;
    current = pick(next);
    t0 = now;
    start = from;
    done = false;
    const unit = current.size / 128;
    parts.eyes.setAttribute("viewBox", `0 0 ${current.size} ${current.size}`);
    parts.shadow.setAttribute("dx", String(0.3 * unit));
    parts.shadow.setAttribute("dy", String(0.7 * unit));
    parts.shadow.setAttribute("stdDeviation", String(0.4 * unit));
    if (next === "idle" || next === "reading") variantSince = now;
    draw(reduced ? (STILL[next] ?? 0) : from);
  }

  /**
   * Switches to a clip once its sheet is ready, behind the poof when asked (and when there is one).
   * @param next - The clip
   * @param puff - Cut behind the smoke cloud
   */
  function go(next: Clip, puff: boolean) {
    const ticket = ++generation;
    const sheets = puff && bust && !reduced ? [load(pick(next).url), load(POOF.url)] : [load(pick(next).url)];
    void Promise.all(sheets).then(() => {
      if (ticket !== generation) return;
      if (puff && bust && !reduced) {
        puffT0 = performance.now();
        pending = next;
        puffIndex = -1;
        parts.puff.style.visibility = "visible";
      } else {
        show(next, 0, performance.now());
      }
    });
  }

  /** Whether what is on screen already belongs to the current mood. */
  const settled = () => clip === loopClip || (loopClip === "idle" && (clip === "reading" || clip === "flick"));

  /**
   * Called once when a one-shot reaches its last frame.
   * @param now - The current timestamp
   */
  function ended(now: number) {
    if (clip === "flick") {
      show("idle", (current.resumeFrame ?? 1) - 1, now);
      return;
    }
    if (clip !== "win") return;
    winning = false;
    options.onWinEnd();
    // Win ends on idle's first frame, so the way back to idle is a straight cut.
    if (loopClip === "idle") show("idle", 0, now);
    else go(loopClip, true);
  }

  /**
   * Advances this Jongi by one animation frame.
   * @param now - Frame timestamp
   */
  function tick(now: number) {
    if (puffT0 !== null) {
      const elapsed = now - puffT0;
      if (pending && elapsed >= (POOF.swapAtMs ?? 0)) {
        show(pending, 0, now);
        pending = null;
      }
      const i = Math.floor(elapsed / FRAME_MS);
      if (i >= POOF.frames) {
        puffT0 = null;
        parts.puff.style.visibility = "hidden";
      } else if (i !== puffIndex) {
        puffIndex = i;
        Object.assign(parts.puff.style, frameStyle(POOF, i, size));
      }
    }

    if (!reduced) {
      let i = Math.floor((now - t0) / FRAME_MS) + start;
      if (current.loop) i %= current.frames;
      else if (i >= current.frames) {
        i = current.frames - 1;
        if (!done && (clip === "win" || clip === "flick")) {
          if (shownIndex !== i) draw(i);
          done = true;
          ended(now);
          i = shownIndex;
        }
      }
      if (i !== shownIndex) draw(i);

      // mood "idle" alternates between sitting and reading (bust only; the full framing has no reading sheet).
      if (bust && loopClip === "idle" && !winning && puffT0 === null && (clip === "idle" || clip === "reading")) {
        const since = now - variantSince;
        const other: Clip = clip === "idle" ? "reading" : "idle";
        if (since >= PRELOAD_MS) void load(pick(other).url);
        if (since >= IDLE_VARIANT_MS) {
          variantSince = Infinity;
          go(other, true);
        }
      }
    }

    if (follow && !reduced) {
      const rect = parts.root.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > innerHeight || rect.width === 0) return;
      let tx: number;
      let ty: number;
      if (now - pointer.last > 2500) {
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
      look.x += (tx - look.x) * 0.08;
      look.y += (ty - look.y) * 0.08;
      if (Math.abs(look.x - look.ax) > 1e-3 || Math.abs(look.y - look.ay) > 1e-3 || Number.isNaN(look.ax)) {
        look.ax = look.x;
        look.ay = look.y;
        const r = current.lookRangePx;
        parts.look.setAttribute("transform", `translate(${(look.x * r).toFixed(2)} ${(look.y * r * 0.8).toFixed(2)})`);
        if (parallax > 0) parts.stage.style.translate = `${(look.x * 3 * parallax).toFixed(2)}% ${(look.y * 2 * parallax).toFixed(2)}%`;
      }
    }
  }

  /** The Win one-shot: cuts straight in, so the celebration lands on the beat. */
  function win() {
    if (winning) return;
    winning = true;
    generation++;
    pending = null;
    if (reduced) {
      show("win", 0, performance.now());
      draw(happyFrame(current));
      timers.push(
        window.setTimeout(() => {
          winning = false;
          options.onWinEnd();
          show(loopClip, 0, performance.now());
        }, HAPPY_MS),
      );
      return;
    }
    void load(pick("win").url).then(() => {
      if (!winning) return;
      puffT0 = null;
      parts.puff.style.visibility = "hidden";
      show("win", 0, performance.now());
    });
  }

  /**
   * Plays the given mood's loop, behind the poof when it changes what is on screen.
   * @param mood - The new mood
   */
  function setMood(mood: JongiMood) {
    if (mood === "cheer") {
      loopClip = "idle";
      win();
      return;
    }
    loopClip = mood;
    if (winning) return;
    if (pending) {
      // The cloud is already up: retarget the swap under it.
      pending = settled() ? null : loopClip;
      if (pending) void load(pick(pending).url);
      return;
    }
    if (!settled()) go(loopClip, true);
  }

  /** A small squash, for a click or tap. */
  function poke() {
    if (winning || reduced || typeof parts.body.animate !== "function") return;
    parts.body.animate(POKE, { duration: 450 });
  }

  /** The ear flick, for hover: only from the sitting idle, the one pose it was drawn for. */
  function flick() {
    if (!bust || winning || reduced || clip !== "idle" || puffT0 !== null) return;
    void load(pick("flick").url).then(() => {
      if (clip === "idle" && !winning && puffT0 === null) show("flick", 0, performance.now());
    });
  }

  show(clip, reduced || !current.loop ? 0 : Math.floor(Math.random() * current.frames), t0);
  const remove = addTicker(tick, follow);

  return {
    setMood,
    win,
    poke,
    flick,
    stop() {
      remove();
      timers.forEach((id) => window.clearTimeout(id));
      generation++;
    },
  };
}

/* ---------------------------------------------------------------------------------------------
 * The component.
 * ------------------------------------------------------------------------------------------- */

/**
 * Jongi, the companion: rendered paper frames with drawn pupils; moods idle (alternating with
 * reading), think, rest, and cheer (a one-shot Win that returns to idle).
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
  const stageRef = useRef<HTMLSpanElement>(null);
  const bodyRef = useRef<HTMLSpanElement>(null);
  const frameRef = useRef<HTMLSpanElement>(null);
  const eyesRef = useRef<SVGSVGElement>(null);
  const shadowRef = useRef<SVGFEDropShadowElement>(null);
  const lookRef = useRef<SVGGElement>(null);
  const pupilRefs = useRef<(SVGEllipseElement | null)[]>([]);
  const puffRef = useRef<HTMLSpanElement>(null);
  const player = useRef<Player | null>(null);
  const moodRef = useRef(mood);
  moodRef.current = mood;
  const onWinEndRef = useRef(onWinEnd);
  onWinEndRef.current = onWinEnd;

  // The first paint shows the mood's first frame; the player takes over from there.
  const [first] = useState(() => {
    const clip: Clip = mood === "think" || mood === "rest" ? mood : "idle";
    const s = framing === "bust" ? BUST[clip] : (FULL[clip] ?? FULL.idle!);
    return { style: frameStyle(s, 0, size), size: s.size };
  });

  useEffect(() => {
    const root = rootRef.current;
    const stage = stageRef.current;
    const body = bodyRef.current;
    const frame = frameRef.current;
    const eyes = eyesRef.current;
    const shadow = shadowRef.current;
    const lookG = lookRef.current;
    const puff = puffRef.current;
    const pupils = pupilRefs.current.filter((el): el is SVGEllipseElement => el !== null);
    if (!root || !stage || !body || !frame || !eyes || !shadow || !lookG || !puff || pupils.length !== 6) return;
    const p = startPlayer(
      { root, stage, body, frame, eyes, shadow, look: lookG, pupils, puff },
      { size, framing, follow, parallax, mood: moodRef.current === "cheer" ? "idle" : moodRef.current, onWinEnd: () => onWinEndRef.current?.() },
    );
    player.current = p;
    if (moodRef.current === "cheer") p.win();
    return () => {
      p.stop();
      player.current = null;
    };
  }, [size, framing, follow, parallax]);

  useEffect(() => {
    player.current?.setMood(mood);
  }, [mood]);

  useImperativeHandle(
    ref,
    () => ({
      win: () => player.current?.win(),
      poke: () => player.current?.poke(),
      flick: () => player.current?.flick(),
    }),
    [],
  );

  const scene = framing === "scene";
  const zoom = framing === "bust" && tile !== "round" ? SQUARE_BUST_ZOOM : 1;

  return (
    <span
      ref={rootRef}
      className={cn("jongi", `j-${framing}`, tile && "j-tile", tile === "round" && "j-round", follow && "j-tracking", className)}
      style={{ width: size, height: size, ...style }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {scene ? (
        <svg className="j-discs" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
          <circle cx="50" cy="50" r="41" fill="#111628" />
          <circle cx="48" cy="52" r="32.5" fill="#18203b" />
          <circle cx="55.5" cy="44.5" r="22.5" fill={mood === "rest" ? "#221a33" : "#2a1f3c"} />
          {mood === "rest" ? <path d="M25,28.5 A4,4 0 1,0 25,35.4 A4,4 0 0,1 25,28.5Z" fill="#e7b250" opacity=".7" /> : null}
        </svg>
      ) : null}
      <span ref={stageRef} className="j-stage" style={zoom === 1 ? undefined : { scale: String(zoom) }}>
        <span ref={bodyRef} className="j-body">
          <span ref={frameRef} className="j-frame" style={first.style} />
          <svg ref={eyesRef} className="j-eyes" viewBox={`0 0 ${first.size} ${first.size}`} aria-hidden="true" focusable="false">
            <defs>
              <filter id={`${uid}-eye`} x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow ref={shadowRef} dx="0.3" dy="0.7" stdDeviation="0.4" floodColor="#04050b" floodOpacity=".45" />
              </filter>
            </defs>
            <g ref={lookRef} filter={`url(#${uid}-eye)`}>
              {[EYE_INK, EYE_SHINE, EYE_SHINE, EYE_INK, EYE_SHINE, EYE_SHINE].map((fill, i) => (
                <ellipse
                  key={i}
                  ref={(el) => {
                    pupilRefs.current[i] = el;
                  }}
                  fill={fill}
                />
              ))}
            </g>
          </svg>
        </span>
        <span ref={puffRef} className="j-puff" />
      </span>
    </span>
  );
}
