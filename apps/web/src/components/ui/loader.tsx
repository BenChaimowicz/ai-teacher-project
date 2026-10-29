import { useEffect, useState, type CSSProperties } from "react";
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
 * cover whose right page keeps turning, read by the companion's head (ears, cap) over the top.
 * Its own little artboard, independent of the companion component. Animation lives in kit.css
 * (`.k-loader .lp`, `.le`, `.lh`).
 */
const LOADER_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true">
<g class="lh"><polygon points="19.5,25 20.5,12.5 28,19" fill="#e8b07a"/><polygon points="21.5,22 21.8,15.5 26,19.3" fill="#b96d7e"/>
<polygon points="44.5,25 43.5,12.5 36,19" fill="#c6824b"/><polygon points="42.5,22 42.2,15.5 38,19.3" fill="#8f4c5e"/>
<ellipse cx="32" cy="31" rx="15.5" ry="13" fill="#d8955c"/>
<path d="M41,20.5 C45.5,23.5 47.5,27.5 47.5,31 C47.5,38 41,43 32,44 C39,41.5 44,37 44.5,31 C45,26.5 43.5,23 41,20.5Z" fill="#b06f3c"/>
<ellipse cx="32" cy="40" rx="11" ry="6" fill="#f0e0c2"/>
<g class="le"><circle cx="27" cy="31" r="2" fill="#141726"/><circle cx="37" cy="31" r="2" fill="#141726"/><circle cx="26.3" cy="30.2" r=".65" fill="#fff4e2"/><circle cx="36.3" cy="30.2" r=".65" fill="#fff4e2"/></g>
<g transform="rotate(6 32 19)"><path d="M25,19 L39,19 L38.5,23 Q32,25 25.5,23Z" fill="#161b2f"/><polygon points="21,18 32.5,13.5 43.5,17.5 32,21.5" fill="#2f3964"/>
<polyline points="21,18 32.5,13.5 43.5,17.5" stroke="#5a68a6" stroke-width=".7" fill="none"/><path d="M32.3,17.5 L43,17.4 L43,22" stroke="#e7b250" stroke-width=".8" fill="none"/><rect x="42" y="21.5" width="2" height="3.5" fill="#e7b250"/></g></g>
<path d="M6,47 Q19,43 32,47 Q45,43 58,47 L58,59 Q45,55 32,59 Q19,55 6,59Z" fill="#3a2747"/>
<path d="M8,45 Q20,41 32,45 L32,57 Q20,53 8,57Z" fill="#d4c3a0"/><path d="M32,45 Q44,41 56,45 L56,57 Q44,53 32,57Z" fill="#e2d3b2"/>
<path d="M12,48.5 Q20,46 28,48.5 M12,51.5 Q20,49 28,51.5 M36,48.5 Q44,46 52,48.5 M36,51.5 Q44,49 50,51" stroke="#a8977a" stroke-width=".7" fill="none"/>
<path class="lp lp2" d="M32,45 Q44,41 56,45 L56,57 Q44,53 32,57Z" fill="#e2d3b2"/><path class="lp" d="M32,45 Q44,41 56,45 L56,57 Q44,53 32,57Z" fill="#e2d3b2"/>
<path d="M32,45 L32,59" stroke="#2a1c33" stroke-width="1"/>
<ellipse cx="24" cy="45.5" rx="3.2" ry="2" fill="#f0e0c2"/><ellipse cx="40" cy="45.5" rx="3.2" ry="2" fill="#f0e0c2"/></svg>`;

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
