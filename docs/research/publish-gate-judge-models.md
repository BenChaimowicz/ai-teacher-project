# Publish-gate Judge models

**Date:** 2026-09-04

Which models should run the Publish-gate **Judge** checks, given that the authoring model and the judging model must be different? Name a default Judge (and a fallback) for factual-claim grounding against retrieved excerpts, Blueprint / Lesson objective coverage, Quiz alignment, Course coherence, and the Demonstrative-media vision pass. What is the pairing rule when the DeepSeek fallback adapter wrote the Lesson? Cover cost, latency, independence from the Generator, and whether one Judge model covers text and vision or they split. Locked constraints: TypeScript full-stack; DeepSeek `deepseek-v4-pro` (OpenAI-compatible Chat Completions) is the leading Generator; OpenAI `gpt-5.6-terra` (official `openai` SDK, Responses API) is the fallback adapter ([Provider bakeoff: OpenAI vs DeepSeek](https://linear.app/senoy/issue/SEN-20/provider-bakeoff-openai-vs-deepseek)); Claude is not a Generator fallback; this ticket picks Judges; You.com is the only search layer; Judges ground on *our* retrieved excerpts with stable source IDs, not vendor `web_search`; Quality bar (SEN-16) is hybrid binary Publish gates — Code checks in-process, Judge checks pass/fail (no 0–100), authoring model must not judge its own artifact; two regenerations per slot then terminal; Judge-check lists for Blueprint / reading Lesson / Quiz / whole-Course are already locked; generated Demonstrative media (SEN-28) currently described a cheap Anthropic vision-check — this ticket may confirm or replace it; never generate photomicrographs; vision must not classify Gram species from a generated stain; team standing preference is disdain for Anthropic Sonnet/Opus as default Judges (wasteful long-run); same vendor + different SKU satisfies independence; Judge outputs are strict structured JSON; model IDs live in config, not on Lesson records; a thin Judge port analogous to Generator.

---

## 2. Recommendation

**Pin one OpenAI model for every Judge check, text and vision: `gpt-5.6-luna`.** Fallback if luna is unavailable or schema-fails: **`gpt-5.6-terra`**, and only when Terra did not author that artifact. Do not use DeepSeek as Judge. Do not split text vs vision across **vendors or SKUs**. Do keep **two luna call shapes** so a media miss spends the one vision repair, not a Lesson regeneration ([Generated demonstrative media](https://linear.app/senoy/issue/SEN-28/generated-demonstrative-media)). Do not default to `claude-sonnet-5`, `claude-opus-5`, or `claude-haiku-4-5`. Do not judge with the same model ID that authored the artifact.

Current first-party model cards (fetched 2026-09-04) document that **luna accepts image input, emits text, and supports Structured Outputs**, at **$0.20 / $1.20 per 1M input/output tokens** (short context), 1.05M context, 128k max output, knowledge cutoff 16 February 2026. Terra and sol document the same modalities at 10× and 20× luna’s list price. That is enough to keep a single Responses-API Judge adapter: `text.format` `{ type: "json_schema", strict: true }` plus `input_image` blocks, no `web_search`, excerpts pasted as ordinary text with stable source IDs.

The independence bar is **different model ID**, not different vendor. Zheng et al. (NeurIPS 2023) report GPT-4 judges favoring their own answers by about 10 percentage points of win rate vs humans, Claude-v1 by about 25, while cautioning the study could not isolate quality from bias. Panickssery, Bowman, and Feng (NeurIPS 2024) show GPT-4 / GPT-3.5 / Llama 2 evaluators recognize and prefer their own generations even when humans rate quality equal. Cross-vendor Claude-as-judge is therefore optional, not required — and at Sonnet 5 **$2 / $10** (now the standard price) or Opus 5 **$5 / $25**, plus Claude 4.7+ tokenizer inflation of ~30% more tokens for the same text, it is the expensive way to buy a bias the product already forbids by SKU.

**Pairing (config, not Lesson records)**

| Author ID | Judge ID |
| --- | --- |
| `deepseek-v4-pro` (leading Generator) | `gpt-5.6-luna` |
| `gpt-5.6-terra` (fallback Generator) | `gpt-5.6-luna` |
| Luna down / schema-fails, author is DeepSeek | `gpt-5.6-terra` |
| Luna down / schema-fails, author is Terra | do not use Terra; keep a non-author Judge ID |

Vision-check: **same luna model, separate call** from the reading-Lesson text Judge, with the still (or a still frame of a loop) as `input_image` at `detail: "high"`. Checklist is caption/alt binary items (finger count, named stain colors, no logos, not a photomicrograph-looking generated field, not a named-work copy). Do **not** ask the VLM to ID Gram species from a generated stain ([Future Microbiology, 2024](https://doi.org/10.1080/17460913.2024.2381967)). Merging vision into the text Judge would fail the whole Lesson and spend a Lesson regeneration on a bad grip photo; SEN-28 kept one media repair inside generate. This **replaces** the SEN-28 placeholder that pinned Anthropic Messages image input on `claude-sonnet-5`.

Call settings for Judges: Responses API, `store: false`, `reasoning.effort: "none"` (OpenAI lists classification as a `none` use case; default `medium` bills hidden reasoning tokens as output). Do not enable `web_search`. Schema: `{ pass: boolean, failedChecks: string[], reasons: string[] }` — binary, not a score.

Residual quality risk: luna is the GPT-5.6 “nano” tier. If Test-course protocol finds missed factual errors after publish, bump Judge SKU in config (`luna` → `terra`) without changing the pairing rule — never to the model that authored the Lesson. That is config, not a new ticket.

### Rejected alternatives (one line each)

- **`claude-sonnet-5` / `claude-opus-5` as default Judge:** same Messages JSON schema as a Judge could use, but 10–25× luna list price on every Blueprint + Lesson + Quiz + Course + vision call, plus ~30% tokenizer inflation on Sonnet 5; not uniquely capable of binary checklist gates.
- **Same-ID self-eval (`gpt-5.6-sol` judging sol Lessons):** forbidden by the Quality bar; Panickssery et al. document self-preference even when humans rate quality equal.
- **Gemini Flash as a third Judge vendor:** luna already has vision + json_schema; extra ToS/SDK/keys; unpaid Gemini trains on prompts; Grounded Results storage bans if search is ever enabled. Last resort only — not needed.
- **`claude-haiku-4-5` as the cheap Anthropic Judge:** vision + structured outputs are documented, but **$1 / $5** is still ~5× luna, 200k context, retirement floor **15 October 2026**, and it is not a uniquely capable cheap option.
- **`gpt-5.6-sol` as Judge when it also authored:** violates different-ID. Luna covers the checks at 1/20 Sol list price. Terra is the Judge fallback/bump, never Sol.
- **`deepseek-v4-pro` as Judge:** Generator fallback only. No product Judge path on DeepSeek.
- **`gpt-6-astra` as Judge:** OpenAI’s evals guide says start with astra then optimize cost; astra is TAP-rolling-out at **$10 / $50** and does not support `reasoning.effort: "none"`. Wrong SKU for checklist gates.
- **OpenAI Evals platform as the production Judge:** platform is deprecating (read-only 31 Oct 2026, shutdown 30 Nov 2026). Use Responses + json_schema in our adapter.

### 2.1 Decision text for the Linear resolution comment

> Resolve with a single default Judge model: OpenAI `gpt-5.6-luna` via the Responses API (`text.format` json_schema strict, `reasoning.effort: "none"`, no web_search). Same model for Blueprint coverage, reading-Lesson claim/coverage/coherence, Quiz alignment, whole-Course coherence, and Demonstrative-media vision. Vision is a **separate luna call** (`input_image`, `detail: "high"`, caption/alt checklist — not Gram-species ID) so the one media repair does not draw on the Lesson repair budget. Fallback if luna is down, schema-fails, or would equal the author: `gpt-5.6-terra` (not Sol — Sol is the leading Generator). Pairing: author `gpt-5.6-sol` or `deepseek-v4-pro` → judge `gpt-5.6-luna`; if Judge ID equals Author ID, bump to `gpt-5.6-terra`. Do not default to Claude Sonnet/Opus/Haiku. Model IDs live in config behind a thin Judge port. Binary pass/fail JSON only. If Test-course protocol finds missed factual errors, bump Judge SKU in config (luna → terra) without changing the pairing rule.

The quote above is the original SEN-29 resolution. After [Provider bakeoff: OpenAI vs DeepSeek](https://linear.app/senoy/issue/SEN-20/provider-bakeoff-openai-vs-deepseek), authors are DeepSeek or Terra; Luna still judges; Terra-as-Judge only when Terra did not write.

---

## 3. Current OpenAI GPT-5.6 facts (re-verified 2026-09-04)

Mid-August 2026 research in `docs/research/llm-provider.md` listed luna $0.20/$1.20, terra $2/$12, sol $5/$30. **Re-fetch of the pricing page and model cards on 2026-09-04:**

| ID | Role in this product | Input / output (short context, per 1M) | Cached in | Context / max out | Knowledge cutoff | Image in | Structured outputs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `gpt-5.6-luna` | **Default Judge** | **$0.20 / $1.20** | $0.02 | 1.05M / 128k | 16 Feb 2026 | **Yes** | **Yes** |
| `gpt-5.6-terra` | **Fallback Generator** and Judge fallback (only if Terra did not author) | $2.00 / $12.00 | $0.20 | 1.05M / 128k | 16 Feb 2026 | Yes | Yes |
| `gpt-5.6-sol` (`gpt-5.6` alias) | Not in the Generator pair; not a default Judge | **$4.00 / $20.00** promotional | $0.40 | 1.05M / 128k | 16 Feb 2026 | Yes | Yes |

Sources: [models catalog](https://developers.openai.com/api/docs/models), [luna card](https://developers.openai.com/api/docs/models/gpt-5.6-luna), [terra card](https://developers.openai.com/api/docs/models/gpt-5.6-terra), [sol card](https://developers.openai.com/api/docs/models/gpt-5.6-sol), [pricing](https://developers.openai.com/api/docs/pricing).

**What changed vs August.** Luna and terra list prices match the August note. Sol is on **promotional** $4/$20 (20% lower input, 33% lower output vs the $5/$30 launch rate), “available at least through **21 November 2026**.” After [Provider bakeoff: OpenAI vs DeepSeek](https://linear.app/senoy/issue/SEN-20/provider-bakeoff-openai-vs-deepseek), Sol is not the leading Generator. Terra is both the fallback writer and the Judge bump when DeepSeek authored. Long-context (>272k input) is 2× input / 1.5× output for the full request; Judge prompts will not hit that. Cache writes are 1.25× uncached input. Regional processing endpoints: 10% uplift for eligible post–5 March 2026 models.

**Family positioning (vendor’s words).** Catalog: start with GPT-6 Astra for complex work; Terra to balance intelligence and cost; Luna for “cost-sensitive, high-volume workloads.” Luna card: “roughly corresponds to the **nano** model tier used in earlier GPT-5 families.” Terra ≈ mini; sol ≈ unsuffixed flagship. Speed on all three cards: Fast. Reasoning.effort on all three: `none`, `low`, `medium` (default), `high`, `xhigh`, `max`.

**GPT-6 Astra** (`gpt-6-astra`, $10/$50, cutoff 30 Apr 2026) is rolling out to TAP enterprises “today” on the catalog page. OpenAI’s [evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices) say start with astra as an LLM judge, then optimize for cost. Astra does **not** support `reasoning.effort: "none"` (HTTP 400). It is the wrong default for binary checklist gates billed on every Lesson.

**Endpoints.** Luna/terra/sol: Chat Completions, Responses, Batch. Features on the luna card: Streaming, Function calling, **Structured outputs**, Image **input only**. Tools on Responses include web search — **do not enable it** for Judges (You.com is the search layer; excerpts are already in the prompt).

**Rate limits (luna, published on the model card).** Free: not supported. Tier 1: 500 RPM / 500k TPM; Tier 2: 5k / 2M; Tier 5: 30k / 180M. Terra/sol Tier 1 is 500 RPM / 500k TPM with a smaller batch queue than luna. Org usage tiers still spend-gated ($5 paid → Tier 1 … $1,000 paid → Tier 5, $200k/mo cap) per the [rate-limits guide](https://developers.openai.com/api/docs/guides/rate-limits). A Course of ~25 Judge calls is inside Tier 1.

**Training / ownership.** [Your data](https://developers.openai.com/api/docs/guides/your-data): as of 1 March 2023, API data is not used to train unless you opt in. `/v1/responses`: no training; abuse logs 30 days; application state 30 days when `store` is true/default — set **`store: false`** on Judge calls. [Services Agreement](https://openai.com/policies/services-agreement/) effective 1 January 2026 §4.1: Customer retains Input and **owns Output**; OpenAI assigns its interest. §4.2: OpenAI will not use Customer Content to develop or improve Services unless Customer explicitly agrees. §4.3: Customer evaluates accuracy.

---

## 4. Vision and structured JSON on luna — one model, no split

Prior media note (`generated-demonstrative-media.md`, 29 Aug 2026) left OpenAI `gpt-5.6-terra` image-input **unverified** and pinned Claude vision because Anthropic’s vision docs were fetched. **Re-verification 2026-09-04:**

**Image input is documented for luna, terra, and sol.** Catalog: “All latest OpenAI models support text and image input … and vision.” Luna card modalities: Text in/out, **Image input only**. [Images and vision](https://developers.openai.com/api/docs/guides/images-vision): the GPT-5.6 family (`gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`) supports `detail` `low` | `high` | `original` | `auto`. `low` fits 512×512; `high` fits 2048×2048 and 2,500 patches; `original` preserves dimensions (cap 65,535 px/side; reject if >30,000 patches); **`auto` uses original’s sizing**. Files: PNG, JPEG, WEBP, **non-animated** GIF. Responses API block: `{ type: "input_image", image_url: "<https or data URL>", detail: "high" }` (or `file_id`). Official TS: `openai.responses.create`.

**Token cost of a vision-check still.** Patch tokenizer is 32×32; GPT-5.6 multiplier **1.2**. Documented example: 1024×1024 at `high` → 1024 patches → `ceil(1024 × 1.2) = 1229` input tokens. At luna $0.20/1M that is **~$0.00025** of image tokens. `low` would be cheaper but OpenAI recommends higher detail for spatially sensitive tasks (finger count, small logos). Pin **`detail: "high"`**, not `auto`/`original` (original can explode tokens on a 4K Commons file).

**Loops.** Vision accepts WEBP but only **non-animated** GIF is listed. For a silent animated WebP, pass a **representative still frame** (first or mid frame) plus caption/alt that names the motion. Do not send video.

**Structured Outputs.** [Guide](https://developers.openai.com/api/docs/guides/structured-outputs): Responses uses `text.format` `{ type: "json_schema", strict: true, name, schema }` (not Chat Completions `response_format`). Compatible models: `gpt-4o-2024-08-06` / `gpt-4o-mini` **and later** — GPT-5.6 is later; luna card lists Structured outputs **Supported**. The 2024 first-party announcement states Structured Outputs with response formats is **compatible with vision inputs**. Use json_schema on **both** luna call shapes: text-only for Blueprint / reading claims / Quiz / whole-Course; `input_image` + json_schema for the media checklist. Do not merge those into one Lesson call (repair budgets differ).

**Why not split vision to Claude.** SEN-28 used Claude because OpenAI vision was unverified. It is now verified on luna. A second vendor for a checklist that is cheaper on luna is the waste the ticket asked to avoid.

---

## 5. Independence: different model ID, not different vendor

Locked Quality bar: “a model that did not author.” Academic evidence supports *that* bar, not a mandatory cross-vendor pair.

**Zheng, Chiang, Sheng, et al., NeurIPS 2023, “Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena”** ([arXiv:2306.05685](https://arxiv.org/abs/2306.05685); [NeurIPS PDF](https://proceedings.neurips.cc/paper_files/paper/2023/file/91f18a1287b398d378ef22505bf41832-Paper-Datasets_and_Benchmarks.pdf)). Limitations of LLM judges include **position bias** (favor first answer; GPT-4 default-prompt consistency 65%, often first-position), **verbosity bias**, and **self-enhancement**. On win rate vs humans: “GPT-4 favors itself with a **10%** higher win rate; Claude-v1 favors itself with a **25%** higher win rate.” The authors **cannot determine** whether that is true self-enhancement vs quality, because they could not restyle answers without changing quality. GPT-4 still matched human experts at >80% agreement (human–human ~81%). Mitigations they actually tested: swap positions for pairwise; reference-guided prompts for math. **Our gates are single-artifact pass/fail against excerpts/objectives, not pairwise chat ranking** — position bias of A-vs-B is mostly out of scope; self-enhancement of “this looks like my prose” is in scope.

**Panickssery, Bowman, Feng, NeurIPS 2024, “LLM Evaluators Recognize and Favor Their Own Generations”** ([arXiv:2404.13076](https://arxiv.org/abs/2404.13076); [NeurIPS PDF](https://proceedings.neurips.cc/paper_files/paper/2024/file/7f1f0218e45f5414c79c0679633e47bc-Paper-Conference.pdf)). Self-preference: an evaluator scores **its own** outputs higher than others’ while **humans consider them equal quality**. GPT-4, GPT-3.5 Turbo, and Llama 2 all show this on summarization. Out of the box, GPT-4 is **73.5%** accurate at distinguishing itself from two other LLMs and humans. Fine-tuning self-recognition **linearly increases** self-preference. Ordering bias remains (GPT-4 reverses pairwise preference 25% of the time when options swap).

**Implication for this product.** Forbidding same-ID self-eval is the evidence-backed control. Paying 10–25× for Claude to judge OpenAI Lessons is **not** required by these papers: they study same-model (often same-checkpoint) preference, not “any OpenAI SKU prefers any other OpenAI SKU.” Luna judging Sol is a different ID in the same family. That matches the locked rule and the cost preference. If later Test-course misses look like family-style leniency, the config bump is luna → **terra** (still ≠ sol), not a new vendor.

**OpenAI’s own evals guidance** ([evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)): LLM-as-judge is cheaper than humans; challenges are position and verbosity bias; **“Use pairwise comparison or pass/fail for more reliability”**; start capable then **“once the LLM judge … is faster, cheaper, and consistently agrees with human annotations, scale up.”** Our Quality bar already locked pass/fail. Human calibration is the Test-course protocol after publish, not a per-Lesson HITL.

**Reference-guided, not taste.** Zheng’s math failures improved with a reference answer. Our reading Judge already receives the retrieval set. That is the high-leverage prompt design: “every factual claim must be supported by excerpt `<sourceId>` … fail if unsupported,” not “which Lesson is nicer.”

---

## 6. Pairing rule (pin this)

Independence is evaluated **per artifact** at Judge time:

1. Read `authorModelId` from the generate config used for that Blueprint / Lesson / Quiz (not stored as a new Lesson field — the job already knows which adapter/SKU wrote it).
2. Select `judgeModelId` from config (default `gpt-5.6-luna`).
3. If `judgeModelId === authorModelId`, pick a Judge that did not author. Terra is that bump only when Terra did not write the artifact.
4. Never select `deepseek-v4-pro` as Judge. Never select `gpt-5.6-terra` as Judge when Terra authored that artifact. Sol is not a default Judge.

Worked cases:

- DeepSeek wrote the Lesson → luna judges (IDs differ).
- Terra fallback wrote the Lesson → luna judges (IDs differ). Do not fall back to Terra-as-Judge on that artifact.
- Luna is 429/5xx or returns a `refusal` / schema compiler 400 → retry once with backoff; then fallback terra **only if** Terra did not author.

Two regenerations per slot then terminal (locked). A Judge **fail** consumes a regeneration of the *artifact*, not a second Judge SKU, unless the Judge call itself errored.

---

## 7. Cost and latency ballpark (one Course)

**Assumptions (explicit).** ~16 reading Lessons + 4 Quizzes + 1 Blueprint + 1 whole-Course Judge. Reading Judge prompt ≈ 15k input (body + excerpts + objectives + prior titles/goals) and 0.8k structured JSON out. Quiz Judge ≈ 25k in (assessed Lesson bodies) / 1k out. Blueprint ≈ 8k / 0.8k. Whole-Course ≈ 12k / 1k (titles, goals, objectives, short commitments — not a re-judge of every Lesson). Vision on **8** media slots: 1229 image tokens + 2k text in / 0.5k out each, `detail: "high"`. `reasoning.effort: "none"` so output is roughly the JSON, not hidden reasoning. No web_search. Short-context list prices. Claude 4.7+ tokenizer ≈ **30% more tokens for the same text** ([Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)); apply that to Sonnet 5 / Opus 5 only. Haiku 4.5 predates that tokenizer.

| SKU | In + image (k) | Out (k) | List $ / Course | vs luna |
| --- | --- | --- | --- | --- |
| **`gpt-5.6-luna` (pin)** | ~386 | ~23 | **~$0.11** | 1× |
| `gpt-5.6-terra` as Judge | ~386 | ~23 | ~$1.05 | ~10× |
| `gpt-5.6-sol` fallback | ~386 | ~23 | ~$2.00 at promo $4/$20 | ~18× |
| `claude-sonnet-5` | ~502 (×1.3) | ~30 | **~$1.30** | ~12× |
| `claude-opus-5` | ~502 | ~30 | **~$3.26** | ~30× |
| `claude-haiku-4-5` | ~386 | ~23 | ~$0.51 | ~5× |

Token sums: reading 16×15k = 240k in, 12.8k out; quizzes 100k in, 4k out; Blueprint 8k / 0.8k; Course 12k / 1k; vision text 16k / 4k; vision images ~10k. If every slot spends both regenerations, multiply Judge spend by up to ~3× — luna still **well under $1** per Course. Medium reasoning effort could add hundreds to tens of thousands of **billed output** tokens per call ([reasoning guide](https://developers.openai.com/api/docs/guides/reasoning)); that is why Judges pin `none`.

**Why Sonnet/Opus are wasteful here.** A Publish-gate Judge is a binary checklist with the evidence already in the prompt. You are not buying agentic coding, 1M-context adaptive thinking, or OpenAI’s “start with astra” preference-ranking judge. You are buying json_schema adherence + instruction following, ~25 times per Course, forever. Sonnet 5 at $2/$10 is the **same input price as terra** with **more** tokens per word; Opus 5 is a research-lab luxury SKU for a pass/fail. Haiku is the only Anthropic SKU in the “cheap” neighborhood, and it is still 5× luna without being uniquely capable (§8).

**Latency.** Luna card: Speed Fast; `none` effort is the latency-critical classification setting. Sequential ~25 Judge calls at ~1–3 s each is tens of seconds, not minutes. Default `medium` reasoning plus Claude adaptive thinking (Sonnet/Opus default effort `high`) would add think-time on every gate. Vision `high` is still a still-image encode, not gpt-image-2’s “up to 2 minutes” generate path.

---

## 8. Anthropic as Judge — capable, wrong default

**Current IDs and prices** ([models overview](https://platform.claude.com/docs/en/about-claude/models/overview); [pricing](https://platform.claude.com/docs/en/about-claude/pricing); [Haiku 4.5](https://platform.claude.com/docs/en/models/haiku-4-5/overview)):

| ID | Price in/out | Context | Vision | Structured outputs | Notes |
| --- | --- | --- | --- | --- | --- |
| `claude-sonnet-5` | $2 / $10 (**standard**; the 1 Sep 2026 hike to $3/$15 **will not occur**) | 1M / 128k | Yes | Yes (`output_config.format` json_schema) | Not a Generator or Judge in this product |
| `claude-opus-5` | $5 / $25 | 1M / 128k | Yes | Yes | Adaptive thinking, default effort `high` |
| `claude-haiku-4-5` (alias → `claude-haiku-4-5-20251001`) | $1 / $5 | 200k / 64k | **Text and images → text** | Yes (listed on structured-outputs supported models) | Fastest; retirement **not sooner than 15 Oct 2026** |

**Vision** ([guide](https://platform.claude.com/docs/en/build-with-claude/vision)): `image` blocks, base64 / URL / `file_id`. Haiku is on the standard-resolution tier; Anthropic’s own example prices a 1000×1000 image at Haiku 4.5 ≈ **$1.30 per thousand images** vs luna’s ~$0.25 per thousand 1024² `high` stills.

**Structured outputs vs citations.** [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs): citations **cannot** combine with `output_config.format` (400 — citations interleave with text). **Judges will not use `citations.enabled`.** They receive excerpts as ordinary text + source IDs. So the 400 does not block Claude as a Judge; it just does not make Claude better than luna for this job.

**Tokenizer.** Claude 4.7+ (includes Sonnet 5) ≈ 30% more tokens for the same text vs Sonnet 4.6 and earlier. Haiku 4.5 (Oct 2025) is on the older tokenizer.

**Commercial Terms §B** ([fetched](https://www.anthropic.com/legal/commercial-terms)): Customer owns Outputs; Anthropic may not train on API Customer Content. Fine contract — still the expensive vendor for this role.

**Haiku is not the uniquely capable cheap option.** It has vision + json_schema, but luna has both at ~1/5 the price, 1.05M context vs 200k, and a retirement floor six weeks from this note’s date vs a current GPT-5.6 SKU. Using Haiku would also keep a second SDK on the **Judge** path even when OpenAI authored. Reject as default. Do not use it as fallback (fallback is terra).

---

## 9. Gemini as a rejected third vendor

Luna already does image+text+json_schema. A third vendor is extra ToS, SDK, and keys.

[Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms) (official URL; **full HTML timed out** this pass — clauses from the live-page extract of that URL, consistent with the 29 Aug media note’s fetch): unpaid Gemini **uses prompts/responses to improve products**; paid does not. **Grounding with Google Search:** do not cache/store/build a database of Grounded Results except narrow eval/chat-history cases. A Judge that never enables `google_search` would not mint Grounded Results — the Generator-rejection (storage ban + unpaid training) is therefore **weaker** for a search-off Judge. It is still a last-resort vendor. **Not needed:** OpenAI’s cheaper SKUs document the required features. Gemini model/pricing pages also timed out this pass; do not pin a Flash ID from memory.

---

## 10. Adapter, schema, and prompt contract

**Port.** Domain code depends on a thin `Judge` interface. OpenAI Responses types stay in `adapters/openai/`; Anthropic types stay in the Generator fallback adapter and are **not** required for Judges.

```ts
/** Config, not Lesson records. */
type JudgeConfig = {
  judgeModelId: "gpt-5.6-luna";
  judgeFallbackModelId: "gpt-5.6-terra";
};

type JudgeCheckId =
  | "blueprint_coverage"
  | "blueprint_prereq_order"
  | "blueprint_no_redundant_slot"
  | "blueprint_quiz_chunk"
  | "lesson_claim_grounding"
  | "lesson_objectives_taught"
  | "lesson_sequential_coherence"
  | "lesson_no_named_work_substitute"
  | "lesson_media_vision"
  | "quiz_objectives_hit"
  | "quiz_answerable_from_lessons"
  | "quiz_one_correct"
  | "quiz_distractors"
  | "course_coherence"
  | "course_reaches_goal";

type JudgeVerdict = {
  pass: boolean; // false if any required check failed
  failedChecks: JudgeCheckId[];
  reasons: string[]; // short, one per failed check
};

type JudgePort = {
  judge(input: {
    checks: JudgeCheckId[];
    artifact: unknown; // Blueprint | Lesson | Quiz | Course summary
    excerpts?: { sourceId: string; text: string }[];
    images?: { mediaType: string; dataUrl: string }[]; // stills / loop frames
  }): Promise<JudgeVerdict>;
};
```

**Call shape (adapter-internal).** `openai.responses.create({ model, input, text: { format: { type: "json_schema", strict: true, name: "judge_verdict", schema } }, reasoning: { effort: "none" }, store: false, max_output_tokens: 2048 })`. Attach `input_image` only for media vision. Zod in the official SDK may build the schema; still validate `failedChecks` ⊆ requested checks in-process (Code check).

**Grounding.** System+user text includes numbered excerpts `{ sourceId, url, quotedText }`. Instruct: fail `lesson_claim_grounding` if a factual claim has no supporting excerpt; never invent a URL; never call tools. Drop any model-emitted URL not in the retrieval set (existing Source-trust rule).

**Vision checklist (binary, caption/alt-derived).** Required slots fail closed; optional decorative may skip (locked). Items: five fingers per visible hand; stick through thumb–index if the caption claims that fulcrum; colors match **named** caption colors (purple/pink as words, not species); no logos or watermarks; not a generated field that looks like a photomicrograph; not a substitute of a named work. **Forbidden item:** “what species / Gram result is this generated stain.” Library photomicrographs may be checked for “cells are purple and round **as the caption states**”; generated micrographs are already a Code/policy fail before the Judge.

**Code vs Judge.** Schema validity, citation URLs ∈ retrieval set, plugin method-shape remain Code checks. Judge does not re-do those.

---

## 11. Vision-check accuracy limits (do not overclaim)

The Future Microbiology 2024 paper (DOI [10.1080/17460913.2024.2381967](https://doi.org/10.1080/17460913.2024.2381967); already cited in the media note): GPT-4o and Gemini 1.5 Pro **failed** unprimed Gram stain and shape ID for *N. gonorrhoeae*; authors: unprimed VLMs are **not ready for clinical practice**. Luna is a cheaper general VLM. It is a **caption checklist**, not a lab instrument. Finger-count / logo / “looks like a fake micrograph” are the right questions; species ID is not.

OpenAI vision docs: account for model limitations; `high`/`original` when spatial detail matters. That supports `detail: "high"` for hands, not clinical microscopy.

---

## 12. Risks the spec should carry

- **Luna weaker than terra/sol on hard unsupported claims.** Residual. Mitigation: Test-course protocol; config bump luna → terra; keep pairing rule.
- **`reasoning.effort` default is `medium`.** Forgetting to set `none` silently multiplies output cost. Pin it in the adapter.
- **`detail: "auto"` on GPT-5.6 is original-sized**, not a cheap default. Pin `high`.
- **Animated WebP / loops.** Pass a still frame; do not assume animated WEBP is a legal vision input.
- **Structured-output refusals.** Safety refusals may not match the schema; Responses includes a `refusal` field — treat as Judge-call error → retry/fallback, not a Lesson pass.
- **Sol promo expiry 21 Nov 2026+.** Sol is not in the Generator pair after the bakeoff lock; ignore as a pricing risk for writing.
- **Haiku retirement floor 15 Oct 2026** — another reason not to pin it.
- **OpenAI Evals shutdown 30 Nov 2026.** Do not build production Judges on that product.
- **Same-family leniency** is not quantified for luna-vs-sol in these papers. If Test-course shows luna rubber-stamping sol prose, bump SKU (terra) rather than adding Claude.
- **Services Agreement / Usage Policies** were fetched this pass for §4.1–4.4; Usage Policies HTML was not separately re-crawled. Re-fetch before launch if policy owners need quotes.

---

## 13. Sources

Every URL fetched or used as a primary authority in this note.

### OpenAI (fetched 2026-09-04)

- Models catalog (luna/terra/sol IDs, vision on all latest, prices, astra TAP): https://developers.openai.com/api/docs/models
- GPT-5.6 Luna (image in, structured outputs, $0.20/$1.20, 1.05M, cutoff, RPM/TPM, nano-tier): https://developers.openai.com/api/docs/models/gpt-5.6-luna
- GPT-5.6 Terra: https://developers.openai.com/api/docs/models/gpt-5.6-terra
- GPT-5.6 Sol (promo $4/$20 through at least 21 Nov 2026, `gpt-5.6` alias): https://developers.openai.com/api/docs/models/gpt-5.6-sol
- Pricing (short/long context, cache writes, sol promo note): https://developers.openai.com/api/docs/pricing
- Changelog (luna −80% / terra −20% from 30 Jul 2026; family launch; original image detail): https://developers.openai.com/api/docs/changelog
- Images and vision (GPT-5.6 detail table, 1.2× multiplier, 1024² = 1229 tokens, file types, Responses `input_image`): https://developers.openai.com/api/docs/guides/images-vision
- Structured Outputs (`text.format` json_schema strict; gpt-4o-2024-08-06 and later): https://developers.openai.com/api/docs/guides/structured-outputs
- Introducing Structured Outputs (vision-compatible response formats, 2024): https://openai.com/index/introducing-structured-outputs-in-the-api/
- Responses create (`input_image` `detail` enum): https://developers.openai.com/api/reference/resources/responses/methods/create/
- Reasoning (`none` = classification/latency; tokens billed as output; GPT-5.6 default medium; astra rejects `none`): https://developers.openai.com/api/docs/guides/reasoning
- Evaluation best practices (LLM-as-judge, pass/fail, start capable then cheap): https://developers.openai.com/api/docs/guides/evaluation-best-practices
- Graders (separate model grades training model): https://developers.openai.com/api/docs/guides/graders
- Rate limits (tiers, RPM/TPM, 429): https://developers.openai.com/api/docs/guides/rate-limits
- Your data (no training default 1 Mar 2023; Responses store / ZDR): https://developers.openai.com/api/docs/guides/your-data
- Services Agreement effective 1 Jan 2026 (§4.1 own Output, §4.2 no train unless agreed): https://openai.com/policies/services-agreement/
- GPT-5.6 launch post (family; older $1/$6 luna / $2.50/$15 terra / $5/$30 sol — superseded by pricing page): https://openai.com/index/gpt-5-6/

### Anthropic (fetched 2026-09-04)

- Models overview (IDs, prices, vision on all current, tokenizer 30% note, Haiku 200k): https://platform.claude.com/docs/en/about-claude/models/overview
- Haiku 4.5 (dated ID, $1/$5, images→text, retirement not sooner than 15 Oct 2026): https://platform.claude.com/docs/en/models/haiku-4-5/overview
- Pricing (Sonnet 5 $2/$10 now standard; tokenizer 30%; Haiku $1/$5; Opus $5/$25): https://platform.claude.com/docs/en/about-claude/pricing
- Vision (image blocks, limits, Haiku token example): https://platform.claude.com/docs/en/build-with-claude/vision
- Structured outputs (json_schema; citations + format = 400; Haiku listed): https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- Commercial Terms §B (own Outputs, no API training): https://www.anthropic.com/legal/commercial-terms

### Google (partial this pass)

- Gemini API Additional Terms (unpaid trains; Grounded Results storage — full HTML **timed out**; live-page extract used): https://ai.google.dev/gemini-api/terms
- Gemini pricing / models catalog: **timed out** 2026-09-04

### Academic / clinical (original papers)

- Zheng et al., *Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena*, NeurIPS 2023 (position / verbosity / self-enhancement 10% GPT-4, 25% Claude-v1; >80% human agreement): https://arxiv.org/abs/2306.05685 and https://proceedings.neurips.cc/paper_files/paper/2023/file/91f18a1287b398d378ef22505bf41832-Paper-Datasets_and_Benchmarks.pdf
- Panickssery, Bowman, Feng, *LLM Evaluators Recognize and Favor Their Own Generations*, NeurIPS 2024 (self-preference; GPT-4 73.5% self-recognition): https://arxiv.org/abs/2404.13076 and https://proceedings.neurips.cc/paper_files/paper/2024/file/7f1f0218e45f5414c79c0679633e47bc-Paper-Conference.pdf
- Future Microbiology 2024, VLM Gram ID failure (DOI): https://doi.org/10.1080/17460913.2024.2381967

### Already locked in prior notes (re-cited, not re-opened)

- Quality bar / Judge vs Code / binary gates: glossary in `CONTEXT.md`
- Generator `deepseek-v4-pro` / `gpt-5.6-terra`; OpenAI structured outputs: `docs/research/llm-provider.md` (amended 2026-09-04, bakeoff lock)
- Demonstrative media generate path; vision-check placeholder on Claude; no generated photomicrographs: `docs/research/generated-demonstrative-media.md`

### Unreached / uncertain

- **Gemini API Additional Terms, pricing, and model cards:** WebFetch **timed out** 2026-09-04. Rejection of Gemini as a third Judge vendor rests on luna already covering vision+json_schema (fetched) plus a live-page extract of the Additional Terms URL for unpaid training / Grounded Results. Re-fetch `https://ai.google.dev/gemini-api/terms` if legal needs a verbatim quote.
- **OpenAI Usage Policies HTML** was not separately fetched this pass (Services Agreement and Your-data were).
- **No first-party benchmark** that luna matches terra on *this product’s* claim-grounding rubric. Residual risk is named; bakeoff-adjacent config bump is the control.
- **Whether luna `auto` image detail will change** away from original-sized: pin `high` so we do not depend on that.
- **Animated WEBP as vision input:** not explicitly allowed; still-frame is the safe pin.
- **Family-level (not same-ID) self-preference** for luna judging sol: not measured in Zheng or Panickssery. Different ID is the locked bar; terra bump if Test-course shows leniency.

---

*End of research note.*
