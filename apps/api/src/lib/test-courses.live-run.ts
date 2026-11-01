import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { createDb, loadRootEnv } from "@senoy/db";

/**
 * Drives the Norse and Gram test Courses through the running product's API as a test Learner, the way the
 * 2026-11-01 run on SEN-113 was done by hand: Request → validity → focus → Starting Level ("I don't know" throughout)
 * → Blueprint → approve → generation → published. Then prints what each stage cost from `usage_records`, so a change
 * to the pipeline shows its before and after on a real Course (SEN-120).
 *
 * Needs `pnpm apps` (the API and the worker) running against the shared database, and in `.env`:
 * `TEST_LEARNER_EMAIL` and `TEST_LEARNER_PASSWORD` (a confirmed account; its Teaching Profile is saved with default
 * answers if it has none) and optionally `API_URL` (default `http://127.0.0.1:3000`). Billable: about $1.30 a Course
 * after SEN-120. Writes real published Courses to that Learner's Library. Not part of `pnpm test`.
 *
 * Usage: `pnpm run:test-courses:live [norse|gram|all] [output path relative to the repo root]`
 */

/** The two test Courses, with the subject and Learning Goal the 2026-11-01 runs used, verbatim (SEN-119). */
const COURSES = {
  norse: {
    subject: "Norse mythology",
    learningGoal: "Explain how the Norse sources picture the cosmos and its fate: Yggdrasil and the Nine Worlds, the Norns, Odin and the halls of the gods, the death of Baldr, and Ragnarök.",
  },
  gram: {
    subject: "Microbiology lab fundamentals",
    learningGoal: "Understand Gram staining and the lab basics around it: why Gram-positive and Gram-negative cell walls stain differently, the four reagent steps, reading a stained slide under the microscope, and the aseptic technique and culture methods that come before it.",
  },
} as const;

/** A step that calls a model may run for minutes; the Starting Level set has taken up to five. */
const STEP_TIMEOUT_MS = 15 * 60 * 1000;

/** How often, and how long, generation is polled. */
const POLL_MS = 20_000;
const GENERATION_LIMIT_MS = 90 * 60 * 1000;

/** The Request as the API returns it. */
type RequestView = { id: string; status: string; failureReason: string | null };

/** What `GET /blueprint` says about a running generation. */
type GenerationView = { status: string; stage: string | null; lessonNumber: number | null; lessonTitle: string | null; finishedLessons: number; totalLessons: number } | null;

/** One stage's spend, from the Usage Records under the Request's Pipeline Events. */
type StageCost = { kind: string; who: string; calls: number; usd: number };

/**
 * A signed-in HTTP client that keeps the session cookies the API sets and renews.
 * @param baseUrl - The API's origin
 */
function createClient(baseUrl: string) {
  const jar = new Map<string, string>();

  /** Remembers every cookie a response sets. */
  const keep = (response: Response) => {
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const at = pair?.indexOf("=") ?? -1;
      if (pair && at > 0) jar.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
    }
  };

  return {
    /**
     * Sends one JSON request and parses the JSON reply (null for an empty one).
     * @param method - HTTP method
     * @param path - Path under the API's origin
     * @param body - JSON body, if any
     */
    async call<T = unknown>(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<{ status: number; json: T }> {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
          ...(jar.size ? { cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; ") } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(STEP_TIMEOUT_MS),
      });
      keep(response);
      const text = await response.text();
      return { status: response.status, json: (text ? JSON.parse(text) : null) as T };
    },
  };
}

/**
 * Expects one of the given statuses on a reply, else stops with the API's error.
 * @param reply - The reply
 * @param allowed - Acceptable HTTP statuses
 * @param step - What was being done, for the error
 */
function expect<T>(reply: { status: number; json: T }, allowed: number[], step: string): T {
  if (!allowed.includes(reply.status)) {
    const detail = reply.json && typeof reply.json === "object" && "error" in reply.json ? String((reply.json as { error: unknown }).error) : "";
    throw new Error(`[test-courses.live-run.ts: ${step}] Unexpected status || status=${reply.status} || ${detail}`);
  }
  return reply.json;
}

/** Waits. */
const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/**
 * Sums a Request's Usage Records per step kind and caller, walking nested Pipeline Events (SEN-119's query).
 * @param requestId - The Course Request
 */
async function costOf(requestId: string): Promise<{ stages: StageCost[]; totalUsd: number; calls: number }> {
  const db = createDb(process.env.DATABASE_URL!, { max: 1 });
  try {
    const rows = await db.execute(sql`
      with recursive tree as (
        select id, course_request_id, kind from pipeline_events where parent_id is null
        union all
        select e.id, coalesce(t.course_request_id, e.course_request_id), e.kind
        from pipeline_events e join tree t on e.parent_id = t.id
      )
      select t.kind, case when u.vendor <> 'openrouter' then u.vendor when u.role = 'judge' then 'judge' else 'author' end as who,
        count(*)::int as calls, round(sum(u.cost_usd)::numeric, 4) as usd
      from usage_records u join tree t on t.id = u.pipeline_event_id
      where t.course_request_id = ${requestId}::uuid
      group by 1, 2 order by 1, 2`);
    const stages = [...rows].map((row) => ({ kind: String(row.kind), who: String(row.who), calls: Number(row.calls), usd: Number(row.usd) }));
    return {
      stages,
      totalUsd: Math.round(stages.reduce((sum, stage) => sum + stage.usd, 0) * 10000) / 10000,
      calls: stages.reduce((sum, stage) => sum + stage.calls, 0),
    };
  } finally {
    await db.$client.end();
  }
}

/**
 * Runs one test Course end to end and returns what happened and what it cost.
 * @param client - The signed-in client
 * @param name - Which Course
 */
async function runCourse(client: ReturnType<typeof createClient>, name: keyof typeof COURSES) {
  const course = COURSES[name];
  const startedAt = new Date();
  const timeline: { at: string; status: string; note?: string }[] = [];
  const note = (status: string, extra?: string) => {
    timeline.push({ at: new Date().toISOString(), status, ...(extra ? { note: extra } : {}) });
    process.stdout.write(`  ${new Date().toISOString().slice(11, 19)}  ${status}${extra ? ` · ${extra}` : ""}\n`);
  };
  process.stdout.write(`\n${name}: "${course.subject}"\n`);

  // The Request; the Teaching Profile is saved with default answers if the account has none.
  let created = await client.call<{ courseRequest: RequestView; error?: string }>("POST", "/api/course-requests", course);
  if (created.status === 409 && /Teaching Profile/.test(created.json?.error ?? "")) {
    expect(await client.call("PUT", "/api/teaching-profile", { answers: {} }), [200], "teaching profile");
    created = await client.call("POST", "/api/course-requests", course);
  }
  let request = expect(created, [201], "create").courseRequest;
  const id = request.id;
  note(request.status, `request ${id}`);

  request = expect(await client.call<{ courseRequest: RequestView }>("POST", `/api/course-requests/${id}/validity`, {}), [200], "validity").courseRequest;
  note(request.status);
  assert.equal(request.status, "validity_passed", `Validity did not pass: ${request.failureReason ?? request.status}`);

  request = expect(await client.call<{ courseRequest: RequestView }>("POST", `/api/course-requests/${id}/focus`, {}), [200], "focus").courseRequest;
  note(request.status);
  if (request.status !== "goal_focused") {
    // The 2026-11-01 goals were precise and passed straight through; a broad reading is skipped as a deliberate overview.
    request = expect(await client.call<{ courseRequest: RequestView }>("POST", `/api/course-requests/${id}/focus/skip`, {}), [200], "focus skip").courseRequest;
    note(request.status, "focusing skipped: the goal was not read as precise this time");
  }

  const prepared = expect(await client.call<{ courseRequest: RequestView; diagnostic: { items: { id: string }[] } | null }>(
    "POST", `/api/course-requests/${id}/diagnostic`, {},
  ), [200], "diagnostic");
  request = prepared.courseRequest;
  note(request.status, prepared.diagnostic ? `${prepared.diagnostic.items.length} items` : request.failureReason ?? undefined);
  assert.ok(prepared.diagnostic, `The Starting Level check was not prepared: ${request.failureReason ?? request.status}`);

  const answers = Object.fromEntries(prepared.diagnostic.items.map((item) => [item.id, "dont_know"]));
  request = expect(await client.call<{ courseRequest: RequestView }>("POST", `/api/course-requests/${id}/diagnostic/answers`, { answers }), [200], "answers").courseRequest;
  note(request.status, "answered I don't know throughout");
  request = expect(await client.call<{ courseRequest: RequestView }>("POST", `/api/course-requests/${id}/diagnostic/confirm`, { choice: "looks_right" }), [200], "confirm").courseRequest;
  note(request.status);

  request = expect(await client.call<{ courseRequest: RequestView }>("POST", `/api/course-requests/${id}/blueprint`, {}), [202], "blueprint").courseRequest;
  note(request.status);
  const designStart = Date.now();
  while (request.status === "blueprint_preparing") {
    await sleep(10_000);
    request = expect(await client.call<{ courseRequest: RequestView }>("GET", `/api/course-requests/${id}/blueprint`), [200], "blueprint poll").courseRequest;
    assert.ok(Date.now() - designStart < STEP_TIMEOUT_MS, "The Blueprint took too long to design.");
  }
  note(request.status, request.failureReason ?? undefined);
  assert.equal(request.status, "blueprint_review", `No Blueprint to review: ${request.failureReason ?? request.status}`);

  request = expect(await client.call<{ courseRequest: RequestView }>("POST", `/api/course-requests/${id}/blueprint/approve`, { sequenceMode: "linear" }), [200], "approve").courseRequest;
  note(request.status);

  const generationStart = Date.now();
  let lastSeen = "";
  while (request.status === "generating") {
    await sleep(POLL_MS);
    const view = expect(await client.call<{ courseRequest: RequestView; generation: GenerationView }>("GET", `/api/course-requests/${id}/blueprint`), [200], "generation poll");
    request = view.courseRequest;
    const seen = view.generation ? `${view.generation.stage ?? view.generation.status} ${view.generation.finishedLessons}/${view.generation.totalLessons}${view.generation.lessonTitle ? ` · ${view.generation.lessonTitle}` : ""}` : "";
    if (seen && seen !== lastSeen) note("generating", seen);
    lastSeen = seen;
    assert.ok(Date.now() - generationStart < GENERATION_LIMIT_MS, "Generation took too long.");
  }
  note(request.status, request.failureReason ?? undefined);

  const cost = await costOf(id);
  const minutes = Math.round((Date.now() - startedAt.getTime()) / 6000) / 10;
  process.stdout.write(`  ${name}: ${request.status} in ${minutes} min · ${cost.calls} calls · $${cost.totalUsd.toFixed(2)}\n`);
  for (const stage of cost.stages) process.stdout.write(`    ${stage.kind.padEnd(18)} ${stage.who.padEnd(9)} ${String(stage.calls).padStart(3)}  $${stage.usd.toFixed(3)}\n`);
  return { name, ...course, requestId: id, startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), minutes, finalStatus: request.status, failureReason: request.failureReason, timeline, cost };
}

async function runTestCourses() {
  const root = loadRootEnv(import.meta.url, 4);
  const which = process.argv[2] ?? "all";
  const outPath = resolve(root, process.argv[3] ?? `docs/research/sen-120-test-course-runs-${new Date().toISOString().slice(0, 10)}.json`);
  const { TEST_LEARNER_EMAIL, TEST_LEARNER_PASSWORD, DATABASE_URL } = process.env;
  assert.ok(TEST_LEARNER_EMAIL && TEST_LEARNER_PASSWORD, "TEST_LEARNER_EMAIL and TEST_LEARNER_PASSWORD are required for the test-Course run.");
  assert.ok(DATABASE_URL, "DATABASE_URL is required to read what the run cost.");
  const names = which === "all" ? (Object.keys(COURSES) as (keyof typeof COURSES)[]) : [which as keyof typeof COURSES];
  assert.ok(names.every((name) => name in COURSES), `Unknown Course "${which}"; choose norse, gram or all.`);
  const baseUrl = (process.env.API_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");

  const client = createClient(baseUrl);
  const health = await client.call("GET", "/api/health").catch(() => null);
  assert.ok(health?.status === 200, `No API at ${baseUrl}; start it with pnpm apps.`);
  expect(await client.call("POST", "/api/auth/sign-in", { email: TEST_LEARNER_EMAIL, password: TEST_LEARNER_PASSWORD }), [204], "sign-in");
  const me = expect(await client.call<{ displayName: string; email: string | null }>("GET", "/api/me"), [200], "me");
  process.stdout.write(`Signed in as ${me.displayName} (${me.email ?? "no email"}) at ${baseUrl}\n`);

  const runs = [];
  for (const name of names) runs.push(await runCourse(client, name));
  await writeFile(outPath, `${JSON.stringify({ ranAt: new Date().toISOString(), apiUrl: baseUrl, runs }, null, 2)}\n`);
  process.stdout.write(`\nWrote ${outPath}\n`);
  const failed = runs.filter((run) => run.finalStatus !== "published");
  assert.equal(failed.length, 0, `Not published: ${failed.map((run) => `${run.name} (${run.failureReason ?? run.finalStatus})`).join(", ")}`);
  process.stdout.write("Test-Course run finished; both published.\n".replace("both", runs.length === 1 ? "it" : "both"));
}

await runTestCourses();
