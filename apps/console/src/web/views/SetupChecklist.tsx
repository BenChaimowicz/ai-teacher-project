import type { OpsSetupChecklist, OpsSetupChecklistItem, OpsSetupChecklistSection } from "@senoy/db/usage";
import { CheckCircle2, ChevronDown, KeyRound } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { RingGauge } from "@/components/charts/RingGauge";
import { PageHeader } from "@/components/PageHeader";
import { Async } from "@/components/States";
import { Card } from "@/components/ui";
import { opsPut } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useOps } from "@/lib/useOps";
import { cn } from "@/lib/cn";

/** Ticks the founders want saved but the API has not confirmed yet, by item key. */
type Pending = Record<string, boolean>;

/**
 * One checklist item: a real checkbox with its label, and who ticked it and when.
 * @param props.item - The item
 * @param props.pending - The state being saved, if a save is in flight
 * @param props.readOnly - True when this console has no operator to tick as
 * @param props.hintId - Id of the read-only explanation, for screen readers
 * @param props.onToggle - Saves the new state
 */
function ChecklistItem({
  item,
  pending,
  readOnly,
  hintId,
  onToggle,
}: {
  item: OpsSetupChecklistItem;
  pending: boolean | undefined;
  readOnly: boolean;
  hintId: string;
  onToggle: (done: boolean) => void;
}) {
  const checked = pending ?? item.completedAt !== null;
  const inputId = `setup-${item.key}`;
  return (
    <li className="flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-ice/[0.04]">
      <input
        id={inputId}
        type="checkbox"
        checked={checked}
        disabled={readOnly || pending !== undefined}
        aria-describedby={readOnly ? hintId : undefined}
        onChange={(e) => onToggle(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 cursor-pointer accent-[var(--ice)] rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed"
      />
      <div className="min-w-0 flex-1">
        <label htmlFor={inputId} className={cn("cursor-pointer text-sm leading-snug", checked ? "text-muted-foreground" : "text-foreground")}>
          {item.label}
        </label>
        {item.completedAt && pending === undefined && (
          <p className="mt-0.5 text-[11px] text-muted-foreground/80">
            Done{item.completedBy ? ` by ${item.completedBy}` : ""} · <time dateTime={item.completedAt}>{formatDateTime(item.completedAt)}</time>
          </p>
        )}
        {pending !== undefined && <p className="mt-0.5 text-[11px] text-muted-foreground/80">Saving…</p>}
      </div>
    </li>
  );
}

/**
 * A collapsible section with its progress, e.g. "3 of 7 completed". Open by default so nothing is hidden.
 * @param props.section - The section
 * @param props.number - Its position, from 1
 */
function ChecklistSection({
  section,
  number,
  pending,
  readOnly,
  hintId,
  onToggle,
}: {
  section: OpsSetupChecklistSection;
  number: number;
  pending: Pending;
  readOnly: boolean;
  hintId: string;
  onToggle: (key: string, done: boolean) => void;
}) {
  const complete = section.done === section.total;
  return (
    <Card>
      <details open className="group">
        <summary className="flex cursor-pointer list-none items-start gap-3 rounded-2xl px-4 py-3 focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-full font-mono text-xs ring-1",
              complete ? "bg-ok/10 text-ok ring-ok/30" : "text-ice ring-ice/30",
            )}
            aria-hidden="true"
          >
            {complete ? <CheckCircle2 className="size-4" /> : number}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">
              <span className="sr-only">{number}. </span>
              {section.title}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{section.intro}</p>
          </div>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {section.done} of {section.total} completed
          </span>
          <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="mx-4 h-1 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
          <div className="h-full rounded-full bg-ice/60 transition-[width] duration-300" style={{ width: `${(section.done / section.total) * 100}%` }} />
        </div>
        <ul className="px-1 py-2">
          {section.items.map((item) => (
            <ChecklistItem
              key={item.key}
              item={item}
              pending={pending[item.key]}
              readOnly={readOnly}
              hintId={hintId}
              onToggle={(done) => onToggle(item.key, done)}
            />
          ))}
        </ul>
      </details>
    </Card>
  );
}

/**
 * Knibbler Setup: the two founders' shared checklist for the domain, email, vendor access, and authentication email.
 * Progress lives in a committed file, so the other founder sees a tick once it is pushed and they pull. It never holds a
 * secret.
 */
export function SetupChecklist() {
  const state = useOps<OpsSetupChecklist>("setup-checklist");
  // The checklist the API answered our last tick with; a later refresh replaces it.
  const [saved, setSaved] = useState<OpsSetupChecklist>();
  const [pending, setPending] = useState<Pending>({});
  const [error, setError] = useState<string>();
  const hintId = useId();

  useEffect(() => setSaved(undefined), [state.data]);

  /**
   * Saves one tick, showing it at once and rolling it back if the save fails.
   * @param key - The item
   * @param done - Ticked or not
   */
  async function toggle(key: string, done: boolean) {
    setError(undefined);
    setPending((p) => ({ ...p, [key]: done }));
    try {
      setSaved(await opsPut<OpsSetupChecklist>(`setup-checklist/items/${encodeURIComponent(key)}`, { done }));
    } catch {
      setError("That change was not saved. Check the console API is running, then try again.");
    } finally {
      setPending(({ [key]: _, ...rest }) => rest);
    }
  }

  return (
    <>
      <PageHeader
        title="Knibbler Setup"
        description="Domain, email, vendor access, and authentication email. Work from top to bottom. Store credentials and recovery codes in your shared password manager, never in this checklist."
        range={false}
      />
      <Async state={{ ...state, data: saved ?? state.data }} rows={8}>
        {(checklist) => {
          const readOnly = checklist.operator === null;
          const allDone = checklist.done === checklist.total;
          return (
            <div className="mx-auto max-w-3xl space-y-4">
              <Card>
                <div className="flex flex-wrap items-center gap-4 p-4">
                  <RingGauge value={checklist.total ? checklist.done / checklist.total : null} size={72} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-semibold tabular-nums">
                      {checklist.done} of {checklist.total} completed
                    </p>
                    {allDone ? (
                      <p className="inline-flex items-center gap-1.5 text-xs text-ok">
                        <CheckCircle2 className="size-3.5" aria-hidden="true" />
                        All set. Knibbler’s setup is complete.
                      </p>
                    ) : checklist.done === 0 ? (
                      <p className="text-xs text-muted-foreground">Nothing ticked yet. Start with the shared password vault.</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Shared with your co-founder through git. Pull to see their latest ticks.</p>
                    )}
                    <p id={hintId} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
                      <KeyRound className="size-3" aria-hidden="true" />
                      {readOnly
                        ? "Read-only here: set your name with git config user.name and restart the console to tick items."
                        : `Ticking as ${checklist.operator}. Commit and push docs/setup-checklist-progress.json to share your ticks.`}
                    </p>
                  </div>
                </div>
              </Card>

              <p role="status" aria-live="polite" className={cn("text-xs text-bad", !error && "sr-only")}>
                {error ?? ""}
              </p>

              {checklist.sections.map((section, i) => (
                <ChecklistSection
                  key={section.key}
                  section={section}
                  number={i + 1}
                  pending={pending}
                  readOnly={readOnly}
                  hintId={hintId}
                  onToggle={toggle}
                />
              ))}
            </div>
          );
        }}
      </Async>
    </>
  );
}
