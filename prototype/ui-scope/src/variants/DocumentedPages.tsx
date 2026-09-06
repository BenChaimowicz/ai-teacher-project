import type { ReactNode } from "react";
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
import type { VariantProps } from "../types";

function Choices({
  options,
  value,
  onPick,
}: {
  options: string[];
  value?: string | number | null;
  onPick: (i: number) => void;
}) {
  return (
    <>
      {options.map((opt, i) => (
        <button
          key={opt}
          type="button"
          className={value === i || value === opt ? "choice on" : "choice"}
          onClick={() => onPick(i)}
        >
          {opt}
        </button>
      ))}
    </>
  );
}

function Guide({ children }: { children: ReactNode }) {
  return (
    <aside className="guide">
      <div className="kicker">Course Guide</div>
      <h2>Here to present the next step</h2>
      {children}
    </aside>
  );
}

export function DocumentedPages({ scene, state, setState, go }: VariantProps) {
  return (
    <div className="a app-shell">
      <header className="top">
        <div className="wordmark">Library</div>
        <nav>
          <button className="link" type="button" onClick={() => go("home")}>
            Home
          </button>
          <button className="link" type="button" onClick={() => go("teaching-profile")}>
            Teaching Profile
          </button>
          <button className="link" type="button" onClick={() => go("request")}>
            New Course Request
          </button>
        </nav>
      </header>
      {scene === "home" && <Home go={go} />}
      {scene === "request" && <Request state={state} setState={setState} go={go} />}
      {scene === "request-clarify" && <Clarify go={go} />}
      {scene === "request-reject" && <Reject go={go} />}
      {scene === "teaching-profile" && <Profile state={state} setState={setState} go={go} />}
      {scene === "diagnostic" && <Diagnostic state={state} setState={setState} go={go} />}
      {scene === "remaining-gap" && <Gap go={go} />}
      {scene === "ceiling" && <Ceiling go={go} />}
      {scene === "assessment-failed" && <AssessFail go={go} />}
      {scene === "waiting-blueprint" && <Wait kind="blueprint" state={state} setState={setState} go={go} />}
      {scene === "blueprint-review" && <Blueprint state={state} setState={setState} go={go} />}
      {scene === "waiting-course" && <Wait kind="course" state={state} setState={setState} go={go} />}
      {scene === "generation-fail" && <GenFail go={go} />}
      {scene === "course-home" && (
        <Course go={go} mode={state.sequenceMode} setMode={(m) => setState({ sequenceMode: m })} />
      )}
      {scene === "reading" && <Reading state={state} setState={setState} go={go} />}
      {scene === "quiz-taking" && <Quiz taking state={state} setState={setState} go={go} />}
      {scene === "quiz-feedback" && <Quiz taking={false} state={state} setState={setState} go={go} />}
    </div>
  );
}

function Home({ go }: { go: VariantProps["go"] }) {
  return (
    <main className="page">
      <h1>Your Courses</h1>
      <p className="lede">
        Each published Course is a snapshot. In-flight Course Requests stay visible — including
        rejected ones you can revise.
      </p>
      <div className="card-list">
        {homeItems.map((item) => (
          <button
            key={item.title}
            className="doc-card"
            type="button"
            onClick={() => {
              if (item.tag === "Published") go("course-home");
              else if (item.tag === "Blueprint review") go("blueprint-review");
              else if (item.tag === "Generation failed") go("generation-fail");
              else go("request-reject");
            }}
          >
            <div className="kicker">{item.tag}</div>
            <h2>{item.title}</h2>
            <p>{item.goal}</p>
            <p>{item.status}</p>
          </button>
        ))}
      </div>
    </main>
  );
}

function Request({
  state,
  setState,
  go,
}: Pick<VariantProps, "state" | "setState" | "go">) {
  return (
    <div className="spread">
      <main>
        <div className="kicker">Course Request</div>
        <h1>What do you want to be able to do?</h1>
        <p className="lede">
          Subject and Learning Goal. The Course Guide will present the validity decision; it cannot
          override it.
        </p>
        <label>
          Subject and Learning Goal
          <textarea
            value={state.requestDraft}
            onChange={(e) => setState({ requestDraft: e.target.value })}
          />
        </label>
        <div className="actions">
          <button className="btn" type="button" onClick={() => go("diagnostic")}>
            Submit request
          </button>
        </div>
      </main>
      <Guide>
        <p>
          Once this passes, we only ask Teaching Profile questions if we do not already have them.
          Then a short knowledge check — not a Quiz — sets the remaining gap.
        </p>
      </Guide>
    </div>
  );
}

function Clarify({ go }: { go: VariantProps["go"] }) {
  return (
    <div className="spread">
      <main>
        <div className="kicker">Validity gate · one clarification</div>
        <h1>Do you mean the myth, or a real animal?</h1>
        <p className="lede">
          “How to feed unicorns” could be mythology, fiction-writing, or a claim that unicorns are
          livestock. Only the last is rejected.
        </p>
        <div className="actions">
          <button className="btn" type="button" onClick={() => go("diagnostic")}>
            Study the unicorn in myth
          </button>
          <button className="btn ghost" type="button" onClick={() => go("request-reject")}>
            Real-world animal care
          </button>
        </div>
      </main>
      <Guide>
        <p>One clarification. After you confirm an unsupported premise, the request is rejected.</p>
      </Guide>
    </div>
  );
}

function Reject({ go }: { go: VariantProps["go"] }) {
  return (
    <div className="spread">
      <main>
        <div className="kicker">Rejected Course Request</div>
        <h1>We cannot teach real-world unicorn care</h1>
        <p className="lede">
          That premise is not a documented animal-care subject. A safe reframe: study the unicorn as
          it appears in myth and art.
        </p>
        <p>This rejected request stays in your library. There is no appeal.</p>
        <div className="actions">
          <button className="btn" type="button" onClick={() => go("request")}>
            Revise request
          </button>
          <button className="btn ghost" type="button" onClick={() => go("home")}>
            Back to library
          </button>
        </div>
      </main>
      <Guide>
        <p>I can explain the decision. I cannot override it or keep the dangerous portion.</p>
      </Guide>
    </div>
  );
}

function Profile({
  state,
  setState,
  go,
}: Pick<VariantProps, "state" | "setState" | "go">) {
  return (
    <div className="spread">
      <main>
        <div className="kicker">Teaching Profile · Learner-level</div>
        <h1>How should Lessons be presented?</h1>
        <p className="lede">{profileIntro}</p>
        {profileQuestions.map((q) => (
          <section key={q.id}>
            <h2 style={{ fontSize: 22 }}>{q.prompt}</h2>
            <Choices
              options={q.options}
              value={state.profileQ[q.id]}
              onPick={(i) => setState({ profileQ: { ...state.profileQ, [q.id]: q.options[i] } })}
            />
          </section>
        ))}
        <div className="actions">
          <button className="btn" type="button" onClick={() => go("diagnostic")}>
            Save and continue
          </button>
          <button className="btn ghost" type="button" onClick={() => go("diagnostic")}>
            Skip remaining
          </button>
        </div>
      </main>
      <Guide>
        <p>
          These are needs and preferences, not a learning-style type. Sequence mode is chosen later
          on the Course, not here.
        </p>
      </Guide>
    </div>
  );
}

function Diagnostic({
  state,
  setState,
  go,
}: Pick<VariantProps, "state" | "setState" | "go">) {
  return (
    <div className="spread">
      <main>
        <div className="kicker">Starting Level · not a Quiz</div>
        <h1>Eight short knowledge checks</h1>
        <p className="lede">{honestyIntro}</p>
        {diagnosticItems.map((item, i) => (
          <section key={item.capability}>
            <div className="kicker">{item.capability}</div>
            <h2 style={{ fontSize: 22 }}>{item.stem}</h2>
            <Choices
              options={item.options}
              value={typeof state.diagnosticAnswers[i] === "number" ? state.diagnosticAnswers[i] : null}
              onPick={(n) => {
                const next = [...state.diagnosticAnswers];
                next[i] = n;
                setState({ diagnosticAnswers: next });
              }}
            />
            <button
              className="choice"
              type="button"
              onClick={() => {
                const next = [...state.diagnosticAnswers];
                next[i] = "idk";
                setState({ diagnosticAnswers: next });
              }}
            >
              I don’t know {state.diagnosticAnswers[i] === "idk" ? "✓" : ""}
            </button>
          </section>
        ))}
        <div className="actions">
          <button className="btn" type="button" onClick={() => go("remaining-gap")}>
            See remaining gap
          </button>
        </div>
      </main>
      <Guide>
        <p>
          Correct means evidenced knowledge only. Wrong, skip, and I don’t know all mean not
          evidenced. We never treat this as proof you can already play.
        </p>
      </Guide>
    </div>
  );
}

function Gap({ go }: { go: VariantProps["go"] }) {
  return (
    <div className="spread">
      <main>
        <div className="kicker">Starting Level</div>
        <h1>Where we would start</h1>
        <p className="lede">{remainingGapStatement}</p>
        <p>{coverageNote}</p>
        <div className="actions">
          <button className="btn" type="button" onClick={() => go("waiting-blueprint")}>
            Looks right
          </button>
          <button className="btn ghost" type="button" onClick={() => go("waiting-blueprint")}>
            This would be too easy
          </button>
        </div>
      </main>
      <Guide>
        <p>
          There is no “I’m more advanced” override. Too easy expands the remaining gap toward
          fundamentals.
        </p>
      </Guide>
    </div>
  );
}

function Ceiling({ go }: { go: VariantProps["go"] }) {
  return (
    <div className="spread">
      <main>
        <div className="kicker">Ceiling</div>
        <h1>This check looked easy — it still cannot certify the goal</h1>
        <p className="lede">
          You answered nearly everything. Playing Iris is still a performance goal this check cannot
          prove. We can propose a thin Blueprint, or you can revise the Learning Goal.
        </p>
        <div className="actions">
          <button className="btn" type="button" onClick={() => go("waiting-blueprint")}>
            Thin Blueprint
          </button>
          <button className="btn ghost" type="button" onClick={() => go("request")}>
            Revise Learning Goal
          </button>
        </div>
      </main>
      <Guide>
        <p>We will not auto-publish an empty Course, and we will not call this mastery.</p>
      </Guide>
    </div>
  );
}

function AssessFail({ go }: { go: VariantProps["go"] }) {
  return (
    <div className="spread">
      <main>
        <div className="kicker">Assessment failed</div>
        <h1>We could not build a reliable knowledge check</h1>
        <p className="lede">
          Retry the diagnostic only. We will not invent a Starting Level from self-report, and we
          will not offer a shortcut that looks like a completed diagnostic.
        </p>
        <div className="actions">
          <button className="btn" type="button" onClick={() => go("diagnostic")}>
            Retry diagnostic
          </button>
          <button className="btn ghost" type="button" onClick={() => go("home")}>
            Library
          </button>
        </div>
      </main>
      <Guide>
        <p>Policy owns this outcome. I can only present Retry diagnostic.</p>
      </Guide>
    </div>
  );
}

function Wait({
  kind,
  state,
  setState,
  go,
}: {
  kind: "blueprint" | "course";
  state: VariantProps["state"];
  setState: VariantProps["setState"];
  go: VariantProps["go"];
}) {
  const resume = state.canceled;
  return (
    <main className="page">
      <div className="kicker">{kind === "blueprint" ? "Preparing Blueprint" : "Generating Course"}</div>
      <h1>{resume ? "Paused — checkpoints kept" : kind === "blueprint" ? "Designing the remaining-gap sequence" : "Writing Lessons"}</h1>
      <p className="lede">
        {kind === "course"
          ? resume
            ? "Resume continues from the next unfinalized Lesson. No draft body is shown."
            : "Generating · Lesson 4 of 10 · Counting 4/4 out loud"
          : "Validating coverage, order, and Quiz placement. No Lesson drafts yet."}
      </p>
      <div className="progress-line">
        <span style={{ width: kind === "course" ? "40%" : "70%" }} />
      </div>
      <div className="actions">
        {!resume && (
          <button className="btn ghost" type="button" onClick={() => setState({ canceled: true })}>
            Cancel
          </button>
        )}
        {resume && (
          <button className="btn" type="button" onClick={() => setState({ canceled: false })}>
            Resume
          </button>
        )}
        <button
          className="btn"
          type="button"
          onClick={() => go(kind === "blueprint" ? "blueprint-review" : "course-home")}
        >
          Skip wait (prototype)
        </button>
      </div>
    </main>
  );
}

function Blueprint({
  state,
  setState,
  go,
}: Pick<VariantProps, "state" | "setState" | "go">) {
  const modules = [...new Set(blueprintSlots.map((s) => s.module))];
  return (
    <main className="page">
      <div className="kicker">Course Blueprint · review titles and Lesson goals</div>
      <h1>Drum kit fundamentals</h1>
      <p className="lede">
        Mark irrelevant if a Lesson does not belong on the path to your Learning Goal. You do not
        edit the structure directly.
      </p>
      {modules.map((mod) => (
        <section key={mod}>
          <h2>{mod}</h2>
          {blueprintSlots
            .filter((s) => s.module === mod)
            .map((s) => (
              <article
                key={s.id}
                className="doc-card"
                style={{ opacity: state.markedIrrelevant.includes(s.id) ? 0.4 : 1 }}
              >
                <div className="kicker">{s.method}</div>
                <h2 style={{ fontSize: 22 }}>{s.title}</h2>
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
              </article>
            ))}
        </section>
      ))}
      <h2>Sequence mode</h2>
      <p>Default is linear. Switching to free jump later is one-way; linear cannot be restored.</p>
      <Choices
        options={["Linear (default)", "Free jump"]}
        value={state.sequenceMode === "linear" ? 0 : 1}
        onPick={(i) => setState({ sequenceMode: i === 0 ? "linear" : "free-jump" })}
      />
      <div className="actions">
        <button className="btn" type="button" onClick={() => go("waiting-course")}>
          Approve Blueprint
        </button>
        <button className="btn ghost" type="button" onClick={() => go("home")}>
          Leave and come back
        </button>
      </div>
    </main>
  );
}

function GenFail({ go }: { go: VariantProps["go"] }) {
  return (
    <main className="page">
      <div className="kicker">Terminal fail</div>
      <h1>Lesson 4 could not be grounded</h1>
      <p className="lede">
        After bounded repair we still could not support the claims. Unpublished Lessons before this
        stay unplayable. Retry that Lesson, or revise the request.
      </p>
      <div className="actions">
        <button className="btn" type="button" onClick={() => go("waiting-course")}>
          Retry
        </button>
        <button className="btn ghost" type="button" onClick={() => go("request")}>
          Revise request
        </button>
      </div>
    </main>
  );
}

function Course({
  go,
  mode,
  setMode,
}: {
  go: VariantProps["go"];
  mode: string;
  setMode: (m: "linear" | "free-jump") => void;
}) {
  let module = "";
  return (
    <main className="page">
      <div className="kicker">Published Course · {mode}</div>
      <h1>Drum kit fundamentals</h1>
      <p className="lede">Play Iris by the Goo Goo Dolls</p>
      <div className="progress-line">
        <span style={{ width: "30%" }} />
      </div>
      <p>Progress 3 / 10 · completed Lessons only. Opening does not count.</p>
      {courseLessons.map((l) => {
        const head = l.module !== module;
        module = l.module;
        const locked = mode === "linear" && l.status === "locked";
        return (
          <div key={l.id}>
            {head && <h2>{l.module}</h2>}
            <button
              className={locked ? "doc-card locked" : "doc-card"}
              type="button"
              disabled={locked}
              onClick={() => go(l.method === "quiz" ? "quiz-taking" : "reading")}
            >
              <div className="kicker">
                {l.method} · {l.status}
              </div>
              <h2 style={{ fontSize: 20 }}>{l.title}</h2>
            </button>
          </div>
        );
      })}
      {mode === "linear" && (
        <div className="actions">
          <button className="btn ghost" type="button" onClick={() => setMode("free-jump")}>
            Course menu: switch to free jump (one-way; linear cannot be restored)
          </button>
        </div>
      )}
    </main>
  );
}

function Reading({
  state,
  setState,
  go,
}: Pick<VariantProps, "state" | "setState" | "go">) {
  const section = readingSections[state.readingSection];
  const last = state.readingSection >= readingSections.length - 1;
  return (
    <main className="page">
      <div className="kicker">Reading Lesson · Timekeeping</div>
      <h1>Counting 4/4 out loud</h1>
      <p className="lede">Count a bar of 4/4 with a steady quarter pulse.</p>
      <div className="media">
        <svg width="220" height="90" viewBox="0 0 220 90" aria-label="Quarter-note pulse diagram">
          <rect fill="#e8dcc6" width="220" height="90" />
          {[0, 1, 2, 3].map((n) => (
            <g key={n} transform={`translate(${30 + n * 48} 28)`}>
              <circle r="10" fill="#2b2118" />
              <text y="36" x="-4" fill="#2b2118" fontSize="14">
                {n + 1}
              </text>
            </g>
          ))}
        </svg>
        <p>A generated SVG pulse diagram — not a chart of Iris.</p>
      </div>
      <article>
        <section>
          <h2>{section.heading}</h2>
          {section.blocks.map((b) => (
            <p key={b}>{b}</p>
          ))}
        </section>
      </article>
      <div className="actions">
        {state.readingSection > 0 && (
          <button
            className="btn ghost"
            type="button"
            onClick={() => setState({ readingSection: state.readingSection - 1 })}
          >
            Previous section
          </button>
        )}
        {!last && (
          <button
            className="btn"
            type="button"
            onClick={() => setState({ readingSection: state.readingSection + 1 })}
          >
            Continue
          </button>
        )}
        {last && (
          <button
            className="btn"
            type="button"
            onClick={() => setState({ readingMarkedComplete: true })}
          >
            {state.readingMarkedComplete ? "Completed" : "Mark complete"}
          </button>
        )}
        {state.readingMarkedComplete && (
          <button className="btn ghost" type="button" onClick={() => go("course-home")}>
            Back to Course
          </button>
        )}
      </div>
      <div className="sources">
        {readingSources.map((s) => (
          <div key={s.n}>
            [{s.n}] {s.title}
          </div>
        ))}
      </div>
    </main>
  );
}

function Quiz({
  taking,
  state,
  setState,
  go,
}: Pick<VariantProps, "state" | "setState" | "go"> & { taking: boolean }) {
  const answered = state.quizAnswers.every((a) => a !== null);
  return (
    <main className="page">
      <div className="kicker">Quiz Lesson · untimed · open book</div>
      <h1>Timekeeping check</h1>
      <p className="lede">
        {taking
          ? "Answer every item, then Submit. Leaving keeps a draft. Completed Lessons stay revisitable."
          : "Best score 50% — Progress moves at 70%. Same items on retake."}
      </p>
      {quizItems.map((q, i) => {
        const pick = state.quizAnswers[i];
        const show = !taking && pick !== null;
        const right = pick === q.key;
        return (
          <section key={q.stem}>
            <h2 style={{ fontSize: 22 }}>
              {i + 1}. {q.stem}{" "}
              {show && <span className={right ? "ok" : "bad"}>{right ? "right" : "wrong"}</span>}
            </h2>
            <Choices
              options={q.options}
              value={pick}
              onPick={(n) => {
                if (!taking) return;
                const next = [...state.quizAnswers];
                next[i] = n;
                setState({ quizAnswers: next });
              }}
            />
            {show && state.showAnswerKey && pick !== q.key && <p>{q.why}</p>}
          </section>
        );
      })}
      <div className="actions">
        {taking && (
          <button className="btn" type="button" disabled={!answered} onClick={() => go("quiz-feedback")}>
            Submit
          </button>
        )}
        {!taking && (
          <>
            <button className="btn" type="button" onClick={() => go("quiz-taking")}>
              Retake in place
            </button>
            <button
              className="btn ghost"
              type="button"
              onClick={() => setState({ showAnswerKey: !state.showAnswerKey })}
            >
              {state.showAnswerKey ? "Hide" : "Show"} answer key
            </button>
            <button className="btn ghost" type="button" onClick={() => go("course-home")}>
              Back to Course
            </button>
          </>
        )}
      </div>
    </main>
  );
}
