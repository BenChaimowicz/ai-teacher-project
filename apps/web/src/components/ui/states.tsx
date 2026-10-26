import type { ReactNode } from "react";
import { Jongi } from "@/components/companion/jongi.tsx";
import { cn } from "@/lib/utils";

type StateProps = {
  title: string;
  children?: ReactNode;
  /** Buttons or links. */
  actions?: ReactNode;
  className?: string;
};

/**
 * Nothing here yet. The companion says it kindly, with one clear next step.
 */
export function EmptyState({ title, children, actions, className }: StateProps) {
  return (
    <div className={cn("k-state", className)}>
      <Jongi size={64} className="art" track tile />
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {actions ? <div className="mt-2 flex flex-wrap justify-center gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * Something failed. Plain words, what happens next, and a retry when there is one.
 */
export function ErrorState({ title = "That didn't load", children, actions, className }: Partial<StateProps>) {
  return (
    <div className={cn("k-state error", className)} role="alert">
      <Jongi size={64} mood="think" className="art" tile />
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {actions ? <div className="mt-2 flex flex-wrap justify-center gap-2">{actions}</div> : null}
    </div>
  );
}
