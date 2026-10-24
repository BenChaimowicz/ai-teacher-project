import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

/**
 * A right-side panel over the current view. Escape or the backdrop closes it.
 * @param props.title - Heading
 * @param props.subtitle - Line under the heading
 * @param props.onClose - Close handler
 */
export function Drawer({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
      <div className="animate-fade-in absolute inset-0 bg-[#02050b]/60 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="glass animate-drawer-in relative flex h-full w-full max-w-[56rem] flex-col border-l bg-card-solid/95 shadow-[-30px_0_60px_-20px_rgba(0,0,0,0.7)]">
        <header className="flex items-start justify-between gap-3 border-b px-5 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{title}</h2>
            {subtitle && <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-accent" aria-label="Close">
            <X className="size-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </div>
  );
}

/**
 * A titled section inside a drawer.
 * @param props.title - Section heading
 */
export function DrawerSection({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  );
}
