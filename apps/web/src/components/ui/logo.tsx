import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { logoMarkup, PRODUCT_NAME } from "@/lib/brand-marks.ts";
import { cn } from "@/lib/utils";

const MARK = logoMarkup();
const MARK_ON_TILE = logoMarkup({ tile: true });

/**
 * The Knibbler mark: Jongi's folded paper head in a scholar cap.
 * @param size - Pixel size
 * @param tile - Sit on the rounded ink-navy tile (32px and up)
 */
export function Logo({ size = 28, tile = false, className }: { size?: number; tile?: boolean; className?: string }) {
  return (
    <span
      className={cn("k-logo", className)}
      style={{ "--s": `${size}px` } as CSSProperties}
      role="img"
      aria-label={PRODUCT_NAME}
      dangerouslySetInnerHTML={{ __html: tile ? MARK_ON_TILE : MARK }}
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
