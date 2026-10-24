import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { Tip, TipBody } from "@/components/Tip";

/**
 * A bordered surface for a chart, table, or group of tiles.
 * @param props.title - Heading shown in the card's header row
 * @param props.subtitle - One muted line under the title
 * @param props.actions - Controls aligned right in the header row
 */
export function Card({
  title,
  subtitle,
  actions,
  className,
  children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("glass glow-border inner-glow lift rounded-2xl border", className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b px-4 py-2.5">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/**
 * A compact button.
 * @param props.variant - `default` (bordered), `ghost`, or `primary`
 */
export function Button({
  variant = "default",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "ghost" | "primary" }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors disabled:opacity-40",
        "focus-visible:outline-2 focus-visible:outline-ring",
        variant === "default" && "glow-focus border bg-secondary hover:border-ice/30 hover:bg-ice/10",
        variant === "ghost" && "hover:bg-ice/10",
        variant === "primary" && "bg-primary text-primary-foreground shadow-[0_0_18px_-4px_rgba(140,203,245,0.6)] hover:opacity-90",
        className,
      )}
      {...props}
    />
  );
}

/**
 * A compact native select with a small label.
 * @param props.label - Shown before the control
 */
export function Select({ label, className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      {label}
      <select
        className={cn(
          "glow-focus h-7 rounded-md border bg-secondary px-1.5 text-xs text-foreground transition-colors [&>option]:bg-card-solid",
          props.value ? "border-ice/50 text-ice" : "",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

/**
 * A compact text input with an optional label.
 * @param props.label - Shown before the control
 */
export function TextInput({ label, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      {label}
      <input
        className={cn(
          "glow-focus h-7 rounded-md border bg-secondary px-2 text-xs text-foreground transition-colors placeholder:text-muted-foreground/70",
          className,
        )}
        {...props}
      />
    </label>
  );
}

/**
 * A monospace id, shortened, with the full value in a tooltip.
 * @param props.id - The id
 * @param props.full - Show the whole id
 */
export function Mono({ id, full, className }: { id: string | null | undefined; full?: boolean; className?: string }) {
  if (!id) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("font-mono text-[11px]", className)} title={id}>
      {full || id.length <= 10 ? id : id.slice(0, 8)}
    </span>
  );
}

/**
 * A label/value pair for detail panels.
 * @param props.label - Field name
 * @param props.tip - Explanation of the field
 */
export function Field({ label, tip, children, className }: { label: string; tip?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {tip ? (
          <Tip content={typeof tip === "string" ? <TipBody>{tip}</TipBody> : tip} underline>
            {label}
          </Tip>
        ) : (
          label
        )}
      </dt>
      <dd className="mt-0.5 truncate text-sm tabular-nums">{children}</dd>
    </div>
  );
}

/**
 * A pill of filter chips showing which filters are active, each removable.
 * @param props.chips - Active filters
 * @param props.onClear - Clears all
 */
export function ActiveFilters({
  chips,
  onClear,
}: {
  chips: { key: string; label: string; onRemove: () => void }[];
  onClear: () => void;
}) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.onRemove}
          className="rounded-full border border-ice/40 bg-ice/10 px-2 py-0.5 text-ice transition-colors hover:bg-ice/20"
          title="Remove filter"
        >
          {chip.label} ×
        </button>
      ))}
      <button type="button" onClick={onClear} className="text-muted-foreground hover:text-foreground">
        clear all
      </button>
    </div>
  );
}
