import { ShellTitle } from "@/components/shell/app-shell.tsx";

/**
 * Component reference page (SEN-86). Placeholder: the full page showing every
 * component in every state is still to be built (see docs/handoff/redesign-handoff.md).
 */
export function ComponentsPage() {
  return (
    <div className="mx-auto max-w-3xl p-8">
      <ShellTitle>Components</ShellTitle>
      <h1 className="text-2xl font-bold">Component reference</h1>
      <p className="mt-2 text-muted-foreground">Not built yet. Tracked in SEN-86.</p>
    </div>
  );
}
