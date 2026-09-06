# Generated Demonstrative media

**Date:** 2026-08-29

When the media library has no good illustration or animation, how should the product generate simple, accurate, minimal **Demonstrative media**? Which options (still image, looping animation, which models or tools, human-authored vs model-generated) fit the three Test courses — matched-grip / stroke, Gram staining, Valhalla — and what licensing, accuracy, and fallback rules should the spec lock? Locked constraints: TypeScript full-stack; OpenAI `gpt-5.6-terra` leads text generation, Anthropic `claude-sonnet-5` is the fallback Generator adapter; teaching methods shipping are reading + quizzes only (AV as a *teaching method* is out of scope); Demonstrative media is a hosted image/animation/audio clip *inside a reading Lesson*; prefer the best original/licensed/Commons file, else generate; store file + sibling Media descriptor (kind, caption, alt, Source, license, origin library|generated); published Lessons snapshot those fields; You.com Search cannot supply media bytes; do not scrape YouTube; Vic Firth / PAS / Drumeo ToS do not grant remix licenses; named-work Learning Goals must not get a generated substitute copy; bytes live in a private Supabase Storage bucket on stable app paths; library lookup is Media descriptors tagged with Media category + Topic tags; generation runs inside sequential Lesson generate, before that Lesson is checkpointed; media failure is a Lesson defect (bounded repair, then terminal fail at that slot).

---

## 2. Recommendation

**This section matches the closed Linear resolution on [Generated demonstrative media](https://linear.app/senoy/issue/SEN-28/generated-demonstrative-media).** Later sections keep extra vendor and file-page evidence from a parallel research pass; they do not reopen the lock.

**Library lookup, then Commons/PHIL ingest into private Storage, then generate.** Default generate path is **SVG** from the existing text Generator. Pictorial stills SVG cannot draw use OpenAI **`gpt-image-2`** (snapshot `gpt-image-2-2026-04-21`, `size: "1024x1024"`, `quality: "medium"`, `output_format: "webp"`, `moderation: "auto"`). Loops are silent SVG+CSS (or SVG-frame / 2–4-frame animated WebP) only when motion is load-bearing; if that fails, sequenced stills. Never generate photomicrographs, named-work copies, living-person likeness, or video. Audio is library-or-skip.

**Lookup.** Query Media descriptors by Media category + Topic tags. A hit is **good enough** only if all of: (1) it depicts the named technique, anatomy, or mythic *concept* correctly (not a decorative vibe image); (2) it is labeled if the Lesson objectives require labels; (3) the product can *host* the bytes under a recorded license (public domain / CC0 / CC BY / CC BY-SA with TASL on the descriptor; CDC PHIL public-domain with CDC credit and no CDC logo; **not** CC BY-NC; **not** Vic Firth / PAS / Drumeo / YouTube files); (4) it is not a substitute copy of a named work (no “Iris” chart, no official-looking album art, no PAS rudiment engraving, no Marvel / *God of War* Valhalla). Snapshot the descriptor onto the published Lesson.

**If miss — ingest, do not hotlink.** Worker queries Wikimedia Commons (`generator=search` + `imageinfo` `extmetadata`) with a descriptive User-Agent; Gram photomicrographs also from CDC PHIL public-domain records. Copy bytes into the private bucket; write a library Media descriptor so later Courses attach. Do not use You.com Images.

**If still miss — generate by kind.**
- **Labeled diagram / procedure / schematic / family-tree / kit layout:** existing text Generator emits **constrained SVG** (`image/svg+xml`). Validate (no `<script>`, no `foreignObject` html). Origin `generated`. Do not ask `gpt-image-2` to place precise labels — OpenAI’s own image guide lists text placement and layout-sensitive composition as remaining limitations.
- **Pictorial still SVG cannot draw:** `POST /v1/images/generations` with `gpt-image-2` via the official `openai` SDK. Prompt from Lesson goal, objectives, caption/alt, plus hard negatives (no logos, no living-artist style, no named copyrighted characters, no fake microscopy). Decode `b64_json`; store WebP; descriptor `origin: generated`, license = OpenAI Output (Services Agreement §4.1). Organization Verification may be required (deploy prerequisite). Claude does not generate rasters — use it for the vision-check.
- **Loop (motion load-bearing only):** silent SVG+CSS or SMIL for schematic cycles (stain-color sequence, stick path). Raster fallback: silent animated WebP from 2–4 frames (library stills if they exist, else generated frames with a shared style prompt). Cap ~4 seconds, no soundtrack. If that fails bounded repair, an ordered **sequence of stills**. Not Sora / Videos API (deprecated, shutdown 24 September 2026).

**Seed.** Prototype ships a small human-curated catalog before first generation: CDC PHIL + Commons Gram photos/diagrams, Commons grip stills plus one original silent rebound loop if a photographed strip exists, PD historic Valhalla plates. Generation remains the fallback for Lessons those seeds do not cover.

**Where.** Inside sequential Lesson generate, after caption/alt exist, before checkpoint. One moderation/vision repair, then Lesson defect on **required** slots. Optional decorative stills may skip. Quizzes skip media.

**Test-course table**

| Slot | Library vs generate | Still vs loop | Fail closed if… |
| --- | --- | --- | --- |
| **Gram photomicrograph** (purple cocci vs pink rods) | **Library only.** Seed CDC PHIL public-domain photos (e.g. 2296, 2297, 2842, 1947) and/or Commons `File:Gram stain 01.jpg` (CC BY-SA 3.0). | Still | Generate is forbidden. If no PD/CC file, **terminal Lesson fail** at that slot after bounded lookup repair. |
| **Gram procedure / cell wall** | **Library first:** Commons `File:Gram Stain.png` (CC BY-SA 4.0 procedure diagram), `File:Gram-Cell-Wall.jpg` (PD), `File:Zellwand-Gramfärbung Grau.svg` (CC BY 3.0). Miss → **SVG schematic** from the text LLM, not a fake micrograph. | Still; optional 4-frame silent WebP of reagent steps if the objective is sequence, built from the library diagram’s panels or SVG states — not a video model | Generated *photomicrograph-looking* stills |
| **Matched grip / fulcrum still** | **Library first:** Commons `File:Matchedsnaregrip.jpg`, `File:Matched Grip.jpg`, `File:German grip.jpg` (all CC BY-SA 4.0); kit diagram `File:Drum kit illustration edit.svg` (CC BY-SA 3.0). | Still | Generated photoreal hands that fail the vision-check (finger count / stick fulcrum). Prefer library. |
| **Rebound stroke loop** | **Seed one original silent loop** (product-authored phone clip or three photographed frames). Commons “fulcrum grip” GIFs are **four-mallet marimba**, wrong technique. Vic Firth video is cite-not-copy. Generate-fallback: 3 `gpt-image-2` frames → silent WebP, then vision-check. | **Loop** (the one load-bearing animation in the prototype) | If loop fails check, fall back to the three stills as a strip. If Blueprint marked the loop **required** and stills are not good enough, Lesson defect. |
| **Valhalla / mythic corpus** | **Library first:** PD historic illustrations (`File:Walhall by Emil Doepler.jpg`, `File:Walhalla (1896) by Max Brückner.jpg`). Caption must say this is **one artist’s depiction**, not a photograph of a place and not “the” canonical Valhalla. | Still. No loop unless a later Lesson needs a cyclic schematic (e.g. Ragnarök cycle diagram as SVG). | Prompting Marvel / *God of War* / living-artist style; generating a substitute of a named in-copyright illustration |
| **Iris / named work** | **Never generate** chart, album art, transcribed notation, or “official” stills. Generic skill media (6/8 vs 4/4 schematic, kit diagram) is OK. | Still / SVG | Any named-work substitute |
| **Quizzes** | Skip media (locked). | — | — |

**Licensing.** As between the product and OpenAI, Customer owns Image API Output (Services Agreement §4.1, effective 1 Jan 2026); OpenAI assigns its interest, if any. Outputs may not be unique (§4.4). Customer remains responsible for evaluating accuracy and for third-party IP in the prompt. Commons files keep their per-file license; hosting CC BY-SA requires TASL (title, author, source URL, license URL) on the Media descriptor and share-alike on *that asset* (not on the whole Lesson prose). CDC PHIL public-domain images: credit CDC + photographer when named; link back to the PHIL record; do not add the CDC logo; do not imply endorsement. Never prompt for named copyrighted works or living-artist styles (OpenAI 4o image system card refuses living-artist style; Usage Policies forbid unconsented photoreal likeness).

**Where in Lesson generate (locked slot).** After the text Generator has drafted the reading body plus caption/alt for each Demonstrative-media content block, and **before** the Lesson is checkpointed: (1) library lookup; (2) on miss, Commons/PHIL ingest; (3) on still miss, generate SVG or `gpt-image-2` still / loop; (4) store bytes + descriptor; (5) cheap vision-check via Anthropic Messages **image input** (`claude-sonnet-5`) against a checklist derived from caption/alt (finger count, stain colors named in the caption, “no logos”); (6) on moderation_blocked or vision-check fail, **one** prompt repair then retry; (7) still failing → Lesson defect at that slot (bounded repair already spent) → terminal fail of that Lesson, not a silent skip, **when the Blueprint marked media required**. If media was **optional** (decorative mythic still), skip the block and continue. Quizzes never enter this path.

**Audio (this ticket).** **Stills + optional silent loops only. Audio is library-or-skip.** OpenAI’s speech endpoint is TTS (`gpt-4o-mini-tts`) for spoken narration, with a required disclosure that the voice is AI — it cannot be a flam or a backbeat. Drumming research already established that Vic Firth / Alfred rudiment audio is copyrighted. Do not spec TTS or sfx generation here. A later ticket may ingest original pad/kit recordings into the library.

**Fail closed when:** generating a Gram *photomicrograph*; generating a named-work substitute; Commons/PHIL license is NC, missing, or Wikipedia non-free; Vic Firth / PAS / Drumeo / YouTube bytes; moderation still blocked after one repair on a required slot; vision-check fails on a required motor-skill or medical image; the Generator asks for an AV teaching method.

### Rejected alternatives (one line each)

- **Generate every miss with no seed library:** OpenAI documents up to ~2 minutes per complex image; a 3-frame loop plus repair can blow the sequential Course job; Gram/grip accuracy is worse than CDC/Commons files that already exist.
- **Gemini Nano Banana (`gemini-3.1-flash-image`) as the raster vendor:** Paid image output is cheap (~$0.067 / 1K image) and Google won’t claim ownership, but Grounding-with-Search storage bans still apply if you turn search on; unpaid quota trains on prompts; clinical-practice/medical-advice ban; extra vendor beside the locked OpenAI/Anthropic pair; all images get SynthID.
- **Anthropic raster generation:** Help Center (fetched 2026-08-29): Claude does not generate photos or illustrations; vision + HTML/SVG diagrams only. Use it for the vision-check and optional SVG, not for PNG.
- **Imagen 4 via Gemini `generate_images`:** Official Imagen page: deprecated, shutdown **17 August 2026**; migrate to Nano Banana. Do not spec it on 29 August 2026.
- **fal.ai Flux / Stability / Recraft as the generate path:** fal has `@fal-ai/client` and claims commercial use on-platform; Recraft assigns Asset copyright but forbids training-on-assets and has no first-party TypeScript SDK (REST / OpenAI-Python-compatible). Extra vendor, extra ToS, no accuracy win for Gram/grip. Rejected for the prototype.
- **Sora / Runway / Kling / Luma video models:** Sora 2 + Videos API shutdown **24 September 2026**; async jobs measured in seconds of *video* not stills; clips include audio; that is an AV teaching method in all but name. Out of scope.
- **Lottie / dotLottie as the generate or show-time path:** After Effects export / JSON (or `.lottie` ZIP with optional state machines). Needs a player and an authoring toolchain. A later *library* `.lottie` is just a catalog kind; do not generate Lottie and do not require the player to ship the Test courses. ([dotLottie spec](https://www.dotlottie.io/spec/2.0/); [Lottie spec](https://lottie.github.io/lottie-spec/latest/).)
- **Three.js / WebGL as a reading embed:** Official use is a 3D scene, camera, renderer, and animation loop — a runtime, not a hosted still. Worse accuracy for 2D microscopy and generated hands; cinematic Valhalla is decoration. Out of scope as an interactive method. ([Fundamentals](https://threejs.org/manual/en/fundamentals.html).)
- **Mermaid / Graphviz / Cytoscape as the grip/stain/myth renderer:** Flowcharts and network graphs; they cannot show a fulcrum or a Gram field. Optional later for an Æsir family tree, not the generate-fallback.
- **You.com Images or scraping Vic Firth / YouTube:** You.com Images is partner-only and unmaintained (drumming note); YouTube ToS forbid download/scrape; Vic Firth ToS forbid extract/derivative. Cite, do not copy.
- **TTS / generated sfx for flam and backbeat in this ticket:** Speech APIs speak text; they do not produce percussion. Library-or-skip.

### 2.1 Decision text (posted on Linear)

Resolve with library-first, then Commons/PHIL ingest into private Storage, then generate. Default generate path is SVG from the existing text Generator. Pictorial stills SVG cannot draw use OpenAI `gpt-image-2` (`gpt-image-2-2026-04-21`, 1024² WebP, medium quality). Loops are silent SVG/CSS (or SVG-frame WebP) only when motion is load-bearing; if that fails, sequenced stills. Never generate photomicrographs, named-work copies, living-person likeness, or video (Sora Videos API is deprecated and AV is not a teaching method). Audio is library-or-skip. Generated files are origin `generated`; ingested Commons/PHIL files are origin `library` with license and creator on the Media descriptor. Customer owns OpenAI image Output. Fail closed when the plugin marked media required.

---

## 3. Raster image generation APIs (Aug 2026)

Facts below are from vendor docs, pricing pages, or ToS fetched 2026-08-29 unless noted.

### 3.1 OpenAI GPT Image — **pin this**

**Model IDs.** Official model card: **`gpt-image-2`** is “state-of-the-art image generation”; snapshot **`gpt-image-2-2026-04-21`**. Endpoints listed: `v1/images/generations`, `v1/images/edits`, plus Responses. ([GPT-Image-2 model](https://developers.openai.com/api/docs/models/gpt-image-2).)

**Two surfaces.** Image API: pick the GPT Image model yourself (`openai.images.generate({ model: "gpt-image-2", prompt })` in the official guide’s TypeScript). Responses API: pick a mainline text model and attach the `image_generation` tool; that path bills **both** the mainline tokens and GPT Image tokens. For one-shot Lesson stills, the guide says use the Image API. ([Image generation guide](https://developers.openai.com/api/docs/guides/image-generation).)

**Formats.** Image API returns **base64**, not a hosted URL. Default **`png`**; also **`jpeg`** and **`webp`**. JPEG/WebP may set `output_compression` 0–100. **No SVG.** Transparent background is preview-only on `gpt-image-2`; pair `background: "transparent"` with png or webp, not jpeg. ([Image generation guide — Customize Image Output](https://developers.openai.com/api/docs/guides/image-generation); [Create image API](https://developers.openai.com/api/reference/resources/images/methods/generate/).)

**Sizes.** `gpt-image-2` accepts `WIDTHxHEIGHT` with both edges multiples of 16, max edge ≤ 3840 px, aspect between 1:3 and 3:1, total pixels 655,360–8,294,400. Popular: `1024x1024`, `1536x1024`, `1024x1536`. Outputs > `2560x1440` are experimental. Quality: `low` | `medium` | `high` | `auto`. Square is typically fastest. ([same guide](https://developers.openai.com/api/docs/guides/image-generation).)

**Pricing (Standard, per 1M tokens).** `gpt-image-2`: image input **$8**, cached image input **$2**, image output **$30**; text input **$5**, cached text **$1.25**. Per-image calculator on the same guide (1024×1024): Low **$0.006**, Medium **$0.053**, High **$0.211**. Pin medium: pennies per still. ([Pricing](https://developers.openai.com/api/docs/pricing); [Image generation — Calculating costs](https://developers.openai.com/api/docs/guides/image-generation).)

**Latency.** “Complex prompts may take up to 2 minutes.” Streaming `partial_images` adds 100 image-output tokens per partial. ([Limitations / Partial images cost](https://developers.openai.com/api/docs/guides/image-generation).)

**Moderation.** All prompts and outputs filtered per [Usage Policies](https://openai.com/policies/usage-policies/). Parameter `moderation`: `auto` (default) or `low`. Blocked requests return `error.type = "image_generation_user_error"`, `error.code = "moderation_blocked"`, optional `moderation_details.moderation_stage` (`input` | `output` | `unknown`) and coarse `categories` (e.g. harassment, self-harm, sexual, violence). Do not retry without changing the prompt. ([Handling blocked requests](https://developers.openai.com/api/docs/guides/image-generation).)

**Org verification.** GPT Image models may require [API Organization Verification](https://help.openai.com/en/articles/10910291-api-organization-verification) before use. ([Image generation guide](https://developers.openai.com/api/docs/guides/image-generation).)

**Rate limits (gpt-image-2).** Free tier: not supported. Tier 1: 100k TPM / 5 IPM … Tier 5: 8M TPM / 250 IPM. ([model card](https://developers.openai.com/api/docs/models/gpt-image-2).)

**Deprecations.** `dall-e-2` and `dall-e-3` shut down **12 May 2026** (replacement: gpt-image-2 / 1 / 1-mini). `gpt-image-1.5`, `gpt-image-1-mini`, `chatgpt-image-latest` shut down **1 December 2026** (replacement: `gpt-image-2`). Do not pin the retiring IDs. ([Deprecations](https://developers.openai.com/api/docs/deprecations).)

**Ownership / training.** Services Agreement effective **1 January 2026** §4.1: Customer retains Input and **owns Output**; OpenAI assigns its right, title, and interest, if any. §4.2: OpenAI will not use Customer Content to develop or improve Services unless Customer explicitly agrees. §4.3: Customer is solely responsible for use of Outputs and for evaluating accuracy. §4.4: Output may not be unique. ([Services Agreement](https://openai.com/policies/services-agreement/).) Platform “Your data”: as of **1 March 2023**, API data is not used to train unless you opt in. `/v1/images/generations` and `/v1/images/edits`: not used for training; abuse logs 30 days; application state none; ZDR eligible for `gpt-image-2` (with CSAM-scan limitations on image inputs). ([Your data](https://developers.openai.com/api/docs/guides/your-data).)

**Likeness / medical / IP (policy).** Image guide points moderation at Usage Policies. Usage Policies (page fetched via search 2026-08-29; full HTML **403** on a raw curl this pass): forbid use of someone’s likeness, including photorealistic image, without consent in ways that could confuse authenticity; list **medical** among high-stakes domains that must not be automated without human review. Service Terms (search extract; HTML **403** this pass) §9 Medical Use: “Our Services are not intended for use in the diagnosis or treatment of any health condition.” §6 Visual Capabilities: “You may not use Visual Capabilities to reproduce the likeness of any person without express consent and all necessary rights.” Teaching a lab technique with a diagram is not diagnosis; generating a fake stain that a learner might trust as a micrograph is the accuracy failure this spec must close (see §7). Native image generation system card (4o, still the cited image-policy addendum): **refusal when the user asks for an image in the style of a living artist**; public-figure photorealism is more fine-grained than DALL·E 3’s blanket block. ([Usage Policies](https://openai.com/policies/usage-policies); [Service Terms](https://openai.com/policies/service-terms/); [4o native image generation system card PDF](https://cdn.openai.com/11998be9-5319-4302-bfbf-1167e093f1fb/Native_Image_Generation_System_Card.pdf).)

**TypeScript.** Official guide uses `import OpenAI from "openai"` and `openai.images.generate`. That is the same `openai` npm client the llm-provider note already identified. No extra vendor SDK.

### 3.2 Anthropic — vision and SVG, not raster

Help Center **“Can Claude produce images?”**: “Claude doesn’t generate photos or illustrations the way image-generation tools do.” It can build diagrams in **HTML and SVG** (beta on Claude web/desktop) and can **view** uploaded images. ([Help Center](https://support.claude.com/en/articles/9002504-can-claude-produce-images).)

API vision: images as `image` content blocks (base64, URL, or Files API `file_id`). Limits: request size 32 MB standard; many-image stricter dimension cap. This is the right primitive for the **vision-check**, not for PNG generation. ([Vision](https://platform.claude.com/docs/en/build-with-claude/vision).)

AUP: do not provide false or misleading information related to medical, health or science issues; Healthcare is a High-Risk Use Case requiring HITL + disclosure when giving medical guidance. Educational lab *fundamentals* with CDC-sourced stains is not “patient care,” but a generated fake micrograph would be misleading science. ([Anthropic Usage Policy](https://www.anthropic.com/legal/aup).)

Commercial Terms (from the llm-provider note, still the live contract URL): Customer owns Outputs; no training on API Customer Content. ([Commercial Terms](https://www.anthropic.com/legal/commercial-terms).)

### 3.3 Google Gemini / Imagen — capable, wrong contract shape

**Imagen.** Gemini API Imagen page: “This model is deprecated and will be shut down on **August 17, 2026**; migrate to Nano Banana.” Imagen 3 already shut down. Do not spec `imagen-4.0-generate-001`. ([Imagen](https://ai.google.dev/gemini-api/docs/imagen).) `https://developers.google.com/gemini-api/docs/imagen` **404** this pass.

**Nano Banana (native Gemini image).** Four IDs on the image-generation guide: `gemini-3.1-flash-lite-image`, **`gemini-3.1-flash-image`** (workhorse), `gemini-3-pro-image`, legacy `gemini-2.5-flash-image`. Official JS: `@google/genai`, `ai.interactions.create({ model: "gemini-3.1-flash-image", input })`, PNG via base64. **All generated images include a SynthID watermark.** ([Image generation](https://ai.google.dev/gemini-api/docs/image-generation).)

**Pricing (paid `gemini-3.1-flash-image`).** Input $0.50 / 1M text-or-image; output $3 / 1M text+thinking and **$60 / 1M image tokens** ≈ **$0.067 per 1K (1024×1024) image**. Free tier: “Not available” for this model’s image table; unpaid Gemini elsewhere **is** used to improve products. Grounding with Google Web and Image Search: 5k prompts/mo then **$14 / 1k queries**. ([Pricing](https://ai.google.dev/gemini-api/docs/pricing).)

**ToS.** Additional Terms (HTML fetched 2026-08-29, effective date on the live page still **23 March 2026** in prior research; this pass the page loaded): Google **won’t claim ownership** of generated content; same/similar content may be generated for others. **Paid:** prompts/responses not used to improve products. **Unpaid:** used to improve products; human reviewers may read disconnected logs. **“You may not use the Services in clinical practice, to provide medical advice, or in any manner that is overseen by or requires clearance or approval from a medical device regulatory agency.”** Grounding with Google Search: **do not cache, store, or build a database of Grounded Results** except narrow eval / chat-history / legal-hold cases. Image generation *without* the search tool is ordinary generated content (storable); turning on search to “make the Valhalla accurate” would produce Grounded Results the product must not persist as lesson media. ([Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms); [Prohibited Use Policy](https://policies.google.com/terms/generative-ai/use-policy) last modified 17 Dec 2024 — IP rights, misleading health claims.)

**Verdict:** technically fine TypeScript; contract and product-architecture worse than OpenAI (second vendor, SynthID, medical clause, search-storage trap). Rejected for the prototype.

### 3.4 fal.ai Flux / Recraft / Stability

**fal.ai Flux.** Endpoint docs for `fal-ai/flux/dev`: JS SDK `npm install --save @fal-ai/client`; “suitable for personal and commercial use”; **$0.025 / megapixel**. That is a real TS SDK and a commercial claim **on fal’s platform**. Self-hosted FLUX.1 [dev] weights on Hugging Face are under a **non-commercial** license — different contract. Extra vendor. ([fal flux-dev](https://fal.ai/docs/model-api-reference/image-generation-api/flux-dev); [Hugging Face FLUX.1-dev](https://huggingface.co/black-forest-labs/FLUX.1-dev).)

**Recraft.** REST `https://external.api.recraft.ai/v1`; examples use OpenAI **Python** with a custom base URL; **no first-party TypeScript SDK** in the getting-started page. Developer Terms §6.2: you own Assets; Recraft assigns copyright; **Assets may not be used to train any AI model** (breach → rights revert). Rejected (no TS SDK + extra ToS). ([Getting started](https://www.recraft.ai/docs/api-reference/getting-started); [Developer Terms](https://www.recraft.ai/legal/developer-terms).)

**Stability.** Not fetched as a complete 2026 API+ToS pair this pass (see Unreached). Not needed if OpenAI is pinned.

---

## 4. Diagram / SVG / code-generated graphics

**OpenAI Image API does not emit SVG.** Formats are png / jpeg / webp only (§3.1).

**Text LLMs can emit SVG as text.** Anthropic’s Help Center documents HTML/SVG diagrams as a Claude capability (consumer UI beta). The product’s text Generator (`gpt-5.6-terra` with `claude-sonnet-5` fallback) can be instructed to return a constrained SVG: viewBox, no external images, a fixed palette, `<text>` labels matching the Lesson caption. The app validates (no `<script>`, no `foreignObject` html), then either serves the SVG or rasterizes (e.g. resvg) to PNG for the bucket.

**Fit**

| Need | Raster `gpt-image-2` | Constrained SVG from text LLM | Mermaid / Graphviz / Cytoscape |
| --- | --- | --- | --- |
| Labeled Gram cell wall | Weak (text-placement limitation) | **Good** | Poor (not a wall cross-section) |
| Four-step stain flowchart | Weak | **Good** | Mermaid flowchart possible; uglier than purpose-drawn SVG |
| Kit part callouts | Weak | **Good** | No |
| Photoreal matched grip | Better than SVG, still worse than a photo | Stick-figure only | No |
| Photomicrograph | **Forbidden** | N/A | N/A |
| Valhalla as “a place” | Tempting, inaccurate | Schematic hall OK if captioned as invented | No |
| Æsir relations | Weak | Tree SVG | Graphviz/Cytoscape overkill |

OpenAI image limitations explicitly include **precise text placement** and **layout-sensitive composition**. ([Limitations](https://developers.openai.com/api/docs/guides/image-generation).) That is the evidence for routing *labeled* diagrams to SVG, not to GPT Image.

**Mermaid** is a flowchart/sequence DSL. Useful later for a gods-and-kin tree; not a grip or a stain. Do not pin it as the generate-fallback.

---

## 5. Looping animation without becoming an AV course

Glossary: Demonstrative media is a hosted image, **animation**, or audio clip *inside a reading Lesson*. A video/podcast *teaching method* is out of scope.

**Locked loop path:** schematic cycles as **silent SVG+CSS** (store the SVG so the published Lesson snapshots bytes). Raster fallback: **silent animated WebP from 2–4 stills** (library stills or generated frames). MDN: WebP is an “excellent choice for both images and animated images”; support Chrome, Edge, Firefox, Opera, Safari. APNG is a good lossless alternative; GIF is the old, 8-bit fallback. ([MDN image types](https://developer.mozilla.org/en-US/docs/Web/Media/Formats/Image_types).)

**Rejected animation paths**

| Path | Why not for the prototype |
| --- | --- |
| **Sora 2 / Videos API** | Official banner: deprecated; shutdown **24 September 2026**. Models `sora-2`, `sora-2-pro` (+ dated snapshots). Async `POST /videos`, poll until `completed`; 16–20 s generations; **audio** in the product copy; $0.10–$0.70 / second. That is a video pipeline. ([Video generation](https://developers.openai.com/api/docs/guides/video-generation); [Pricing](https://developers.openai.com/api/docs/pricing); [Deprecations](https://developers.openai.com/api/docs/deprecations).) |
| **Runway / Kling / Luma** | Not fetched as first-party TS+ToS this pass; even if cheap, they produce video lessons. Out of scope. |
| **Lottie / dotLottie** | After Effects export / JSON (or `.lottie` ZIP). Needs a player and an authoring toolchain. Do not generate Lottie; a later library `.lottie` is only a catalog kind. ([Lottie spec](https://lottie.github.io/lottie-spec/latest/); [dotLottie](https://www.dotlottie.io/spec/2.0/).) |
| **Three.js / WebGL canvas** | A 3D engine (scene, camera, renderer, animation loop), not a storage-key file. Worse accuracy for 2D microscopy and generated hands. ([Fundamentals](https://threejs.org/manual/en/fundamentals.html).) |
| **SVG+SMIL** | SMIL exists but CSS `@keyframes` on SVG is the more portable web path; use it for *schematic* cycles (stain steps), not photoreal grip. |
| **CSS keyframes in the Lesson HTML** | Fine for SVG schematics the product authors. Not a stored Media file unless the SVG is what you store. Prefer storing the SVG/WebP so published Lessons snapshot bytes. |

**Latency / cost.** Three medium 1024² stills ≈ 3 × $0.053 + up to ~2 min each worst case. Encode to animated WebP is local CPU. That is why the rebound loop should be **seeded**, with generate as fallback.

**Caption / alt.** A loop still needs one caption and one alt on the Media descriptor (what motion is being shown). Screen readers will not “see” the loop; alt must state the motion in words (“stick rebounds off the head while the fulcrum stays between thumb and index”).

**Verdict:** a 2–4 second **silent** loop is Demonstrative media. A Sora clip is not.

---

## 6. Library-first “good enough”

### 6.1 How to look up Commons (not You.com)

You.com Search does not return image bytes (drumming note). Use the **MediaWiki Action API** on Commons:

- Search files: `GET https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srsearch=…` ([API:Search](https://www.mediawiki.org/wiki/API:Search).) Live query 2026-08-29 for `matched grip drumstick` returned `File:Matched Grip.jpg`, `File:Matchedsnaregrip.jpg`, `File:Matchedgrip.jpg` among hits.
- License + thumb: `prop=imageinfo&iiprop=url|size|mime|extmetadata` with `iiextmetadatafilter=LicenseShortName|LicenseUrl|UsageTerms|Artist|Credit|Copyrighted`. Commons documents this on [Commons:API/MediaWiki](https://commons.wikimedia.org/wiki/Commons:API/MediaWiki); MediaWiki documents `extmetadata` as formatted metadata from the file page ([API:Imageinfo](https://www.mediawiki.org/wiki/API:Imageinfo)).
- Operator rules: meaningful User-Agent with contact; serial requests; honor throttling; follow content licenses when republishing. ([API:Etiquette](https://www.mediawiki.org/wiki/API:Etiquette); [Wikimedia Foundation API Usage Guidelines](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_API_Usage_Guidelines) 26 Aug 2024.)

The stale page [Commons:API](https://commons.wikimedia.org/wiki/Commons:API) still exists (community notes, “do not use or index” tags). **Do not treat that page as the search API**; use Action API as above.

**Hotlinking vs hosting.** Commons reuse guide: hotlinking is possible but **not recommended**; you must still satisfy the license. This product already locked **private bucket + stable app paths** — download (with UA + license check), store, snapshot. ([Reusing content outside Wikimedia](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia).)

### 6.2 License families the product can host

Commons only hosts PD or free licenses that allow **any purpose including commercial**; **CC BY-NC is not accepted on Commons** and must not appear in the seed set. CC BY-SA requires attribution **and** share-alike on derivatives of *that file*. ([Commons:Licensing](https://commons.wikimedia.org/wiki/Commons:Licensing).)

Record on the Media descriptor: `license` short name + URL, `Source` = file description URL, `Artist`/`Credit` from extmetadata, `origin: library`. TASL on CC files. Lesson prose stays cite-and-paraphrase (already distinguished from ingesting CC BY-SA *article* text).

**Wikipedia non-free media** is not a license for this product (drumming note; [WP:NFCC](https://en.wikipedia.org/wiki/Wikipedia:Non-free_content)).

### 6.3 CDC / NIH — Gram photomicrographs

PHIL FAQ: images are **Public Domain** or **Copyright Protected**; most are PD; permission is not required for PD but **credit the original institution and contributor when known**; copyrighted items need the content provider’s permission; **do not add the CDC logo** without a logo license. PHIL imagery is **historic** and “not to be viewed as a source of the most current public health information.” Advanced Search can filter **Public Domain only**. ([PHIL FAQ](https://wwwn.cdc.gov/PHIL/FAQ.aspx).)

CDC Use of Agency Materials (last reviewed 1 May 2023): most CDC website material is PD; PHIL images “royalty-free… personal, professional and educational use… credit CDC and the individual photographer… If used in electronic media, please link back to the PHIL site.” Do not imply endorsement; do not change substantive content. ([Agency materials](https://www.cdc.gov/other/agencymaterials.html).)

**Candidate PD PHIL stills (copyright line on the record: “None — public domain”):**

| PHIL ID | What it shows | Record |
| --- | --- | --- |
| 2296 | S. aureus Gram-positive cocci, 250× | https://phil.cdc.gov/details.aspx?pid=2296 |
| 2297 | same, 320× | https://phil.cdc.gov/details.aspx?pid=2297 |
| 2842 | Gram-positive staphylococci in sputum | https://phil.cdc.gov/Details.aspx?pid=2842 |
| 1947 | Gram-negative *H. influenzae* | https://phil.cdc.gov/Details.aspx?pid=1947 |

Digitally colorized **SEM** (e.g. PHIL 10046 MRSA) is **not** a Gram stain — do not tag it as one.

### 6.4 Commons candidates verified via `imageinfo` (2026-08-29)

| File | License (extmetadata) | Role |
| --- | --- | --- |
| [File:Gram stain 01.jpg](https://commons.wikimedia.org/wiki/File:Gram_stain_01.jpg) | CC BY-SA 3.0 | Mixed Gram+ cocci (purple) and Gram− bacilli (red), 1000× — **library photomicrograph** |
| [File:Gram Stain Anthrax.jpg](https://commons.wikimedia.org/wiki/File:Gram_Stain_Anthrax.jpg) | Public domain | Anthrax Gram stain — use only if the Lesson is about that organism |
| [File:Gram Stain.png](https://commons.wikimedia.org/wiki/File:Gram_Stain.png) | CC BY-SA 4.0 | **Procedure diagram** (crystal violet / iodine / decolorizer / safranin vs wall types) |
| [File:Gram-Cell-Wall.jpg](https://commons.wikimedia.org/wiki/File:Gram-Cell-Wall.jpg) | Public domain | Cell-wall diagram |
| [File:Zellwand-Gramfärbung Grau.svg](https://commons.wikimedia.org/wiki/File:Zellwand-Gramf%C3%A4rbung_Grau.svg) | CC BY 3.0 | Labeled SVG cell walls |
| [File:Matchedsnaregrip.jpg](https://commons.wikimedia.org/wiki/File:Matchedsnaregrip.jpg) | CC BY-SA 4.0 | Matched snare grip still |
| [File:Matched Grip.jpg](https://commons.wikimedia.org/wiki/File:Matched_Grip.jpg) | CC BY-SA 4.0 | Matched grip (mallets; check technique before tagging drum-kit) |
| [File:Matchedgrip.jpg](https://commons.wikimedia.org/wiki/File:Matchedgrip.jpg) | Public domain | Small (400×348) matched-grip still |
| [File:German grip.jpg](https://commons.wikimedia.org/wiki/File:German_grip.jpg) | CC BY-SA 4.0 | German matched-grip variant, high-res |
| [File:Drum kit illustration edit.svg](https://commons.wikimedia.org/wiki/File:Drum_kit_illustration_edit.svg) | CC BY-SA 3.0 | Kit anatomy |
| [File:Walhall by Emil Doepler.jpg](https://commons.wikimedia.org/wiki/File:Walhall_by_Emil_Doepler.jpg) | Public domain | 1905 Doepler: einherjar, valkyries, Odin — **one depiction** |
| [File:Walhalla (1896) by Max Brückner.jpg](https://commons.wikimedia.org/wiki/File:Walhalla_(1896)_by_Max_Br%C3%BCckner.jpg) | Public domain | 1896 Brückner Valhalla painting |

**Not good enough:** [Category:Fulcrum grip](https://commons.wikimedia.org/wiki/Category:Fulcrum_grip) GIFs are **four-mallet marimba** technique, not drum-kit matched-grip rebound. `File:Matched Grip.jpg` is percussion *mallets* — reviewers must not auto-tag it as drum-kit German/American matched without a human or vision check against the Lesson objective.

**Vic Firth / PAS.** Cite as Sources; do not ingest PDFs or videos (drumming note; [Vic Firth Terms](https://vicfirth.com/pages/terms-of-use-updated)).

### 6.5 What “good enough” means (lock this)

A library file is good enough iff:

1. **Accuracy:** shows the technique or structure the objectives name (purple vs pink cells for Gram *result*; thumb–index fulcrum for matched grip; a *labeled historic illustration* of Valhöll, not a tourist photo of the Walhalla memorial in Donaustauf unless the Lesson is about reception history — and the Test course is **mythic corpus only**).
2. **Labels:** if the objective is “name the four reagents,” the figure must name them (procedure diagram), not just show pretty purple circles.
3. **License:** hostable as above; descriptor records Source + license.
4. **Not decorative:** a misty hall stock photo with no caption tying it to a named poem/prose source is a miss, not a hit.
5. **Not a named-work copy:** no Goo Goo Dolls art, no PAS 40-rudiment plate.

---

## 7. Accuracy failure modes

### 7.1 Medical / Gram

**Do not generate photomicrographs.** Evidence:

- **Hallucinated structures in generative stains.** Virtual Gram staining (cGAN from dark-field stacks) still reports **bacteria hallucination (BH) ~1.5%** and false staining ~3% even in a *purpose-trained* lab model with real dark-field input — not a text-to-image toy. ([Science Advances, 2025](https://www.science.org/doi/10.1126/sciadv.ads2757).)
- **Realistic hallucinations fool experts.** AQuA (Nature Biomedical Engineering / UCLA): virtual H&E models produce **realistic hallucinations** that board-certified pathologists missed; AQuA hit **99.8%** accuracy distinguishing good vs hallucinated virtual stains on kidney samples. ([UCLA news](https://newsroom.ucla.edu/releases/dangerous-AI-errors-digital-pathology-caught-ucla-artificial-intelligence); [Nat. Biomed. Eng.](https://www.nature.com/articles/s41551-025-01421-9).) If specialist virtual-stain models invent tissue, a general image model inventing a “Gram field” is not trustworthy teaching media.
- **VLMs misread real Gram stains.** GPT-4o vs Gemini 1.5 Pro on 80 labeled Gram images: both **failed** to identify Gram stain *and* shape for *Neisseria gonorrhoeae*; authors: unprimed LLMs are **not ready for clinical practice**. ([Future Microbiology, 2024](https://doi.org/10.1080/17460913.2024.2381967).) A vision-check that *classifies* a generated stain is the same weak discriminator.
- **Vendor policy.** OpenAI: services not for diagnosis/treatment ([Service Terms](https://openai.com/policies/service-terms/) — search extract; HTML 403 this pass). Google: no clinical practice / medical advice ([Additional Terms](https://ai.google.dev/gemini-api/terms)). Anthropic: no false medical/science information; healthcare HITL ([AUP](https://www.anthropic.com/legal/aup)). CDC PHIL: historic images, credit required ([FAQ](https://wwwn.cdc.gov/PHIL/FAQ.aspx)).

**Lock:** photomicrographs = CDC PHIL PD or Commons with a real license. Procedure/cell-wall = Commons diagram or SVG. Generate-fallback must not look like a microscope photo.

### 7.2 Motor skill / hands

Peer-reviewed restoration papers treat **malformed generated hands** (wrong finger count, impossible joints) as an unsolved diffusion failure, not a prompt-engineering footnote. HandCraft: models are “surprisingly inept” at hands; supernumerary or missing digits. ([arXiv:2411.04332](https://doi.org/10.48550/arxiv.2411.04332).) RHanDS (AAAI 2025): “instability in generating hands with correct structures.” ([AAAI](https://doi.org/10.1609/aaai.v39i7.32815).) HandSurge (WACV 2026 workshop): 21 keypoints, small image fraction, self-occlusion. ([CVF Open Access](https://openaccess.thecvf.com/content/WACV2026W/WVAQ/papers/Lao_HandSurge_Localized_Neural_Surgery_for_Diffusion-Generated_Hand_Deformity_Restoration_WACVW_2026_paper.pdf).)

**Implication:** matched-grip media should be **photographs or diagrams from Commons / original seed**, not photoreal generated hands. If generate-fallback runs, the vision-check must reject extra/missing fingers or a stick that does not pass through a thumb–index fulcrum. Prefer a labeled SVG of fulcrum geometry over a pretty wrong photo.

### 7.3 Myth / copyrighted look

OpenAI 4o image system card: **living-artist style refusal**. Usage Policies: unconsented photoreal likeness. Google Prohibited Use: violating IP rights. Named in-copyright illustrations and game/film Valhallas (Marvel, *God of War*) are third-party IP — do not prompt them.

There is **no canonical photograph of Valhalla**. Seed PD plates (Doepler 1905, Brückner 1896) and caption them as historical *interpretations* of the mythic hall. Generated generic “mead hall, no trademarks, no living-artist style” is allowed on a miss if the caption says it is a **modern schematic, not a source image of the myth**.

---

## 8. Seed library vs generate-everything

**Pick (a): ship a small original/Commons/CDC seed for load-bearing media; generate only decorative or generic misses.**

Evidence, not vibe:

- **Accuracy:** §7. CDC/Commons photomicrographs exist; generated ones are the failure mode the pathology literature warns about.
- **License:** PHIL PD and Commons CC/PD are designed for reuse; Vic Firth video is not. Seeding those files once with correct TASL is cheaper than arguing ToS per Course job.
- **Latency:** OpenAI: up to 2 minutes per complex image, inside **sequential** Lesson generate. Three Test courses × many Lessons × generate-on-every-miss is a timeout factory. Library hits are a storage read.
- **The ticket still needs a generate path:** optional mythic stills, generic kit photos if the Commons file is the wrong grip variant, SVG schematics when no labeled diagram exists, 3-frame rebound fallback if the original loop was never ingested.

**Seed set (prototype ingest, human-reviewed once):**

1. Gram: PHIL 2296 + 1947 (pos/neg examples) + `File:Gram stain 01.jpg` + `File:Gram Stain.png` + one cell-wall SVG/JPEG from §6.4.
2. Drums: kit SVG + `File:Matchedsnaregrip.jpg` + `File:German grip.jpg` + **one original silent rebound WebP** (product-authored; none of the Commons fulcrum GIFs qualify).
3. Myth: Doepler Walhall + Brückner Walhalla, with corpus captions.

Generate-everything (b) is rejected as the *default*; it remains the **miss path**.

---

## 9. Where in the Lesson generate step

Locked: inside sequential Lesson generate, before checkpoint; media failure is a Lesson defect.

**Prompt construction.** Inputs already in hand at that moment: Lesson goal, objectives, drafted caption, drafted alt, Media category, Topic tags, named-work flag from the Course Request. Build:

```
Educational schematic for a reading lesson.
Goal: <lesson goal>
Must show: <objectives as bullet constraints>
Caption: <caption>
Style: simple, accurate, minimal, flat or textbook; no photoreal microscope;
no logos; no living-artist style; no named copyrighted characters or albums.
Not: <hard negatives from named-work + medical photomicrograph policy>
```

For SVG path, the text Generator returns `{ svg, caption, alt }` under JSON schema (second call, no citations — already the quiz pattern).

**Storage.** Bytes → private Supabase bucket; stable app path; Media descriptor JSON sibling: `kind` (image | animation), `caption`, `alt`, `Source`, `license`, `origin` (`library` | `generated`), `storageKey`, Media category, Topic tags. Published Lesson **copies** those fields.

**Repair.** (1) `moderation_blocked` → rewrite prompt once (strip likeness, violence, brand names). (2) Vision-check fail → one regenerate or switch to SVG schematic. (3) API 429/5xx → retry with backoff (OpenAI: retries OK for 429/5xx, not for user errors). Then **terminal fail** of that Lesson if the slot was required.

**Skip vs fail.** Optional decorative still: skip the content block, Lesson can checkpoint. Required technique illustration (Gram result, grip): fail the Lesson. Quizzes: skip (locked).

**Vision-check.** One Anthropic Messages call with the PNG as an `image` block and a yes/no checklist (finger count 5 per visible hand; stick through thumb–index; if caption says purple cocci, are cells purple and round — **only for library photos**, never as a reason to accept a generated micrograph). Do not use the check to “bless” a generated Gram field.

---

## 10. Audio

OpenAI Audio API speech endpoint: **`gpt-4o-mini-tts`**, 11 voices, mp3, “Narrate a written blog post”; **must disclose** the voice is AI-generated. ([Text to speech](https://developers.openai.com/api/docs/guides/text-to-speech).) That is narration, not a flam.

Realtime/audio generation models on the pricing page (`gpt-realtime-2.1`, etc.) are conversational audio, not percussion libraries. ([Pricing](https://developers.openai.com/api/docs/pricing).)

Drumming note: PAS/Alfred recordings ©; Vic Firth play-alongs ToS-restricted; flam/backbeat *sound* is load-bearing **and** must be original or licensed.

**Lock for this ticket:** no TTS, no generated sfx. Media kinds in scope: `image` and silent `animation`. Audio clips remain glossary-legal but **library-or-skip** until a later ingest ticket.

---

## 11. Risks / gaps for the spec

- **Org verification** can block `gpt-image-2` until a human finishes it in the OpenAI console.
- **2-minute image latency** inside sequential Lesson generate: cap one image (or three loop frames) per Lesson; do not generate a gallery.
- **CC BY-SA share-alike** applies to the *file and its derivatives*, not automatically to surrounding Lesson prose — keep TASL on the descriptor; do not flatten SA into the reading body.
- **PHIL historic disclaimer:** captions should not present a 1963 stain as “current CDC protocol”; the *colors and morphology* are still the teaching point.
- **German vs American vs French matched grip:** Commons files are not always labeled at that granularity; Topic tags must be assigned by a human or a vision-check against Wikipedia’s definitions, not by filename.
- **Doepler/Brückner are reception-history art**, not archaeology — which matches the Test course (mythic corpus). Do not caption them as reconstructions of a physical hall.
- **Gemini image-without-search is storable**, but enabling Google Image Search on Nano Banana to “ground” a myth illustration would create Grounded Results the Additional Terms say not to database. Easy foot-gun; another reason not to add Gemini.
- **OpenAI Usage Policies / Service Terms HTML 403** this pass — implementers should re-fetch before launch; quotes above mix the image guide, Services Agreement (fetched), Your-data guide (fetched), system card PDF (fetched), and search extracts of Usage Policies / Service Terms.
- **No verified Commons rebound-stroke loop** for drum kit. The seed original loop is load-bearing; without it, generate-fallback + vision-check is the only honest in-app motion.

---

## 12. Sources

Every URL fetched or used as a primary authority in this note.

### OpenAI

- GPT-Image-2 model card (IDs, endpoints, TPM/IPM): https://developers.openai.com/api/docs/models/gpt-image-2
- Image generation guide (API choice, TS SDK, formats, size/quality, moderation, 2-min latency, cost table): https://developers.openai.com/api/docs/guides/image-generation
- Image generation tool (Responses): https://developers.openai.com/api/docs/guides/tools-image-generation
- Create image API (`output_format` png/jpeg/webp, size constraints): https://developers.openai.com/api/reference/resources/images/methods/generate/
- Prompting cookbook (quality, transparency png/webp): https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide
- Pricing (gpt-image-2 tokens; Sora per-second; flagship gpt-5.6-terra): https://developers.openai.com/api/docs/pricing
- Your data (no training default; `/v1/images/generations` ZDR table): https://developers.openai.com/api/docs/guides/your-data
- Deprecations (DALL·E 12 May 2026; gpt-image-1.5 1 Dec 2026; Sora 24 Sep 2026): https://developers.openai.com/api/docs/deprecations
- Video generation / Sora 2: https://developers.openai.com/api/docs/guides/video-generation
- Text to speech (`gpt-4o-mini-tts`, AI-voice disclosure): https://developers.openai.com/api/docs/guides/text-to-speech
- Organization Verification: https://help.openai.com/en/articles/10910291-api-organization-verification
- Services Agreement (own Output §4.1–4.4): https://openai.com/policies/services-agreement/
- Usage Policies: https://openai.com/policies/usage-policies
- Service Terms (medical / visual capabilities — search extract): https://openai.com/policies/service-terms/
- 4o native image generation system card (living-artist refusal): https://cdn.openai.com/11998be9-5319-4302-bfbf-1167e093f1fb/Native_Image_Generation_System_Card.pdf

### Anthropic

- Can Claude produce images?: https://support.claude.com/en/articles/9002504-can-claude-produce-images
- Vision API: https://platform.claude.com/docs/en/build-with-claude/vision
- Usage Policy: https://www.anthropic.com/legal/aup
- Commercial Terms: https://www.anthropic.com/legal/commercial-terms

### Google

- Nano Banana image generation (model IDs, JS, SynthID): https://ai.google.dev/gemini-api/docs/image-generation
- Imagen deprecated / shutdown 17 Aug 2026: https://ai.google.dev/gemini-api/docs/imagen
- Gemini API Additional Terms (ownership, paid vs unpaid, clinical practice, Grounded Results storage): https://ai.google.dev/gemini-api/terms
- Pricing (`gemini-3.1-flash-image` $0.067 / 1K): https://ai.google.dev/gemini-api/docs/pricing
- Generative AI Prohibited Use Policy (17 Dec 2024): https://policies.google.com/terms/generative-ai/use-policy
- 404 this pass: https://developers.google.com/gemini-api/docs/imagen

### Wikimedia / Commons

- Commons:API (community notes): https://commons.wikimedia.org/wiki/Commons:API
- Commons:API/MediaWiki (imageinfo, extmetadata, thumbs): https://commons.wikimedia.org/wiki/Commons:API/MediaWiki
- API:Imageinfo: https://www.mediawiki.org/wiki/API:Imageinfo
- API:Search (`srnamespace=6` for files): https://www.mediawiki.org/wiki/API:Search
- API:Etiquette (User-Agent, serial requests): https://www.mediawiki.org/wiki/API:Etiquette
- WMF API Usage Guidelines: https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_API_Usage_Guidelines
- Commons:Reusing content outside Wikimedia (TASL, hotlink not recommended): https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia
- Commons:Licensing (no NC, commercial OK): https://commons.wikimedia.org/wiki/Commons:Licensing
- File pages listed in §6.4
- Category:Fulcrum grip (wrong technique): https://commons.wikimedia.org/wiki/Category:Fulcrum_grip
- Wikipedia:Non-free content: https://en.wikipedia.org/wiki/Wikipedia:Non-free_content

### CDC

- PHIL FAQ: https://wwwn.cdc.gov/PHIL/FAQ.aspx
- Use of Agency Materials / PHIL reuse: https://www.cdc.gov/other/agencymaterials.html
- PHIL 2296, 2297, 2842, 1947 (URLs in §6.3)

### Accuracy papers / first-party lab

- Virtual Gram staining / BH rate: https://www.science.org/doi/10.1126/sciadv.ads2757
- GPT-4o / Gemini Gram identification: https://doi.org/10.1080/17460913.2024.2381967
- AQuA hallucinations: https://www.nature.com/articles/s41551-025-01421-9 and https://newsroom.ucla.edu/releases/dangerous-AI-errors-digital-pathology-caught-ucla-artificial-intelligence
- HandCraft: https://doi.org/10.48550/arxiv.2411.04332
- RHanDS: https://doi.org/10.1609/aaai.v39i7.32815
- HandSurge: https://openaccess.thecvf.com/content/WACV2026W/WVAQ/papers/Lao_HandSurge_Localized_Neural_Surgery_for_Diffusion-Generated_Hand_Deformity_Restoration_WACVW_2026_paper.pdf

### Animation / other vendors

- MDN image types (WebP/APNG/GIF): https://developer.mozilla.org/en-US/docs/Web/Media/Formats/Image_types
- Lottie spec: https://lottie.github.io/lottie-spec/latest/
- fal.ai Flux Dev: https://fal.ai/docs/model-api-reference/image-generation-api/flux-dev
- Hugging Face FLUX.1-dev non-commercial license: https://huggingface.co/black-forest-labs/FLUX.1-dev
- Recraft getting started / developer terms: https://www.recraft.ai/docs/api-reference/getting-started and https://www.recraft.ai/legal/developer-terms

### Already locked in prior notes (re-cited)

- You.com Images partner-only; no Videos API; Vic Firth ToS; YouTube ToS; PAS © 1984: `docs/research/drumming-source-availability.md`
- Generator port / `gpt-5.6-terra` / `claude-sonnet-5`: `docs/research/llm-provider.md`
- Glossary Demonstrative media / Media descriptor: `CONTEXT.md`

### Unreached / uncertain

- **OpenAI Usage Policies and Service Terms HTML:** curl **403** this pass. Image-guide link to Usage Policies and search extracts of both pages were used; **re-fetch in a browser before implementation**.
- **Exact Gemini Additional Terms effective date** on the 2026-08-29 HTML (prior note: 23 Mar 2026); clauses above are from the live HTML.
- **NIH Open-i / NLM image API** as a second medical library: not fetched; CDC PHIL + Commons suffice for the Test course.
- **Stability AI 2026 platform ToS + official TS SDK:** not fully fetched; rejected on vendor-count grounds.
- **Runway / Kling / Luma** first-party ToS: not fetched; rejected as video-lesson-shaped.
- **Whether `gpt-image-2` still refuses photoreal public figures** the way DALL·E 3 did: 4o system card is more permissive for *adult* public figures; do not rely on the model as the named-work filter — **prompt policy + named-work flag** are the spec control.
- **`File:Matched Grip.jpg` technique quality** for drum-kit German/American/French: license verified; pedagogical fit needs a human glance at ingest.
- **PHIL 1947 body** in one fetch omitted the copyright table in the markdown conversion; copyright “public domain / none” is from the earlier search hit of the same URL plus FAQ rules — confirm on ingest.
- **Animated WebP encoder in Node** (which npm package): not specified; implementation detail. Spec the *format*, not the encoder.
- **OpenAI `gpt-5.6-terra` image-input** for the vision-check: not re-verified on the models page this pass; Anthropic vision is the pinned checker because its image-input docs were fetched.

---

*End of research note.*
