import { BookOpen, Compass, Footprints, Rocket, Shuffle } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { useCompanion } from "@/components/companion/companion-provider.tsx";
import { LearnShowcase } from "@/components/learn/learn-showcase.tsx";
import { ShellTitle } from "@/components/shell/app-shell.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { ChatThread, LearnerEcho, CompanionLine, ThreadCard } from "@/components/ui/chat-thread.tsx";
import { CourseCard } from "@/components/ui/course-card.tsx";
import { CourseIcon } from "@/components/ui/course-icon.tsx";
import { CourseRow } from "@/components/ui/course-row.tsx";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog.tsx";
import { Input, Textarea } from "@/components/ui/input.tsx";
import { Loader } from "@/components/ui/loader.tsx";
import { Logo } from "@/components/ui/logo.tsx";
import { Jongi, type JongiHandle, type JongiMood } from "@/components/companion/jongi.tsx";
import { OptionTiles, type OptionTile } from "@/components/ui/option-tiles.tsx";
import { ProgressBar, ProgressRing, SegmentedProgress } from "@/components/ui/progress.tsx";
import { EmptyState, ErrorState } from "@/components/ui/states.tsx";
import { useToast } from "@/components/ui/toast.tsx";
import { COURSE_ICON_PATHS, type CourseIconName } from "@/lib/brand-marks.ts";
import { cheer, confettiAt } from "@/lib/cheer.ts";
import type { CourseListItem } from "@/lib/course-list.ts";

/* Sample courses, one per status, for the row and card sections. */
const SAMPLE_COURSES: CourseListItem[] = [
  { key: "c1", id: "c1", kind: "course", title: "Norse mythology", href: null, status: "learning", badge: "2/6", icon: "norse", progress: { completed: 2, total: 6 } },
  { key: "c2", id: "c2", kind: "course_request", title: "Sourdough from scratch", href: null, status: "making", badge: "writing", icon: "sourdough" },
  { key: "c3", id: "c3", kind: "course_request", title: "The square knot", href: null, status: "needs", badge: "your turn", icon: "knot" },
  { key: "c4", id: "c4", kind: "course", title: "Greek tragedy", href: null, status: "done", badge: "✓ done", icon: "greek", progress: { completed: 5, total: 5 } },
  { key: "c5", id: "c5", kind: "course_request", title: "Index funds", href: null, status: "stopped", badge: "stopped", icon: "investing" },
];

const PACE_OPTIONS: OptionTile[] = [
  { id: "step", label: "Step by step", description: "Lessons unlock in order", icon: <Footprints />, tone: "primary" },
  { id: "jump", label: "Jump around", description: "Open any lesson", icon: <Shuffle /> },
  { id: "unsure", label: "Not sure", description: "I'll pick for you", unsure: true },
];

const QUIZ_OPTIONS: OptionTile[] = [
  { id: "odin", label: "Odin" },
  { id: "thor", label: "Thor" },
  { id: "loki", label: "Loki" },
  { id: "frigg", label: "Frigg" },
];

const THREE_COL: OptionTile[] = [
  { id: "read", label: "Read", icon: <BookOpen /> },
  { id: "explore", label: "Explore", icon: <Compass /> },
  { id: "go", label: "Start now", icon: <Rocket />, tone: "primary" },
  { id: "later", label: "Not now", tone: "quiet" },
  { id: "off", label: "Unavailable", disabled: true },
  { id: "skip", label: "Skip", tone: "quiet" },
];

/**
 * One titled block on the reference page.
 * @param title - Section name (mono, small)
 * @param note - What the section shows, or how to use it
 */
function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mb-12" aria-labelledby={`sec-${title}`}>
      <h2 id={`sec-${title}`} className="k-sec-h">
        {title}
      </h2>
      {note ? <p className="mb-4 px-1 text-sm text-muted-foreground">{note}</p> : null}
      <div className="px-1">{children}</div>
    </section>
  );
}

/** A labelled cell in a row of variants. */
function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <span className="k-mono text-[0.68rem] text-[var(--faint)]">{label}</span>
      {children}
    </div>
  );
}

const JONGI_MOODS: { mood: JongiMood; label: string; note: string }[] = [
  { mood: "idle", label: "Idle", note: "Breathes, blinks, ear-flicks." },
  { mood: "think", label: "Thinking", note: "Paw to chin. Eyes up." },
  { mood: "cheer", label: "Win", note: "A one-shot hop, then idle." },
  { mood: "rest", label: "Resting", note: "Cap slips. Back soon." },
];

/** Jongi in every mood and framing, with a button that replays the Win. */
function JongiSection() {
  const wins = useRef<(JongiHandle | null)[]>([]);
  return (
    <Section title="jongi" note="The companion. Scene tiles at 168, the sidebar card's tile at 56, chat avatars at 32 and 24. Pointer look-at on the first row.">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {JONGI_MOODS.map((m, index) => (
          <div key={m.mood} className="flex flex-col items-center gap-2 rounded-xl bg-[var(--panel)] p-3" data-jongi-tile={m.mood}>
            <Jongi
              ref={(handle) => {
                wins.current[index] = handle;
              }}
              size={168}
              framing="scene"
              mood={m.mood}
              track
              label={`${m.label} Jongi`}
            />
            <span className="text-sm font-semibold">{m.label}</span>
            <span className="text-xs text-muted-foreground">{m.note}</span>
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap items-end gap-8">
        {JONGI_MOODS.map((m) => (
          <Cell key={m.mood} label={`56 tile · ${m.mood}`}>
            <Jongi size={56} mood={m.mood} tile track />
          </Cell>
        ))}
        <Cell label="32 round">
          <Jongi size={32} tile="round" />
        </Cell>
        <Cell label="24 round">
          <Jongi size={24} tile="round" />
        </Cell>
        <Cell label="140 full · cheer">
          <Jongi size={140} framing="full" mood="cheer" />
        </Cell>
        <Cell label="Win">
          <Button variant="secondary" size="sm" onClick={() => wins.current.forEach((handle) => handle?.win())}>
            Replay the win
          </Button>
        </Cell>
      </div>
    </Section>
  );
}

/**
 * Component reference (SEN-86): every kit component in its states.
 * Reachable at /dev/components; not linked from the app.
 */
export function ComponentsPage() {
  const toast = useToast();
  const companion = useCompanion();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);
  const [tilesReset, setTilesReset] = useState(0);
  const [quizReset, setQuizReset] = useState(0);
  const [lastPick, setLastPick] = useState<string | null>(null);
  const [typingKey, setTypingKey] = useState(0);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <ShellTitle>Components</ShellTitle>
      <h1 className="text-2xl font-bold">Component reference</h1>
      <p className="mt-2 mb-10 text-muted-foreground">
        Every kit component in its states. Contract: <code className="k-mono">src/components/README.md</code>.
      </p>

      <Section title="brand" note="The mark is Jongi's folded head in a cap, at 64 / 32 / 16. The favicon is the 64 on its tile.">
        <div className="flex flex-wrap items-end gap-8">
          <Cell label="Logo 16">
            <Logo size={16} />
          </Cell>
          <Cell label="Logo 28">
            <Logo />
          </Cell>
          <Cell label="Logo 32 · tile">
            <Logo size={32} tile />
          </Cell>
          <Cell label="Logo 64 · tile">
            <Logo size={64} tile />
          </Cell>
          <Cell label="Loader 20 (inline)">
            <Loader size={20} />
          </Cell>
          <Cell label="Loader 88 + label">
            <Loader size={88} label="Making your course…" />
          </Cell>
        </div>
        <div className="mt-6 flex flex-wrap gap-4">
          {(Object.keys(COURSE_ICON_PATHS) as CourseIconName[]).map((name) => (
            <Cell key={name} label={name}>
              <CourseIcon name={name} size={24} />
            </Cell>
          ))}
        </div>
      </Section>

      <Section title="button" note="Pop-up tabs on a darker under-sheet; pressed, they fold down 2px.">
        <div className="flex flex-wrap items-end gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="quiet">Quiet</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="link">Link</Button>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <Button size="icon" aria-label="Start">
            <Rocket />
          </Button>
          <Button disabled>Disabled</Button>
          <Button variant="secondary" disabled>
            Disabled
          </Button>
          <Button asChild variant="ghost">
            <a href="#main">asChild link</a>
          </Button>
          <Button variant="secondary">
            <Loader size={18} label="Saving" /> Saving…
          </Button>
        </div>
      </Section>

      <Section title="input" note="The topic is the only free text in the flows; everything else is options.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Cell label="default">
            <Input aria-label="Sample input" placeholder="What would you like to learn?" fieldClassName="w-full" />
          </Cell>
          <Cell label="trailing button">
            <Input
              aria-label="Sample input with button"
              placeholder="Norse mythology"
              fieldClassName="w-full"
              trailing={
                <Button size="sm" variant="primary">
                  Go
                </Button>
              }
            />
          </Cell>
          <Cell label="invalid">
            <Input aria-label="Invalid input" defaultValue="??" invalid fieldClassName="w-full" />
          </Cell>
          <Cell label="disabled">
            <Input aria-label="Disabled input" value="Locked" disabled fieldClassName="w-full" readOnly />
          </Cell>
          <Cell label="textarea">
            <Textarea aria-label="Sample textarea" placeholder="Anything else?" fieldClassName="w-full" />
          </Cell>
        </div>
      </Section>

      <Section title="card" note="Paper sheets: default casts a sheet shadow, flat is an outline for nesting, interactive lifts onto a stack.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="p-5">accent (default)</Card>
          <Card tone="flat" className="p-5">
            flat
          </Card>
          <Card interactive className="p-5">
            interactive (hover)
          </Card>
        </div>
      </Section>

      <JongiSection />

      <Section title="chat thread" note="CompanionLine, LearnerEcho, ThreadCard. Options sit right under the latest line.">
        <ChatThread>
          <CompanionLine>What would you like to learn?</CompanionLine>
          <LearnerEcho>Norse mythology</LearnerEcho>
          <CompanionLine mood="think">Nice. A few quick picks and I'll plan it.</CompanionLine>
          <CompanionLine continued>How do you want to move through it?</CompanionLine>
          <OptionTiles
            label="How do you want to move through it?"
            options={PACE_OPTIONS}
            resetKey={tilesReset}
            onPick={(option) => setLastPick(option.label)}
          />
          {lastPick ? <LearnerEcho>{lastPick}</LearnerEcho> : null}
          <ThreadCard title="Your plan" sub="6 lessons · about 40 minutes">
            <SegmentedProgress segments={["done", "done", "now", "todo", "todo", "todo"]} label="2 of 6 lessons done" />
          </ThreadCard>
          <LearnerEcho verdict="good">Thor</LearnerEcho>
          <LearnerEcho verdict="miss">Loki</LearnerEcho>
          <CompanionLine key={typingKey} typing delayMs={1200}>
            This line typed first.
          </CompanionLine>
        </ChatThread>
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setTilesReset((n) => n + 1);
              setLastPick(null);
            }}
          >
            Reset tiles
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setTypingKey((n) => n + 1)}>
            Replay typing
          </Button>
        </div>
      </Section>

      <Section title="option tiles" note="Resting sheets, stacked while they need you, lifted with an apricot rim when picked. Keys 1–9 pick from the newest unlocked group. Quiz: good bursts paper, miss shakes and reveals.">
        <div className="space-y-6">
          <Cell label="quiz (judge + correctId) · cols 2 · flush">
            <OptionTiles
              className="w-full"
              label="Who carries Mjölnir?"
              options={QUIZ_OPTIONS}
              flush
              correctId="thor"
              judge={(option) => (option.id === "thor" ? "good" : "miss")}
              resetKey={quizReset}
              keyboard={false}
              onPick={() => undefined}
            />
            <Button size="sm" variant="ghost" onClick={() => setQuizReset((n) => n + 1)}>
              Reset quiz
            </Button>
          </Cell>
          <Cell label="cols 3 · primary, quiet, disabled · no keys">
            <OptionTiles className="w-full" label="Three columns" options={THREE_COL} cols={3} flush keyboard={false} resetKey={tilesReset} onPick={() => undefined} />
          </Cell>
          <Cell label="cols 1">
            <OptionTiles className="w-full max-w-md" label="One column" options={PACE_OPTIONS.slice(0, 2)} cols={1} flush keyboard={false} resetKey={tilesReset} onPick={() => undefined} />
          </Cell>
        </div>
      </Section>

      <Section title="progress" note="Ribbon bar with a notched end, paper pips, and a ring cut into paper segments.">
        <div className="grid gap-6 sm:grid-cols-2">
          <Cell label="segments: done, now, writing, miss, todo">
            <SegmentedProgress segments={["done", "done", "now", "writing", "miss", "todo"]} label="sample segments" className="w-64" />
          </Cell>
          <Cell label="bar 0.62">
            <ProgressBar value={0.62} label="62% read" className="w-64" />
          </Cell>
          <div className="flex gap-6">
            <Cell label="ring 0.35">
              <ProgressRing value={0.35} label="35%" />
            </Cell>
            <Cell label="ring custom label">
              <ProgressRing value={0.8} size={80} stroke={6} label="16 of 20 minutes">
                16m
              </ProgressRing>
            </Cell>
            <Cell label="ring 0.6 · 44">
              <ProgressRing value={0.6} size={44} label="60%" />
            </Cell>
            <Cell label="ring no label">
              <ProgressRing value={1} size={40} label="done">
                {null}
              </ProgressRing>
            </Cell>
          </div>
        </div>
      </Section>

      <Section title="ribbons" note="Every status is a notched bookmark ribbon (.k-rib). Red is only for needs you and the streak.">
        <div className="flex flex-wrap items-center gap-3">
          <span className="k-rib learning">Learning</span>
          <span className="k-rib making">Being made</span>
          <span className="k-rib needs">Needs you</span>
          <span className="k-rib done">✓ Done</span>
          <span className="k-rib stopped">Stopped</span>
          <span className="k-rib solid">6-day streak</span>
        </div>
      </Section>

      <Section title="course row" note="Sidebar line: icon with status dot, title, tiny progress, a small status ribbon.">
        <div className="k-clist max-w-xs">
          {SAMPLE_COURSES.map((course, index) => (
            <CourseRow key={course.key} course={course} active={index === 0} />
          ))}
        </div>
      </Section>

      <Section title="course card" note="Home card. Segments default to done/todo from progress.">
        <div className="grid gap-4 sm:grid-cols-2">
          <CourseCard course={SAMPLE_COURSES[0]!} sub="Next: Lesson 3 · The nine worlds" metaLeft="2 of 6" metaRight="12 min left" />
          <CourseCard course={SAMPLE_COURSES[1]!} sub="Writing lesson 3 of 5" segments={["done", "done", "writing", "todo", "todo"]} />
          <CourseCard course={SAMPLE_COURSES[2]!} sub="A quick question before I plan it" />
          <CourseCard course={SAMPLE_COURSES[3]!} metaLeft="finished" metaRight="5 lessons" />
          <CourseCard course={SAMPLE_COURSES[4]!} sub="Stopped while writing" />
        </div>
      </Section>

      <Section title="states">
        <div className="grid gap-4 sm:grid-cols-2">
          <EmptyState title="Nothing here yet" actions={<Button>New course</Button>}>
            Tell me something you're curious about.
          </EmptyState>
          <ErrorState actions={<Button variant="secondary">Try again</Button>}>Your courses are safe. Try again in a moment.</ErrorState>
        </div>
      </Section>

      <Section title="dialog · toast · effects · companion">
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setDialogOpen(true)}>
            Dialog
          </Button>
          <Button variant="secondary" onClick={() => setConfirmOpen(true)}>
            Confirm
          </Button>
          <Button variant="secondary" onClick={() => setDangerOpen(true)}>
            Confirm (danger)
          </Button>
          <Button variant="ghost" onClick={() => toast({ title: "Saved", body: "Your answers are saved." })}>
            Toast
          </Button>
          <Button variant="ghost" onClick={() => toast({ title: "Lesson read", tone: "celebrate" })}>
            Toast celebrate
          </Button>
          <Button variant="ghost" onClick={() => toast({ title: "That didn't save", body: "Try again.", tone: "error" })}>
            Toast error
          </Button>
          <Button variant="ghost" onClick={(event) => cheer(event.currentTarget, "lesson read")}>
            cheer()
          </Button>
          <Button variant="ghost" onClick={(event) => confettiAt(event.currentTarget)}>
            confettiAt()
          </Button>
          <Button variant="ghost" onClick={() => companion.say("Nice work. That one's done.", "cheer")}>
            Companion: say + cheer
          </Button>
          <Button variant="ghost" onClick={() => companion.setMood("think")}>
            Companion: think
          </Button>
          <Button variant="ghost" onClick={() => companion.setMood("idle")}>
            Companion: idle
          </Button>
        </div>
      </Section>

      <LearnShowcase />

      <Dialog
        open={dialogOpen}
        title="A plain dialog"
        onClose={() => setDialogOpen(false)}
        actions={<Button onClick={() => setDialogOpen(false)}>Done</Button>}
      >
        <p>Focus is trapped here. Esc or the backdrop closes it, and focus goes back to the opener.</p>
      </Dialog>
      <ConfirmDialog
        open={confirmOpen}
        title="Start this course?"
        body="I'll start writing the lessons now."
        confirmLabel="Start"
        onConfirm={() => setConfirmOpen(false)}
        onCancel={() => setConfirmOpen(false)}
      />
      <ConfirmDialog
        open={dangerOpen}
        title="Stop making this course?"
        body="The lessons written so far are kept. You can't resume a stopped course."
        confirmLabel="Stop"
        danger
        onConfirm={() => setDangerOpen(false)}
        onCancel={() => setDangerOpen(false)}
      />
    </div>
  );
}
