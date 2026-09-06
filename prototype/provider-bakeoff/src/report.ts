import type { BakeoffRun, CaseRun, ModelName, ProviderRun } from "./types.ts";

function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function money(n: number): string {
  return `$${n.toFixed(4)}`;
}

function tally(run: ProviderRun) {
  let readingCode = 0;
  let quizCode = 0;
  let readingJudge = 0;
  let quizJudge = 0;
  let retries = 0;
  let cost = 0;
  let latency = 0;
  let judgeFails = 0;
  for (const c of run.cases) {
    for (const art of [c.reading, c.quiz]) {
      retries += Math.max(0, art.attempts.length - 1);
      cost += art.attempts.reduce((s, a) => s + a.costUsd, 0) + art.judgeCostUsd;
      latency +=
        art.attempts.reduce((s, a) => s + a.latencyMs, 0) + art.judgeLatencyMs;
      const last = art.attempts.at(-1);
      if (art.kind === "reading") {
        if (last?.code.pass) readingCode += 1;
        if (art.judge?.pass) readingJudge += 1;
      } else {
        if (last?.code.pass) quizCode += 1;
        if (art.judge?.pass) quizJudge += 1;
      }
      judgeFails += art.judge?.failures.length ?? 0;
    }
  }
  return {
    readingCode,
    quizCode,
    readingJudge,
    quizJudge,
    retries,
    cost,
    latency,
    judgeFails,
    n: run.cases.length,
  };
}

function pill(ok: boolean | null): string {
  if (ok === null) return `<span class="pill muted">n/a</span>`;
  return ok
    ? `<span class="pill pass">pass</span>`
    : `<span class="pill fail">fail</span>`;
}

function readingHtml(c: CaseRun, which: ModelName): string {
  const art = c.reading;
  const last = art.attempts.at(-1);
  const lesson = art.accepted as
    | {
        title: string;
        lessonGoal: string;
        sections: { heading: string; prose: string }[];
      }
    | null;
  const body = lesson
    ? `<h4>${esc(lesson.title)}</h4><p class="muted">${esc(lesson.lessonGoal)}</p>${lesson.sections
        .map((s) => `<h5>${esc(s.heading)}</h5><p>${esc(s.prose)}</p>`)
        .join("")}`
    : `<p class="fail">No accepted reading.</p>`;
  const issues =
    last?.code.issues
      .map((i) => `<li>${esc(i.check)}: ${esc(i.detail)}</li>`)
      .join("") ?? "";
  const failures =
    art.judge?.failures
      .map((f) => `<li>${esc(f.check)}: ${esc(f.detail)}</li>`)
      .join("") ?? "";
  return `<article>
    <header>
      <strong>${which}</strong>
      Code ${pill(last?.code.pass ?? false)}
      Judge ${pill(art.judge?.pass ?? null)}
      <span class="muted">${art.attempts.length} attempt(s) · ${money(art.attempts.reduce((s, a) => s + a.costUsd, 0) + art.judgeCostUsd)} · ${Math.round((last?.latencyMs ?? 0) / 1000)}s gen</span>
    </header>
    ${body}
    ${issues ? `<p>Code issues</p><ul>${issues}</ul>` : ""}
    ${failures ? `<p>Judge failures</p><ul>${failures}</ul>` : ""}
    ${art.judge ? `<p class="muted">clarity ${art.judge.clarity} · usefulness ${art.judge.usefulness} · level fit ${art.judge.levelFit}<br>${esc(art.judge.notes)}</p>` : ""}
  </article>`;
}

function quizHtml(c: CaseRun, which: ModelName): string {
  const art = c.quiz;
  const last = art.attempts.at(-1);
  const quiz = art.accepted as
    | { items: { prompt: string; options: string[]; correctIndex: number }[] }
    | null;
  const body = quiz
    ? quiz.items
        .map(
          (item, i) =>
            `<div class="q"><p><strong>Q${i + 1}.</strong> ${esc(item.prompt)}</p><ol>${item.options
              .map(
                (o, oi) =>
                  `<li class="${oi === item.correctIndex ? "correct" : ""}">${esc(o)}</li>`,
              )
              .join("")}</ol></div>`,
        )
        .join("")
    : `<p class="fail">No accepted quiz.</p>`;
  const issues =
    last?.code.issues
      .map((i) => `<li>${esc(i.check)}: ${esc(i.detail)}</li>`)
      .join("") ?? "";
  const failures =
    art.judge?.failures
      .map((f) => `<li>${esc(f.check)}: ${esc(f.detail)}</li>`)
      .join("") ?? "";
  return `<article>
    <header>
      <strong>${which}</strong>
      Code ${pill(last?.code.pass ?? false)}
      Judge ${pill(art.judge?.pass ?? null)}
    </header>
    ${body}
    ${issues ? `<ul>${issues}</ul>` : ""}
    ${failures ? `<ul>${failures}</ul>` : ""}
    ${art.judge ? `<p class="muted">${esc(art.judge.notes)}</p>` : ""}
  </article>`;
}

export function renderHtml(run: BakeoffRun): string {
  const primary = tally(run.deepseek);
  const fallback = tally(run.terra);
  const rows = run.deepseek.cases
    .map((primaryCase) => {
      const fallbackCase = run.terra.cases.find((x) => x.caseId === primaryCase.caseId);
      if (!fallbackCase) return "";
      return `<section>
        <h2>${esc(primaryCase.caseId)}</h2>
        <h3>Reading</h3>
        <div class="pair">${readingHtml(primaryCase, "deepseek")}${readingHtml(fallbackCase, "terra")}</div>
        <h3>Quiz</h3>
        <div class="pair">${quizHtml(primaryCase, "deepseek")}${quizHtml(fallbackCase, "terra")}</div>
      </section>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<meta charset="utf-8"/>
<title>Provider bakeoff — DeepSeek vs Terra</title>
<style>
  :root { color-scheme: dark; }
  body { font: 15px/1.45 ui-sans-serif, system-ui; margin: 0; background: #111; color: #eee; }
  main { max-width: 1200px; margin: 0 auto; padding: 24px; }
  h1 { font-size: 22px; font-weight: 600; }
  h2 { font-size: 18px; margin-top: 32px; }
  h3 { font-size: 15px; color: #bbb; }
  table { border-collapse: collapse; width: 100%; margin: 16px 0 24px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #333; }
  th { color: #999; font-weight: 500; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  article { background: #1a1a1a; border: 1px solid #2a2a2a; padding: 16px; }
  .pill { display: inline-block; padding: 1px 8px; border: 1px solid #444; font-size: 12px; }
  .pass { color: #9d9; border-color: #363; }
  .fail { color: #f99; border-color: #633; }
  .muted { color: #888; font-size: 13px; }
  .correct { font-weight: 600; }
  ol { padding-left: 18px; }
  @media (max-width: 800px) { .pair { grid-template-columns: 1fr; } }
</style>
<main>
  <h1>Provider bakeoff: DeepSeek vs Terra</h1>
  <p class="muted">Throwaway prototype for the Generator default. Same fixtures, prompts, schemas, and Code checks. Judge checks are the other model. DeepSeek stays primary unless Terra shows a clear, material quality advantage. OpenRouter is the phone line, not a product Provider.</p>
  <table>
    <thead><tr><th></th><th>DeepSeek ${esc(run.deepseek.model)}</th><th>Terra ${esc(run.terra.model)}</th></tr></thead>
    <tbody>
      <tr><td>Reading Code pass</td><td>${primary.readingCode}/${primary.n}</td><td>${fallback.readingCode}/${fallback.n}</td></tr>
      <tr><td>Quiz Code pass</td><td>${primary.quizCode}/${primary.n}</td><td>${fallback.quizCode}/${fallback.n}</td></tr>
      <tr><td>Reading Judge pass</td><td>${primary.readingJudge}/${primary.n}</td><td>${fallback.readingJudge}/${fallback.n}</td></tr>
      <tr><td>Quiz Judge pass</td><td>${primary.quizJudge}/${primary.n}</td><td>${fallback.quizJudge}/${fallback.n}</td></tr>
      <tr><td>Judge failure notes</td><td>${primary.judgeFails}</td><td>${fallback.judgeFails}</td></tr>
      <tr><td>Schema retries</td><td>${primary.retries}</td><td>${fallback.retries}</td></tr>
      <tr><td>Total cost</td><td>${money(primary.cost)}</td><td>${money(fallback.cost)}</td></tr>
      <tr><td>Wall time (sum of calls)</td><td>${(primary.latency / 1000).toFixed(1)}s</td><td>${(fallback.latency / 1000).toFixed(1)}s</td></tr>
    </tbody>
  </table>
  ${rows}
  <p class="muted">Run ${esc(run.startedAt)} → ${esc(run.finishedAt)}</p>
</main>
</html>`;
}
