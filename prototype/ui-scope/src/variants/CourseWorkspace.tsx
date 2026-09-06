import {
  blueprintSlots,
  coverageNote,
  courseLessons,
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
import type { SceneId, VariantProps } from "../types";

export function CourseWorkspace({ scene, state, setState, go }: VariantProps) {
  const learn = scene === "course-home" || scene === "reading" || scene === "quiz-taking" || scene === "quiz-feedback";
  if (learn) {
    return (
      <div className="b study app-shell">
        <Learn scene={scene} state={state} setState={setState} go={go} />
      </div>
    );
  }
  return (
    <div className="b app-shell">
      <aside className="rail">
        <div className="brand">Workspace</div>
        <button type="button" className={scene === "home" ? "on" : ""} onClick={() => go("home")}>
          Home
        </button>
        <button
          type="button"
          className={scene === "teaching-profile" ? "on" : ""}
          onClick={() => go("teaching-profile")}
        >
          Teaching Profile
        </button>
        <button type="button" className={scene === "request" ? "on" : ""} onClick={() => go("request")}>
          New Course Request
        </button>
        <div className="group">Open</div>
        <button type="button" className={learn ? "on" : ""} onClick={() => go("course-home")}>
          Drum kit · 3/10
        </button>
        <button
          type="button"
          className={scene === "blueprint-review" ? "on" : ""}
          onClick={() => go("blueprint-review")}
        >
          Microbiology · review
        </button>
        <button
          type="button"
          className={scene === "generation-fail" ? "on" : ""}
          onClick={() => go("generation-fail")}
        >
          Norse · failed
        </button>
        <button
          type="button"
          className={scene === "request-reject" ? "on" : ""}
          onClick={() => go("request-reject")}
        >
          Unicorns · rejected
        </button>
      </aside>
      <div className="workspace">
        {scene === "home" && <Home go={go} />}
        {(scene === "request" ||
          scene === "request-clarify" ||
          scene === "request-reject" ||
          scene === "teaching-profile" ||
          scene === "diagnostic" ||
          scene === "remaining-gap" ||
          scene === "ceiling" ||
          scene === "assessment-failed") && (
          <Intake scene={scene} state={state} setState={setState} go={go} />
        )}
        {(scene === "waiting-blueprint" || scene === "waiting-course") && (
          <Wait scene={scene} state={state} setState={setState} go={go} />
        )}
        {scene === "blueprint-review" && <Blueprint state={state} setState={setState} go={go} />}
        {scene === "generation-fail" && <GenFail go={go} />}
      </div>
    </div>
  );
}

function Home({ go }: { go: VariantProps["go"] }) {
  return (
    <>
      <div className="crumbs">Home</div>
      <h1>Everything in one workspace</h1>
      <p className="sub">Requests, rejected history, and published Courses share this grid. No separate Guide chat.</p>
      <div className="grid">
        {homeItems.map((item) => (
          <button
            key={item.title}
            className="tile"
            type="button"
            onClick={() => {
              if (item.tag === "Published") go("course-home");
              else if (item.tag === "Blueprint review") go("blueprint-review");
              else if (item.tag === "Generation failed") go("generation-fail");
              else go("request-reject");
            }}
          >
            <div className="tag">{item.tag}</div>
            <strong>{item.title}</strong>
            <p>{item.goal}</p>
            <p className="sub">{item.status}</p>
          </button>
        ))}
      </div>
    </>
  );
}

function stepFor(scene: SceneId): number {
  if (scene === "request" || scene === "request-clarify" || scene === "request-reject") return 0;
  if (scene === "teaching-profile") return 1;
  if (scene === "diagnostic" || scene === "assessment-failed") return 2;
  return 3;
}

function Intake({ scene, state, setState, go }: VariantProps) {
  const step = stepFor(scene);
  return (
    <>
      <div className="crumbs">Course Request · system copy, not a chat</div>
      <h1>Start a Course</h1>
      <div className="stepper">
        {["Request", "Teaching Profile", "Diagnostic", "Confirm gap"].map((label, i) => (
          <span key={label} className={i === step ? "on" : ""}>
            {i + 1} {label}
          </span>
        ))}
      </div>
      {scene === "request" && (
        <>
          <div className="banner">
            After submit, a validity gate passes, asks one clarification, or rejects. The Course Guide
            is this copy — there is no character.
          </div>
          <textarea
            value={state.requestDraft}
            onChange={(e) => setState({ requestDraft: e.target.value })}
          />
          <div className="actions">
            <button className="btn" type="button" onClick={() => go("diagnostic")}>
              Submit
            </button>
          </div>
        </>
      )}
      {scene === "request-clarify" && (
        <>
          <div className="banner">One clarification. Confirming an unsupported premise rejects the request.</div>
          <h1>Mythic study, or real-world animal care?</h1>
          <div className="actions">
            <button className="btn" type="button" onClick={() => go("diagnostic")}>
              Mythic corpus
            </button>
            <button className="btn ghost" type="button" onClick={() => go("request-reject")}>
              Real-world care
            </button>
          </div>
        </>
      )}
      {scene === "request-reject" && (
        <>
          <div className="banner">Rejected. Reason stays on the request. No appeal. Revise starts an editable copy.</div>
          <h1>Real-world unicorn care is not a documented subject</h1>
          <p className="sub">Safe reframe: the unicorn in myth and art.</p>
          <div className="actions">
            <button className="btn" type="button" onClick={() => go("request")}>
              Revise request
            </button>
          </div>
        </>
      )}
      {scene === "teaching-profile" && (
        <>
          <p className="sub">{profileIntro}</p>
          {profileQuestions.map((q) => (
            <section key={q.id}>
              <p>
                <strong>{q.prompt}</strong>
              </p>
              {q.options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={state.profileQ[q.id] === opt ? "choice on" : "choice"}
                  onClick={() => setState({ profileQ: { ...state.profileQ, [q.id]: opt } })}
                >
                  {opt}
                </button>
              ))}
            </section>
          ))}
          <div className="actions">
            <button className="btn" type="button" onClick={() => go("diagnostic")}>
              Continue
            </button>
          </div>
        </>
      )}
      {scene === "diagnostic" && (
        <>
          <div className="banner">{honestyIntro}</div>
          {diagnosticItems.map((item, i) => (
            <section key={item.capability}>
              <p className="tag">{item.capability}</p>
              <p>
                <strong>{item.stem}</strong>
              </p>
              {item.options.map((opt, n) => (
                <button
                  key={opt}
                  type="button"
                  className={state.diagnosticAnswers[i] === n ? "choice on" : "choice"}
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
                className={state.diagnosticAnswers[i] === "idk" ? "choice on" : "choice"}
                onClick={() => {
                  const next = [...state.diagnosticAnswers];
                  next[i] = "idk";
                  setState({ diagnosticAnswers: next });
                }}
              >
                I don’t know
              </button>
            </section>
          ))}
          <div className="actions">
            <button className="btn" type="button" onClick={() => go("remaining-gap")}>
              Confirm remaining gap
            </button>
          </div>
        </>
      )}
      {scene === "remaining-gap" && (
        <>
          <div className="banner">{coverageNote}</div>
          <h1>Proposed remaining gap</h1>
          <p>{remainingGapStatement}</p>
          <div className="actions">
            <button className="btn" type="button" onClick={() => go("waiting-blueprint")}>
              Looks right
            </button>
            <button className="btn ghost" type="button" onClick={() => go("waiting-blueprint")}>
              Too easy
            </button>
          </div>
        </>
      )}
      {scene === "ceiling" && (
        <>
          <div className="banner">
            Ceiling is not certification. Performance goals still need a Course. Empty Courses are not
            published.
          </div>
          <div className="actions">
            <button className="btn" type="button" onClick={() => go("waiting-blueprint")}>
              Thin Blueprint
            </button>
            <button className="btn ghost" type="button" onClick={() => go("request")}>
              Revise Learning Goal
            </button>
          </div>
        </>
      )}
      {scene === "assessment-failed" && (
        <>
          <div className="banner">Retry diagnostic only. No self-report Starting Level.</div>
          <div className="actions">
            <button className="btn" type="button" onClick={() => go("diagnostic")}>
              Retry diagnostic
            </button>
          </div>
        </>
      )}
    </>
  );
}

function Wait({
  scene,
  state,
  setState,
  go,
}: VariantProps) {
  const course = scene === "waiting-course";
  return (
    <>
      <div className="crumbs">{course ? "Course generation" : "Blueprint generation"}</div>
      <h1>{state.canceled ? "Canceled — checkpoints kept" : course ? "Generating Lessons" : "Preparing Blueprint"}</h1>
      <p className="sub">
        {course && !state.canceled ? "Repairing · Hi-hat eighths · 8 of 10" : "No draft body, Sources, or token stream."}
      </p>
      <div className="meter">
        <span style={{ width: course ? "80%" : "55%" }} />
      </div>
      <div className="actions">
        <button className="btn ghost" type="button" onClick={() => setState({ canceled: !state.canceled })}>
          {state.canceled ? "Resume" : "Cancel"}
        </button>
        <button className="btn" type="button" onClick={() => go(course ? "course-home" : "blueprint-review")}>
          Skip wait (prototype)
        </button>
      </div>
    </>
  );
}

function Blueprint({
  state,
  setState,
  go,
}: Pick<VariantProps, "state" | "setState" | "go">) {
  return (
    <>
      <div className="crumbs">Persisted review · leave and return</div>
      <h1>Blueprint</h1>
      <p className="sub">Titles and Lesson goals only. Mark irrelevant; the system revises. Sequence mode is a Course control here.</p>
      {blueprintSlots.map((s) => (
        <div key={s.id} className="tile" style={{ marginBottom: 8, width: "100%" }}>
          <div className="tag">
            {s.module} · {s.method}
          </div>
          <strong>{s.title}</strong>
          <p>{s.goal}</p>
          <button
            className="btn ghost"
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
      <p className="sub">Free jump is one-way. Linear cannot be restored.</p>
      <button
        className={state.sequenceMode === "linear" ? "choice on" : "choice"}
        type="button"
        onClick={() => setState({ sequenceMode: "linear" })}
      >
        Linear (default)
      </button>
      <button
        className={state.sequenceMode === "free-jump" ? "choice on" : "choice"}
        type="button"
        onClick={() => setState({ sequenceMode: "free-jump" })}
      >
        Free jump
      </button>
      <div className="actions">
        <button className="btn" type="button" onClick={() => go("waiting-course")}>
          Approve
        </button>
      </div>
    </>
  );
}

function GenFail({ go }: { go: VariantProps["go"] }) {
  return (
    <>
      <div className="banner">Terminal fail. Retry that Lesson, or Revise request. No publish-what-we-have.</div>
      <h1>Could not ground “Feeling 6/8 as two pulses”</h1>
      <div className="actions">
        <button className="btn" type="button" onClick={() => go("waiting-course")}>
          Retry
        </button>
        <button className="btn ghost" type="button" onClick={() => go("request")}>
          Revise request
        </button>
      </div>
    </>
  );
}

function Learn({ scene, state, setState, go }: VariantProps) {
  return (
    <>
      <header className="study-bar">
        <button className="btn ghost" type="button" onClick={() => go("home")}>
          Workspace
        </button>
        <button
          className="btn ghost"
          type="button"
          aria-expanded={state.lessonsOpen}
          onClick={() => setState({ lessonsOpen: !state.lessonsOpen })}
        >
          {state.lessonsOpen ? "Hide lessons" : "Lessons"}
        </button>
        <div className="title">Drum kit fundamentals · 3/10 · {state.sequenceMode}</div>
        {state.sequenceMode === "linear" && (
          <button className="btn ghost" type="button" onClick={() => setState({ sequenceMode: "free-jump" })}>
            Free jump (one-way)
          </button>
        )}
      </header>
      <div className="study-body">
        {state.lessonsOpen && (
          <nav className="lessons-drawer outline" aria-label="Lessons">
            {courseLessons.map((l, i) => {
              const locked = state.sequenceMode === "linear" && l.status === "locked";
              const showMod = i === 0 || courseLessons[i - 1].module !== l.module;
              return (
                <div key={l.id}>
                  {showMod && <div className="mod">{l.module}</div>}
                  <button
                    type="button"
                    className={l.status === "current" ? "current" : locked ? "locked" : ""}
                    disabled={locked}
                    onClick={() => go(l.method === "quiz" ? "quiz-taking" : "reading")}
                  >
                    {l.title}
                    <span className="tag"> {l.status}</span>
                  </button>
                </div>
              );
            })}
          </nav>
        )}
        <div className="study-pane pane">
          {(scene === "course-home" || scene === "reading") && (
            <ReadingPane scene={scene} state={state} setState={setState} go={go} />
          )}
          {(scene === "quiz-taking" || scene === "quiz-feedback") && (
            <QuizPane scene={scene} state={state} setState={setState} go={go} />
          )}
        </div>
      </div>
    </>
  );
}

function ReadingPane({
  scene,
  state,
  setState,
}: VariantProps) {
  if (scene === "course-home") {
    return (
      <>
        <h1>Counting 4/4 out loud</h1>
        <p className="sub">Next up. The workspace sidebar is hidden while you study. Toggle Lessons when you need the list.</p>
        <div className="meter">
          <span style={{ width: "30%" }} />
        </div>
      </>
    );
  }
  const s = readingSections[state.readingSection];
  return (
    <>
      <h1>Counting 4/4 out loud</h1>
      <p className="sub">Lesson goal: count a bar of 4/4 with a steady quarter pulse.</p>
      <h2>{s.heading}</h2>
      {s.blocks.map((b) => (
        <p key={b}>{b}</p>
      ))}
      <div className="media">
        <svg width="200" height="70" viewBox="0 0 200 70" aria-label="Pulse diagram">
          <rect width="200" height="70" fill="#0f1418" />
          {[0, 1, 2, 3].map((n) => (
            <circle key={n} cx={28 + n * 48} cy={28} r="8" fill="#8fb4c9" />
          ))}
        </svg>
      </div>
      <div className="actions">
        {state.readingSection < readingSections.length - 1 ? (
          <button className="btn" type="button" onClick={() => setState({ readingSection: state.readingSection + 1 })}>
            Continue section
          </button>
        ) : (
          <button className="btn" type="button" onClick={() => setState({ readingMarkedComplete: true })}>
            {state.readingMarkedComplete ? "Completed" : "Mark complete"}
          </button>
        )}
      </div>
      <p className="sub">{readingSources.map((x) => `[${x.n}] ${x.title}`).join(" · ")}</p>
    </>
  );
}

function QuizPane({ scene, state, setState, go }: VariantProps) {
  const taking = scene === "quiz-taking";
  const answered = state.quizAnswers.every((a) => a !== null);
  return (
    <>
      <h1>Timekeeping check</h1>
      <p className="sub">
        {taking ? "Draft until Submit. Must answer all. Open book." : "Best 50%. Retake same items. Key optional under 100%."}
      </p>
      {quizItems.map((q, i) => (
        <section key={q.stem}>
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
          {q.options.map((opt, n) => (
            <button
              key={opt}
              type="button"
              className={state.quizAnswers[i] === n ? "choice on" : "choice"}
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
          {!taking && state.showAnswerKey && <p className="sub">{q.why}</p>}
        </section>
      ))}
      <div className="actions">
        {taking ? (
          <button className="btn" type="button" disabled={!answered} onClick={() => go("quiz-feedback")}>
            Submit
          </button>
        ) : (
          <>
            <button className="btn" type="button" onClick={() => go("quiz-taking")}>
              Retake
            </button>
            <button className="btn ghost" type="button" onClick={() => setState({ showAnswerKey: !state.showAnswerKey })}>
              Answer key
            </button>
          </>
        )}
      </div>
    </>
  );
}
