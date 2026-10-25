import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/*
 * Kit button (styles in src/styles/kit.css, `.k-btn`).
 * `default`, `outline`, `destructive` are kept as aliases so older screens keep compiling.
 */
const buttonVariants = cva("k-btn", {
  variants: {
    variant: {
      primary: "primary",
      default: "primary",
      secondary: "secondary",
      ghost: "ghost",
      outline: "ghost",
      quiet: "quiet",
      destructive: "danger",
      danger: "danger",
      link: "link",
    },
    size: {
      default: "",
      sm: "sm",
      lg: "lg",
      icon: "icon",
    },
  },
  defaultVariants: {
    variant: "primary",
    size: "default",
  },
});

type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

/**
 * Button. Use `asChild` to render a Link with button styles.
 * Variants: primary (default), secondary, ghost, quiet, danger, link. Sizes: default, sm, lg, icon.
 */
function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
