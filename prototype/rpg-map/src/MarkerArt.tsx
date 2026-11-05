import { artUrl, type ArtName } from "./assets";
import { PlaceholderArt } from "./placeholder-art";

/**
 * One piece of marker art, drawn from its SVG file when it exists and from the placeholder otherwise.
 * The box is `width` × `height` map units with its top-left at (0,0); position it with a parent `<g transform>`.
 * @param props.name - Which marker
 * @param props.width - Box width in map units
 * @param props.height - Box height in map units
 */
export function MarkerArt({ name, width, height }: { name: ArtName; width: number; height: number }) {
  const url = artUrl(name);
  if (url) return <image href={url} x={0} y={0} width={width} height={height} />;
  const boxHeight = name === "hero" ? 80 : 64;
  return (
    <g transform={`scale(${width / 64} ${height / boxHeight})`}>
      <PlaceholderArt name={name} />
    </g>
  );
}
