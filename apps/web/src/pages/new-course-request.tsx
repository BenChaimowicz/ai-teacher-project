import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button.tsx";
import { useTeachingProfile } from "@/components/teaching-profile-provider.tsx";
import { COURSE_REQUEST_BLOCKED } from "@/lib/teaching-profile-copy.ts";

/**
 * Compose a Course Request. Blocked until the Teaching Profile is saved.
 */
export function NewCourseRequestPage() {
  const { loading, present } = useTeachingProfile();

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-sm text-muted-foreground">New Course Request</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">New Course Request</h1>
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!present) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-sm text-muted-foreground">New Course Request</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">New Course Request</h1>
        <p className="mt-4 max-w-lg text-muted-foreground">{COURSE_REQUEST_BLOCKED}</p>
        <Button asChild className="mt-6">
          <Link to="/teaching-profile">Go to Teaching Profile</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm text-muted-foreground">New Course Request</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">New Course Request</h1>
      <p className="mt-4 max-w-lg text-muted-foreground">
        Not set up yet. This is where a Learner will choose a subject and Learning Goal.
      </p>
    </div>
  );
}
