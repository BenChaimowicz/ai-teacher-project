import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type InputProps = ComponentProps<"input"> & {
  /** Rendered inside the field on the right, e.g. a submit Button. */
  trailing?: ReactNode;
  invalid?: boolean;
  fieldClassName?: string;
};

/**
 * Text input in the kit's rounded field. Pair with a visible <label> or aria-label.
 */
export function Input({ trailing, invalid = false, className, fieldClassName, ...props }: InputProps) {
  return (
    <div className={cn("k-field", fieldClassName)} data-invalid={invalid || undefined}>
      <input className={className} aria-invalid={invalid || undefined} {...props} />
      {trailing}
    </div>
  );
}

/**
 * Multi-line variant of Input.
 */
export function Textarea({ invalid = false, className, fieldClassName, ...props }: ComponentProps<"textarea"> & { invalid?: boolean; fieldClassName?: string }) {
  return (
    <div className={cn("k-field items-start", fieldClassName)} data-invalid={invalid || undefined}>
      <textarea className={cn("min-h-24 resize-y", className)} aria-invalid={invalid || undefined} {...props} />
    </div>
  );
}
