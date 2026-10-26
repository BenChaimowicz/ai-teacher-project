import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button.tsx";
import { CompanionLine } from "@/components/ui/chat-thread.tsx";
import { Dialog } from "@/components/ui/dialog.tsx";
import { Jongi } from "@/components/companion/jongi.tsx";
import { useCompanion } from "@/components/companion/companion-provider.tsx";
import { useStudyChrome } from "@/components/learn/study-chrome.tsx";
import {
  FONT_LABEL,
  FONT_STACK,
  LINE_SPACING_LABEL,
  MAX_SIZE,
  MIN_SIZE,
  READING_MODES,
  SURFACE_LABEL,
  matchingMode,
  type LineSpacing,
  type ReadingFont,
  type ReadingModeKey,
  type ReadingSurface,
  type ReadingWidth,
} from "@/components/learn/reading-settings.ts";
import { cheer, confettiAt } from "@/lib/cheer.ts";
import { cn } from "@/lib/utils";
import "@/components/learn/learn.css";

/* Little line drawings of each mode, from the mock. */
const GLYPH: Record<ReadingModeKey, string> = {
  comfort: `<rect class="ln" x="4" y="5" width="32" height="2.4" rx="1"/><rect class="ln" x="4" y="11" width="30" height="2.4" rx="1"/><rect class="ln" x="4" y="17" width="32" height="2.4" rx="1"/><rect class="ln" x="4" y="23" width="22" height="2.4" rx="1"/>`,
  focus: `<rect class="ln" x="4" y="4" width="32" height="2" rx="1" opacity=".2"/><rect class="ln hi" x="4" y="11" width="32" height="3" rx="1.5"/><rect class="ln hi" x="4" y="16.5" width="26" height="3" rx="1.5"/><rect class="ln" x="4" y="24" width="30" height="2" rx="1" opacity=".2"/>`,
  spaced: `<rect class="ln" x="4" y="4" width="28" height="3" rx="1.5"/><rect class="ln" x="4" y="13" width="32" height="3" rx="1.5"/><rect class="ln" x="4" y="22" width="20" height="3" rx="1.5"/>`,
  book: `<rect class="ln" x="2" y="5" width="16" height="2" rx="1"/><rect class="ln" x="2" y="10" width="16" height="2" rx="1"/><rect class="ln" x="2" y="15" width="16" height="2" rx="1"/><rect class="ln" x="2" y="20" width="12" height="2" rx="1"/><rect class="ln" x="22" y="5" width="16" height="2" rx="1"/><rect class="ln" x="22" y="10" width="16" height="2" rx="1"/><rect class="ln" x="22" y="15" width="16" height="2" rx="1"/><rect class="ln" x="22" y="20" width="9" height="2" rx="1"/>`,
  skim: `<rect class="ln" x="4" y="4" width="32" height="2" rx="1"/><rect class="ln mk" x="3" y="8.5" width="26" height="4" rx="1"/><rect class="ln" x="4" y="9.5" width="24" height="2" rx="1"/><rect class="ln" x="4" y="16" width="30" height="2" rx="1"/><rect class="ln mk" x="3" y="20.5" width="20" height="4" rx="1"/><rect class="ln" x="4" y="21.5" width="18" height="2" rx="1"/>`,
};

/* Dark is the ink paper; Dim a softer ink; Sepia and Paper match the light pages in learn.css. */
const SURFACE_CHIP: Record<ReadingSurface, string> = { dark: "var(--panel)", dim: "#30364d", sepia: "#f2e8d2", paper: "#f8f7f3" };

type SegOption<T> = { value: T; label: string; style?: CSSProperties; chip?: string; note?: string };

/**
 * A row of mutually exclusive buttons (aria-pressed), labelled by the control name.
 */
function Segmented<T extends string | number>({ name, value, options, onChange }: { name: string; value: T; options: SegOption<T>[]; onChange: (value: T) => void }) {
  const id = useId();
  return (
    <div className="l-ctl">
      <span id={id}>{name}</span>
      <div className="l-segc" role="group" aria-labelledby={id}>
        {options.map((option) => (
          <button key={String(option.value)} type="button" aria-pressed={option.value === value} style={option.style} onClick={() => onChange(option.value)}>
            {option.chip ? <span className="chipc" style={{ background: option.chip }} aria-hidden="true" /> : null}
            {option.label}
            {option.note ? <span className="opt-l">{option.note}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The Aa button and reading panel for the Study header: modes, fine controls, page colour, Help me pick.
 * Settings apply at once and are saved for every lesson.
 */
export function ReadingPanel() {
  const { settings, update, applyMode, reset } = useStudyChrome();
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const mode = matchingMode(settings);
  const base = READING_MODES.find((row) => row.key === settings.mode) ?? READING_MODES[0]!;
  const label = mode ? mode.name : "Custom";

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (wrap.current && !wrap.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      button.current?.focus();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div className="l-aa" ref={wrap}>
      <button
        ref={button}
        type="button"
        className="l-aa-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`Reading settings, ${label.toLowerCase()}`}
        onClick={() => setOpen((value) => !value)}
      >
        Aa <small aria-hidden="true">{label.toLowerCase()}</small>
      </button>
      {open ? (
        <div id={panelId} className="l-rpanel" role="dialog" aria-label="Reading settings">
          <div className="l-rp-h">
            <b>Reading mode</b>
            <span className={cn("l-rp-cur", !mode && "custom")}>{mode ? mode.name.toLowerCase() : `custom · ${base.name.toLowerCase()}-based`}</span>
          </div>
          <div className="l-presets" role="group" aria-label="Reading modes">
            {READING_MODES.map((row) => (
              <button key={row.key} type="button" className="l-preset" aria-pressed={mode?.key === row.key} onClick={() => applyMode(row.key)}>
                <svg viewBox="0 0 40 30" aria-hidden="true" dangerouslySetInnerHTML={{ __html: GLYPH[row.key] }} />
                {row.name}
              </button>
            ))}
          </div>
          <p className="l-preset-desc">{mode ? mode.description : "Your own mix. Pick a mode above to go back to a preset."}</p>
          <div className="l-rp-sec">
            <Segmented<ReadingFont>
              name="font"
              value={settings.font}
              onChange={(font) => update({ font })}
              options={(["serif", "sans", "hyper"] as const).map((font) => ({ value: font, label: FONT_LABEL[font], style: { fontFamily: FONT_STACK[font] } }))}
            />
            <div className="l-ctl">
              <span>size</span>
              <div className="l-sizer">
                <button type="button" aria-label="Smaller text" disabled={settings.size <= MIN_SIZE} onClick={() => update({ size: Math.max(MIN_SIZE, settings.size - 1) })}>
                  A−
                </button>
                <span className="px" aria-live="polite">
                  {settings.size}px
                  <i aria-hidden="true">
                    <b style={{ width: `${((settings.size - MIN_SIZE) / (MAX_SIZE - MIN_SIZE)) * 100}%` }} />
                  </i>
                </span>
                <button type="button" aria-label="Larger text" disabled={settings.size >= MAX_SIZE} onClick={() => update({ size: Math.min(MAX_SIZE, settings.size + 1) })}>
                  A+
                </button>
              </div>
            </div>
            <Segmented<ReadingWidth>
              name="width"
              value={settings.width}
              onChange={(width) => update({ width })}
              options={(["narrow", "medium", "wide"] as const).map((width) => ({ value: width, label: width }))}
            />
            <Segmented<LineSpacing>
              name="line space"
              value={settings.lineSpacing}
              onChange={(lineSpacing) => update({ lineSpacing })}
              options={([0, 1, 2] as const).map((value) => ({ value, label: LINE_SPACING_LABEL[value] }))}
            />
            <div className="l-ctl">
              <span>letter space</span>
              <button
                type="button"
                className="l-switch"
                role="switch"
                aria-checked={settings.letterSpacing}
                aria-label="Extra letter spacing"
                onClick={() => update({ letterSpacing: !settings.letterSpacing })}
              />
            </div>
            <Segmented<ReadingSurface>
              name="page"
              value={settings.surface}
              onChange={(surface) => update({ surface })}
              options={(["dark", "dim", "sepia", "paper"] as const).map((surface) => ({
                value: surface,
                label: SURFACE_LABEL[surface],
                chip: SURFACE_CHIP[surface],
                note: surface === "sepia" || surface === "paper" ? "light" : undefined,
              }))}
            />
          </div>
          <p className="l-rp-note">Sepia and Paper are light pages. The app itself stays dark.</p>
          <div className="l-rp-foot">
            <button
              type="button"
              className="l-pick-btn"
              onClick={() => {
                setOpen(false);
                setPicking(true);
              }}
            >
              <Jongi size={32} tile="round" />
              <span>
                <b>Help me pick</b>
                <small>3 quick rounds · about 30s</small>
              </span>
            </button>
            <button type="button" className="l-reset-btn" onClick={reset}>
              reset
            </button>
          </div>
        </div>
      ) : null}
      <FontPicker open={picking} onClose={() => setPicking(false)} />
    </div>
  );
}

type Sample = { font: ReadingFont; spaced?: boolean };

const SAMPLE_TEXT =
  "A good explanation starts with what you already know. It adds one new idea at a time, and checks that each one landed before moving on.";

/**
 * "Help me pick": three A/B rounds, then the winning font (and spacing) is applied.
 * Readers are fastest in their own best font, which differs from person to person (05-reading-modes.md).
 */
function FontPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, update } = useStudyChrome();
  const { say } = useCompanion();
  const [round, setRound] = useState(0);
  const [picks, setPicks] = useState<Sample[]>([]);
  const result = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (open) {
      setRound(0);
      setPicks([]);
    }
  }, [open]);

  const first = picks[0];
  const second = picks[1];
  const rounds: { line: string; a: Sample; b: Sample }[] = [
    { line: "Read both. Which one felt easier?", a: { font: "serif" }, b: { font: "sans" } },
    { line: "And these two?", a: first ?? { font: "sans" }, b: { font: "hyper" } },
    { line: "Last one. Same font, different spacing.", a: { font: second?.font ?? "sans" }, b: { font: second?.font ?? "sans", spaced: true } },
  ];
  const done = round >= rounds.length;
  const current = rounds[Math.min(round, rounds.length - 1)]!;
  const winner = picks[2];

  useEffect(() => {
    if (!done || !winner) return;
    update({ font: winner.font, letterSpacing: Boolean(winner.spaced) });
    say(`${FONT_LABEL[winner.font]} it is.`, "cheer");
    const el = result.current;
    if (el) {
      confettiAt(el, { count: 30, power: 0.8 });
      cheer(el, "applied");
    }
    // Apply once when the last round is picked.
  }, [done]);

  /**
   * Records a pick and moves to the next round.
   * @param sample - The sample the Learner found easier
   */
  function choose(sample: Sample) {
    if (picks.length > round) return;
    setPicks((list) => [...list, sample]);
    window.setTimeout(() => setRound((value) => value + 1), 280);
  }

  const chooseRef = useRef((index: number) => choose(index === 0 ? current.a : current.b));
  chooseRef.current = (index: number) => choose(index === 0 ? current.a : current.b);
  useEffect(() => {
    if (!open || done) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "1" && event.key !== "2") return;
      event.preventDefault();
      chooseRef.current(event.key === "1" ? 0 : 1);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, done]);

  return (
    <Dialog open={open} title="Help me pick a font" onClose={onClose}>
      <div className="l-pk-body">
        <div className="l-pk-head">
          <span>{done ? "done" : `round ${round + 1}/3`}</span>
          <span className="l-dots" aria-hidden="true">
            {rounds.map((_, index) => (
              <i key={index} className={index < round ? "good" : index === round ? "on" : undefined} />
            ))}
          </span>
        </div>
        {done && winner ? (
          <>
            <CompanionLine key="done">
              {FONT_LABEL[winner.font]} suits you{winner.spaced ? ", with a little extra space" : ""}. Applied.
            </CompanionLine>
            <div className="l-pk-result">
              <span ref={result} className="big-aa" style={{ fontFamily: FONT_STACK[winner.font] }} aria-hidden="true">
                Aa
              </span>
              <div>
                <b>
                  {FONT_LABEL[winner.font]}
                  {winner.spaced ? " · spaced" : ""}
                </b>
                <span>{settings.size}px · saved for every lesson</span>
              </div>
              <Button onClick={onClose}>Done</Button>
            </div>
          </>
        ) : (
          <>
            <CompanionLine key={`round-${round}`}>{current.line}</CompanionLine>
            <div role="group" aria-label={current.line} className="k-tiles l-sample-tiles" key={`tiles-${round}`}>
              {[current.a, current.b].map((sample, index) => (
                <button
                  key={index}
                  type="button"
                  className="k-tile"
                  style={{ "--i": index } as CSSProperties}
                  aria-label={`Sample ${"AB"[index]}: ${FONT_LABEL[sample.font]}${sample.spaced ? ", spaced" : ""}`}
                  aria-pressed={picks[round] === sample || undefined}
                  onClick={() => choose(sample)}
                >
                  <span>
                    <span className="l-sample-tag">{"AB"[index]}</span>
                    <span
                      className="l-sample"
                      style={{ fontFamily: FONT_STACK[sample.font], letterSpacing: sample.spaced ? "0.05em" : undefined, wordSpacing: sample.spaced ? "0.16em" : undefined }}
                    >
                      {SAMPLE_TEXT}
                    </span>
                  </span>
                  <kbd aria-hidden="true">{index + 1}</kbd>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
