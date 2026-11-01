/*
 * Small celebration effects. No points or currency: a burst of paper and an optional chip.
 * The confetti is cut paper with two sides: each piece flutters, and as it turns over you see its
 * darker back. Both effects respect prefers-reduced-motion (the chip still shows, without motion).
 */

type Shape = "tri" | "strip" | "fold";

type Piece = {
  x: number; y: number; vx: number; vy: number;
  rot: number; vr: number;
  /** Flip phase and speed: the visible side is cos(phase) > 0. */
  phase: number; flip: number;
  size: number; shape: Shape;
  front: string; back: string;
  life: number; max: number; drift: number;
};

/* Front and back of each paper stock, from the Papercraft mock. */
const PAPER: [string, string][] = [
  ["#e8b07a", "#a8683a"], // apricot
  ["#f0e0c2", "#b39b76"], // cream
  ["#d9563f", "#8f2e24"], // bookmark
  ["#e7b250", "#a87b2a"], // gold thread
  ["#9a6aa8", "#563a63"], // plum
];
const SHAPES: Shape[] = ["tri", "strip", "fold"];

let canvas: HTMLCanvasElement | null = null;
let pieces: Piece[] = [];
let running = false;
let last = 0;

/**
 * True when the Learner asked the OS for less motion.
 */
export function prefersReducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Sizes the canvas to the viewport at device pixel ratio.
 * @param el - Confetti canvas
 * @returns Its 2D context, scaled to CSS pixels
 */
function fit(el: HTMLCanvasElement) {
  const ctx = el.getContext("2d");
  if (!ctx) return null;
  const dpr = devicePixelRatio || 1;
  const w = Math.round(innerWidth * dpr);
  const h = Math.round(innerHeight * dpr);
  if (el.width !== w || el.height !== h) {
    el.width = w;
    el.height = h;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/**
 * Draws one piece at the origin, squashed by its flip.
 * @param ctx - Canvas context, already translated and rotated
 * @param p - Piece
 * @param facing - cos(phase): sign is the side, magnitude the squash
 */
function drawPiece(ctx: CanvasRenderingContext2D, p: Piece, facing: number) {
  const s = p.size;
  ctx.scale(1, Math.max(0.08, Math.abs(facing)));
  ctx.fillStyle = facing > 0 ? p.front : p.back;
  ctx.beginPath();
  if (p.shape === "tri") {
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.87, s * 0.5);
    ctx.lineTo(-s * 0.87, s * 0.5);
    ctx.closePath();
    ctx.fill();
  } else if (p.shape === "strip") {
    ctx.fillRect(-s * 0.35, -s, s * 0.7, s * 2);
  } else {
    // A square folded along its diagonal: the fold shows the other side.
    ctx.fillRect(-s * 0.7, -s * 0.7, s * 1.4, s * 1.4);
    ctx.fillStyle = facing > 0 ? p.back : p.front;
    ctx.globalAlpha *= 0.55;
    ctx.moveTo(-s * 0.7, -s * 0.7);
    ctx.lineTo(s * 0.7, -s * 0.7);
    ctx.lineTo(-s * 0.7, s * 0.7);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * Advances and draws every piece, until none are left.
 * @param now - Frame time
 */
function tick(now: number) {
  if (!canvas) return;
  const ctx = fit(canvas);
  if (!ctx) return;
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  pieces = pieces.filter((p) => p.life < p.max);
  for (const p of pieces) {
    p.life += dt;
    p.vy += 900 * dt;
    p.vx *= Math.pow(0.18, dt);
    // Paper falls slowly: air drag pulls the fall speed back towards a flutter.
    if (p.vy > 90) p.vy += (90 - p.vy) * Math.min(1, dt * 6);
    p.phase += p.flip * dt;
    p.x += p.vx * dt + Math.sin(p.phase * 0.5) * p.drift * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, (p.max - p.life) / 0.45));
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    drawPiece(ctx, p, Math.cos(p.phase));
    ctx.restore();
  }
  if (pieces.length) requestAnimationFrame(tick);
  else {
    running = false;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
  }
}

/**
 * Paper confetti burst from a viewport point.
 * @param x - Viewport x
 * @param y - Viewport y
 * @param options - count, spread (1 = half circle), power
 */
export function confetti(x: number, y: number, { count = 40, spread = 1, power = 1 } = {}) {
  if (prefersReducedMotion()) return;
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "k-confetti";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);
  }
  for (let i = 0; i < count; i += 1) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * spread;
    const speed = (300 + Math.random() * 420) * power;
    const [front, back] = PAPER[i % PAPER.length]!;
    pieces.push({
      x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 5,
      phase: Math.random() * Math.PI * 2, flip: 7 + Math.random() * 7,
      size: 4 + Math.random() * 4, shape: SHAPES[i % SHAPES.length]!,
      front, back, life: 0, max: 1.8 + Math.random() * 0.8, drift: 30 + Math.random() * 50,
    });
  }
  if (!running) {
    running = true;
    last = performance.now();
    requestAnimationFrame(tick);
  }
}

/**
 * Confetti from the centre of an element.
 * @param el - Element to burst from
 * @param options - Same as `confetti`
 */
export function confettiAt(el: Element, options?: Parameters<typeof confetti>[2]) {
  const rect = el.getBoundingClientRect();
  confetti(rect.left + rect.width / 2, rect.top + rect.height / 2, options);
}

const CHECK_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

/**
 * A small burst plus an optional floating "✓ text" ribbon chip above the element.
 * @param el - Element the moment belongs to (a tile, a button)
 * @param text - Short chip text, e.g. "lesson read"
 */
export function cheer(el: Element | null | undefined, text?: string) {
  if (!el) return;
  confettiAt(el, { count: 18, power: 0.6 });
  if (!text) return;
  const rect = el.getBoundingClientRect();
  const chip = document.createElement("div");
  chip.className = "k-chip-float";
  chip.setAttribute("aria-hidden", "true");
  chip.innerHTML = `${CHECK_SVG}<span></span>`;
  chip.querySelector("span")!.textContent = text;
  chip.style.left = `${rect.left + rect.width / 2}px`;
  chip.style.top = `${rect.top}px`;
  document.body.appendChild(chip);
  const still = prefersReducedMotion();
  const animation = chip.animate(
    still
      ? [
          { transform: "translate(-50%, -26px)", opacity: 0 },
          { transform: "translate(-50%, -26px)", opacity: 1, offset: 0.2 },
          { transform: "translate(-50%, -26px)", opacity: 1, offset: 0.8 },
          { transform: "translate(-50%, -26px)", opacity: 0 },
        ]
      : [
          { transform: "translate(-50%, 4px) rotate(-5deg) scale(0.9)", opacity: 0 },
          { transform: "translate(-50%, -22px) rotate(-1deg) scale(1)", opacity: 1, offset: 0.2 },
          { transform: "translate(-50%, -30px) rotate(-1deg) scale(1)", opacity: 1, offset: 0.78 },
          { transform: "translate(-50%, -38px) rotate(-1deg) scale(0.98)", opacity: 0 },
        ],
    { duration: still ? 1200 : 1600, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
  );
  animation.onfinish = () => chip.remove();
}

/**
 * Waits long enough for a cheer to be seen before the screen moves on, e.g. Jongi cheering after sign-in.
 * Resolves at once under reduced motion.
 * @param ms - How long to hold the moment
 */
export function holdCheer(ms = 900): Promise<void> {
  if (prefersReducedMotion()) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
