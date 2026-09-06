import type { ReactNode } from "react";
import {
  blueprintSlots,
  coverageNote,
  diagnosticItems,
  honestyIntro,
  homeItems,
  profileIntro,
  profileQuestions,
  quizItems,
  readingSections,
  readingSources,
  remainingGapStatement,
} from "../content";
import type { VariantProps } from "../types";

const threads = [
  { id: "drum", title: "Drum kit fundamentals", preview: "Open Course · 3/10", scene: "course-home" as const },
  { id: "micro", title: "Microbiology lab", preview: "Blueprint to approve", scene: "blueprint-review" as const },
  { id: "norse", title: "Norse mythology", preview: "Generation failed", scene: "generation-fail" as const },
  { id: "uni", title: "How to feed unicorns", preview: "Rejected", scene: "request-reject" as const },
  { id: "new", title: "New Course Request", preview: "Start with the Guide", scene: "request" as const },
];

export function GuideThread({ scene, state, setState, go }: VariantProps) {
  const player = scene === "reading" || scene === "quiz-taking" || scene === "quiz-feedback";
  if (player) {
    return (
      <div className="c player app-shell">
        <div className="player-bar">
          <button type="button" onClick={() => go("course-home")}>
            Back to thread
          </button>
          <span>
            {scene.startsWith("quiz") ? "Quiz · Timekeeping check" : "Reading · Counting 4/4"}
          </span>
          <span>3/10</span>
        </div>
        <div className="player-body">
          {scene === "reading" && <Reading state={state} setState={setState} />}
          {scene !== "reading" && <Quiz scene={scene} state={state} setState={setState} go={go} />}
        </div>
      </div>
    );
  }

  return (
    <div className="c app-shell">
      <aside className="inbox">
        <h1>Threads</h1>
        {threads.map((t) => (
          <button
            key={t.id}
            type="button"
            className={activeThread(scene) === t.id ? "on" : ""}
            onClick={() => go(t.scene)}
          >
            <strong>{t.title}</strong>
            <div>{t.preview}</div>
          </button>
        ))}
      </aside>
      <section className="thread">
        <div className="thread-head">
          <strong>Course Guide</strong>
          <div>Presents policy. Cannot override it.</div>
        </div>
        <div className="msgs">{messages({ scene, state, setState, go })}</div>
      </section>
    </div>
  );
}

function activeThread(scene: VariantProps["scene"]) {
  if (scene === "request-reject") return "uni";
  if (scene === "generation-fail") return "norse";
  if (scene === "blueprint-review" || scene === "waiting-blueprint") return "micro";
  if (scene === "course-home" || scene === "waiting-course") return "drum";
  return "new";
}

function Bubble({ who, children }: { who: "guide" | "me"; children: ReactNode }) {
  return (
    <>
      <div className="who">{who === "guide" ? "Course Guide" : "You"}</div>
      <div className={`bubble ${who}`}>{children}</div>
    </>
  );
}

function messages({ scene, state, setState, go }: VariantProps) {
  if (scene === "home") {
    return (
      <>
        <Bubble who="guide">
          Pick a thread, or start a Course Request here. Published Courses open as a player from the
          thread — setup stays a conversation.
        </Bubble>
        {homeItems.map((item) => (
          <div className="card" key={item.title}>
            <div className="who">{item.tag}</div>
            <strong>{item.title}</strong>
            <p>{item.status}</p>
          </div>
        ))}
      </>
    );
  }

  if (scene === "request") {
    return (
      <>
        <Bubble who="guide">What subject and Learning Goal should this Course aim at?</Bubble>
        <div className="composer">
          <textarea
            value={state.requestDraft}
            onChange={(e) => setState({ requestDraft: e.target.value })}
          />
          <button className="btn" type="button" onClick={() => go("diagnostic")}>
            Send
          </button>
        </div>
      </>
    );
  }

  if (scene === "request-clarify") {
    return (
      <>
        <Bubble who="me">{state.requestDraft || "How to feed unicorns"}</Bubble>
        <Bubble who="guide">
          One clarification: do you mean the unicorn in myth, or real-world animal care? Confirming
          the second rejects the request.
        </Bubble>
        <div className="chip-row">
          <button className="chip" type="button" onClick={() => go("diagnostic")}>
            Mythic study
          </button>
          <button className="chip" type="button" onClick={() => go("request-reject")}>
            Real-world care
          </button>
        </div>
      </>
    );
  }

  if (scene === "request-reject") {
    return (
      <>
        <Bubble who="me">Real-world animal care for unicorns</Bubble>
        <Bubble who="guide">
          Rejected: that premise is not a documented animal-care subject. Safe reframe: study the
          unicorn in myth and art. This thread stays. There is no appeal.
        </Bubble>
        <div className="chip-row">
          <button className="chip" type="button" onClick={() => go("request")}>
            Revise request
          </button>
        </div>
      </>
    );
  }

  if (scene === "teaching-profile") {
    return (
      <>
        <Bubble who="guide">{profileIntro}</Bubble>
        {profileQuestions.map((q) => (
          <div className="card" key={q.id}>
            <p>
              <strong>{q.prompt}</strong>
            </p>
            <div className="chip-row">
              {q.options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={state.profileQ[q.id] === opt ? "chip on" : "chip"}
                  onClick={() => setState({ profileQ: { ...state.profileQ, [q.id]: opt } })}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="chip-row">
          <button className="btn" type="button" onClick={() => go("diagnostic")}>
            Continue
          </button>
        </div>
      </>
    );
  }

  if (scene === "diagnostic") {
    return (
      <>
        <Bubble who="guide">{honestyIntro}</Bubble>
        {diagnosticItems.map((item, i) => (
          <div className="card" key={item.capability}>
            <div className="who">{item.capability}</div>
            <p>
              <strong>{item.stem}</strong>
            </p>
            <div className="chip-row">
              {item.options.map((opt, n) => (
                <button
                  key={opt}
                  type="button"
                  className={state.diagnosticAnswers[i] === n ? "chip on" : "chip"}
                  onClick={() => {
                    const next = [...state.diagnosticAnswers];
                    next[i] = n;
                    setState({ diagnosticAnswers: next });
                  }}
                >
                  {opt}
                </button>
              ))}
              <button
                type="button"
                className={state.diagnosticAnswers[i] === "idk" ? "chip on" : "chip"}
                onClick={() => {
                  const next = [...state.diagnosticAnswers];
                  next[i] = "idk";
                  setState({ diagnosticAnswers: next });
                }}
              >
                I don’t know
              </button>
            </div>
          </div>
        ))}
        <div className="chip-row">
          <button className="btn" type="button" onClick={() => go("remaining-gap")}>
            Done
          </button>
        </div>
      </>
    );
  }

  if (scene === "remaining-gap") {
    return (
      <>
        <Bubble who="guide">
          {remainingGapStatement} {coverageNote}
        </Bubble>
        <div className="chip-row">
          <button className="chip" type="button" onClick={() => go("waiting-blueprint")}>
            Looks right
          </button>
          <button className="chip" type="button" onClick={() => go("waiting-blueprint")}>
            Too easy
          </button>
        </div>
      </>
    );
  }

  if (scene === "ceiling") {
    return (
      <>
        <Bubble who="guide">
          You got nearly everything. This still cannot certify that you can already play Iris. Thin
          Blueprint, or revise the Learning Goal. We will not publish an empty Course.
        </Bubble>
        <div className="chip-row">
          <button className="chip" type="button" onClick={() => go("waiting-blueprint")}>
            Thin Blueprint
          </button>
          <button className="chip" type="button" onClick={() => go("request")}>
            Revise Learning Goal
          </button>
        </div>
      </>
    );
  }

  if (scene === "assessment-failed") {
    return (
      <>
        <Bubble who="guide">
          Assessment failed. Retry diagnostic only — I cannot invent a Starting Level.
        </Bubble>
        <div className="chip-row">
          <button className="chip" type="button" onClick={() => go("diagnostic")}>
            Retry diagnostic
          </button>
        </div>
      </>
    );
  }

  if (scene === "waiting-blueprint" || scene === "waiting-course") {
    const course = scene === "waiting-course";
    return (
      <>
        <Bubble who="guide">
          {state.canceled
            ? "Canceled. Checkpoints kept. Resume when you want — I will not auto-resume."
            : course
              ? "Generating · Lesson 6 of 10 · Timekeeping check. Repairing citations. No draft body."
              : "Preparing Blueprint from the remaining gap. You can leave this thread."}
        </Bubble>
        <div className="chip-row">
          <button className="chip" type="button" onClick={() => setState({ canceled: !state.canceled })}>
            {state.canceled ? "Resume" : "Cancel"}
          </button>
          <button className="chip" type="button" onClick={() => go(course ? "course-home" : "blueprint-review")}>
            Skip wait (prototype)
          </button>
        </div>
      </>
    );
  }

  if (scene === "blueprint-review") {
    return (
      <>
        <Bubble who="guide">
          Review titles and Lesson goals. Mark irrelevant if a slot does not serve the Learning Goal.
          Sequence mode is a Course choice: linear by default; free jump is one-way.
        </Bubble>
        {blueprintSlots.map((s) => (
          <div className="card" key={s.id} style={{ opacity: state.markedIrrelevant.includes(s.id) ? 0.45 : 1 }}>
            <div className="who">
              {s.module} · {s.method}
            </div>
            <strong>{s.title}</strong>
            <p>{s.goal}</p>
            <button
              className="chip"
              type="button"
              onClick={() => {
                const has = state.markedIrrelevant.includes(s.id);
                setState({
                  markedIrrelevant: has
                    ? state.markedIrrelevant.filter((id) => id !== s.id)
                    : [...state.markedIrrelevant, s.id],
                });
              }}
            >
              {state.markedIrrelevant.includes(s.id) ? "Keep" : "Mark irrelevant"}
            </button>
          </div>
        ))}
        <div className="chip-row">
          <button
            className={state.sequenceMode === "linear" ? "chip on" : "chip"}
            type="button"
            onClick={() => setState({ sequenceMode: "linear" })}
          >
            Linear
          </button>
          <button
            className={state.sequenceMode === "free-jump" ? "chip on" : "chip"}
            type="button"
            onClick={() => setState({ sequenceMode: "free-jump" })}
          >
            Free jump (cannot restore)
          </button>
          <button className="btn" type="button" onClick={() => go("waiting-course")}>
            Approve
          </button>
        </div>
      </>
    );
  }

  if (scene === "generation-fail") {
    return (
      <>
        <Bubble who="guide">
          Terminal fail on Lesson 4. Retry that Lesson on the same Blueprint, or Revise request.
          Unpublished Lessons stay unplayable.
        </Bubble>
        <div className="chip-row">
          <button className="chip" type="button" onClick={() => go("waiting-course")}>
            Retry
          </button>
          <button className="chip" type="button" onClick={() => go("request")}>
            Revise request
          </button>
        </div>
      </>
    );
  }

  if (scene === "course-home") {
    return (
      <>
        <Bubble who="guide">
          Published. Progress 3/10. Sequence mode is {state.sequenceMode}. Lessons open in a player;
          this thread keeps the history. Reuse and lineage stay invisible.
        </Bubble>
        <div className="card">
          <strong>Drum kit fundamentals</strong>
          <p>Play Iris by the Goo Goo Dolls</p>
          <div className="chip-row">
            <button className="btn" type="button" onClick={() => go("reading")}>
              Continue Lesson
            </button>
            <button className="chip" type="button" onClick={() => go("quiz-taking")}>
              Open a Quiz
            </button>
            {state.sequenceMode === "linear" && (
              <button className="chip" type="button" onClick={() => setState({ sequenceMode: "free-jump" })}>
                Switch to free jump
              </button>
            )}
          </div>
        </div>
      </>
    );
  }

  return <Bubble who="guide">Use the scene bar if this state has no thread yet.</Bubble>;
}

function Reading({
  state,
  setState,
}: Pick<VariantProps, "state" | "setState">) {
  const s = readingSections[state.readingSection];
  const last = state.readingSection >= readingSections.length - 1;
  return (
    <>
      <div className="who">Lesson goal</div>
      <h1>Count a bar of 4/4 with a steady quarter pulse</h1>
      <h2>{s.heading}</h2>
      {s.blocks.map((b) => (
        <p key={b}>{b}</p>
      ))}
      <svg width="240" height="80" viewBox="0 0 240 80" aria-label="Pulse diagram">
        <rect width="240" height="80" fill="#ece7df" />
        {[0, 1, 2, 3].map((n) => (
          <g key={n}>
            <circle cx={36 + n * 56} cy={28} r="10" fill="#1c1916" />
            <text x={32 + n * 56} y={58} fontSize="12">
              {n + 1}
            </text>
          </g>
        ))}
      </svg>
      <div className="chip-row">
        {!last && (
          <button className="btn" type="button" onClick={() => setState({ readingSection: state.readingSection + 1 })}>
            Continue
          </button>
        )}
        {last && (
          <button className="btn" type="button" onClick={() => setState({ readingMarkedComplete: true })}>
            {state.readingMarkedComplete ? "Completed" : "Mark complete"}
          </button>
        )}
      </div>
      <p>
        {readingSources.map((x) => (
          <span key={x.n}>
            [{x.n}] {x.title}{" "}
          </span>
        ))}
      </p>
    </>
  );
}

function Quiz({ scene, state, setState, go }: VariantProps) {
  const taking = scene === "quiz-taking";
  const answered = state.quizAnswers.every((a) => a !== null);
  return (
    <>
      <h1>Timekeeping check</h1>
      <p>
        {taking
          ? "Untimed, open book, all items, then Submit."
          : "Best 50%. Progress at 70%. Retake the same items."}
      </p>
      {quizItems.map((q, i) => (
        <div className="card" key={q.stem} style={{ marginBottom: 10, maxWidth: "none" }}>
          <p>
            <strong>
              {i + 1}. {q.stem}
            </strong>{" "}
            {!taking && (
              <span className={state.quizAnswers[i] === q.key ? "ok" : "bad"}>
                {state.quizAnswers[i] === q.key ? "right" : "wrong"}
              </span>
            )}
          </p>
          <div className="chip-row">
            {q.options.map((opt, n) => (
              <button
                key={opt}
                type="button"
                className={state.quizAnswers[i] === n ? "chip on" : "chip"}
                onClick={() => {
                  if (!taking) return;
                  const next = [...state.quizAnswers];
                  next[i] = n;
                  setState({ quizAnswers: next });
                }}
              >
                {opt}
              </button>
            ))}
          </div>
          {!taking && state.showAnswerKey && <p>{q.why}</p>}
        </div>
      ))}
      <div className="chip-row">
        {taking ? (
          <button className="btn" type="button" disabled={!answered} onClick={() => go("quiz-feedback")}>
            Submit
          </button>
        ) : (
          <>
            <button className="btn" type="button" onClick={() => go("quiz-taking")}>
              Retake
            </button>
            <button className="chip" type="button" onClick={() => setState({ showAnswerKey: !state.showAnswerKey })}>
              Answer key
            </button>
          </>
        )}
      </div>
    </>
  );
}
