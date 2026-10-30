/*
 * Packs Jongi's rendered frames into the sprite sheets the web app ships.
 *
 * Blender's `jongi_export.py` text block (inside apps/web/src/components/companion/jongi.blend) renders
 * every sheet's frames into apps/web/src/components/companion/.jongi-frames/<name>/ as f_0001.png… plus a
 * meta.json. This script tiles each folder into one WebP sheet (quality 80, with transparency) and writes
 * frames.json, the manifest the `Jongi` component reads: timing, grid, and the per-frame eye positions.
 *
 * Needs ffmpeg with libwebp on the PATH. Run with `pnpm jongi:pack`.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const COMPANION = new URL("../apps/web/src/components/companion/", import.meta.url).pathname;
const SRC = join(COMPANION, ".jongi-frames");
const DST = join(COMPANION, "frames");
const QUALITY = "80";
/** Transparent gap between frames, so scaling a sheet down never samples a neighbouring frame. */
const PAD = 2;

/**
 * Tiles one sheet's frames into a WebP grid that is as close to square as the frame count allows.
 * @param name - The sheet's folder name, e.g. "idle-bust"
 * @returns The sheet's meta.json, with its grid (and the gap between frames) added and the eye data rounded to 0.1 px
 */
function packSheet(name) {
  const dir = join(SRC, name);
  let meta;
  try {
    meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
  } catch (error) {
    throw new Error(`[pack-jongi-frames: packSheet] Could not read meta.json || dir=${dir} || ${error.message}`);
  }
  const cols = Math.ceil(Math.sqrt(meta.frames));
  const rows = Math.ceil(meta.frames / cols);
  const out = join(DST, `${name}.webp`);
  try {
    execFileSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-framerate", "24", "-i", join(dir, "f_%04d.png"),
      "-vf", `tile=${cols}x${rows}:padding=${PAD}:color=0x00000000,format=yuva420p`, "-frames:v", "1",
      "-c:v", "libwebp", "-lossless", "0", "-quality", QUALITY, "-compression_level", "6", out,
    ]);
  } catch (error) {
    throw new Error(`[pack-jongi-frames: packSheet] ffmpeg failed || name=${name} || ${error.message}`);
  }
  if (meta.eyes) meta.eyes = meta.eyes.map((row) => row.map((v) => Math.round(v * 10) / 10));
  console.log(`${name.padEnd(14)} ${String(meta.frames).padStart(4)} frames  ${cols}x${rows}  ${(statSync(out).size / 1024).toFixed(1)} KB`);
  return { ...meta, cols, rows, pad: PAD };
}

/**
 * Packs every exported sheet and writes frames.json.
 */
function main() {
  let names;
  try {
    names = readdirSync(SRC, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  } catch (error) {
    throw new Error(`[pack-jongi-frames: main] No exported frames; run jongi_export.py in Blender first || src=${SRC} || ${error.message}`);
  }
  const manifest = Object.fromEntries(names.map((name) => [name, packSheet(name)]));
  writeFileSync(join(DST, "frames.json"), JSON.stringify(manifest));
}

main();
