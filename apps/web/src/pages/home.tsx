import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CourseRequestControl } from "@/components/course-request-control.tsx";

type LibraryItem = {
  id: string;
  kind: "course" | "course_request";
  title: string;
  status: string;
  href: string | null;
};

/**
 * One Library card. Published Courses open Study; Course Requests stay inert.
 * @param item - Library row from `/api/library`
 */
function LibraryCard({ item }: { item: LibraryItem }) {
  const inner = (
    <>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.status}</p>
      <p className="mt-1 font-medium">{item.title}</p>
    </>
  );

  if (item.href) {
    return (
      <li>
        <Link
          to={item.href}
          className="block rounded-xl border border-border bg-card p-4 hover:bg-accent"
        >
          {inner}
        </Link>
      </li>
    );
  }

  return <li className="rounded-xl border border-border bg-card p-4">{inner}</li>;
}

/**
 * Home Library. An empty query shows the empty-state copy.
 */
export function HomePage() {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/library")
      .then((response) => {
        if (!response.ok) throw new Error("Could not load the Library");
        return response.json() as Promise<{ items: LibraryItem[] }>;
      })
      .then((body) => {
        if (!cancelled) setItems(body.items);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load the Library");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm text-muted-foreground">Home</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Library</h1>
      <p className="mt-2 text-muted-foreground">Published Courses and unpublished Course Requests live here.</p>

      {error ? <p className="mt-10 text-sm text-red-400">{error}</p> : null}

      {!error && items === null ? <p className="mt-10 text-sm text-muted-foreground">Loading…</p> : null}

      {items && items.length === 0 ? (
        <div className="mt-10 rounded-xl border border-border bg-card p-8">
          <h2 className="text-lg font-medium">No courses yet</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            When you request a Course, it will show up here — including ones still in progress or rejected.
          </p>
          <div className="mt-6">
            <CourseRequestControl variant="button">New Course Request</CourseRequestControl>
          </div>
        </div>
      ) : null}

      {items && items.length > 0 ? (
        <ul className="mt-8 grid gap-3">
          {items.map((item) => (
            <LibraryCard key={`${item.kind}-${item.id}`} item={item} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
