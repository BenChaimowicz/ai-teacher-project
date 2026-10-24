import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activityRow, keyHash } from "./import-openrouter-history.ts";

describe("OpenRouter history import", () => {
  it("hashes a key the way OpenRouter's management API filters by", () => {
    assert.equal(keyHash("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("keeps only the day from OpenRouter's date and maps every usage field", () => {
    const row = activityRow({
      date: "2026-10-21 00:00:00", model: "deepseek/deepseek-v4-pro", model_permaslug: "deepseek/deepseek-v4-pro-20260423",
      endpoint_id: "e1", provider_name: "alibaba/fp8", requests: 14, usage: 0.122748, byok_usage_inference: 0, byok_requests: 0,
      prompt_tokens: 20071, completion_tokens: 35658, reasoning_tokens: 27336, cached_tokens: 5120,
    }, "hash-1", new Date("2026-10-24T00:00:00Z"));
    assert.deepEqual(
      [row.day, row.keyHash, row.providerName, row.requests, row.usageUsd, row.reasoningTokens, row.cachedTokens],
      ["2026-10-21", "hash-1", "alibaba/fp8", 14, 0.122748, 27336, 5120],
    );
  });
});
