import { CalendarRange } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui";
import { RANGE_LABELS, RANGE_PRESETS, isoToLocalInput, useTimeRange } from "@/lib/range";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * The global time range control: presets as a segmented control, plus a custom from/to popover. The range lives in
 * the URL so every view is linkable.
 */
export function RangePicker() {
  const range = useTimeRange();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(() => isoToLocalInput(range.from));
  const [to, setTo] = useState(() => isoToLocalInput(range.to));

  /** Applies the custom inputs (local time) as ISO instants. */
  const apply = () => {
    const f = new Date(from);
    const t = new Date(to);
    if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime()) || f >= t) return;
    range.setCustom(f.toISOString(), t.toISOString());
    setOpen(false);
  };

  return (
    <div className="relative flex items-center gap-2">
      <div className="glass inline-flex rounded-full border p-1 text-xs">
        {RANGE_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => range.setPreset(preset)}
            className={cn(
              "rounded-full px-3 py-1 font-medium transition-all duration-200",
              range.preset === preset ? "pill-gradient text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {RANGE_LABELS[preset]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setFrom(isoToLocalInput(range.from));
            setTo(isoToLocalInput(range.to));
            setOpen((o) => !o);
          }}
          className={cn(
            "flex items-center gap-1 rounded-full px-3 py-1 font-medium transition-all duration-200",
            range.preset === "custom" ? "pill-gradient text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <CalendarRange className="size-3.5" />
          {range.preset === "custom" ? `${formatDateTime(range.from)} → ${formatDateTime(range.to)}` : "Custom"}
        </button>
      </div>
      {open && (
        <div className="glass animate-pop-in absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border bg-card-solid/95 p-3 text-xs">
          <label className="mb-2 block">
            <span className="mb-1 block text-muted-foreground">From</span>
            <input
              type="datetime-local"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="glow-focus h-8 w-full rounded-md border bg-secondary px-2 [color-scheme:dark]"
            />
          </label>
          <label className="mb-3 block">
            <span className="mb-1 block text-muted-foreground">To</span>
            <input
              type="datetime-local"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="glow-focus h-8 w-full rounded-md border bg-secondary px-2 [color-scheme:dark]"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={apply} disabled={!from || !to || new Date(from) >= new Date(to)}>
              Apply
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
