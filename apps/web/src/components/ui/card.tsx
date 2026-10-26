import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type CardProps = ComponentProps<"div"> & {
  /** flat: plain panel without the accent gradient. interactive: hover lift. */
  tone?: "accent" | "flat";
  interactive?: boolean;
};

/**
 * Panel surface. Default has the soft accent gradient used across the redesign.
 */
export function Card({ tone = "accent", interactive = false, className, ...props }: CardProps) {
  return <div className={cn("k-card", tone === "flat" && "flat", interactive && "interactive", className)} {...props} />;
}
