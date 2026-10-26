import { useState, type ReactNode } from "react";
import type { PublicQuizItem } from "@senoy/db/quiz";
import { Play, Plus } from "lucide-react";
import { CountUp } from "@/components/learn/count-up.tsx";
import { CourseOutline } from "@/components/learn/course-outline.tsx";
import { FinishLine } from "@/components/learn/finish-line.tsx";
import { LinkTiles } from "@/components/learn/link-tiles.tsx";
import { QuestionCard, ScoreCard } from "@/components/learn/quiz-view.tsx";
import { ReadingPanel } from "@/components/learn/reading-panel.tsx";
import { ReadingView } from "@/components/learn/reading-view.tsx";
import { StudyChromeProvider } from "@/components/learn/study-chrome.tsx";
import { Button } from "@/components/ui/button.tsx";
import { COMPANION_NAME } from "@/lib/brand-marks.ts";
import type { StudyLesson, StudyPayload } from "@/lib/study-types.ts";
import "@/components/learn/learn.css";

/* Sample data only; nothing here calls the API. */
const lesson = (id: string, title: string, method: "reading" | "quiz", completed: boolean, locked = false): StudyLesson => ({
  id, title, teachingMethod: method, position: 0, lessonGoal: "", completed, locked, body: null, citations: [],
});

const PAYLOAD: StudyPayload = {
  course: { id: "demo", title: "Norse mythology", sequenceMode: "linear", completedAt: null },
  progress: { completed: 2, total: 5 },
  currentLessonId: "l3",
  modules: [
    {
      id: "m1", title: "Gods and worlds", position: 0,
      lessons: [
        lesson("l1", "Gods, giants and the nine worlds", "reading", true),
        lesson("l2", "Quick check", "quiz", true),
        lesson("l3", "Where the myths come from", "reading", false),
        lesson("l4", "Quick check", "quiz", false),
        lesson("l5", "Loki and the death of Baldr", "reading", false, true),
      ],
    },
  ],
};

const ITEM: PublicQuizItem = {
  id: "demo-q",
  prompt: "Who wrote the Prose Edda?",
  options: [
    { id: "a", text: "Snorri Sturluson" },
    { id: "b", text: "Odin" },
    { id: "c", text: "An unknown Viking poet" },
    { id: "d", text: "A Roman historian" },
  ],
} as PublicQuizItem;
const KEY = { itemId: "demo-q", correctOptionId: "a", explanation: "Snorri wrote it around 1220, as a handbook for young poets." };

/** One titled block, matching the reference page's sections. */
function Block({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mb-12" aria-labelledby={`learn-${title}`}>
      <h2 id={`learn-${title}`} className="k-sec-h">
        {title}
      </h2>
      {note ? <p className="mb-4 px-1 text-sm text-muted-foreground">{note}</p> : null}
      <div className="px-1">{children}</div>
    </section>
  );
}

/**
 * The `components/learn/` pieces (SEN-88) for the `/dev/components` reference page, with sample data.
 */
export function LearnShowcase() {
  const [completed, setCompleted] = useState(false);
  return (
    <StudyChromeProvider learnerKey="dev-components">
      <p className="mb-6 px-1 text-sm text-muted-foreground">
        <b className="text-foreground">components/learn/</b> · the learning screens (Home, Study, Course complete). Sample data; no API calls.
      </p>

      <Block title="link tiles · finish line" note="Tiles that navigate. FinishLine is the restyled SEN-84 Next Lesson / Finish Course.">
        <LinkTiles
          flush
          cols={3}
          label="Sample tiles"
          tiles={[
            { to: "#", label: "Continue", description: "Where the myths come from", icon: <Play />, tone: "primary" },
            { to: "#", label: "Start something new", description: `Tell ${COMPANION_NAME} a topic`, icon: <Plus /> },
            { to: "#", label: "Not now", description: "Quiet tone", tone: "quiet" },
          ]}
        />
        <FinishLine courseId="demo" next={PAYLOAD.modules[0]!.lessons[3]!} courseComplete={false} />
      </Block>

      <Block title="count-up" note="Real numbers count up; screen readers get the final value.">
        <p className="k-mono text-3xl font-bold">
          <CountUp to={42} /> · <CountUp to={90} format={(n) => `${n}%`} />
        </p>
      </Block>

      <Block title="course outline" note="The Course page in the Study sidebar (ShellOutline). Built from the payload in order, so a changed path just re-renders.">
        <div className="max-w-[300px] rounded-2xl border border-[var(--line)] bg-[var(--bg-2)] p-3">
          <CourseOutline payload={PAYLOAD} activeLessonId="l3" sections={["The Poetic Edda", "The Prose Edda", "Why this matters"]} sectionsRead={[true, false, false]} />
        </div>
      </Block>

      <Block title="reading panel · reading view" note="Aa opens modes, fine controls, page colour and Help me pick. Settings saved under a separate key here.">
        <div className="mb-4 flex justify-end">
          <ReadingPanel />
        </div>
        <div className="rounded-2xl border border-[var(--line)]">
          <ReadingView
            lessonId="demo-reading"
            title="Where the myths come from"
            lessonGoal="what the Eddas are, who wrote them down, and why that matters."
            lessonNumber={3}
            completed={completed}
            paused={false}
            onComplete={async () => setCompleted(true)}
            finish={<Button variant="ghost" onClick={() => setCompleted(false)}>Reset sample</Button>}
            citations={[{ n: 1, title: "Prose Edda, Wikipedia", url: "https://en.wikipedia.org/wiki/Prose_Edda" }]}
            body={{
              sections: [
                {
                  heading: "The Prose Edda",
                  blocks: [
                    { kind: "prose", text: "Around 1220, Snorri Sturluson wrote the Prose Edda, a handbook for young poets.[1] He retold the myths in plain prose." },
                    { kind: "prose", text: "In doing so he gave us the most complete version of Norse mythology we have. Hover the small number to see its source." },
                  ],
                },
              ],
            }}
          />
        </div>
      </Block>

      <Block title="quiz question · score" note="Unanswered; right (glows); wrong (shakes, the right answer lights up with why). Then the score card.">
        <div className="grid gap-2 [&_.l-qcard]:ml-0 [&_.l-score]:ml-0">
          <QuestionCard item={ITEM} index={0} total={3} streak={0} results={[undefined]} chosen={undefined} locked={false} canCheck={false} result={undefined} revealed={undefined} busy={false} onAnswer={() => undefined} onCheck={() => undefined} />
          <QuestionCard item={{ ...ITEM, id: "demo-q2" }} index={1} total={3} streak={0} results={[true, true]} chosen="a" locked canCheck={false} result revealed={{ ...KEY, itemId: "demo-q2" }} busy={false} onAnswer={() => undefined} onCheck={() => undefined} />
          <QuestionCard item={{ ...ITEM, id: "demo-q3" }} index={2} total={3} streak={2} results={[true, true, false]} chosen="b" locked canCheck={false} result={false} revealed={{ ...KEY, itemId: "demo-q3" }} busy={false} onAnswer={() => undefined} onCheck={() => undefined} />
          <ScoreCard score={{ correct: 4, total: 5 }} passed results={[true, true, true, false, true]} busy={false} onRetake={() => undefined} celebrate={false} />
          <ScoreCard score={{ correct: 2, total: 5 }} passed={false} results={[true, false, true, false, false]} busy={false} onRetake={() => undefined} celebrate={false} />
        </div>
      </Block>
    </StudyChromeProvider>
  );
}
