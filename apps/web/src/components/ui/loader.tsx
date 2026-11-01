import { useEffect, useState, type CSSProperties } from "react";
import { MARK_HEAD } from "@/lib/brand-marks.ts";
import { cn } from "@/lib/utils";

type LoaderProps = {
  /** Pixel size. Under 48 renders inline (no label). */
  size?: number;
  /** Visible label for the page loader; also the accessible name. */
  label?: string;
  className?: string;
};

/*
 * The Papercraft loader from docs/uis/redesign/10-papercraft-jongi.html: an open book on a plum
 * cover whose right page keeps turning, read by Jongi's head (the mark, MARK_HEAD) over the top, his
 * paws on the pages. Its own little artboard, independent of the companion component. Animation lives
 * in kit.css (`.k-loader .lp`, `.le`, `.lh`).
 */
const LOADER_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true">
<g class="lh"><g transform="translate(16 15)">${MARK_HEAD}</g></g>
<path d="M6,47 Q19,43 32,47 Q45,43 58,47 L58,59 Q45,55 32,59 Q19,55 6,59Z" fill="#3a2747"/>
<path d="M8,45 Q20,41 32,45 L32,57 Q20,53 8,57Z" fill="#d4c3a0"/><path d="M32,45 Q44,41 56,45 L56,57 Q44,53 32,57Z" fill="#e2d3b2"/>
<path d="M12,48.5 Q20,46 28,48.5 M12,51.5 Q20,49 28,51.5 M36,48.5 Q44,46 52,48.5 M36,51.5 Q44,49 50,51" stroke="#a8977a" stroke-width=".7" fill="none"/>
<path class="lp lp2" d="M32,45 Q44,41 56,45 L56,57 Q44,53 32,57Z" fill="#e2d3b2"/><path class="lp" d="M32,45 Q44,41 56,45 L56,57 Q44,53 32,57Z" fill="#e2d3b2"/>
<path d="M32,45 L32,59" stroke="#2a1c33" stroke-width="1"/>
<ellipse cx="24" cy="45.5" rx="3.2" ry="2" fill="#3a3d52"/><ellipse cx="40" cy="45.5" rx="3.2" ry="2" fill="#3a3d52"/></svg>`;

/**
 * Loading state: a page turning in a little book, the companion reading over it.
 * Use size 18–24 inline (buttons, rows) and 64–96 for a page or panel.
 */
export function Loader({ size = 96, label, className }: LoaderProps) {
  const small = size < 48;
  return (
    <span
      className={cn("k-loader", small && "sm", className)}
      style={{ "--s": `${size}px` } as CSSProperties}
      role="progressbar"
      aria-label={label ?? "Loading"}
      aria-busy="true"
    >
      <span className="art" dangerouslySetInnerHTML={{ __html: LOADER_SVG }} />
      {label && !small ? <span className="label">{label}</span> : null}
    </span>
  );
}

/** How long a page load may take before the loader shows: quicker loads just show the page. */
const PAGE_LOADER_DELAY_MS = 300;

/**
 * Centred page loader for a whole screen or panel. It waits {@link PAGE_LOADER_DELAY_MS} before appearing, so a fast
 * load doesn't flash it; until then the space is held and screen readers already hear the label.
 */
export function PageLoader({ label = "Loading…" }: { label?: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), PAGE_LOADER_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div className="grid min-h-[50vh] place-items-center p-8">
      {visible ? <Loader size={80} label={label} /> : <span className="sr-only" role="status">{label}</span>}
    </div>
  );
}
