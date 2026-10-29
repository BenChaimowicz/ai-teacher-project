import { ArrowRight } from "lucide-react";
import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { Button } from "@/components/ui/button.tsx";
import { LearnerEcho, CompanionLine } from "@/components/ui/chat-thread.tsx";
import { CourseIcon } from "@/components/ui/course-icon.tsx";
import { Input } from "@/components/ui/input.tsx";
import { ThreadEnd, WorkingLine, useAutoStep } from "@/components/make-course/flow.tsx";
import { cheer } from "@/lib/cheer.ts";
import type { CourseIconName } from "@/lib/brand-marks.ts";

/** Topics to try when the field is empty. */
const SUGGESTIONS: [string, CourseIconName][] = [
  ["Norse mythology", "norse"],
  ["Reading sheet music", "music"],
  ["How sourdough works", "sourdough"],
  ["Basics of investing", "investing"],
];

type TopicFieldProps = {
  initial?: string;
  onSubmit: (subject: string) => void;
};

/** Longest topic or goal the field takes. */
const MAX_TOPIC_LENGTH = 300;

/**
 * The topic field: where the Learner says what to learn, as a topic or as what they want to be able to do (spec §3),
 * with a few topics to try.
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
          maxLength={MAX_TOPIC_LENGTH}
          placeholder="A topic, or what you want to be able to do"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <Button type="submit" className="folded" disabled={!trimmed}>
          Continue
          <ArrowRight aria-hidden="true" />
        </Button>
      </form>
      {!initial ? (
        <>
          <p className="mk-sugg-h" id="topic-sugg">or try one of these</p>
          <div className="mk-sugg" role="group" aria-labelledby="topic-sugg">
            {SUGGESTIONS.map(([topic, icon], index) => (
              <button key={topic} type="button" className="mk-chip k-gift" style={{ "--i": index } as CSSProperties} onClick={() => onSubmit(topic)}>
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
  /** A topic already chosen elsewhere (Home's first-run field, "Go deeper"): saved straight away. */
  presetTopic?: string;
  /** Saves the Request; throws with plain-language copy on failure. */
  onCompose: (subject: string, learningGoal: string) => Promise<void>;
  /** Called with the topic once it is set, e.g. for the top bar title and steps. */
  onTopic?: (subject: string | null) => void;
};

/**
 * Compose: what to learn, typed once. The text is both the subject and the Learning Goal as typed; Goal focusing asks
 * what part and how deep, with options built from the subject, so there is no generic goal question here (SEN-90).
 * Saving the Request is the next step's job; the Validity check then starts by itself.
 */
export function ComposeFlow({ initialSubject, presetTopic, onCompose, onTopic }: ComposeFlowProps) {
  const preset = presetTopic?.trim() ? presetTopic.trim().slice(0, MAX_TOPIC_LENGTH) : null;
  const [subject, setSubject] = useState<string | null>(preset);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Saves the Request with the typed text as subject and goal. */
  async function save(topic: string) {
    setSaving(true);
    setError(null);
    try {
      await onCompose(topic, topic);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Could not save your course. Please try again.");
      setSaving(false);
    }
  }

  function pickTopic(topic: string) {
    setSubject(topic);
    onTopic?.(topic);
    window.setTimeout(() => cheer(document.querySelector(".mk-topic-echo .k-msg"), "topic set"), 30);
    void save(topic);
  }

  useEffect(() => {
    if (preset) onTopic?.(preset);
    // Only the topic the screen opened with.
  }, []);
  // A topic chosen elsewhere was already typed or picked there; save it once.
  useAutoStep(preset ? `compose:${preset}` : null, () => save(preset!));

  return (
    <>
      <CompanionLine>{initialSubject ? "Sure. What would you like to learn this time?" : "Hi. What would you like to learn?"}</CompanionLine>
      {subject === null ? (
        <TopicField initial={initialSubject} onSubmit={pickTopic} />
      ) : (
        <>
          <div className="mk-topic-echo"><LearnerEcho>{subject}</LearnerEcho></div>
          {saving ? <CompanionLine mood="think"><WorkingLine>Saving it…</WorkingLine></CompanionLine> : null}
          {error ? (
            <>
              <CompanionLine mood="think"><span role="alert">{error}</span></CompanionLine>
              <div className="mk-back">
                <Button size="sm" onClick={() => void save(subject)}>Try again</Button>
                <Button variant="link" size="sm" onClick={() => { setSubject(null); setError(null); onTopic?.(null); }}>
                  Change the topic
                </Button>
              </div>
            </>
          ) : null}
        </>
      )}
      <ThreadEnd watch={`${subject}|${saving}|${error}`} />
    </>
  );
}
