import assert from "node:assert/strict";
import { test } from "node:test";
import { loadModelConfig } from "./model-config.ts";
import { createModelPorts, type StructuredRequest } from "./model-ports.ts";
import type { StructuredTransport } from "./openrouter.ts";

/** A structured request whose parser accepts any reply, for checking what the ports send. */
const REQUEST: StructuredRequest<string> = { systemPrompt: "Write.", input: {}, schemaName: "test", schema: {}, parse: (value) => String(value) };

test("Every author call reasons at medium effort unless it sets its own; the Judge keeps high and triage sends none", async () => {
  const sent: { modelId: string; effort: string | undefined; cap: number | undefined }[] = [];
  const transport: StructuredTransport = {
    async complete<T>(modelId: string, request: StructuredRequest<T>): Promise<T> {
      sent.push({ modelId, effort: request.reasoningEffort, cap: request.reasoningMaxTokens });
      return request.parse("ok");
    },
  };
  const config = loadModelConfig({});
  const ports = createModelPorts({ config, transport });

  await ports.generator.generateStructured(REQUEST);
  await ports.generator.generateStructured({ ...REQUEST, reasoningEffort: "high" });
  // Effort overrides a token cap on the same request, so the cap is not sent (openrouter.ts).
  await ports.generator.generateStructured({ ...REQUEST, reasoningMaxTokens: 1500 });
  await ports.fallbackGenerator.generateStructured(REQUEST);
  await ports.judge.judge({ ...REQUEST, authorModelIds: [config.generatorModel] });
  await ports.triage.generateStructured(REQUEST);

  assert.deepEqual(sent, [
    { modelId: config.generatorModel, effort: "medium", cap: undefined },
    { modelId: config.generatorModel, effort: "high", cap: undefined },
    { modelId: config.generatorModel, effort: "medium", cap: 1500 },
    { modelId: config.generatorFallbackModel, effort: "medium", cap: undefined },
    { modelId: config.judgeModel, effort: "high", cap: undefined },
    { modelId: config.triageModel, effort: undefined, cap: undefined },
  ]);
});
