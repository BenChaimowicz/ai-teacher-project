import type { ArtName } from "./assets";

/**
 * Simple stand-in markers drawn in a 64-wide box (figures 64×80), used until the real SVGs land.
 * The origin is the top-left of the art box, like an `<image>`.
 * @param props.name - Which marker to draw
 */
export function PlaceholderArt({ name }: { name: ArtName }) {
  switch (name) {
    case "hero":
      return (
        <g>
          <ellipse cx="32" cy="76" rx="16" ry="4" fill="#000" opacity="0.25" />
          <path d="M20 74 L32 36 L44 74 Z" fill="#2f6f8f" stroke="#17384a" strokeWidth="3" strokeLinejoin="round" />
          <circle cx="32" cy="26" r="14" fill="#e0ad87" stroke="#6b4630" strokeWidth="3" />
          <path d="M16 22 Q32 -2 48 22 Z" fill="#c8473b" stroke="#6b2a22" strokeWidth="3" strokeLinejoin="round" />
        </g>
      );
    case "location":
      return <circle cx="32" cy="32" r="26" fill="#f0e0c2" stroke="#7a5236" strokeWidth="5" />;
    case "location-visited":
      return (
        <g>
          <circle cx="32" cy="32" r="26" fill="#7c9670" stroke="#44593f" strokeWidth="5" />
          <path d="M20 33 L29 42 L45 23" fill="none" stroke="#f0e0c2" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    case "location-locked":
      return (
        <g>
          <circle cx="32" cy="32" r="26" fill="#8a8478" stroke="#4a463f" strokeWidth="5" />
          <rect x="21" y="30" width="22" height="16" rx="3" fill="#d4bc95" />
          <path d="M25 30 V25 A7 7 0 0 1 39 25 V30" fill="none" stroke="#d4bc95" strokeWidth="4" />
        </g>
      );
    case "boss":
      return (
        <g>
          <path d="M32 4 L60 32 L32 60 L4 32 Z" fill="#c8473b" stroke="#6b2a22" strokeWidth="5" strokeLinejoin="round" />
          <circle cx="24" cy="30" r="4" fill="#f0e0c2" />
          <circle cx="40" cy="30" r="4" fill="#f0e0c2" />
          <path d="M22 42 L27 38 L32 42 L37 38 L42 42" fill="none" stroke="#f0e0c2" strokeWidth="3" strokeLinejoin="round" />
        </g>
      );
    case "final-boss":
      return (
        <g>
          <path
            d="M32 2 L40 22 L62 24 L45 38 L51 60 L32 48 L13 60 L19 38 L2 24 L24 22 Z"
            fill="#6a3d9a"
            stroke="#e7b250"
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <circle cx="25" cy="30" r="4" fill="#f0e0c2" />
          <circle cx="39" cy="30" r="4" fill="#f0e0c2" />
        </g>
      );
  }
}
