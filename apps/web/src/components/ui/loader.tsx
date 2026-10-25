import type { CSSProperties } from "react";
import { useId, useMemo } from "react";
import { cappedNibblesMarkup } from "@/lib/brand-marks.ts";
import { cn } from "@/lib/utils";

type LoaderProps = {
  /** Pixel size. Under 48 renders inline (bobbing, no dots or label). */
  size?: number;
  /** Visible label for the page loader; also the accessible name. */
  label?: string;
  className?: string;
};

/**
 * Loading state: capped Nibbles hopping, tassel swinging, three dots being nibbled.
 * Use size 18–24 inline (buttons, rows) and 72–96 for a page or panel.
 */
export function Loader({ size = 96, label, className }: LoaderProps) {
  const uid = useId().replace(/:/g, "");
  const markup = useMemo(() => cappedNibblesMarkup(`cn${uid}`), [uid]);
  const small = size < 48;
  return (
    <span
      className={cn("k-loader", small && "sm", className)}
      style={{ "--s": `${size}px` } as CSSProperties}
      role="progressbar"
      aria-label={label ?? "Loading"}
      aria-busy="true"
    >
      <span className="stage">
        <span className="body" dangerouslySetInnerHTML={{ __html: markup }} />
        {small ? null : <span className="shadow" />}
      </span>
      {small ? null : (
        <span className="dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      )}
      {label && !small ? <span className="label">{label}</span> : null}
    </span>
  );
}

/**
 * Centred page loader for a whole screen or panel.
 */
export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="grid min-h-[50vh] place-items-center p-8">
      <Loader size={88} label={label} />
    </div>
  );
}
