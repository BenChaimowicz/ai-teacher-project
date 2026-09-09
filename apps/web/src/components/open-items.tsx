import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

type OpenItem = {
  id: string;
  kind: "course" | "course_request";
  title: string;
  status: string;
  href: string | null;
};

/**
 * Sidebar group for in-progress Course Requests and published Courses.
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
        ? items.map((item) =>
            item.href ? (
              <Link
                key={`${item.kind}-${item.id}`}
                to={item.href}
                className="mt-2 block truncate text-sm text-foreground hover:text-primary"
              >
                {item.title}
              </Link>
            ) : (
              <p key={`${item.kind}-${item.id}`} className="mt-2 truncate text-sm text-foreground">
                {item.title}
              </p>
            ),
          )
        : null}
    </div>
  );
}
