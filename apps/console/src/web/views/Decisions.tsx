import type { DecisionStatus, OpsDecision, OpsDecisionLog } from "@senoy/db/usage";
import { AlertTriangle, FileText, Search, Users } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { StatusPill } from "@/components/Badges";
import { Async, EmptyState } from "@/components/States";
import { Tip, TipBody } from "@/components/Tip";
import { Card } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { useSetParams } from "@/lib/nav";
import { useOps } from "@/lib/useOps";
import type { StatusTone } from "@/lib/palette";
import { cn } from "@/lib/cn";

/** How each status reads in the list. */
const STATUS: Record<DecisionStatus, { label: string; tone: StatusTone; help: string }> = {
  active: { label: "Active", tone: "good", help: "Still how we do it." },
  superseded: { label: "Superseded", tone: "neutral", help: "A later decision replaced this one." },
  reversed: { label: "Reversed", tone: "warning", help: "We undid this and did not replace it." },
};

/** The status tabs, in the order they are shown. */
const TABS = [{ key: "", label: "All" }, ...Object.entries(STATUS).map(([key, s]) => ({ key, label: s.label }))] as const;

/**
 * Formats a `YYYY-MM-DD` as a day, without letting the browser's time zone shift it.
 * @param day - The entry's date
 * @returns e.g. `Oct 28, 2026`
 */
function formatDecisionDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return day;
  return new Date(year, month - 1, date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * The month an entry belongs to, used as the timeline heading.
 * @param day - The entry's date
 * @returns e.g. `October 2026`
 */
function monthOf(day: string): string {
  const [year, month] = day.split("-").map(Number);
  if (!year || !month) return day;
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/**
 * Renders bold and inline code inside one line of the why; everything else stays literal text.
 * @param text - One line of Markdown
 * @returns The line's nodes
 */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {inline(part.slice(2, -2))}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={i} className="rounded bg-secondary px-1 py-px font-mono text-[11px] text-ice">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/**
 * The why, as the small slice of Markdown entries are written in: paragraphs, bullet lists, bold, and code.
 * @param props.text - The entry's body
 */
function Why({ text }: { text: string }) {
  // A run of `-` lines is one list; everything else is one paragraph, so a lead-in line keeps its own line.
  const runs: { bullets: boolean; lines: string[] }[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) {
      runs.push({ bullets: false, lines: [] });
      continue;
    }
    const bullets = /^\s*[-*]\s+/.test(line);
    const last = runs.at(-1);
    if (last && last.lines.length > 0 && last.bullets === bullets) last.lines.push(line);
    else runs.push({ bullets, lines: [line] });
  }

  return (
    <div className="space-y-2.5 text-sm leading-relaxed text-muted-foreground">
      {runs
        .filter((run) => run.lines.length > 0)
        .map((run, i) =>
          run.bullets ? (
            <ul key={i} className="ml-1 space-y-1">
              {run.lines.map((line, j) => (
                <li key={j} className="flex gap-2">
                  <span className="mt-[7px] size-1 shrink-0 rounded-full bg-ice/50" />
                  <span>{inline(line.replace(/^\s*[-*]\s+/, ""))}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p key={i}>{inline(run.lines.join(" "))}</p>
          ),
        )}
    </div>
  );
}

/**
 * One decision: what we decided, the tickets and people it belongs to, and why, collapsed until opened.
 * @param props.decision - The entry
 * @param props.ticket - The ticket filter, so its chip reads as active
 * @param props.onTicket - Filters the list by a ticket
 */
function DecisionCard({ decision, ticket, onTicket }: { decision: OpsDecision; ticket: string; onTicket: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const status = STATUS[decision.status];
  const long = decision.why.length > 420;

  return (
    <Card className="overflow-hidden">
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <h3 className="text-base font-semibold leading-snug">{decision.decision}</h3>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
              <span className="tabular-nums text-foreground/80">{formatDecisionDay(decision.when)}</span>
              {decision.people.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Users className="size-3" />
                  {decision.people.join(", ")}
                </span>
              )}
              <Tip content={<TipBody title="Where it lives">Edit this file to change the entry; the console re-reads it on refresh.</TipBody>}>
                <span className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground/70">
                  <FileText className="size-3" />
                  {decision.path}
                </span>
              </Tip>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            {decision.tickets.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => onTicket(ticket === id ? "" : id)}
                className={cn(
                  "rounded-full border px-2 py-px font-mono text-[11px] transition-colors",
                  ticket === id ? "border-ice/50 bg-ice/15 text-ice" : "text-muted-foreground hover:border-ice/30 hover:text-foreground",
                )}
              >
                {id}
              </button>
            ))}
            <StatusPill tone={status.tone} tip={<TipBody title={status.label}>{status.help}</TipBody>}>
              {status.label}
            </StatusPill>
          </div>
        </div>

        <div className={cn("relative", !open && long && "max-h-28 overflow-hidden")}>
          <Why text={decision.why} />
          {!open && long && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card-solid to-transparent" />}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          {long && (
            <button type="button" onClick={() => setOpen((v) => !v)} className="text-ice transition-opacity hover:opacity-80">
              {open ? "Show less" : "Read the whole why"}
            </button>
          )}
          {decision.supersedes.length > 0 && <span className="text-muted-foreground">Replaces {decision.supersedes.join(", ")}</span>}
        </div>
      </div>
    </Card>
  );
}

/**
 * Decisions: the team's decision log, read straight from `docs/decisions/` in the repo — what we decided, why, and
 * when. No database; an edited file shows on the next refresh.
 */
export function Decisions() {
  const [search] = useSearchParams();
  const setParams = useSetParams();
  const status = search.get("status") ?? "";
  const ticket = search.get("ticket") ?? "";
  const text = search.get("q") ?? "";
  const state = useOps<OpsDecisionLog>("decisions");

  return (
    <>
      <PageHeader
        title="Decisions"
        description="What the team decided, why, and when — read straight from docs/decisions/ in the repo."
        range={false}
      />
      <Async state={state} rows={8}>
        {(log) => {
          const needle = text.trim().toLowerCase();
          const shown = log.decisions.filter(
            (d) =>
              (!status || d.status === status) &&
              (!ticket || d.tickets.includes(ticket)) &&
              (!needle || `${d.decision} ${d.why} ${d.tickets.join(" ")} ${d.people.join(" ")}`.toLowerCase().includes(needle)),
          );
          const months = [...new Set(shown.map((d) => monthOf(d.when)))];

          return (
            <div className="space-y-4">
              {log.problems.length > 0 && (
                <Card className="border-bad/40">
                  <div className="flex items-start gap-3 p-4 text-sm">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-bad" />
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium">
                        {log.problems.length} {log.problems.length === 1 ? "entry" : "entries"} could not be read, so they are missing below.
                      </p>
                      {log.problems.map((p) => (
                        <p key={p.path} className="break-words font-mono text-[10px] text-muted-foreground">
                          {p.path} — {p.problem}
                        </p>
                      ))}
                    </div>
                  </div>
                </Card>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-md border bg-secondary p-0.5 text-[11px]">
                  {TABS.map((tab) => {
                    const n = log.decisions.filter((d) => !tab.key || d.status === tab.key).length;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setParams({ status: tab.key })}
                        className={cn(
                          "rounded px-2 py-0.5 transition-colors",
                          status === tab.key ? "bg-ice/15 text-ice" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {tab.label} <span className="tabular-nums opacity-60">{n}</span>
                      </button>
                    );
                  })}
                </div>
                <label className="glow-focus inline-flex h-7 items-center gap-1.5 rounded-md border bg-secondary px-2 text-xs">
                  <Search className="size-3.5 text-muted-foreground" />
                  <input
                    value={text}
                    onChange={(e) => setParams({ q: e.target.value })}
                    placeholder="Search decisions"
                    className="w-48 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
                  />
                </label>
                {ticket && (
                  <button
                    type="button"
                    onClick={() => setParams({ ticket: "" })}
                    className="inline-flex h-7 items-center gap-1.5 rounded-md border border-ice/50 bg-ice/15 px-2 font-mono text-[11px] text-ice"
                  >
                    {ticket} ×
                  </button>
                )}
                <span className="text-xs text-muted-foreground">
                  {shown.length} of {log.decisions.length}
                </span>
              </div>

              {shown.length === 0 ? (
                <Card>
                  <EmptyState
                    title={log.decisions.length === 0 ? "No decisions logged yet" : "Nothing matches these filters"}
                    hint={
                      log.decisions.length === 0
                        ? `Add a Markdown file to ${log.folder}/ — see its README for the shape. It shows here on the next refresh.`
                        : "Clear the search, the ticket, or the status tab."
                    }
                  />
                </Card>
              ) : (
                months.map((month) => (
                  <section key={month} className="space-y-3">
                    <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{month}</h2>
                    {shown
                      .filter((d) => monthOf(d.when) === month)
                      .map((d) => (
                        <DecisionCard key={d.id} decision={d} ticket={ticket} onTicket={(id) => setParams({ ticket: id })} />
                      ))}
                  </section>
                ))
              )}
            </div>
          );
        }}
      </Async>
    </>
  );
}
