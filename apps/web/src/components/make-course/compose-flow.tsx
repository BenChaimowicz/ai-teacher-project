import { BookOpen, Layers, MessageCircle, Wrench } from "lucide-react";
import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { Button } from "@/components/ui/button.tsx";
import { LearnerEcho, CompanionLine } from "@/components/ui/chat-thread.tsx";
import { CourseIcon } from "@/components/ui/course-icon.tsx";
import { Input } from "@/components/ui/input.tsx";
import { OptionTiles, type OptionTile } from "@/components/ui/option-tiles.tsx";
import { ThreadEnd, WorkingLine } from "@/components/make-course/flow.tsx";
import { cheer } from "@/lib/cheer.ts";
import type { CourseIconName } from "@/lib/brand-marks.ts";

/** Topics to try when the field is empty. */
const SUGGESTIONS: [string, CourseIconName][] = [
  ["Norse mythology", "norse"],
  ["Reading sheet music", "music"],
  ["How sourdough works", "sourdough"],
  ["Basics of investing", "investing"],
];

/**
 * What the Learner can want from a Course. The pick becomes the Learning Goal, worded around the topic, so the topic
 * stays the only free text (spec §3).
 * @param subject - The topic as typed
 */
export function goalOptions(subject: string): OptionTile<string>[] {
  return [
    { id: "big-picture", label: "Get the big picture", description: "The main ideas, and how they fit together", icon: <BookOpen />,
      value: `Understand the main ideas of ${subject} and how they fit together.` },
    { id: "explain", label: "Be able to explain it", description: "Well enough to tell someone else", icon: <MessageCircle />,
      value: `Explain the key ideas of ${subject} clearly to someone else.` },
    { id: "use", label: "Use it in practice", description: "Apply it to real situations", icon: <Wrench />,
      value: `Apply ${subject} in practical, real situations.` },
    { id: "deep", label: "Go deep", description: "Detail, nuance and where it comes from", icon: <Layers />,
      value: `Understand ${subject} in depth, including the details, debates and sources behind it.` },
  ];
}

type TopicFieldProps = {
  initial?: string;
  onSubmit: (subject: string) => void;
};

/**
 * The topic field: the only place the Learner types (spec §3), with a few topics to try.
 */
export function TopicField({ initial = "", onSubmit }: TopicFieldProps) {
  const [value, setValue] = useState(initial);
  const trimmed = value.trim();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (trimmed) onSubmit(trimmed);
  }

  return (
    <div className="mk-topic">
      <form onSubmit={submit}>
        <label htmlFor="topic" className="sr-only">What would you like to learn?</label>
        <Input
          id="topic"
          name="subject"
          autoComplete="off"
          autoFocus
          maxLength={200}
          placeholder="A topic, a skill, anything you're curious about"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <Button type="submit" disabled={!trimmed}>Continue</Button>
      </form>
      {!initial ? (
        <>
          <p className="mk-sugg-h" id="topic-sugg">or try one of these</p>
          <div className="mk-sugg" role="group" aria-labelledby="topic-sugg">
            {SUGGESTIONS.map(([topic, icon], index) => (
              <button key={topic} type="button" className="mk-chip" style={{ "--i": index } as CSSProperties} onClick={() => onSubmit(topic)}>
                <CourseIcon name={icon} size={14} />
                {topic}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

type ComposeFlowProps = {
  /** Prefills the topic (Revise request reopens the field with it). */
  initialSubject?: string;
  /** A topic already chosen elsewhere (Home's first-run field, "Go deeper"): skip straight to the goal. */
  presetTopic?: string;
  /** Saves the Request; throws with plain-language copy on failure. */
  onCompose: (subject: string, learningGoal: string) => Promise<void>;
  /** Called with the topic once it is set, e.g. for the top bar title and steps. */
  onTopic?: (subject: string | null) => void;
};

/**
 * Compose: what to learn (typed), then what to get out of it (tapped). Saving the Request is the next step's job;
 * the Validity check then starts by itself.
 */
export function ComposeFlow({ initialSubject, presetTopic, onCompose, onTopic }: ComposeFlowProps) {
  const preset = presetTopic?.trim() ? presetTopic.trim().slice(0, 200) : null;
  const [subject, setSubject] = useState<string | null>(preset);
  useEffect(() => {
    if (preset) onTopic?.(preset);
    // Only the topic the screen opened with.
  }, []);
  const [goal, setGoal] = useState<OptionTile<string> | null>(null);
  const [goalShown, setGoalShown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  function pickTopic(topic: string) {
    setSubject(topic);
    setGoalShown(false);
    onTopic?.(topic);
    window.setTimeout(() => cheer(document.querySelector(".mk-topic-echo .k-msg"), "topic set"), 30);
  }

  async function pickGoal(option: OptionTile<string>) {
    if (!subject || !option.value) return;
    setGoal(option);
    setSaving(true);
    setError(null);
    try {
      await onCompose(subject, option.value);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Could not save your course. Please try again.");
      setSaving(false);
      setAttempt((n) => n + 1);
    }
  }

  return (
    <>
      <CompanionLine>{initialSubject ? "Sure. What would you like to learn this time?" : "Hi. What would you like to learn?"}</CompanionLine>
      {subject === null ? (
        <TopicField initial={initialSubject} onSubmit={pickTopic} />
      ) : (
        <>
          <div className="mk-topic-echo"><LearnerEcho>{subject}</LearnerEcho></div>
          <CompanionLine typing key={subject} onShown={() => setGoalShown(true)}>
            Good choice. What would you like to get out of it?
          </CompanionLine>
          {goalShown ? (
            <>
              <OptionTiles
                label="What would you like to get out of it?"
                options={goalOptions(subject)}
                resetKey={attempt}
                onPick={(option) => pickGoal(option)}
              />
              {!goal || error ? (
                <div className="mk-back">
                  <Button variant="link" size="sm" onClick={() => { setSubject(null); setGoal(null); onTopic?.(null); }}>
                    Change the topic
                  </Button>
                </div>
              ) : null}
            </>
          ) : null}
          {goal && !error ? <LearnerEcho>{goal.label}</LearnerEcho> : null}
          {saving ? <CompanionLine mood="think"><WorkingLine>Saving it…</WorkingLine></CompanionLine> : null}
          {error ? <CompanionLine mood="think"><span role="alert">{error}</span> <span className="mk-faint">Pick again to retry.</span></CompanionLine> : null}
        </>
      )}
      <ThreadEnd watch={`${subject}|${goalShown}|${goal?.id}|${saving}|${error}`} />
    </>
  );
}
