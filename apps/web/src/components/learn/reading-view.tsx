import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import type { MediaLicense } from "@senoy/db";
import { proseBlocks, type MediaBlock, type NumberedSource, type ReadingBody } from "@senoy/db/reading-lesson";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useCompanion } from "@/components/companion/companion-provider.tsx";
import { useShell } from "@/components/shell/app-shell.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ChatThread, CompanionLine } from "@/components/ui/chat-thread.tsx";
import { OptionTiles, type OptionTile } from "@/components/ui/option-tiles.tsx";
import { useToast } from "@/components/ui/toast.tsx";
import { isLightSurface, readingStyle } from "@/components/learn/reading-settings.ts";
import { useStudyChrome } from "@/components/learn/study-chrome.tsx";
import { cheer } from "@/lib/cheer.ts";
import { cn } from "@/lib/utils";
import "@/components/learn/learn.css";

const BOOK_GAP = 64;
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Splits a paragraph into its first sentence (the "key" line Skim highlights) and the rest.
 * @param text - Paragraph text
 */
function splitKey(text: string): [string, string] {
  const match = /^(.+?[.!?](?:\[\d+\])*)(\s+[\s\S]*)?$/.exec(text);
  if (!match) return [text, ""];
  return [match[1]!, match[2] ?? ""];
}

/**
 * Words in the body, for the minutes estimate.
 * @param body - Reading body
 */
function wordCount(body: ReadingBody) {
  return body.sections.reduce((sum, section) => sum + proseBlocks(section).reduce((n, block) => n + block.text.split(/\s+/).length, 0), 0);
}

/** How a figure's credit line names each licence. */
const LICENSE_LABELS: Record<MediaLicense, string> = {
  public_domain: "Public domain",
  cc0: "CC0",
  cc_by: "CC BY",
  cc_by_sa: "CC BY-SA",
  product_owned: "Original illustration",
};

/**
 * One piece of Demonstrative media: the file from `/media/…`, the caption the Lesson wrote, and a credit line with the
 * file's title, author, and licence, linked to its source page and licence deed where it has them.
 */
function MediaFigure({ block }: { block: MediaBlock }) {
  const { descriptor } = block;
  const license = LICENSE_LABELS[descriptor.license];
  return (
    <figure className="l-figure fb">
      <img
        src={`/media/${descriptor.storageKey}`}
        alt={block.alt}
        width={descriptor.width ?? undefined}
        height={descriptor.height ?? undefined}
        loading="lazy"
        decoding="async"
      />
      <figcaption>
        <span className="l-figure-caption">{block.caption}</span>
        <span className="l-figure-credit">
          {descriptor.source ? (
            <>
              <a href={descriptor.source.url} target="_blank" rel="noreferrer">
                {descriptor.source.title}
              </a>
              {" · "}
              {descriptor.source.author}
              {" · "}
            </>
          ) : null}
          {descriptor.licenseUrl ? (
            <a href={descriptor.licenseUrl} target="_blank" rel="noreferrer">
              {license}
            </a>
          ) : (
            license
          )}
        </span>
      </figcaption>
    </figure>
  );
}

type ProseProps = { text: string; sources: Map<number, NumberedSource>; onCite: (event: MouseEvent<HTMLAnchorElement>, n: number) => void };

/**
 * Prose with [n] markers turned into small superscript links. The source title shows on hover and focus,
 * so the reader doesn't have to leave the line.
 */
function Prose({ text, sources, onCite }: ProseProps) {
  return (
    <>
      {text.replace(/\s+(?=\[\d+\])/g, "").split(/(\[\d+\])/g).map((part, index, parts) => {
        const match = /^\[(\d+)\]$/.exec(part);
        if (!match) {
          if (part === "" && index > 0 && index < parts.length - 1) {
            return (
              <span key={index} className="l-cite-sep" aria-hidden="true">
                ,
              </span>
            );
          }
          return <span key={index}>{part}</span>;
        }
        const n = Number(match[1]);
        const source = sources.get(n);
        return (
          <a
            key={index}
            href={`#citation-${n}`}
            className="l-cite"
            data-title={source?.title ?? `Source ${n}`}
            aria-label={source ? `Source ${n}: ${source.title}` : `Source ${n}`}
            onClick={(event) => onCite(event, n)}
          >
            {n}
          </a>
        );
      })}
    </>
  );
}

type ReadingViewProps = {
  lessonId: string;
  title: string;
  lessonGoal: string;
  lessonNumber?: number;
  body: ReadingBody;
  citations: NumberedSource[];
  completed: boolean;
  /** Pause after each section until Continue (Teaching Profile `sectionAdvance = manual`). */
  paused: boolean;
  /** Marks the Lesson complete. Rejects with a message the page shows. */
  onComplete: () => Promise<void>;
  /** Next Lesson / Finish Course, shown once the Lesson is complete. */
  finish?: ReactNode;
};

const END_OPTIONS: OptionTile<"read" | "stay">[] = [
  { id: "read", label: "I've read it", description: "Marks this lesson done", tone: "primary", value: "read" },
  { id: "stay", label: "Not yet, stay here", description: "Keep reading. No rush.", tone: "quiet", value: "stay" },
];

/**
 * A reading Lesson in the current reading mode: Comfort/Spaced scroll, Focus lights the paragraph
 * you're on, Book pages through two columns, Skim folds sections to their key sentences.
 * Ends with the companion's "I've read it" prompt, which is the completion action.
 */
export function ReadingView({ lessonId, title, lessonGoal, lessonNumber, body, citations, completed, paused, onComplete, finish }: ReadingViewProps) {
  const { settings, setSectionsRead } = useStudyChrome();
  const { setReadingProgress, sidebarOpen } = useShell();
  const { say } = useCompanion();
  const toast = useToast();
  const layout = settings.layout;
  const total = body.sections.length;

  const [revealed, setRevealed] = useState(paused ? 1 : total);
  const [read, setRead] = useState<boolean[]>(() => body.sections.map(() => completed));
  const [unfolded, setUnfolded] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [endKey, setEndKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const article = useRef<HTMLElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const flow = useRef<HTMLDivElement>(null);
  const halfSaid = useRef(false);

  const sources = useMemo(() => new Map(citations.map((row) => [row.n, row])), [citations]);
  const minutes = Math.max(1, Math.round(wordCount(body) / 200));
  const allShown = revealed >= total;
  const book = layout === "book";
  const lastPage = page >= pages - 1;

  useEffect(() => {
    setRevealed(paused ? 1 : total);
    setRead(body.sections.map(() => completed));
    setUnfolded(new Set());
    setPage(0);
    setError(null);
    halfSaid.current = false;
    // A new Lesson starts at the top.
  }, [lessonId]);

  useEffect(() => {
    if (!paused) setRevealed(total);
  }, [paused, total]);

  useEffect(() => {
    if (completed) setRead((list) => list.map(() => true));
  }, [completed]);

  useEffect(() => {
    setSectionsRead(read);
  }, [read, setSectionsRead]);

  useEffect(() => () => setSectionsRead([]), [setSectionsRead]);

  /**
   * Ticks a section in the sidebar outline, with a small cheer from the tick.
   * @param index - Section index
   */
  const markRead = useCallback(
    (index: number) => {
      setRead((list) => {
        if (list[index]) return list;
        const next = [...list];
        next[index] = true;
        const tick = sidebarOpen ? document.querySelector(`#study-lessons .l-subs li:nth-child(${index + 1})`) : null;
        if (tick) cheer(tick, "section read");
        if (next.every(Boolean) && next.length > 1) say("All the sections. Nice and steady.");
        return next;
      });
    },
    [sidebarOpen, say],
  );

  const progress = useCallback(
    (value: number) => {
      const p = Math.max(0, Math.min(1, value));
      setReadingProgress(p);
      if (!halfSaid.current && p > 0.5 && !completed) {
        halfSaid.current = true;
        say("Halfway.");
      }
    },
    [setReadingProgress, say, completed],
  );

  /* ----- scroll layouts: progress, section ticks, the lit paragraph in Focus ----- */
  useEffect(() => {
    if (book) return;
    const main = document.getElementById("main");
    const root = article.current;
    if (!main || !root) return;
    function onScroll() {
      if (!main || !root) return;
      progress(main.scrollTop / (main.scrollHeight - main.clientHeight || 1));
      const box = main.getBoundingClientRect();
      const line = box.top + main.clientHeight * 0.6;
      root.querySelectorAll<HTMLElement>("[data-sec-end]").forEach((el) => {
        if (el.getBoundingClientRect().top <= line) markRead(Number(el.dataset.secEnd));
      });
      if (layout === "focus") {
        const mid = box.top + main.clientHeight * 0.42;
        let best: Element | null = null;
        let bestDistance = Infinity;
        root.querySelectorAll(".fb").forEach((el) => {
          const r = el.getBoundingClientRect();
          if (!r.height) return;
          const d = r.top <= mid && r.bottom >= mid ? 0 : Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid));
          if (d < bestDistance) {
            bestDistance = d;
            best = el;
          }
        });
        root.querySelectorAll(".fb").forEach((el) => el.classList.toggle("lit", el === best));
      }
    }
    onScroll();
    main.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      main.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [book, layout, progress, markRead, revealed, unfolded, settings]);

  /* ----- Book: CSS columns in a clipped view; a page is one view wide ----- */
  const measureBook = useCallback(() => {
    const v = view.current;
    const f = flow.current;
    if (!v || !f) return;
    const main = document.getElementById("main");
    const height = Math.max(320, Math.min(620, (main?.clientHeight ?? 700) - 170));
    f.style.height = `${height}px`;
    const step = v.clientWidth + BOOK_GAP;
    const count = Math.max(1, Math.ceil((f.scrollWidth + BOOK_GAP) / step - 0.02));
    setPages(count);
    setPage((current) => Math.min(current, count - 1));
  }, []);

  useLayoutEffect(() => {
    const f = flow.current;
    if (!book) {
      if (f) {
        f.style.height = "";
        f.style.transform = "";
      }
      return;
    }
    measureBook();
    const frame = requestAnimationFrame(measureBook);
    window.addEventListener("resize", measureBook);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measureBook);
    };
  }, [book, measureBook, settings, revealed, unfolded, lessonId]);

  useEffect(() => {
    if (!book) return;
    const v = view.current;
    const f = flow.current;
    if (!v || !f) return;
    const step = v.clientWidth + BOOK_GAP;
    f.style.transform = `translateX(${-page * step}px)`;
    progress(pages > 1 ? page / (pages - 1) : 1);
    f.querySelectorAll<HTMLElement>("[data-sec-end]").forEach((el) => {
      if (Math.floor((el.offsetLeft + 2) / step) <= page) markRead(Number(el.dataset.secEnd));
    });
  }, [book, page, pages, progress, markRead]);

  useEffect(() => {
    if (!book) return;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (document.querySelector(".k-dialog, .l-rpanel")) return;
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        setPage((current) => Math.min(pages - 1, current + 1));
      }
      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        setPage((current) => Math.max(0, current - 1));
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [book, pages]);

  /**
   * A citation jumps to its source without moving the URL or breaking the book view.
   * @param event - Click
   * @param n - Source number
   */
  function onCite(event: MouseEvent<HTMLAnchorElement>, n: number) {
    event.preventDefault();
    const target = document.getElementById(`citation-${n}`);
    if (!target) return;
    if (book && view.current) {
      const step = view.current.clientWidth + BOOK_GAP;
      setPage(Math.floor((target.offsetLeft + 2) / step));
    } else {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    target.classList.add("hl");
    window.setTimeout(() => target.classList.remove("hl"), 2400);
    target.focus({ preventScroll: true });
  }

  /**
   * The end prompt: "I've read it" completes; "Not yet" leaves the prompt for later.
   * @param option - Picked tile
   */
  async function onEnd(option: OptionTile<"read" | "stay">) {
    if (option.value === "stay") {
      say("No rush. I'll be here when you're ready.");
      window.setTimeout(() => setEndKey((key) => key + 1), 600);
      return;
    }
    setError(null);
    try {
      await onComplete();
      setRead((list) => list.map(() => true));
      const tile = article.current?.querySelector(".l-nib .k-tile.picked");
      cheer(tile, "lesson read");
      toast({ title: "Lesson read", body: `${title}${lessonNumber ? ` · lesson ${pad(lessonNumber)} done` : ""}`, tone: "celebrate" });
      say("Done reading. Nice pace.", "cheer");
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Could not mark complete");
      setEndKey((key) => key + 1);
    }
  }

  const fold = layout === "skim";
  const surfaceLight = isLightSurface(settings.surface);
  const shownSections = body.sections.slice(0, revealed);

  const endArea = allShown && (!book || lastPage) ? (
    <div className="l-nib">
      <ChatThread label="End of lesson">
        {completed ? (
          <CompanionLine key="done">You've read this one.{finish ? " Ready when you are." : ""}</CompanionLine>
        ) : (
          <>
            <CompanionLine key="ask">That's the lesson. Did it make sense?</CompanionLine>
            <OptionTiles options={END_OPTIONS} onPick={onEnd} label="End of lesson" resetKey={endKey} />
          </>
        )}
      </ChatThread>
      {error ? (
        <p role="alert" className="l-error">
          {error}
        </p>
      ) : null}
      {completed ? finish : null}
    </div>
  ) : null;

  const content = (
    <>
      <header className="l-lhead fb">
        <p className="l-kicker">{lessonNumber ? `lesson ${pad(lessonNumber)} · reading` : "reading"}</p>
        <h1>{title}</h1>
        <p className="learn">
          <b>You'll learn:</b> {lessonGoal}
        </p>
        <p className="l-meta">
          <span>{minutes} min</span>
          <span aria-hidden="true">·</span>
          <span>
            {total} {total === 1 ? "section" : "sections"}
          </span>
          {citations.length > 0 ? (
            <>
              <span aria-hidden="true">·</span>
              <span>
                {citations.length} {citations.length === 1 ? "source" : "sources"}
              </span>
            </>
          ) : null}
        </p>
      </header>
      <div className="l-prose">
        {shownSections.map((section, index) => {
          const open = !fold || unfolded.has(index);
          const hasMore = section.blocks.some((block) => block.kind === "media" || splitKey(block.text)[1].trim().length > 0);
          return (
            <section key={`${section.heading}-${index}`} aria-labelledby={`sec-${lessonId}-${index}`}>
              <h2 id={`sec-${lessonId}-${index}`} data-sec-end={index > 0 ? index - 1 : undefined}>
                <span className="sec-n" aria-hidden="true">
                  {lessonNumber ? `${lessonNumber}.${index + 1}` : index + 1}
                </span>
                {section.heading}
              </h2>
              {section.blocks.map((block, blockIndex) => {
                // In Skim a figure waits with the rest of its section until the section is expanded.
                if (block.kind === "media") return open ? <MediaFigure key={blockIndex} block={block} /> : null;
                if (!fold) {
                  return (
                    <p key={blockIndex} className="fb">
                      <Prose text={block.text} sources={sources} onCite={onCite} />
                    </p>
                  );
                }
                const [key, rest] = splitKey(block.text);
                return (
                  <p key={blockIndex} className="fb">
                    <span className="key">
                      <Prose text={key} sources={sources} onCite={onCite} />
                    </span>
                    {open && rest ? <Prose text={rest} sources={sources} onCite={onCite} /> : null}
                  </p>
                );
              })}
              {fold && hasMore ? (
                <button
                  type="button"
                  className="l-sec-more"
                  aria-expanded={open}
                  onClick={() =>
                    setUnfolded((current) => {
                      const next = new Set(current);
                      if (next.has(index)) next.delete(index);
                      else next.add(index);
                      return next;
                    })
                  }
                >
                  {open ? "collapse ↑" : "expand ↓"}
                </button>
              ) : null}
            </section>
          );
        })}
      </div>
      {allShown ? (
        <aside className="l-sources fb" aria-labelledby={`sources-${lessonId}`} data-sec-end={total - 1}>
          {citations.length > 0 ? (
            <>
              <h2 id={`sources-${lessonId}`}>sources</h2>
              <ol>
                {citations.map((row) => (
                  <li key={row.n} id={`citation-${row.n}`} tabIndex={-1}>
                    <b>[{row.n}]</b>
                    <a href={row.url} target="_blank" rel="noreferrer">
                      {row.title}
                    </a>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <h2 id={`sources-${lessonId}`} className="sr-only">
              End of the lesson
            </h2>
          )}
        </aside>
      ) : null}
    </>
  );

  return (
    <article
      ref={article}
      aria-label={title}
      className={cn("l-read", `lay-${layout}`, `surf-${settings.surface}`, `f-${settings.font}`, surfaceLight && "light")}
      style={readingStyle(settings)}
    >
      {book ? (
        <>
          <div className="l-book-view" ref={view}>
            <div className="l-flow" ref={flow}>
              {content}
            </div>
          </div>
          <div className="l-book-nav">
            <button type="button" aria-label="Previous page" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>
              <ArrowLeft />
            </button>
            <span className="pg" aria-live="polite">
              page <b>{page + 1}</b> / {pages}
            </span>
            <button type="button" aria-label="Next page" disabled={lastPage} onClick={() => setPage((current) => Math.min(pages - 1, current + 1))}>
              <ArrowRight />
            </button>
          </div>
        </>
      ) : (
        content
      )}
      {!allShown ? (
        <div className="l-continue">
          <Button onClick={() => setRevealed((count) => Math.min(total, count + 1))}>Continue</Button>
          <span>
            section {revealed} of {total}
          </span>
        </div>
      ) : null}
      {endArea}
    </article>
  );
}
