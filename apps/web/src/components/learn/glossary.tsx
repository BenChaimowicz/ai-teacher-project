import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import type { GlossaryEntry } from "@senoy/db/reading-lesson";
import { Jongi } from "@/components/companion/jongi.tsx";
import type { TermSegment } from "@/components/learn/glossary-marks.ts";

/** Gap between a marked word and its bubble (room for the tail), and the least room kept to the screen edge, in px. */
const GAP = 10;
const EDGE = 8;
/** The bubble's left edge sits this far left of the word, so the tail at its corner points at the word's start. */
const LEAD = 8;
/** How long a hover bubble waits after the pointer leaves, so the pointer can cross onto it. */
const HOVER_GRACE_MS = 140;
/** How long the mouse rests on a word before its bubble opens, so passing over the text opens nothing. */
const HOVER_OPEN_MS = 220;

/** How a bubble was opened. A click or tap pins it open; hover and focus open it until they end. */
type OpenHow = "hover" | "focus" | "click";

/** The one open bubble: which entry, the marked word it hangs from (and that word's id), and whether a click pinned it. */
type OpenTerm = { entry: GlossaryEntry; anchor: HTMLElement; id: string; pinned: boolean };

/** Where the bubble sits: its offset in the layer, and whether it is above the word (tail at the bottom) or below it. */
type Place = { top: number; left: number; side: "above" | "below" };

/** What a marked word needs from the layer that owns the bubble. */
type GlossaryControls = {
  /** The id of the bubble element, for `aria-controls` and `aria-describedby`. */
  popoverId: string;
  /** The id of the marked word whose bubble is open, or null. */
  openId: string | null;
  /** Whether the open bubble is pinned by a click or tap. */
  pinned: boolean;
  /**
   * Opens the bubble on a marked word.
   * @param entry - The glossary entry
   * @param anchor - The marked word
   * @param id - The marked word's own id
   * @param how - What opened it
   */
  show: (entry: GlossaryEntry, anchor: HTMLElement, id: string, how: OpenHow) => void;
  /**
   * Opens a hover bubble once the mouse has rested on the word a moment.
   * @param entry - The glossary entry
   * @param anchor - The marked word
   * @param id - The marked word's own id
   */
  showSoon: (entry: GlossaryEntry, anchor: HTMLElement, id: string) => void;
  /** Closes the bubble now. */
  hide: () => void;
  /** Closes a hover bubble after a short grace, unless the pointer comes back. */
  hideSoon: () => void;
  /** Cancels a pending {@link GlossaryControls.hideSoon} or {@link GlossaryControls.showSoon}. */
  keep: () => void;
};

const GlossaryContext = createContext<GlossaryControls | null>(null);

type GlossaryLayerProps = {
  /** Called each time a definition opens (the caller dedupes). */
  onOpen?: (entry: GlossaryEntry) => void;
  /** Any change closes the bubble: a new Lesson, a book page turn. */
  resetKey: string;
  children: ReactNode;
};

/**
 * Owns the reading page's one glossary bubble, Jongi's speech bubble with a word's definition, and lets marked words
 * open it. Renders a zero-size anchor layer as its first child, inside the reading page, so the bubble takes the page's
 * colours (Sepia and Paper re-point them) and scrolls with the text, and so the book view's clipping never cuts it off.
 */
export function GlossaryLayer({ onOpen, resetKey, children }: GlossaryLayerProps) {
  const popoverId = useId();
  const [open, setOpen] = useState<OpenTerm | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const layer = useRef<HTMLDivElement>(null);
  const popover = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | null>(null);
  const openRef = useRef<OpenTerm | null>(null);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  const keep = useCallback(() => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const hide = useCallback(() => {
    keep();
    openRef.current = null;
    setOpen(null);
  }, [keep]);

  const hideSoon = useCallback(() => {
    keep();
    if (!openRef.current || openRef.current.pinned) return;
    timer.current = window.setTimeout(hide, HOVER_GRACE_MS);
  }, [keep, hide]);

  const show = useCallback(
    (entry: GlossaryEntry, anchor: HTMLElement, id: string, how: OpenHow) => {
      keep();
      const current = openRef.current;
      const same = current?.id === id;
      if (!same) onOpenRef.current?.(entry);
      const next = { entry, anchor, id, pinned: how === "click" || (same && current.pinned) };
      openRef.current = next;
      setOpen(next);
    },
    [keep],
  );

  const showSoon = useCallback(
    (entry: GlossaryEntry, anchor: HTMLElement, id: string) => {
      keep();
      if (openRef.current?.id === id) return;
      timer.current = window.setTimeout(() => show(entry, anchor, id, "hover"), HOVER_OPEN_MS);
    },
    [keep, show],
  );

  useEffect(() => hide, [resetKey, hide]);
  useEffect(() => keep, [keep]);

  /* Places the bubble over the word with its tail at the word's start, or under it when there is no room above, kept
     inside the screen. */
  const reposition = useCallback(() => {
    const box = layer.current?.getBoundingClientRect();
    const pop = popover.current;
    if (!box || !pop || !open) return;
    const word = open.anchor.getBoundingClientRect();
    if (!word.width && !word.height) {
      hide();
      return;
    }
    const width = pop.offsetWidth;
    const height = pop.offsetHeight;
    const left = Math.max(EDGE, Math.min(window.innerWidth - EDGE - width, word.left - LEAD));
    const fitsAbove = word.top - GAP - height >= EDGE;
    const fitsBelow = word.bottom + GAP + height <= window.innerHeight - EDGE;
    const side = fitsAbove || !fitsBelow ? "above" : "below";
    const top = side === "above" ? word.top - GAP - height : word.bottom + GAP;
    setPlace({ top: top - box.top, left: left - box.left, side });
  }, [open, hide]);

  useLayoutEffect(() => {
    if (!open) {
      setPlace(null);
      return;
    }
    reposition();
    window.addEventListener("resize", reposition);
    return () => window.removeEventListener("resize", reposition);
  }, [open, reposition]);

  /* Escape closes and hands focus back to the word; a press anywhere else closes. */
  useEffect(() => {
    if (!open) return;
    const anchor = open.anchor;
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      hide();
      anchor.focus({ preventScroll: true });
    }
    function onDown(event: globalThis.PointerEvent) {
      const target = event.target as Node | null;
      if (target && (anchor.contains(target) || popover.current?.contains(target))) return;
      hide();
    }
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, hide]);

  const controls: GlossaryControls = { popoverId, openId: open?.id ?? null, pinned: open?.pinned ?? false, show, showSoon, hide, hideSoon, keep };

  return (
    <GlossaryContext.Provider value={controls}>
      <div className="l-gloss-layer" ref={layer}>
        {open ? (
          <span
            ref={popover}
            id={popoverId}
            role="tooltip"
            className="l-gloss-pop"
            data-side={place?.side ?? "above"}
            style={place ? { top: place.top, left: place.left } : { visibility: "hidden" }}
            onPointerEnter={keep}
            onPointerLeave={(event) => {
              if (event.pointerType === "mouse") hideSoon();
            }}
            onMouseDown={(event) => event.preventDefault()}
          >
            <Jongi size={22} framing="bust" className="l-gloss-jongi" />
            <b>{open.entry.term}</b>
            {open.entry.definition}
          </span>
        ) : null}
      </div>
      {children}
    </GlossaryContext.Provider>
  );
}

/**
 * One marked word in the prose: a dotted underline that opens its definition on hover, focus, click, or tap.
 * Enter or Space pins it open; Escape closes it. Outside a {@link GlossaryLayer} it renders as plain text.
 */
function GlossaryTerm({ text, entry }: { text: string; entry: GlossaryEntry }) {
  const controls = useContext(GlossaryContext);
  const id = useId();
  const self = useRef<HTMLSpanElement>(null);
  if (!controls) return <>{text}</>;
  const { popoverId, openId, pinned, show, showSoon, hide, hideSoon } = controls;
  const isOpen = openId === id;

  /** A click, a tap, Enter, or Space: pins the bubble open, or closes it when already pinned. */
  function toggle() {
    if (!self.current) return;
    if (isOpen && pinned) hide();
    else show(entry, self.current, id, "click");
  }

  /**
   * Enter and Space act like a click, as on a button.
   * @param event - Key press on the word
   */
  function onKeyDown(event: KeyboardEvent<HTMLSpanElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggle();
    }
  }

  /**
   * A mouse resting on the word opens it; touch is left to the tap.
   * @param event - Pointer entering the word
   */
  function onPointerEnter(event: PointerEvent<HTMLSpanElement>) {
    if (event.pointerType === "mouse" && self.current) showSoon(entry, self.current, id);
  }

  return (
    <span
      ref={self}
      role="button"
      tabIndex={0}
      className="l-term"
      aria-expanded={isOpen}
      aria-controls={isOpen ? popoverId : undefined}
      aria-describedby={isOpen ? popoverId : undefined}
      onClick={toggle}
      onKeyDown={onKeyDown}
      onFocus={() => {
        if (self.current?.matches(":focus-visible")) show(entry, self.current, id, "focus");
      }}
      onBlur={() => {
        if (isOpen) hide();
      }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") hideSoon();
      }}
    >
      {text}
    </span>
  );
}

/**
 * Renders prose segments, with each glossary term as a {@link GlossaryTerm}.
 * @param segments - From the glossary matcher
 */
export function MarkedText({ segments }: { segments: TermSegment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.entry ? <GlossaryTerm key={index} text={segment.text} entry={segment.entry} /> : segment.text,
      )}
    </>
  );
}
