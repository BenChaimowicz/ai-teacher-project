import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useCompanionLines } from "@/components/companion/companion-provider.tsx";
import { FlowSteps, MAKE_STEPS } from "@/components/make-course/flow.tsx";
import { LEVEL_STATUSES, LevelStage } from "@/components/make-course/level-stage.tsx";
import { PLAN_STATUSES, PlanStage } from "@/components/make-course/plan-stage.tsx";
import { errorText, onRequestChange } from "@/components/make-course/request-api.ts";
import { RequestHistory, VALIDITY_STATUSES, ValidityStage } from "@/components/make-course/validity-stage.tsx";
import { ShellActions, ShellTitle } from "@/components/shell/app-shell.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ChatThread } from "@/components/ui/chat-thread.tsx";
import { PageLoader } from "@/components/ui/loader.tsx";
import { ErrorState } from "@/components/ui/states.tsx";
import { requestJson } from "@/lib/api.ts";
import type { CourseRequestRecord } from "@/lib/course-request-types.ts";

const LINES = {
  goal: ["A few taps and I'll make the plan.", "You can change the plan before I write it.", "No rush."],
  level: ["Just checking where to start.", "“I don't know” is always a fine answer.", "No grades here."],
  plan: ["Here's what I'd do. Your call.", "Untick anything you'd rather skip.", "Nothing is written until you say so."],
  making: ["Writing. You can leave; I'll keep going.", "Each lesson is checked before the next.", "It'll be on Home when it's ready."],
  stopped: ["Nothing's lost.", "Pick it up again anytime."],
  done: ["All done. Lesson 1 is ready when you are.", "Enjoy it."],
};

/**
 * Which top-bar step a status is on: Topic, Goal, Level, Plan, Making; past the end once published.
 * @param status - Request status
 */
function stepOf(status: string) {
  if (status === "draft") return 0;
  if (VALIDITY_STATUSES.has(status)) return 1;
  if (LEVEL_STATUSES.has(status)) return 2;
  if (status === "starting_level_confirmed" || status.startsWith("blueprint_")) return 3;
  if (status === "published") return MAKE_STEPS.length;
  return 4;
}

/** The companion's sidebar lines for a status. */
function linesOf(status: string) {
  const step = stepOf(status);
  if (status === "published") return LINES.done;
  if (status === "generation_cancelled" || status === "generation_failed" || status === "rejected") return LINES.stopped;
  return [LINES.goal, LINES.goal, LINES.level, LINES.plan, LINES.making][step] ?? LINES.goal;
}

/**
 * One saved Course Request, at whatever status it is in (spec §3: one screen for every unpublished status). The thread
 * replays what was asked and answered, then the current step with its options right under the latest line. Opening it
 * never runs a step by itself unless that step is a server step the Learner doesn't trigger.
 */
export function CourseRequestPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const [record, setRecord] = useState<CourseRequestRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setRecord(null);
    setError(null);
    requestJson<{ courseRequest: CourseRequestRecord }>(`/api/course-requests/${requestId}`, "GET", undefined, "Could not load this course.")
      .then((body) => { if (!cancelled) setRecord(body.courseRequest); })
      .catch((caught: unknown) => { if (!cancelled) setError(errorText(caught, "Could not load this course.")); });
    return () => { cancelled = true; };
  }, [requestId, retry]);

  useEffect(() => onRequestChange((next) => {
    if (next.id === requestId) setRecord(next);
  }), [requestId]);

  useCompanionLines(linesOf(record?.status ?? "draft"));

  if (error && !record) {
    return (
      <div className="mk-page">
        <ErrorState actions={<Button onClick={() => setRetry((n) => n + 1)}><RefreshCw /> Try again</Button>}>
          {error}
        </ErrorState>
      </div>
    );
  }
  if (!record) return <PageLoader label="Opening your course…" />;

  return (
    <div className="mk-page">
      <ShellTitle>{record.status === "draft" ? "New course" : record.subject}</ShellTitle>
      <ShellActions><FlowSteps current={stepOf(record.status)} /></ShellActions>
      <ChatThread key={record.id}>
        <RequestHistory record={record} />
        {VALIDITY_STATUSES.has(record.status) ? <ValidityStage record={record} /> : null}
        {!VALIDITY_STATUSES.has(record.status) ? <LevelStage record={record} /> : null}
        {PLAN_STATUSES.has(record.status) ? <PlanStage record={record} /> : null}
      </ChatThread>
    </div>
  );
}
