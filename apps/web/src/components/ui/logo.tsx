import type { CSSProperties } from "react";
import { useId, useMemo } from "react";
import { Link } from "react-router-dom";
import { logoMarkup, PRODUCT_NAME } from "@/lib/brand-marks.ts";
import { cn } from "@/lib/utils";

/**
 * The Knibbler mark (Nibbles' silhouette in a cap), themed from the current palette.
 * @param size - Pixel size
 */
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  const uid = useId().replace(/:/g, "");
  const markup = useMemo(() => logoMarkup(undefined, `lg${uid}`), [uid]);
  return (
    <span
      className={cn("k-logo", className)}
      style={{ "--s": `${size}px` } as CSSProperties}
      role="img"
      aria-label={PRODUCT_NAME}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

/**
 * Logo plus wordmark, linking Home.
 */
export function BrandLink({ size = 28 }: { size?: number }) {
  return (
    <Link to="/" className="k-brand" aria-label={`${PRODUCT_NAME} home`}>
      <Logo size={size} />
      <span className="k-wordmark" aria-hidden="true">
        {PRODUCT_NAME.toLowerCase()}
      </span>
    </Link>
  );
}
