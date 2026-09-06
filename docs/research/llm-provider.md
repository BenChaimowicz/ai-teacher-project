# LLM provider for generated lessons

**Date:** 2026-08-14

**Amendment 2026-09-04 (bakeoff lock):** [Provider bakeoff: OpenAI vs DeepSeek](https://linear.app/senoy/issue/SEN-20/provider-bakeoff-openai-vs-deepseek) locked DeepSeek **`deepseek-v4-pro`** as the leading Generator (OpenAI-compatible Chat Completions at `https://api.deepseek.com`) and OpenAI **`gpt-5.6-terra`** as the fallback adapter (official `openai` SDK, Responses API). Claude is not a Generator fallback. OpenRouter is not a product Provider. Citation contract and two-step reading-then-quiz from this note still hold. Sol is not in the Generator pair.

**Amendment 2026-09-04 (earlier, superseded):** Briefly treated OpenAI `gpt-5.6-sol` as leading with DeepSeek as fallback, pending the bakeoff. The August body below is the original Anthropic-first survey; do not treat either as current.

Which LLM provider should power course generation for a prototype TypeScript AI learning platform, and how should the spec abstract the LLM behind an interface so it stays swappable? Content is You.com web search plus LLM synthesis; teaching methods shipping now are reading lessons and quizzes; the destination is a buildable spec, not production-at-scale. Citations must come from *our* retrieval set, not the model’s own web search.

---

## 2. Recommendation

**Pick Anthropic Claude Sonnet 5 (`claude-sonnet-5`) via the Messages API and official `@anthropic-ai/sdk`, behind a thin custom TypeScript `Generator` interface. Do not pin Vercel AI SDK, OpenRouter, or LangChain as the domain boundary.**

Auth is an API key (`x-api-key` / `ANTHROPIC_API_KEY`) from the Claude Console. The official TypeScript SDK is `@anthropic-ai/sdk` (v0.117.1 as of 13 Aug 2026; GitHub `anthropics/anthropic-sdk-typescript`). Pass You.com pages as top-level `search_result` content blocks with `citations: { enabled: true }` — Anthropic’s docs explicitly list this for “content from external search services” and “pre-fetched content.” Claude returns text blocks with `citations[]` of type `search_result_location` containing `source`, `title`, `cited_text`, `search_result_index`, and block indices. Persist those fields onto the locked Citation / Source schema; drop any footnote whose URL was not in the retrieval set. `cited_text` is not billed as output tokens.

**Pin Sonnet 5, not Opus 5 or Fable 5.** Current Claude API list prices: Sonnet 5 **$2 / $10 per million input/output tokens** (the $2/$10 rate, originally introductory through 31 Aug 2026, is now the standard price). Opus 5 is $5/$25; Fable 5 is $10/$50. Three test courses do not need Fable. Context window is 1M tokens; max output 128k — enough for a lesson plus sources. New API users receive a small amount of free credits (amount unpublished).

**Do not enable Anthropic’s `web_search` tool on generation calls.** That tool runs *Anthropic’s* search and cites *those* results. Search is already locked to You.com. Mixing the two would invent a second citation graph.

**Do not combine citations with structured outputs on the same request.** Anthropic: enabling citations on `document` or `search_result` blocks *and* sending `output_config.format` returns **400**. Citations interleave with text; JSON schema cannot. The prototype pipeline is therefore two calls inside one adapter:

1. **Lesson body** — `search_result` + `citations.enabled`, no `output_config`. Map `citations[]` → stored sources. Instruct numbered footnotes that match those sources.
2. **Quiz object** — `output_config.format: { type: "json_schema", schema: … }` (GA; no beta header). No citation blocks. Quiz items may reference footnote numbers from the already-generated body.

Commercial Terms §B: Customer owns Outputs; Anthropic “may not train models on Customer Content from Services.” Privacy Center (16 Mar 2026): API chats are not used for training unless you opt into the Development Partner Program or submit feedback. Inputs/outputs are deleted from backend within 30 days unless Files API / ZDR / Usage Policy / law. Storing generated lessons in *our* database is allowed.

**Abstraction: a ~20–40 line domain interface wrapping `@anthropic-ai/sdk` now.** Vercel AI SDK (`ai` v7) is a real provider-agnostic *model* interface (`generateText` / `Output.object()`), but its Anthropic provider documents `web_search` / `web_fetch` citations, not `search_result` blocks. `Output.object()` is the same structured-output constraint that Anthropic rejects alongside citations. Putting `ai` on the domain boundary would either drop the citation primitive this product needs or leak Anthropic types through `providerOptions`. Keep `ai` off the spec’s core path; a later adapter may use it for quiz JSON or UI streaming.

### Rejected alternatives (one line each)

- **OpenAI GPT-5.6 (Responses API, `openai` npm):** Strongest JSON schema (`text.format` / Structured Outputs) and you own Outputs (Services Agreement §4.1, effective 1 Jan 2026); **no `search_result` equivalent** — web_search `url_citation` annotations cite *OpenAI’s* search, file_search cites *uploaded files*. Grounding our You.com set is prompt-stuffing plus hope.
- **Google Gemini (`@google/genai`):** Grounding with Google Search returns `groundingChunks` / `groundingSupports`, but Additional Terms (23 Mar 2026) **forbid caching/storing Grounded Results** except narrow chat-history/eval cases — incompatible with persisting lesson citations. URL context fetches the live URL (≤20 URLs), not our snippets, and is a different retrieval than You.com.
- **Vercel AI SDK as the spec’s LLM interface:** Provider-agnostic for text/JSON/streaming, not for Anthropic `search_result` citations; `Output.object()` cannot ride with citations.enabled.
- **OpenRouter (`@openrouter/sdk`):** Unified chat completions across 400+ models; OpenRouter itself does not train on Inputs/Outputs, but **some routed providers may**, and Anthropic `search_result` blocks are not a documented first-class OpenRouter feature.
- **LangChain JS (`langchain` + `@langchain/anthropic`):** Official docs now sell `createAgent` (model + harness). Overweight for one-shot lesson synthesis; same citation-block gap.
- **Local (Ollama `ollama` npm / llama.cpp):** Official JS client supports `format: "json"` and streaming; **no citation/grounding API** that returns which source was used. Unrealistic for lesson-quality synthesis plus verifiable footnotes on a prototype.
- **Claude Opus 5 / Fable 5 as the default:** Same Messages + citations API; 2.5× / 5× Sonnet 5 list price with no prototype need for agentic-coding or “long-running agents” SKUs.
- **Gemini unpaid / AI Studio free quota:** Additional Terms: Google **uses prompts and responses to improve products**; human reviewers may read them. Paid Gemini API does not — but paid Gemini still lacks our-retrieval citation blocks and Search-grounding storage is restricted.

---

## 3. Provider comparison

Facts below are from vendor docs, pricing pages, npm, or ToS. “Our retrieval” means You.com results already in hand; the LLM must ground on that set.

| Provider | Auth | Official TS/JS | Ground our You.com pages | Citation payload from *our* sources | Structured JSON schema | Streaming | Models to pin (Aug 2026) | Price / 1M tok (std) | Rate limits (published) | Store lessons / train default |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Anthropic Claude** | API key `x-api-key` / `ANTHROPIC_API_KEY`; optional WIF Bearer | `@anthropic-ai/sdk` | **Yes:** `type: "search_result"` top-level (Method 2) or from a custom tool | **Yes:** `citations[]` → `search_result_location` with `source`, `title`, `cited_text`, `search_result_index`, block indices. `cited_text` not billed as output | **Yes:** `output_config.format` json_schema (GA). **Incompatible with citations (400)** | Yes, SSE `stream: true`; SDK `.stream()` | **Sonnet 5** `claude-sonnet-5`; also Opus 5, Fable 5, Haiku 4.5 | Sonnet 5 **$2 in / $10 out**; Opus 5 $5/$25; Fable 5 $10/$50; Haiku 4.5 $1/$5. Cache read 0.1× input. Batch 50% off | Org tiers; spend caps Start $500 / Build $1k / Scale $200k/mo. Three published RPM/ITPM/OTPM tables (Sonnet 5: 1k/2M/400k → 5k/5M/1M → 10k/10M/2M). New orgs may start in Evaluation below those. Cached reads do not count toward ITPM on current models | **Own Outputs** (Commercial Terms §B). **No training** on API content unless DPP / feedback. 30-day backend delete |
| **OpenAI** | API key `OPENAI_API_KEY`; org/project | `openai` (v7.4.0, 13 Aug 2026). Primary: **Responses API** | Paste into `input` / messages. **No search_result block.** `web_search` tool is OpenAI’s index. `file_search` is files you uploaded | `url_citation` on **web_search** results; `file_citation` `{file_id, filename, index}` on **file_search**. Neither is a You.com URL unless you uploaded the page as a file | **Yes:** Responses `text.format` `{type:"json_schema", strict:true}`. Chat Completions still has `response_format`. Zod helpers in SDK. Start with `gpt-5.6` | Yes | **gpt-5.6-sol** (alias `gpt-5.6`) $5/$30; **gpt-5.6-terra** $2/$12; **gpt-5.6-luna** $0.20/$1.20. Context 1.05M, max out 128k, cutoff Feb 16 2026 | See left. Web search **$10 / 1k calls** + content tokens | Org+project RPM/TPM; usage tiers Free→Tier 5 ($100→$200k/mo after spend). Exact RPM not a single public number — Console Limits page | **Own Output** (§4.1). **No training** on API as of 1 Mar 2023 unless opt-in. Abuse logs 30 days. Responses `store` defaults to 30-day application state |
| **Google Gemini** | API key `x-goog-api-key` / `GEMINI_API_KEY`; paid = Cloud project + billing | `@google/genai` (v2.17.1, 13 Aug 2026). `GoogleGenAI`. Interactions API recommended; `generateContent` still documented | Paste into `contents`. **URL context** fetches up to **20 public URLs** (not our snippets; live/index fetch; 34MB/URL). **google_search** is Google’s search | Search: `groundingMetadata.groundingChunks` + `groundingSupports`. URL context: `url_citation` annotations (`start_index`, `end_index`, `url`, `title`) | **Yes:** `response_format` / JSON schema; Zod in JS examples. Gemini 3 can combine structured output with built-in tools | Yes (SDK) | **gemini-3.6-flash** $1.50/$7.50; **gemini-3.5-flash** $1.50/$9; **gemini-3.5-flash-lite** $0.30/$2.50; **gemini-3.1-pro-preview** $2/$12 (≤200k) or $4/$18 (>200k). Free tier exists | See left. Search grounding: 5k prompts/mo then **$14 / 1k queries** (Gemini 3 billed per query the model runs) | Per project RPM/TPM/RPD; view in AI Studio. Tiers Free / 1 / 2 / 3. Spend-based 10-min caps on paid ($10 / $200). Exact RPM “view in AI Studio,” not a single public table | **Paid:** Google does **not** use prompts/responses to improve products. **Unpaid:** **does**, human review possible. **Search Grounded Results: storage heavily restricted** (see §7) |
| **Vercel AI SDK** | Whatever the wrapped provider needs | `ai` (v7 “Latest” on ai-sdk.dev) + `@ai-sdk/anthropic` / `@ai-sdk/openai` / `@ai-sdk/google` | Only if you put sources in `prompt` / messages. Anthropic provider documents **web_search / web_fetch**, not `search_result` | Provider-specific; not a unified citation type in Core docs fetched | `generateText` + `Output.object({ schema })` (Zod/Valibot/JSON). Replaces older `generateObject` in v7 docs | `streamText` + `partialOutputStream` | Any supported provider string, e.g. `anthropic('claude-sonnet-5')` or gateway `"xai/grok-4.6"` | Pass-through | Pass-through | Pass-through |
| **OpenRouter** | Bearer `OPENROUTER_API_KEY` | `@openrouter/sdk`; also OpenAI SDK with `baseURL: https://openrouter.ai/api/v1` | Chat completions `messages`; not Anthropic content-block typed | Whatever the underlying model returns; not a documented search_result mapper | Provider-dependent | Yes | 400+ slugs, e.g. `~openai/gpt-latest` | Per-model; OpenRouter adds routing. Some endpoints train | FAQ/account; not fully fetched here | OpenRouter **does not train**. **Some Model Providers may.** Privacy Policy 6 Jul 2026 |
| **LangChain JS** | Provider keys | `langchain` + `@langchain/anthropic` / `@langchain/openai` / `@langchain/google-genai` / `@langchain/ollama` | Agent/messages; not a first-class search_result helper in the overview fetched | Not in the overview fetched | `createAgent` + tools/Zod; structured-output how-to URL redirected to the agent overview in this fetch | Yes | Provider model strings | Pass-through + LangSmith optional | Pass-through | Pass-through |
| **Ollama** | Local `http://localhost:11434/api`; cloud `OLLAMA_API_KEY` at ollama.com | Official `ollama` (ollama-js v0.6.3) | Stuff the prompt. Optional `webSearch` / `webFetch` require an Ollama account — **another** search, not You.com | None that return cited_text/source from caller-supplied pages | `format: "json"` (JSON, not JSON Schema adherence) | `stream: true` | Whatever you pull (e.g. gemma4, llama3.1); quality varies | Local: electricity. Cloud: billed by Ollama (not fetched) | Local hardware | You store everything; no vendor training on local |

Sources for this table are listed in §10.

---

## 4. Grounding on *our* retrieval set

Locked decision: You.com `POST /v1/search` is the citation source. The LLM must not become a second search engine.

### What each vendor actually offers

| Mechanism | Whose pages? | Fits this product? |
| --- | --- | --- |
| **Anthropic `search_result` (Method 2)** | Yours. `source` is any stable string (URL or `kb://…`); `content` is text blocks you supply | **Yes. This is the primitive.** Docs: “Pre-fetched content from your search infrastructure,” “Content from external search services.” |
| Anthropic `document` + `citations.enabled` | Yours (plain text / PDF / custom content) | Yes as a fallback if you flatten highlights into one document; weaker URL attribution than `search_result.source` |
| Anthropic `web_search_*` tool | Anthropic’s search | **No.** $10 / 1k searches + tokens. Citations are from that search, not You.com. Do not enable on course generation. |
| Anthropic `web_fetch` | Live URL Claude fetches | Optional later for quoting a cited URL’s full page; not the retrieval index. Extra tokens. |
| OpenAI `web_search` | OpenAI’s search | **No.** `url_citation` annotations cite those results. $10 / 1k. |
| OpenAI `file_search` | Files you uploaded to a vector store | Only if you re-upload every You.com page as a file. Wrong shape; $0.10/GB-day storage + $2.50 / 1k tool calls on Responses. |
| OpenAI prompt stuffing | Yours, unstructured | Works, but the model invents footnotes. Keep the post-filter (drop URLs not in the retrieval set). No `cited_text` guarantee. |
| Gemini `google_search` | Google Search | **No** as citation source. Also ToS storage limits on Grounded Results. |
| Gemini `url_context` | Live fetch of URLs you list (≤20), from Google’s index cache or live fetch | **Not the same as You.com snippets.** Paywalled/login URLs fail. Citations are `url_citation` on what Gemini fetched, which may differ from the highlight we ranked. |
| Gemini prompt stuffing | Yours | Same as OpenAI stuffing. |

### Recommended Anthropic request shape (adapter-internal)

```
POST https://api.anthropic.com/v1/messages
x-api-key: $ANTHROPIC_API_KEY
anthropic-version: 2023-06-01

{
  "model": "claude-sonnet-5",
  "max_tokens": 8192,
  "messages": [{
    "role": "user",
    "content": [
      { "type": "search_result", "source": "<you.com url>", "title": "<title>",
        "content": [{ "type": "text", "text": "<highlight or snippet>" }],
        "citations": { "enabled": true } },
      … more results …
      { "type": "text", "text": "<generate reading lesson; footnote only sources above>" }
    ]
  }]
}
```

All `search_result` blocks in a request must share the same citations enabled/disabled setting. Citations are **off by default**; every official example sets `"enabled": true`. Split each result’s `content` into small text blocks if you want finer `cited_text` spans (Claude cites whole blocks, not substrings).

Map each `search_result_location` to the locked Citation / Source fields:

| Anthropic field | Store as |
| --- | --- |
| `source` | `url` (must be in the You.com set) |
| `title` | `title` |
| `cited_text` | `quotedText` when `usedAs === "quote"`; else evidence for paraphrase |
| (You.com `page_age` / hostname, request time) | `publisher`, `retrievedAt` — **not** returned by Claude; copy from retrieval |

**Source-trust claim check (still accurate, with one new constraint):** “If generation uses Claude, pass retrieved pages as `search_result` blocks with `citations.enabled` and persist the returned `cited_text` / `source` / `title` rather than trusting the model to invent citations.” **Yes, that is still what current Anthropic docs specify.** Add: **do not send `output_config.format` on that same call.**

---

## 5. Structured output, quizzes, streaming, models

### Structured lesson + quiz objects

The spec needs typed `Lesson` / `Quiz` objects. Vendor primitives:

| Vendor | How | Schema-adherent? | With our citations? |
| --- | --- | --- | --- |
| Anthropic | `output_config.format: { type: "json_schema", schema }` on Messages. SDK `messages.create`. Old `output_format` + beta header still works during transition | Yes (constrained decoding) | **No — 400 if citations enabled** |
| OpenAI | Responses `text.format`; Chat Completions `response_format`. `strict: true` | Yes from gpt-4o snapshots onward; docs say start with `gpt-5.6` | N/A (no our-source citation API) |
| Gemini | `response_format` / `mime_type: application/json` + schema. JS: Zod → JSON Schema. Gemini 3 can combine with built-in tools | Yes (subset of JSON Schema) | Built-in search/URL tools only, not You.com blocks |
| Vercel AI SDK v7 | `Output.object({ schema: z.object(...) })` on `generateText` | Validates with your schema; maps to provider JSON/tool mode | Would hit Anthropic 400 if you also enabled citations |
| Ollama | `format: "json"` | Valid JSON, **not** schema |

**Prototype split (pin this):**

1. `generateLessonBody(sources)` → markdown/HTML body + `Citation[]` from Anthropic citations (call A).
2. `generateQuiz(lessonBody, sources)` → JSON via Anthropic `output_config` (call B). Quiz `prompt` may include the body and the numbered source list as ordinary text, without `citations.enabled`.
3. App-level: intersect footnote URLs with the retrieval set (source-trust rule 3). Zod-validate quiz JSON even though call B is schema-constrained.

Do not ask one `output_config` object to contain `{ body, footnotes, quiz }` while citations are on. That is the 400.

### Streaming

Nice-to-have. Anthropic: `"stream": true` SSE; TypeScript SDK `client.messages.stream({...})`. Structured outputs also stream (accumulate before JSON.parse). OpenAI Responses and Gemini SDKs stream. Prototype can generate synchronously for three courses; expose streaming later behind the same interface as an optional `AsyncIterable`.

### Models available (Aug 2026) — pin these IDs in *config*, not in domain objects

**Anthropic (Claude API aliases are pinned snapshots from 4.6 onward):**

| ID | Role | Price in/out | Context / max out | Knowledge |
| --- | --- | --- | --- | --- |
| `claude-sonnet-5` | **Default generator** | $2 / $10 | 1M / 128k | Reliable cutoff Jan 2026 |
| `claude-opus-5` | Escalation | $5 / $25 | 1M / 128k | May 2026 |
| `claude-fable-5` | Do not default | $10 / $50 | 1M / 128k | Jan 2026 |
| `claude-haiku-4-5` | Cheap quiz-only experiment | $1 / $5 | 200k / 64k | Feb 2025 reliable / Jul 2025 training |

Tokenizer: Claude 4.7+ ≈ 30% more tokens for the same text vs Sonnet 4.6 and earlier. Sonnet 5 is in that newer family — budget ~1.3× if you compare old token estimates.

**OpenAI flagship (short context, Standard):** `gpt-5.6-sol` $5/$30, `gpt-5.6-terra` $2/$12, `gpt-5.6-luna` $0.20/$1.20. Long-context rates are 2× input / 1.5× output on the pricing table fetched.

**Gemini:** `gemini-3.6-flash` is the current “most intelligent built for speed” Flash SKU at $1.50/$7.50 paid. Free tier: input/output free of charge but **used to improve products**.

### Rate limits and free credits

- **Anthropic:** Monthly spend caps Start $500 / Build $1,000 / Scale $200,000. Rate limits are RPM + uncached ITPM + OTPM per model class; 429 + `retry-after`. “New users receive a small amount of free credits to test the API” (amount not published). Evaluation tier may sit below the standard tables.
- **OpenAI:** Tiers by historical spend (Free $100/mo cap … Tier 5 $200k/mo). RPM/TPM in Console and response headers. No single public RPM for gpt-5.6 in the rate-limits guide fetched.
- **Gemini:** Per-project RPM/TPM/RPD; **view in AI Studio**. Paid spend-based cap $10 / $200 per 10 minutes by tier. Free tier exists with “limited access to certain models.”

Three courses × ~20 lessons × 2 LLM calls is well inside Start-tier Anthropic limits. Cost ballpark at Sonnet 5: if each lesson is ~15k input (sources) + 3k output, 60 lessons ≈ 0.9M in + 0.18M out ≈ **$2 + $2** plus You.com search — pocket change. Regeneration loops are the real spend risk; cap retries in the spec.

---

## 6. Abstraction boundary

### Pin this TypeScript surface in the spec

The rest of the product (course model, teaching-method plugins, You.com client) depends **only** on this. The Anthropic SDK stays inside `adapters/anthropic/`.

```ts
/** Retrieval-set item already fetched (You.com). Adapter must not web-search. */
export type Source = {
  url: string;
  title: string;
  publisher: string;
  retrievedAt: string; // ISO 8601
  content: string;     // snippet / highlight / extract we actually have
  license?: string;
  doi?: string;
};

export type Citation = {
  url: string;
  title: string;
  publisher: string;
  retrievedAt: string;
  usedAs: "quote" | "paraphrase";
  quotedText?: string;
  license?: string;
  doi?: string;
};

export type QuizItem = {
  prompt: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
};

export type GeneratedLesson = {
  body: string;              // reading lesson with [n] footnotes
  citations: Citation[];
};

export type GeneratedQuiz = {
  items: QuizItem[];
};

export type GenerateLessonInput = {
  subject: string;
  skillLevel: number;        // 0–100
  teachingMethod: "reading"; // plugin id; more later
  moduleTitle: string;
  lessonTitle: string;
  sources: Source[];
};

export interface Generator {
  generateLesson(input: GenerateLessonInput): Promise<GeneratedLesson>;
  generateQuiz(input: {
    lesson: GeneratedLesson;
    sources: Source[];
  }): Promise<GeneratedQuiz>;
}
```

Config (env / yaml), **not** domain objects:

```ts
type GeneratorConfig = {
  provider: "anthropic";       // only implemented adapter at prototype
  model: string;               // e.g. "claude-sonnet-5"
  apiKeyEnv: "ANTHROPIC_API_KEY";
};
```

### What must not leak across the boundary

- Anthropic block types: `search_result`, `search_result_location`, `document`, `cited_text` as API objects, `search_result_index`.
- OpenAI `url_citation` / `file_citation` / `file_id`.
- Gemini `groundingMetadata`, `groundingChunks`, `vertexaisearch.cloud.google.com` redirect URIs, `searchEntryPoint` HTML.
- Model IDs on `Course` / `Module` / `Lesson` rows (store `generator: { provider, model, requestId }` in an audit column if you want reproducibility — not in the teaching graph).
- Provider tool schemas (`web_search_20260318`, `google_search`, Responses `tools`).
- Vercel `LanguageModel` / `Output.object` types in plugin code.
- Prompts that mention “Claude” or “GPT” in user-visible lesson text.

### Vercel AI SDK vs thin custom interface

| | Thin `@anthropic-ai/sdk` adapter (recommended) | Pin `ai` as the interface |
| --- | --- | --- |
| Swap provider later | Write a second adapter that implements `Generator` | Swap `model:` one-liner **for text/JSON**, not for our citation contract |
| You.com citations | First-class `search_result` in the Anthropic adapter | Not documented on `@ai-sdk/anthropic` (web_search/web_fetch only in the provider page fetched) |
| Structured quiz | Second Messages call with `output_config` | `Output.object()` — cannot combine with Anthropic citations |
| Prototype cost | One dependency | `ai` + `@ai-sdk/anthropic` (+ future providers) |
| Teaching-method plugins | Depend on `Generator` | Would depend on `ai` internals / providerOptions |

**Verdict:** The spec’s swappable unit is `Generator`, not `ai`. Implement one Anthropic adapter. A future OpenAI adapter stuffs sources into the prompt and relies on the URL intersection post-filter (weaker). A future Gemini adapter may use URL context **only if** product later drops “citations = You.com snippets” — it must not do that in v1.

OpenRouter and LangChain add a hop or an agent runtime without implementing the citation contract. Rejected for the prototype.

---

## 7. ToS: storing lessons, training defaults

| Vendor | May we persist generated lessons? | Training on our prompts/outputs (default) | Other flags |
| --- | --- | --- | --- |
| **Anthropic Commercial Terms** | **Yes.** §B: Customer owns Outputs; Anthropic assigns any interest. Customer Content is Confidential Information. API is explicitly for products you make available to Users (§A.1) | **No.** “Anthropic may not train models on Customer Content from Services.” Privacy Center 16 Mar 2026: commercial API not used for training unless DPP or explicit feedback | 30-day backend delete of inputs/outputs (1 Jul 2026 article). Usage Policy: consumer-facing chatbots must disclose AI; High-Risk “media or professional journalistic content” auto-publish needs human-in-the-loop + disclosure. Educational lessons should disclose AI generation to learners. AUP also forbids using inputs/outputs to train a competing model |
| **OpenAI Services Agreement** (effective 1 Jan 2026) | **Yes.** §4.1 Customer owns Output; §2.2 may integrate into Customer Applications | **No**, unless Customer explicitly agrees (§4.2). Platform “Your data” guide: API not used to train as of 1 Mar 2023 unless opt-in | Abuse monitoring logs up to 30 days. Responses application state 30 days if `store` true. ZDR is sales-gated |
| **Gemini Additional Terms** (23 Mar 2026) | **Generated content:** Google won’t claim ownership. **Paid API:** prompts/responses not used to improve products; logged briefly for safety | **Unpaid / free quota: Yes, used to improve products**; human reviewers may read disconnected logs. **Paid: No** | **Grounding with Google Search:** do not cache/store Grounded Results except (1) ≤2 years for display eval, (2) end-user chat history, (3) temporary function-call refinement, (4) legal hold. Do not build a database of Grounded Results. **Do not use Gemini Search as the lesson citation store.** Age 18+; API Clients not directed at under-18s — **yellow flag if the learning product is K–12** |
| **OpenRouter Privacy** (6 Jul 2026) | You may store Outputs you receive | OpenRouter does not train. **Underlying providers may.** Filter with account data-policy settings | Extra contractual party |

**Gemini under-18 clause** is a product-legal issue if courses are for minors. Anthropic AUP has a separate “products serving minors” Help Center requirement (not fully fetched). Prototype with adult testers is the safe path.

---

## 8. Local models (rejected)

Ollama official docs: local HTTP `localhost:11434/api`, JS library `ollama`, `format: "json"`, streaming, optional cloud. llama.cpp is a C++ inference engine (GitHub `ggml-org/llama.cpp`) with grammar-constrained decoding in-tree; the grammars README fetch returned an empty file in this pass.

Neither publishes a citation API that returns `source` / `cited_text` for caller-supplied web pages. Instruction-following for “footnote only these URLs” on small local models is not a documented guarantee. For three test courses where citation integrity is a locked product rule, local inference is a later offline experiment, not the generator.

---

## 9. Risks / failure modes (for the spec)

- **Citations × JSON 400.** One-shot `{ lesson, quiz }` with `output_config` and `citations.enabled` will fail. Two calls, or JSON-in-the-prompt without `output_config` (weaker).
- **Do not turn on `web_search`.** It is a different corpus and a $10/1k meter. Source-trust already forbids synthesizing from a vendor answer API.
- **Citation reliability ≠ no hallucinations.** Anthropic says citations contain valid pointers into *provided* documents; the model can still write uncited claims or skip a source. Keep the retrieval-set intersection.
- **`cited_text` is the block, not a substring.** Split You.com highlights into tight blocks or footnotes will quote too much (quote vs paraphrase rule).
- **Vercel AI SDK swap fantasy.** Swapping `anthropic('…')` for `openai('…')` does not preserve `search_result` citations. The domain interface must stay citation-shaped.
- **Gemini Search ToS vs lesson table.** Even if someone “just uses Gemini grounding because citations look good,” storing those URLs/snippets in a lesson table is likely a Grounded Results database — forbidden.
- **Gemini URL context ≠ You.com.** Different fetch, different ranking, paywall misses, 20-URL cap.
- **Free Gemini trains on data.** Prototype must use paid Anthropic (or paid OpenAI), not Gemini free quota.
- **OpenRouter training variance.** Convenience routing can silently send prompts to a provider that trains. Out of scope for a citation-sensitive prototype.
- **AUP disclosure.** Show learners that lessons are AI-generated; do not present as human-authored textbook prose. High-risk auto-publish HITL is a later ticket if this becomes a consumer product.
- **Minors.** Gemini Additional Terms bar API Clients directed at under-18s. Anthropic has extra minor-product rules. Spec the prototype for adult testers.
- **Tokenizer + caching.** Cache the `search_result` prefix (`cache_control`) across lesson regenerations; cached reads are 0.1× and do not count toward ITPM on current models.
- **Model IDs are snapshots.** `claude-sonnet-5` is a pinned snapshot, not an evergreen pointer (Anthropic: dateless IDs from 4.6 are still snapshots). Pin the ID in config; when Anthropic ships Sonnet 6, bump via adapter config, not a domain migration.

---

## 10. Sources

Every claim above traces to one of these. Secondary blogs were not used as authorities.

### Anthropic

- Models overview (Fable 5, Opus 5, Sonnet 5, Haiku 4.5, IDs, prices, context): https://platform.claude.com/docs/en/about-claude/models/overview
- Pricing (Sonnet 5 $2/$10 now standard; cache multipliers; web search $10/1k; web fetch no extra fee; free credits FAQ): https://platform.claude.com/docs/en/about-claude/pricing
- Citations (document blocks, `cited_text` not billed, **incompatible with structured outputs**): https://platform.claude.com/docs/en/build-with-claude/citations
- Search results (schema, Method 2 top-level, `search_result_location` fields, citation control): https://platform.claude.com/docs/en/build-with-claude/search-results
- Structured outputs (`output_config.format`, GA, citations 400): https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- Get started (API key, `@anthropic-ai/sdk`, `claude-opus-5` examples): https://platform.claude.com/docs/en/get-started
- API overview (auth headers, SDKs, cloud vs first-party): https://platform.claude.com/docs/en/api/overview
- Rate limits (tiers, spend caps, RPM/ITPM/OTPM tables): https://platform.claude.com/docs/en/api/rate-limits
- Streaming: https://platform.claude.com/docs/en/build-with-claude/streaming
- Web search tool (do not use for this product’s citations): https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool
- npm `@anthropic-ai/sdk`: https://www.npmjs.com/package/@anthropic-ai/sdk
- GitHub SDK: https://github.com/anthropics/anthropic-sdk-typescript
- Commercial Terms (own Outputs, no training on Customer Content): https://www.anthropic.com/legal/commercial-terms
- Usage Policy (disclosure, high-risk, no model distillation): https://www.anthropic.com/legal/aup
- Training on commercial data (16 Mar 2026): https://privacy.anthropic.com/en/articles/7996885-how-do-you-use-personal-data-in-model-training
- Retention 30 days (1 Jul 2026): https://privacy.anthropic.com/en/articles/7996866-how-do-you-use-personal-data-in-model-training (fetched URL; page title is “How long do you store my organization’s data?”)

### OpenAI

- Models (gpt-5.6-sol/terra/luna, prices, tools, cutoff): https://platform.openai.com/docs/models
- Pricing (flagship table, web search $10/1k, file search): https://platform.openai.com/docs/pricing
- Structured outputs: https://developers.openai.com/api/docs/guides/structured-outputs
- Migrate to Responses: https://developers.openai.com/api/docs/guides/migrate-to-responses
- Web search + `url_citation`: https://developers.openai.com/api/docs/guides/tools-web-search
- Your data / no training default: https://developers.openai.com/api/docs/guides/your-data
- Rate limits / usage tiers: https://developers.openai.com/api/docs/guides/rate-limits
- npm `openai`: https://www.npmjs.com/package/openai
- Services Agreement (own Output, no train unless agreed; effective 1 Jan 2026): https://openai.com/policies/services-agreement/
- How data is used (business/API default off): https://openai.com/policies/how-your-data-is-used-to-improve-model-performance/

### Google Gemini

- Pricing (Flash/Pro, free vs paid, search $14/1k, “used to improve products”): https://ai.google.dev/gemini-api/docs/pricing
- Additional Terms (23 Mar 2026; unpaid training; paid no-train; Search storage bans; under-18): https://ai.google.dev/gemini-api/terms
- URL context (≤20 URLs, `url_citation`, 34MB, public only): https://ai.google.dev/gemini-api/docs/url-context
- Grounding with Google Search (`groundingMetadata`): https://ai.google.dev/gemini-api/docs/generate-content/google-search
- Structured output (generateContent): https://ai.google.dev/gemini-api/docs/generate-content/structured-output
- Structured output (Interactions): https://ai.google.dev/gemini-api/docs/structured-output
- Rate limits: https://ai.google.dev/gemini-api/docs/rate-limits
- Quickstart: https://ai.google.dev/gemini-api/docs/quickstart
- npm `@google/genai`: https://www.npmjs.com/package/@google/genai
- SDK reference: https://googleapis.github.io/js-genai/release_docs/

### Abstraction layers

- AI SDK introduction (v7, provider list): https://ai-sdk.dev/docs/introduction
- (same content) https://sdk.vercel.ai/docs
- Structured data / `Output.object`: https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data
- Anthropic provider (`@ai-sdk/anthropic`, web_search/web_fetch citations): https://ai-sdk.dev/providers/ai-sdk-providers/anthropic
- OpenRouter quickstart (`@openrouter/sdk`): https://openrouter.ai/docs/quickstart
- OpenRouter provider logging / training table: https://openrouter.ai/docs/guides/privacy/logging
- OpenRouter Privacy Policy (6 Jul 2026; OpenRouter does not train; providers may): https://openrouter.ai/privacy
- LangChain JS overview (`createAgent`): https://js.langchain.com/docs/introduction/

### Local

- Ollama docs index: https://docs.ollama.com / https://ollama.com/docs
- Ollama API: https://docs.ollama.com/api
- npm `ollama`: https://www.npmjs.com/package/ollama
- llama.cpp repo: https://github.com/ggml-org/llama.cpp

### Unreached / uncertain

- **OpenAI Terms of Use HTML** (`openai.com/policies/row-terms-of-use/`): bot-challenge / timeout. Used the **Services Agreement** (API/business) instead, which is the relevant contract for API keys.
- **OpenAI file_search guide** (`platform.openai.com/docs/guides/tools-file-search`): timeout this pass. Citation shape `file_citation` / `{file_id, filename, index}` is taken from the already-cited source-trust note and from Structured Outputs/models pages that list File search as a tool — **re-fetch before implementing an OpenAI adapter**.
- **OpenRouter Terms of Service** (`openrouter.ai/terms`): timeout. Privacy Policy and logging docs were fetched; credit/markup terms are uncertain.
- **OpenRouter FAQ rate limits:** not fetched.
- **Gemini generateContent structured-output page** (non-Interactions): one fetch timed out; the generateContent variant at `/docs/generate-content/structured-output` **did** load.
- **Gemini models catalog** (`ai.google.dev/gemini-api/docs/models`): timeout; model IDs taken from pricing + tool pages.
- **Anthropic “How long do you store…” vs training article:** requesting `…/7996866-how-do-you-use-personal-data-in-model-training` returned the **retention** article (30 days). Training defaults are from `…/7996885-…` and Commercial Terms §B.
- **llama.cpp grammars README:** fetch returned an empty file. Grammar/JSON-schema support is therefore **not** cited as a current first-party fact.
- **Ollama JavaScript integration doc** (`docs.ollama.com/integrations/javascript`): 404. Used npm `ollama` README + `/api` docs.
- **LangChain structured-output how-to** (`js.langchain.com/docs/how_to/structured_output`): redirected to the agent overview. Do not claim a current LangChain `withStructuredOutput` API from this pass.
- **Anthropic rate-limit table captions** (which of the three RPM tables is Start vs Build vs Scale): spend caps are labeled; the three RPM tables appeared unlabeled in the markdown conversion. Quoted as increasing published standard tables, not as named tiers.
- **Exact Anthropic free-credit dollar amount:** unpublished (“a small amount”).
- **OpenAI exact gpt-5.6 RPM:** not on the public rate-limits guide; Console-only.
- **Gemini exact RPM per model:** AI Studio only.
- **Vercel AI SDK npm page** (`npmjs.com/package/ai`): timeout; version “v7 Latest” is from ai-sdk.dev docs chrome.

---

*End of research note.*
