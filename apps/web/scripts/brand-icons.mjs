/*
 * Writes the favicon set in apps/web/public from the mark in src/lib/brand-marks.ts, so the tab icon,
 * the home-screen icons and the in-app Logo are one drawing:
 *   jongi-logo.svg         the tab icon (logoMarkup on its tile)
 *   favicon.ico            16, 32 and 48px PNGs, for browsers and tools that skip the SVG
 *   apple-touch-icon.png   180px, full-bleed (iOS rounds the corners)
 *   icon-192.png, icon-512.png and manifest.webmanifest
 *
 * Run `pnpm brand:icons` after changing the mark. `--check` writes nothing and fails if the SVG or the
 * manifest on disk no longer match brand-marks.ts (the PNGs are rendered from the same markup in the same run).
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { appIconMarkup, logoMarkup, PRODUCT_NAME } from "../src/lib/brand-marks.ts";

const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));

/** The desk colour (`--bg` in src/index.css): the browser's theme colour and the splash background. */
const DESK_COLOUR = "#0b0e18";

/**
 * Renders SVG markup to a square PNG.
 * @param svg - SVG markup
 * @param size - Width and height in pixels
 * @returns The PNG bytes
 */
function renderPng(svg, size) {
  try {
    return Buffer.from(new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng());
  } catch (error) {
    throw new Error(`[brand-icons: renderPng] Failed to render the mark || size=${size} || ${error.message}`);
  }
}

/**
 * Packs PNG images into an .ico file (the PNG-in-ICO form every current browser reads).
 * @param images - Square PNGs with their pixel size
 * @returns The .ico bytes
 */
function packIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 means 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map(({ png }) => png)]);
}

/** The text files: what `--check` compares. */
const textFiles = {
  "jongi-logo.svg": `${logoMarkup({ tile: true })}\n`,
  "manifest.webmanifest": `${JSON.stringify(
    {
      name: PRODUCT_NAME,
      short_name: PRODUCT_NAME,
      start_url: "/",
      display: "standalone",
      background_color: DESK_COLOUR,
      theme_color: DESK_COLOUR,
      icons: [
        { src: "/icon-192.png", type: "image/png", sizes: "192x192", purpose: "any maskable" },
        { src: "/icon-512.png", type: "image/png", sizes: "512x512", purpose: "any maskable" },
      ],
    },
    null,
    2,
  )}\n`,
};

if (process.argv.includes("--check")) {
  const stale = [];
  for (const [name, expected] of Object.entries(textFiles)) {
    const actual = await readFile(PUBLIC_DIR + name, "utf8").catch(() => "");
    if (actual.replace(/\r\n/g, "\n") !== expected) stale.push(name);
  }
  if (stale.length > 0) {
    console.error(`public/${stale.join(", public/")} no longer match brand-marks.ts. Run \`pnpm brand:icons\`.`);
    process.exit(1);
  }
  console.log("Favicon set matches brand-marks.ts.");
} else {
  const tab = logoMarkup({ tile: true });
  const app = appIconMarkup();
  const files = {
    ...textFiles,
    "favicon.ico": packIco([16, 32, 48].map((size) => ({ size, png: renderPng(tab, size) }))),
    "apple-touch-icon.png": renderPng(app, 180),
    "icon-192.png": renderPng(app, 192),
    "icon-512.png": renderPng(app, 512),
  };
  for (const [name, bytes] of Object.entries(files)) {
    try {
      await writeFile(PUBLIC_DIR + name, bytes);
    } catch (error) {
      throw new Error(`[brand-icons: write] Failed to write an icon || file=${name} || ${error.message}`);
    }
  }
  console.log(`Wrote ${Object.keys(files).join(", ")} to apps/web/public.`);
}
