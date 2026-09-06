import { useEffect, useState } from "react";

type OpenItem = { id: string; title: string; status: string };

/**
 * Sidebar group for in-progress items. Empty until Course Requests exist.
 */
export function OpenItems() {
  const [items, setItems] = useState<OpenItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/open-items")
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load Open items");
        return response.json() as Promise<{ items: OpenItem[] }>;
      })
      .then((body) => {
        if (!cancelled) setItems(body.items);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mt-6 px-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Open items</p>
      {items && items.length > 0
        ? items.map((item) => (
            <p key={item.id} className="mt-2 truncate text-sm text-foreground">
              {item.title}
            </p>
          ))
        : null}
    </div>
  );
}
