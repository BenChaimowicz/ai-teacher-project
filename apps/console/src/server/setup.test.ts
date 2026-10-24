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
    const read = createSetupReader({ env: { GENERATOR_MODEL: "a/x", GENERATOR_PROVIDER_ORDER: "alibaba" }, fetch: fakeFetch });
    const setup = await read();
    assert.deepEqual(setup.models.map((model) => model.role), ["generator", "generator_fallback", "judge", "judge_fallback"]);
    assert.equal(setup.models[0]!.modelId, "a/x");
    assert.deepEqual(setup.models[0]!.preferredProviders, ["alibaba"]);
    assert.equal(setup.models[0]!.endpoints?.[0]?.provider, "OpenAI");
    assert.deepEqual(setup.research.map((entry) => [entry.slot, entry.vendor]), [["primary", "parallel"], ["secondary", "you"]]);
    assert.deepEqual(setup.vendors, ["openrouter", "parallel", "you"]);
    const fetched = urls.length;
    await read();
    assert.equal(urls.length, fetched);
  });

  it("reports a failed host list on that model instead of failing", async () => {
    const failing = (async () => new Response("nope", { status: 503 })) as unknown as typeof fetch;
    const setup = await createSetupReader({ env: {}, fetch: failing })();
    assert.equal(setup.models[0]!.endpoints, null);
    assert.match(setup.models[0]!.endpointsError ?? "", /status=503/);
  });
});
