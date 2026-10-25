import { Home, Settings2 } from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useCompanionLines } from "@/components/companion/companion-provider.tsx";
import { ComposeFlow } from "@/components/make-course/compose-flow.tsx";
import { FlowSteps } from "@/components/make-course/flow.tsx";
import { requestAction } from "@/components/make-course/request-api.ts";
import { ShellActions, ShellTitle } from "@/components/shell/app-shell.tsx";
import { useTeachingProfile } from "@/components/teaching-profile-provider.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ChatThread, NibblesLine } from "@/components/ui/chat-thread.tsx";
import { PageLoader } from "@/components/ui/loader.tsx";
import { OptionTiles } from "@/components/ui/option-tiles.tsx";
import { ErrorState } from "@/components/ui/states.tsx";

const LINES = ["Pick anything. I'll handle the rest.", "A few taps and I'll make the plan.", "You can change the plan before I write it.", "No rush."];

/**
 * New course: the topic (typed), then the goal (tapped). Saving opens the Request, where the Validity check starts by
 * itself. Waits for "How you like to learn" first. `?subject=` prefills the topic (Start again from a failed Course).
 */
export function NewCourseRequestPage() {
  const { loading, present, error, refresh } = useTeachingProfile();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [topic, setTopic] = useState<string | null>(null);
  useCompanionLines(LINES);

  if (loading) return <PageLoader />;
  if (error) {
    return (
      <div className="mk-page">
        <ErrorState actions={<Button onClick={() => void refresh()}>Try again</Button>}>
          I couldn't check how you like to learn, so I can't start a course yet.
        </ErrorState>
      </div>
    );
  }

  if (!present) {
    return (
      <div className="mk-page">
        <ChatThread>
          <NibblesLine>First, a few quick choices about how I teach you. It takes about a minute, and then we can make your course.</NibblesLine>
          <OptionTiles
            label="Before your first course"
            options={[
              { id: "setup", label: "Set it up", description: "7 quick questions", icon: <Settings2 />, tone: "primary" },
              { id: "home", label: "Back to Home", description: "Come back anytime", icon: <Home />, tone: "quiet" },
            ]}
            onPick={(option) => navigate(option.id === "setup" ? "/teaching-profile" : "/")}
          />
        </ChatThread>
      </div>
    );
  }

  /** Saves the Request and opens it; its Validity check starts there. */
  async function compose(subject: string, learningGoal: string) {
    const { courseRequest } = await requestAction("", "POST", { subject, learningGoal }, "Could not save your course. Please try again.");
    navigate(`/course-requests/${courseRequest.id}`);
  }

  return (
    <div className="mk-page">
      {topic ? <ShellTitle>{topic}</ShellTitle> : null}
      <ShellActions><FlowSteps current={topic ? 1 : 0} /></ShellActions>
      <ChatThread>
        <ComposeFlow initialSubject={params.get("subject") ?? undefined} onCompose={compose} onTopic={setTopic} />
      </ChatThread>
    </div>
  );
}
