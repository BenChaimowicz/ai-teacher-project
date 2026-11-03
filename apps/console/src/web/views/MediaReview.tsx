import type { OpsMediaReview, OpsMediaReviewItem } from "@senoy/db/usage";
import { Check, ExternalLink, Trash2, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { StatusPill } from "@/components/Badges";
import { PageHeader } from "@/components/PageHeader";
import { Async, EmptyState } from "@/components/States";
import { Button, Card } from "@/components/ui";
import { opsPut } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useOps } from "@/lib/useOps";
import { cn } from "@/lib/cn";

/** Licence names as a person reads them. */
const LICENSE_LABEL: Record<string, string> = { public_domain: "Public domain", cc0: "CC0", cc_by: "CC BY", cc_by_sa: "CC BY-SA" };

/** A decision being saved, by file id. */
type Pending = Record<string, "reviewed" | "removed">;

/**
 * One Commons file: its thumbnail from our bucket, caption, licence, author and source page, and the two decisions.
 * @param props.item - The file
 * @param props.pending - The decision being saved, if any
 * @param props.onDecide - Saves a decision
 */
function MediaItem({ item, pending, onDecide }: { item: OpsMediaReviewItem; pending: Pending[string] | undefined; onDecide: (review: "reviewed" | "removed") => void }) {
  const [broken, setBroken] = useState(false);
  const license = LICENSE_LABEL[item.license] ?? item.license;
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row">
      <div className="grid h-36 w-full shrink-0 place-items-center overflow-hidden rounded-xl border bg-secondary/40 sm:w-48">
        {broken ? (
          <p className="px-3 text-center text-[11px] text-muted-foreground">No thumbnail: the console has no bucket keys, or the file is missing.</p>
        ) : (
          <img src={`/api/ops/media-review/${item.id}/file`} alt={item.alt} loading="lazy" onError={() => setBroken(true)} className="max-h-full max-w-full object-contain" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5 text-sm">
        <p className="leading-snug">{item.caption}</p>
        <p className="text-xs text-muted-foreground">
          {item.licenseUrl ? <a href={item.licenseUrl} target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-foreground">{license}</a> : license}
          {item.source && <> · by {item.source.author}</>}
          {item.width && item.height && <> · {item.width}×{item.height}</>}
        </p>
        {item.source && (
          <a href={item.source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-ice hover:underline">
            {item.source.title} <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        )}
        <p className="text-[11px] text-muted-foreground/80">
          {item.mediaCategory} · {item.topicTags.join(", ")} · found <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
          {" · "}shown in {item.lessonCount} published {item.lessonCount === 1 ? "Lesson" : "Lessons"}
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {item.review === "unreviewed" ? (
            <>
              <Button variant="primary" disabled={pending !== undefined} onClick={() => onDecide("reviewed")}>
                <Check className="size-3.5" aria-hidden="true" /> Approve
              </Button>
              <Button disabled={pending !== undefined} onClick={() => onDecide("removed")}>
                <Trash2 className="size-3.5" aria-hidden="true" /> Remove
              </Button>
            </>
          ) : (
            <>
              <StatusPill tone={item.review === "reviewed" ? "good" : "critical"}>{item.review === "reviewed" ? "Approved" : "Removed"}</StatusPill>
              <Button variant="ghost" disabled={pending !== undefined} onClick={() => onDecide(item.review === "reviewed" ? "removed" : "reviewed")}>
                <Undo2 className="size-3.5" aria-hidden="true" /> {item.review === "reviewed" ? "Remove instead" : "Approve instead"}
              </Button>
            </>
          )}
          {pending && <span className="text-[11px] text-muted-foreground">Saving…</span>}
        </div>
      </div>
    </li>
  );
}

/**
 * Media review (SEN-129): images found on Wikimedia Commons go into Lessons straight away, unreviewed, and are listed
 * here until a person approves or removes them. Removing stops new Readings from using a file; Lessons that already show
 * it keep showing it.
 */
export function MediaReview() {
  const state = useOps<OpsMediaReview>("media-review");
  const [pending, setPending] = useState<Pending>({});
  const [error, setError] = useState<string>();

  useEffect(() => setError(undefined), [state.data]);

  /**
   * Saves one decision, then re-reads the list.
   * @param id - The file
   * @param review - Approve or remove
   */
  async function decide(id: string, review: "reviewed" | "removed") {
    setError(undefined);
    setPending((p) => ({ ...p, [id]: review }));
    try {
      await opsPut(`media-review/${encodeURIComponent(id)}`, { review });
      state.reload();
    } catch {
      setError("That decision was not saved. Check the console API is running, then try again.");
    } finally {
      setPending(({ [id]: _, ...rest }) => rest);
    }
  }

  return (
    <>
      <PageHeader
        title="Media review"
        description="Images found on Wikimedia Commons for Lessons the library could not fill. Each is used straight away; check that it shows what its caption says and that the licence and author are right. Removing one stops new Lessons from using it; Lessons that already show it keep it."
        range={false}
      />
      <p role="status" aria-live="polite" className={cn("mb-3 text-xs text-bad", !error && "sr-only")}>{error ?? ""}</p>
      <Async state={state} rows={4}>
        {(data) => (
          <div className="mx-auto max-w-4xl space-y-4">
            <Card title={`Not yet reviewed (${data.unreviewed.length})`} subtitle="Oldest first.">
              {data.unreviewed.length === 0 ? (
                <EmptyState title="Nothing to review" hint="Every image found on Commons so far has been approved or removed." />
              ) : (
                <ul className="divide-y">
                  {data.unreviewed.map((item) => <MediaItem key={item.id} item={item} pending={pending[item.id]} onDecide={(review) => decide(item.id, review)} />)}
                </ul>
              )}
            </Card>
            {data.decided.length > 0 && (
              <Card title="Recently decided" subtitle="The latest approvals and removals, newest first. A decision can be changed.">
                <ul className="divide-y">
                  {data.decided.map((item) => <MediaItem key={item.id} item={item} pending={pending[item.id]} onDecide={(review) => decide(item.id, review)} />)}
                </ul>
              </Card>
            )}
          </div>
        )}
      </Async>
    </>
  );
}
