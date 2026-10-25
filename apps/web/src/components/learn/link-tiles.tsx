import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import "@/components/learn/learn.css";

export type LinkTile = {
  to: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  tone?: "default" | "primary" | "quiet";
};

/**
 * Option tiles that navigate (the kit's `.k-tile` look, as links). For next steps under a companion line,
 * where the choice opens another screen rather than answering in place.
 */
export function LinkTiles({ tiles, label, cols = 2, flush = false, className }: { tiles: LinkTile[]; label: string; cols?: 1 | 2 | 3; flush?: boolean; className?: string }) {
  return (
    <nav aria-label={label} className={cn("k-tiles", cols === 1 && "one", cols === 3 && "three", flush && "flush", className)}>
      {tiles.map((tile, index) => (
        <Link
          key={`${tile.to}-${tile.label}`}
          to={tile.to}
          className={cn("k-tile", tile.tone === "primary" && "primary", tile.tone === "quiet" && "quiet")}
          style={{ "--i": index } as CSSProperties}
        >
          {tile.icon ? (
            <span className="ti" aria-hidden="true">
              {tile.icon}
            </span>
          ) : null}
          <span>
            <span className="tt">{tile.label}</span>
            {tile.description ? <span className="td">{tile.description}</span> : null}
          </span>
        </Link>
      ))}
    </nav>
  );
}
