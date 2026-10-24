import { ArrowDown, ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from "react";
import { Button } from "@/components/ui";
import { Tip, TipBody } from "@/components/Tip";
import { formatInt } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * A dense, horizontally scrollable table.
 * @param props.children - `<thead>` and `<tbody>`
 */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  );
}

/**
 * A header cell. Numeric columns align right.
 * @param props.numeric - Right-align
 * @param props.sorted - Show the active-sort arrow
 * @param props.onSort - Make the header a sort toggle
 * @param props.tip - Explanation shown as a rich tooltip on the header label
 */
export function Th({
  numeric,
  sorted,
  onSort,
  tip,
  className,
  children,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean; sorted?: boolean; onSort?: () => void; tip?: ReactNode }) {
  return (
    <th
      className={cn(
        "sticky top-0 z-[1] whitespace-nowrap border-b bg-card-solid px-2.5 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground",
        numeric && "text-right",
        onSort && "cursor-pointer select-none hover:text-foreground",
        sorted && "text-foreground",
        className,
      )}
      onClick={onSort}
      aria-sort={sorted ? "descending" : undefined}
      {...props}
    >
      <span className={cn("inline-flex items-center gap-1", numeric && "flex-row-reverse")}>
        {tip ? (
          <Tip content={typeof tip === "string" ? <TipBody>{tip}</TipBody> : tip} underline>
            {children}
          </Tip>
        ) : (
          children
        )}
        {sorted && <ArrowDown className="size-3" />}
      </span>
    </th>
  );
}

/**
 * A body cell. Numeric cells align right with tabular figures.
 * @param props.numeric - Right-align, tabular-nums
 */
export function Td({ numeric, className, ...props }: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={cn("whitespace-nowrap px-2.5 py-1.5 align-middle", numeric && "text-right tabular-nums", className)}
      {...props}
    />
  );
}

/**
 * A body row; clickable rows get a hover wash and keyboard access.
 * @param props.onClick - Row action
 * @param props.active - Highlight (e.g. the row whose drawer is open)
 */
export function Tr({
  onClick,
  active,
  tone,
  className,
  children,
}: {
  onClick?: () => void;
  active?: boolean;
  tone?: "failed";
  className?: string;
  children: ReactNode;
}) {
  return (
    <tr
      onClick={onClick}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={cn(
        "border-b border-border/60 transition-colors duration-150 last:border-0",
        onClick && "cursor-pointer hover:bg-ice/[0.06] focus-visible:bg-ice/[0.06] focus-visible:outline-none",
        tone === "failed" && "bg-bad/[0.05]",
        active && "bg-ice/10 shadow-[inset_2px_0_0_var(--ice)]",
        className,
      )}
    >
      {children}
    </tr>
  );
}

/**
 * Offset pagination footer.
 * @param props.page - Zero-based page
 * @param props.pageSize - Rows per page
 * @param props.total - Total rows matching
 * @param props.onPage - Go to page
 */
export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : page * pageSize + 1;
  const last = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
      <span className="tabular-nums">
        {formatInt(first)}–{formatInt(last)} of {formatInt(total)}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="size-3.5" />
        </Button>
        <span className="tabular-nums">
          {page + 1} / {pages}
        </span>
        <Button variant="ghost" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
