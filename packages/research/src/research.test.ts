import assert from "node:assert/strict";
import { test } from "node:test";
import { researchAdaptersFromEnv } from "./adapters/index.ts";
import { parallelProAdapter } from "./adapters/parallel-pro.ts";
import { youResearchAdapter } from "./adapters/you-research.ts";
import { applyHostPolicy } from "./host-policy.ts";
import { runResearch } from "./research.ts";
import { sourceIdFor } from "./source-id.ts";
import type { ResearchAdapter, VendorResult } from "./types.ts";
import { pinWikipediaRevisions } from "./wikipedia.ts";

const ENV = { PARALLEL_PRO_API_KEY: "secret-parallel", YOU_DOT_COM_API_KEY: "secret-you" };
const TOPIC = "Yggdrasil and the Nine Worlds in Norse cosmology";

/** A fake adapter that answers with `result`, or calls it when it is a function. */
function fakeAdapter(
  id: ResearchAdapter["id"],
  envKey: string,
  result: VendorResult | ((signal: AbortSignal, apiKey: string) => Promise<VendorResult>),
): ResearchAdapter {
  return {
    id, envKey, estimatedCostUsd: id === "parallel-pro" ? 0.1 : 0.05, timeoutMs: 50,
    research: async (_topic, { signal, apiKey }) => (typeof result === "function" ? result(signal, apiKey) : result),
  };
}

/** A fetch that answers Wikipedia revision lookups with revid 42 per title, and fails anything else. */
const wikipediaFetch: typeof fetch = async (input) => {
  const url = new URL(String(input));
  if (url.pathname !== "/w/api.php") throw new Error(`Unexpected fetch ${url}`);
  const titles = url.searchParams.get("titles")!.split("|");
  return Response.json({
    query: {
      redirects: titles.includes("World tree") ? [{ from: "World tree", to: "Yggdrasil" }] : [],
      pages: titles.map((title) => ({ title: title === "World tree" ? "Yggdrasil" : title, revisions: [{ revid: 42 }] })),
    },
  });
};

const primaryResult: VendorResult = {
  requestId: "trun_1",
  summary: "Parallel report",
  sources: [
    { url: "https://www.pinterest.com/pin/123", title: "Pin", excerpts: ["x"] },
    { url: "https://voluspa.org/voluspa.htm", title: "Völuspá", excerpts: ["An ash I know"] },
    { url: "https://en.wikipedia.org/wiki/Norse_cosmology", title: "Norse cosmology", excerpts: ["Norse cosmology is…"] },
    { url: "https://en.wikipedia.org/wiki/Norse_cosmology#Worlds", title: "Norse cosmology", excerpts: ["Norse cosmology is…", "Nine worlds"] },
  ],
};
const secondaryResult: VendorResult = {
  requestId: "you_1",
  summary: "You.com report",
  sources: [
    { url: "https://en.wikipedia.org/wiki/Norse_cosmology", title: "Norse cosmology", excerpts: ["Snippet"] },
    { url: "https://www.britannica.com/topic/Niflheim", title: null, excerpts: [] },
  ],
};

test("Source ID names the page: scheme, www, fragment, tracking params, trailing slash and Wikipedia revision don't change it", () => {
  const id = sourceIdFor("https://www.britannica.com/topic/Yggdrasil");
  assert.match(id, /^src_[0-9a-f]{10}$/);
  for (const same of [
    "http://britannica.com/topic/Yggdrasil/",
    "https://www.britannica.com/topic/Yggdrasil#section",
    "https://www.britannica.com/topic/Yggdrasil?utm_source=x&fbclid=y",
  ]) assert.equal(sourceIdFor(same), id, same);
  assert.equal(
    sourceIdFor("https://en.wikipedia.org/w/index.php?title=Norse_cosmology&oldid=42"),
    sourceIdFor("https://en.wikipedia.org/wiki/Norse_cosmology"),
  );
  assert.notEqual(sourceIdFor("https://www.britannica.com/topic/Niflheim"), id);
  assert.notEqual(sourceIdFor("https://example.org/page?id=1"), sourceIdFor("https://example.org/page?id=2"));
});

test("Host policy drops denylisted hosts and subdomains, keeps YouTube, and ranks preferred hosts first in vendor order", () => {
  const { kept, filteredOut } = applyHostPolicy([
    { url: "https://www.youtube.com/watch?v=1" },
    { url: "https://uk.pinterest.com/pin/1" },
    { url: "https://kids.britannica.com/a" },
    { url: "https://voluspa.org/" },
    { url: "https://en.wikipedia.org/wiki/Odin" },
  ]);
  assert.deepEqual(kept.map((item) => item.url), [
    "https://kids.britannica.com/a",
    "https://en.wikipedia.org/wiki/Odin",
    "https://www.youtube.com/watch?v=1",
    "https://voluspa.org/",
  ]);
  assert.deepEqual(filteredOut, [{ url: "https://uk.pinterest.com/pin/1", host: "uk.pinterest.com", rule: "denylist" }]);
});

test("Both packs research the same topic; shared pages share a Source ID and pinned Wikipedia URL", async () => {
  const topics: string[] = [];
  const primary = fakeAdapter("parallel-pro", "PARALLEL_PRO_API_KEY", primaryResult);
  const secondary = fakeAdapter("you-research", "YOU_DOT_COM_API_KEY", secondaryResult);
  primary.research = async (topic) => (topics.push(topic), primaryResult);
  secondary.research = async (topic) => (topics.push(topic), secondaryResult);
  const [p, s] = await runResearch(`  ${TOPIC} `, { primary, secondary, env: ENV, fetch: wikipediaFetch });
  assert.deepEqual(topics, [TOPIC, TOPIC]);

  assert.equal(p.status, "ok");
  assert.equal(p.slot, "primary");
  assert.equal(p.adapter, "parallel-pro");
  assert.equal(p.vendorRequestId, "trun_1");
  assert.equal(p.vendorSummary, "Parallel report");
  assert.equal(p.estimatedCostUsd, 0.1);
  assert.deepEqual(p.filteredOut.map((f) => f.host), ["pinterest.com"]);
  assert.deepEqual(p.sources.map((src) => src.host), ["en.wikipedia.org", "voluspa.org"]);
  const [wiki] = p.sources;
  assert.equal(wiki!.url, "https://en.wikipedia.org/w/index.php?title=Norse_cosmology&oldid=42");
  assert.equal(wiki!.preferred, true);
  assert.equal(wiki!.excerptOrigin, "vendor");
  assert.deepEqual(wiki!.excerpts, [
    { id: `${wiki!.sourceId}#1`, text: "Norse cosmology is…" },
    { id: `${wiki!.sourceId}#2`, text: "Nine worlds" },
  ]);
  assert.ok(Date.parse(wiki!.retrievedAt));

  assert.equal(s.status, "ok");
  assert.equal(s.sources[0]!.sourceId, wiki!.sourceId);
  assert.equal(s.sources[0]!.url, wiki!.url);
  assert.equal(s.sources[1]!.title, "britannica.com");
  assert.deepEqual(s.sources[1]!.excerpts, []);
});

test("Empty packs say why: vendor found nothing vs Host policy dropped everything", async () => {
  const [p, s] = await runResearch(TOPIC, {
    primary: fakeAdapter("parallel-pro", "PARALLEL_PRO_API_KEY", { sources: [], summary: null, requestId: null }),
    secondary: fakeAdapter("you-research", "YOU_DOT_COM_API_KEY", {
      sources: [{ url: "https://pinterest.com/x", title: "x", excerpts: [] }], summary: null, requestId: null,
    }),
    env: ENV, fetch: wikipediaFetch,
  });
  assert.equal(p.status, "empty_vendor");
  assert.equal(s.status, "empty_filtered");
  assert.equal(s.filteredOut.length, 1);
});

test("A timed-out or failing call yields its own pack without the key; the other pack is unaffected", async () => {
  const [p, s] = await runResearch(TOPIC, {
    primary: fakeAdapter("parallel-pro", "PARALLEL_PRO_API_KEY", (signal) => new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason));
    })),
    secondary: fakeAdapter("you-research", "YOU_DOT_COM_API_KEY", async (_signal, apiKey) => {
      throw new Error(`401 for key ${apiKey}`);
    }),
    env: ENV, fetch: wikipediaFetch,
  });
  assert.equal(p.status, "timed_out");
  assert.equal(p.estimatedCostUsd, 0);
  assert.equal(s.status, "error");
  assert.match(s.error!, /\[redacted\]/);
  assert.ok(!JSON.stringify([p, s]).includes("secret-"));
});

test("A missing key fails before any vendor is called", async () => {
  let called = false;
  const adapter = fakeAdapter("you-research", "YOU_DOT_COM_API_KEY", async () => ((called = true), primaryResult));
  await assert.rejects(
    runResearch(TOPIC, { primary: { ...adapter, id: "parallel-pro", envKey: "PARALLEL_PRO_API_KEY" }, secondary: adapter,
      env: { YOU_DOT_COM_API_KEY: "k" } }),
    /PARALLEL_PRO_API_KEY/,
  );
  assert.equal(called, false);
});

test("Config picks one adapter per slot and refuses unknown ids or the same engine twice", () => {
  const defaults = researchAdaptersFromEnv({});
  assert.equal(defaults.primary.id, "parallel-pro");
  assert.equal(defaults.secondary.id, "you-research");
  assert.throws(() => researchAdaptersFromEnv({ PRIMARY_RESEARCH_ADAPTER: "exa-agent" }), /Unknown research adapter/);
  assert.throws(() => researchAdaptersFromEnv({ SECONDARY_RESEARCH_ADAPTER: "parallel-pro" }), /different engines/);
});

test("Parallel adapter creates a pro run, reads its result, and flattens basis citations", async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    if (init?.method === "POST") return Response.json({ run_id: "trun_9", status: "queued" }, { status: 202 });
    return Response.json({
      run: { run_id: "trun_9", status: "completed" },
      output: {
        type: "text", content: "# Report",
        basis: [{ field: "output", citations: [
          { url: "https://voluspa.org/", title: "Völuspá", excerpts: ["An ash I know", ""] },
          { url: "https://en.wikipedia.org/wiki/Yggdrasil", title: null, excerpts: null },
        ] }],
      },
    });
  };
  const result = await parallelProAdapter.research(TOPIC, { apiKey: "k", fetch: fetchImpl, signal: new AbortController().signal });
  assert.equal(JSON.parse(String(requests[0]!.init!.body)).processor, "pro");
  assert.equal((requests[0]!.init!.headers as Record<string, string>)["x-api-key"], "k");
  assert.match(requests[1]!.url, /\/v1\/tasks\/runs\/trun_9\/result\?timeout=600$/);
  assert.deepEqual(result, {
    requestId: "trun_9", summary: "# Report",
    sources: [
      { url: "https://voluspa.org/", title: "Völuspá", excerpts: ["An ash I know"] },
      { url: "https://en.wikipedia.org/wiki/Yggdrasil", title: null, excerpts: [] },
    ],
  });
});

test("Parallel adapter fails when the run did not complete", async () => {
  const fetchImpl: typeof fetch = async (_input, init) =>
    init?.method === "POST" ? Response.json({ run_id: "trun_9" }) : Response.json({ run: { status: "failed" } });
  await assert.rejects(
    parallelProAdapter.research(TOPIC, { apiKey: "k", fetch: fetchImpl, signal: new AbortController().signal }),
    /did not complete/,
  );
});

test("You.com adapter makes one standard Research call and reads sources, snippets, and x-request-id", async () => {
  let body: unknown;
  const fetchImpl: typeof fetch = async (_input, init) => {
    body = JSON.parse(String(init!.body));
    return Response.json(
      { output: { content: "Report", content_type: "text", sources: [{ url: "https://britannica.com/a", title: "A", snippets: ["s"] }] } },
      { headers: { "x-request-id": "req-1" } },
    );
  };
  const result = await youResearchAdapter.research(TOPIC, { apiKey: "k", fetch: fetchImpl, signal: new AbortController().signal });
  assert.deepEqual(body, { input: TOPIC, research_effort: "standard" });
  assert.deepEqual(result, { requestId: "req-1", summary: "Report", sources: [{ url: "https://britannica.com/a", title: "A", excerpts: ["s"] }] });
});

test("Vendor HTTP errors carry status and body, not the key", async () => {
  const fetchImpl: typeof fetch = async () => new Response("bad key", { status: 401 });
  await assert.rejects(
    youResearchAdapter.research(TOPIC, { apiKey: "k-secret", fetch: fetchImpl, signal: new AbortController().signal }),
    (error: Error) => /status=401/.test(error.message) && !error.message.includes("k-secret"),
  );
});

test("Wikipedia pinning follows redirects and keeps the live URL with a warning when the lookup fails", async () => {
  const pinned = await pinWikipediaRevisions(
    ["https://en.wikipedia.org/wiki/World_tree", "https://voluspa.org/"],
    wikipediaFetch,
  );
  assert.deepEqual([...pinned.stableByUrl], [
    ["https://en.wikipedia.org/wiki/World_tree", "https://en.wikipedia.org/w/index.php?title=Yggdrasil&oldid=42"],
  ]);
  const failed = await pinWikipediaRevisions(["https://en.wikipedia.org/wiki/Odin"], async () => new Response("", { status: 503 }));
  assert.equal(failed.stableByUrl.size, 0);
  assert.match(failed.warnings[0]!, /lookup failed/);
});
