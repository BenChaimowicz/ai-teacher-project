import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type ChoiceCardProps = {
  name: string;
  type: "radio" | "checkbox";
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
  hint?: string;
};

/**
 * One selectable row in the questionnaire.
 */
export function ChoiceCard({ name, type, checked, onChange, children, hint }: ChoiceCardProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm",
        checked ? "border-ring bg-accent" : "border-border hover:bg-accent/50",
      )}
    >
      <input
        type={type}
        name={name}
        checked={checked}
        onChange={onChange}
        className="mt-0.5"
      />
      <span>
        <span className="block">{children}</span>
        {hint ? <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  );
}
