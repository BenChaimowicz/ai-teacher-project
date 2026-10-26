import { HelpCircle } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { confettiAt } from "@/lib/cheer.ts";
import { cn } from "@/lib/utils";

export type OptionTile<T = unknown> = {
  id: string;
  label: string;
  description?: string;
  /** Icon node (lucide icon or CourseIcon). */
  icon?: ReactNode;
  /** primary: filled accent (the main action). quiet: dashed (skip, not sure, not now). */
  tone?: "default" | "primary" | "quiet";
  /** Marks a "Not sure" style option: quiet tone with a help icon. */
  unsure?: boolean;
  disabled?: boolean;
  value?: T;
};

export type TileVerdict = "good" | "miss" | null;

type OptionTilesProps<T> = {
  options: OptionTile<T>[];
  /** Called with the picked option. The group locks while it runs and stays locked after. */
  onPick: (option: OptionTile<T>) => void | Promise<void>;
  /** Accessible name for the group, usually the question. */
  label: string;
  cols?: 1 | 2 | 3;
  /** No left indent (tiles not under a companion line). */
  flush?: boolean;
  /** Quiz mode: return good/miss for the pick. Good gets a small burst; miss shakes and reveals `correctId`. */
  judge?: (option: OptionTile<T>) => TileVerdict;
  correctId?: string;
  /** Keys 1–9 pick (only the newest unlocked group listens). Default true. */
  keyboard?: boolean;
  /** Re-enable after a pick (e.g. the parent shows the same group again). */
  resetKey?: unknown;
  className?: string;
};

/* The newest unlocked group owns the number keys. */
const keyOwners: symbol[] = [];

/**
 * Option tiles under the companion's line: icon, title, description, number key, stagger-in,
 * and picked/good/miss/reveal states. The group locks after a pick.
 */
export function OptionTiles<T>({
  options,
  onPick,
  label,
  cols = 2,
  flush = false,
  judge,
  correctId,
  keyboard = true,
  resetKey,
  className,
}: OptionTilesProps<T>) {
  const [picked, setPicked] = useState<{ id: string; verdict: TileVerdict } | null>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const owner = useRef(Symbol("tiles"));
  const pickRef = useRef<(index: number) => void>(() => undefined);

  useEffect(() => {
    setPicked(null);
  }, [resetKey]);

  /**
   * Locks the group, shows the verdict, and hands the option to the parent.
   * @param index - Option index
   */
  async function pick(index: number) {
    const option = options[index];
    if (!option || option.disabled || picked) return;
    const verdict = judge ? judge(option) : null;
    setPicked({ id: option.id, verdict });
    const el = buttons.current[index];
    if (verdict === "good" && el) confettiAt(el, { count: 22, power: 0.7 });
    await onPick(option);
  }
  pickRef.current = (index) => void pick(index);

  useEffect(() => {
    if (!keyboard || picked) return;
    const me = owner.current;
    keyOwners.push(me);
    function onKey(event: KeyboardEvent) {
      if (keyOwners[keyOwners.length - 1] !== me) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      const n = Number(event.key);
      if (!Number.isInteger(n) || n < 1 || n > 9 || n > options.length) return;
      event.preventDefault();
      pickRef.current(n - 1);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const at = keyOwners.indexOf(me);
      if (at >= 0) keyOwners.splice(at, 1);
    };
  }, [keyboard, picked, options.length]);

  return (
    <div
      role="group"
      aria-label={label}
      className={cn("k-tiles", cols === 1 && "one", cols === 3 && "three", flush && "flush", picked && "locked", className)}
    >
      {options.map((option, index) => {
        const isPicked = picked?.id === option.id;
        const state = isPicked
          ? (picked?.verdict ?? "picked")
          : picked?.verdict === "miss" && option.id === correctId
            ? "reveal"
            : null;
        const tone = option.unsure ? "quiet" : option.tone;
        const icon = option.icon ?? (option.unsure ? <HelpCircle /> : null);
        return (
          <button
            key={option.id}
            ref={(el) => {
              buttons.current[index] = el;
            }}
            type="button"
            className={cn("k-tile", tone === "primary" && "primary", tone === "quiet" && "quiet", state)}
            style={{ "--i": index } as CSSProperties}
            disabled={option.disabled}
            aria-pressed={isPicked || undefined}
            aria-keyshortcuts={keyboard && index < 9 ? String(index + 1) : undefined}
            onClick={() => void pick(index)}
          >
            {icon ? (
              <span className="ti" aria-hidden="true">
                {icon}
              </span>
            ) : null}
            <span>
              <span className="tt">{option.label}</span>
              {option.description ? <span className="td">{option.description}</span> : null}
            </span>
            {keyboard && index < 9 ? <kbd aria-hidden="true">{index + 1}</kbd> : null}
          </button>
        );
      })}
    </div>
  );
}
