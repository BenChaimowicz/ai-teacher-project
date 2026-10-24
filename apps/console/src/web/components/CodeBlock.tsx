import { Check, ChevronDown, ChevronRight, Copy, WrapText } from "lucide-react";
import { useMemo, useState } from "react";
import { formatInt } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Turns any payload into display text: strings stay as-is (or are pretty-printed if they hold JSON), everything
 * else is pretty-printed JSON.
 * @param value - Any payload
 * @returns Text to show and copy
 */
export function toDisplayText(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      try {
        return JSON.stringify(JSON.parse(trimmed), null, 2);
      } catch {
        return value;
      }
    }
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return `[CodeBlock: toDisplayText] Could not serialise payload || type=${typeof value} || ${(error as Error).message}`;
  }
}

/**
 * Copy-to-clipboard button that confirms briefly.
 * @param props.text - What to copy
 */
export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        });
      }}
      title="Copy"
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {label ?? (copied ? "Copied" : "Copy")}
    </button>
  );
}

/**
 * A collapsible, copyable, pretty-printed block for prompts, inputs, and raw responses.
 * @param props.title - Heading
 * @param props.value - Payload (string or JSON-able)
 * @param props.defaultOpen - Start expanded
 */
export function CodeBlock({ title, value, defaultOpen = false }: { title: string; value: unknown; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [wrap, setWrap] = useState(true);
  const text = useMemo(() => toDisplayText(value), [value]);
  const empty = text === "" || text === "null";
  const lines = empty ? 0 : text.split("\n").length;

  return (
    <div className="rounded-md border bg-background/60">
      <div className="flex items-center justify-between gap-2 px-2 py-1">
        <button
          type="button"
          className="flex min-w-0 items-center gap-1 text-xs font-medium hover:text-foreground"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          {title}
          <span className="font-normal text-muted-foreground">
            {empty ? "· empty" : `· ${formatInt(lines)} lines · ${formatInt(text.length)} chars`}
          </span>
        </button>
        {!empty && (
          <div className="flex items-center">
            {open && (
              <button
                type="button"
                className={cn("rounded p-1 text-muted-foreground hover:bg-accent", wrap && "text-foreground")}
                onClick={() => setWrap((w) => !w)}
                title="Toggle line wrap"
              >
                <WrapText className="size-3" />
              </button>
            )}
            <CopyButton text={text} />
          </div>
        )}
      </div>
      {open && !empty && (
        <pre
          className={cn(
            "max-h-[28rem] overflow-auto border-t px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground/90",
            wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre",
          )}
        >
          {text}
        </pre>
      )}
    </div>
  );
}
