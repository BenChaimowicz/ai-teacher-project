import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSetupReader, parseEndpoints } from "./setup.ts";

/** An OpenRouter endpoint as its API lists it. */
const endpoint = (provider: string, prompt: string, supported: string[]) => ({
  provider_name: provider,
  tag: `${provider.toLowerCase()}/fp8`,
  pricing: { prompt, completion: "0.000002" },
  supported_parameters: supported,
  uptime_last_30m: 99.5,
  latency_last_30m: 1200,
  throughput_last_30m: 40,
});

describe("parseEndpoints", () => {
  it("prices per million tokens, cheapest first, and marks hosts that accept our parameters", () => {
    const rows = parseEndpoints({
      data: {
        endpoints: [
          endpoint("Alibaba", "0.000001416", ["response_format", "reasoning"]),
          endpoint("StreamLake", "0.000000216", ["response_format", "reasoning"]),
          endpoint("Relace", "0.0000009", ["reasoning"]),
        ],
      },
    });
    assert.deepEqual(rows.map((row) => [row.provider, row.promptUsdPerMTok, row.servesOurCalls]), [
      ["StreamLake", 0.216, true],
      ["Relace", 0.9, false],
      ["Alibaba", 1.416, true],
    ]);
    assert.equal(rows[0]!.completionUsdPerMTok, 2);
  });

  it("rejects a body with no list", () => {
    assert.throws(() => parseEndpoints({ data: {} }), /no endpoint list/);
  });
});

describe("createSetupReader", () => {
  it("lists every configured role, its hosts, and the research vendors; caches host lists", async () => {
    const urls: string[] = [];
    const fakeFetch = (async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ data: { endpoints: [endpoint("OpenAI", "0.0000001", ["response_format", "reasoning"])] } }));
    }) as unknown as typeof fetch;
    const read = createSetupReader({ env: { GENERATOR_MODEL: "a/x" }, fetch: fakeFetch });
    const setup = await read();
    assert.deepEqual(setup.models.map((model) => model.role), [
      "generator", "generator_fallback", "lesson_generator", "lesson_generator_fallback", "judge", "judge_fallback", "triage",
    ]);
    assert.equal(setup.models[0]!.modelId, "a/x");
    assert.deepEqual(setup.models[0]!.preferredProviders, []);
    assert.equal(setup.models[0]!.endpoints?.[0]?.provider, "OpenAI");
    assert.deepEqual(setup.research.map((entry) => [entry.tier, entry.slot, entry.adapterId, entry.vendor, entry.estimatedCostUsd]), [
      ["deluxe", "primary", "parallel-pro", "parallel", 0.1],
      ["deluxe", "secondary", "you-research", "you", 0.05],
      ["regular", "primary", "parallel-core", "parallel", 0.025],
      ["regular", "secondary", "you-research-lite", "you", 0.012],
    ]);
    assert.equal(setup.researchMode, "deluxe", "RESEARCH_TIER defaults to deluxe.");
    assert.equal(setup.researchError, null);
    assert.deepEqual(setup.vendors, ["openrouter", "parallel", "you", "wikimedia", "openverse"]);
    const fetched = urls.length;
    await read();
    assert.equal(urls.length, fetched);
  });

  it("shows the RESEARCH_TIER mode, and reports a bad one instead of failing", async () => {
    const quiet = (async () => new Response(JSON.stringify({ data: { endpoints: [] } }))) as unknown as typeof fetch;
    assert.equal((await createSetupReader({ env: { RESEARCH_TIER: "auto" }, fetch: quiet })()).researchMode, "auto");
    const bad = await createSetupReader({ env: { RESEARCH_TIER: "cheap" }, fetch: quiet })();
    assert.equal(bad.researchMode, null);
    assert.match(bad.researchError ?? "", /Unknown research tier \|\| RESEARCH_TIER=cheap/);
    assert.equal(bad.research.length, 4, "The tiers are code, so they still show.");
  });

  it("reports a failed host list on that model instead of failing", async () => {
    const failing = (async () => new Response("nope", { status: 503 })) as unknown as typeof fetch;
    const setup = await createSetupReader({ env: {}, fetch: failing })();
    assert.equal(setup.models[0]!.endpoints, null);
    assert.match(setup.models[0]!.endpointsError ?? "", /status=503/);
  });
});
