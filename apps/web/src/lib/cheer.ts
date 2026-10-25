/*
 * Small, accent-coloured celebration effects. No points or currency: a burst and an optional chip.
 * Both respect prefers-reduced-motion (the chip still shows, without motion).
 */

type Particle = {
  x: number; y: number; vx: number; vy: number; r: number; rot: number; vr: number; colour: string; life: number; square: boolean;
};

let canvas: HTMLCanvasElement | null = null;
let particles: Particle[] = [];
let running = false;

/**
 * True when the Learner asked the OS for less motion.
 */
export function prefersReducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Advances and draws every particle, until none are left.
 */
function tick() {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  if (canvas.width !== innerWidth || canvas.height !== innerHeight) {
    canvas.width = innerWidth;
    canvas.height = innerHeight;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles = particles.filter((p) => p.life > 0);
  for (const p of particles) {
    p.vy += 0.18;
    p.vx *= 0.985;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    p.life -= 0.012;
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.colour;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    if (p.square) ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
    else {
      ctx.beginPath();
      ctx.arc(0, 0, p.r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  if (particles.length) requestAnimationFrame(tick);
  else {
    running = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

/**
 * Confetti burst from a viewport point.
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
  const styles = getComputedStyle(document.documentElement);
  const colours = [styles.getPropertyValue("--a").trim(), styles.getPropertyValue("--b").trim(), "#ffffff"];
  for (let i = 0; i < count; i += 1) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * spread;
    const speed = (4 + Math.random() * 5) * power;
    particles.push({
      x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: 2 + Math.random() * 3,
      rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, colour: colours[i % 3]!, life: 1, square: Math.random() > 0.5,
    });
  }
  if (!running) {
    running = true;
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
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

/**
 * A small burst plus an optional floating "✓ text" chip above the element.
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
  const animation = chip.animate(
    [
      { transform: "translate(-50%, 4px) scale(0.85)", opacity: 0 },
      { transform: "translate(-50%, -22px) scale(1)", opacity: 1, offset: 0.25 },
      { transform: "translate(-50%, -30px) scale(1)", opacity: 1, offset: 0.75 },
      { transform: "translate(-50%, -40px) scale(0.96)", opacity: 0 },
    ],
    { duration: prefersReducedMotion() ? 1200 : 1500, easing: "ease-out" },
  );
  animation.onfinish = () => chip.remove();
}
