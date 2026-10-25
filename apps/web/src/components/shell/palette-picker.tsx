import { useEffect, useRef, useState } from "react";
import { PALETTES, usePalette } from "@/lib/theme.ts";

/**
 * Accent palette picker: a small swatch button in the sidebar footer that opens five swatches.
 * Always dark; only the accent pair changes. Saved in this browser.
 */
export function PalettePicker() {
  const [palette, setPalette] = usePalette();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const current = PALETTES.find((row) => row.key === palette) ?? PALETTES[0];

  return (
    <div className="k-palette" ref={root}>
      <button
        type="button"
        aria-label={`Colours: ${current.label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Colours"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="sw-dot" aria-hidden="true" />
      </button>
      {open ? (
        <div className="pop" role="dialog" aria-label="Colours">
          <p>colours · always dark</p>
          <div className="sws" role="radiogroup" aria-label="Accent colours">
            {PALETTES.map((row) => (
              <button
                key={row.key}
                type="button"
                role="radio"
                aria-checked={row.key === palette}
                aria-label={row.label}
                title={row.label}
                onClick={() => setPalette(row.key)}
              >
                <span style={{ background: `linear-gradient(135deg, ${row.a} 50%, ${row.b} 50%)` }} />
              </button>
            ))}
          </div>
          <p className="name">{current.label}</p>
        </div>
      ) : null}
    </div>
  );
}
