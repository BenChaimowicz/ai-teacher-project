# Source trust scheme for generated lessons

**Date:** 2026-08-14

**Amendment 2026-09-04 (human lock):** [Source trust scheme](https://linear.app/senoy/issue/SEN-6/source-trust-scheme) was reopened and locked by the human, not by a vendor bakeoff. Retrieval is two independent research calls on the same Lesson topic. **Primary research** is Parallel Pro or Exa Agent high and produces a structured Source pack with citations. **Secondary research** is You.com Research standard or Linkup M — same topic, different engine, different index. The Generator synthesizes from both packs; Citations must point at Sources in those packs. Which vendor runs in each slot is config. The August You.com Web Search + `boost_domains` recommendation below is superseded.

Which web-search API and which source-ranking/whitelisting scheme best delivers “most trusted sources” for generated reading lessons in a prototype AI course platform, and how should the generator cite those sources? Content is web search plus LLM synthesis; the destination is a buildable spec, not production-at-scale.

---

## 2. Recommendation

**Pick You.com Web Search API + hybrid ranked preference (boost educational domains, do not hard-allowlist the whole web) + numbered inline footnotes with a stored source list (quote vs paraphrase).**

Use **You.com `POST /v1/search`** via the official TypeScript SDK (`@youdotcom-oss/sdk`). Auth is an API key (`X-API-Key` / `YDC_API_KEY`). You.com operates its own crawler and index (vendor: queries do not go to Google or Bing). Results include `url`, `title`, `description`, `snippets`, `page_age`, `favicon_url`, and optional query-aware `highlights`. Domain controls are first-class: `include_domains`, `exclude_domains`, and uniquely **`boost_domains`** (up to 500 each). Query operators include `site:.edu` and `filetype:pdf`. Pricing as of this research: **$5.00 per 1,000 calls** (up to 100 results), **$100 free credits** on new accounts, full-page extraction add-on $1.00 per 1,000 pages. That is cheap enough for a prototype and TypeScript-simple.

**Trust scheme: hybrid ranked preference, not a hard allowlist.** Pin a preference list in the spec (OpenStax, Khan Academy, MIT OCW, Britannica, Wikipedia, `*.edu`, `*.gov`, plus a small set of subject encyclopedias and standards bodies). Pass that list as `boost_domains`. Keep `exclude_domains` for known junk (content farms, social scrapes, quiz-mill sites). Use `site:.edu` / `site:.gov` as *query operators*, not as proof of reliability. Wikipedia’s own reliable-sources guideline is explicit: reliability is contextual; no source is always reliable; `.edu` / `.gov` TLDs are a CRAAP *hint*, not a warrant. A hard allowlist starves coverage (Khan is `.org`, Britannica is `.com`, Wikipedia is `.org`). Boost-without-exclude is the only vendor-native control that matches that policy. If a lesson topic is scholarly (STEM, medicine, history of science), overlay **OpenAlex or Semantic Scholar** as a second retrieval pass and prefer peer-reviewed secondary sources over news.

**Citation rule: Wikipedia-style numbered footnotes in the lesson body + a “Sources” list at the end.** Store with each lesson: `url`, `title`, `publisher`/`domain`, `retrievedAt` (ISO 8601), `usedAs: quote | paraphrase`, optional `license` and `quotedText`. Paraphrase by default; quotes require in-text attribution plus a footnote. When reproducing Creative Commons material (OpenStax, MIT OCW), add TASL attribution (Title, Author, Source, License) and obey NC/SA constraints. If generation uses Claude, pass retrieved pages as `search_result` blocks with `citations.enabled` and persist the returned `cited_text` / `source` / `title` rather than trusting the model to invent citations.

### Rejected alternatives (one line each)

- **Tavily:** Best RAG-shaped TypeScript SDK and a recurring 1,000 free credits/month, but only hard `include_domains` / `exclude_domains` (no boost) and the documented result object has no published-date field to cite.
- **Brave Search (Web or LLM Context):** Independent index and Goggles rerank, but Terms of Use forbid storing/caching Search Results except transiently — incompatible with persisting lesson citations without a paid storage-rights plan.
- **Exa:** Strongest domain/path/wildcard filters (1,200 entries) and a TypeScript SDK, but $7/1k (plus contents) is worse prototype economics than You.com/Tavily at $5/1k.
- **Perplexity Search API:** Real search-results API with `search_domain_filter` and a TypeScript SDK, but the filter is allow *or* deny (max 20 domains, not both) — too small for an educational preference list.
- **Google Custom Search JSON API:** Closed to new customers; existing customers only until 1 January 2027. Do not spec it.
- **Bing Web Search API:** Retired 11 August 2025. Microsoft’s replacement (Grounding with Bing Search) does not return raw results to developers.
- **SerpApi:** Officially a Google/Bing/etc. scrape; underlying-engine ToS risk is the opposite of “legally cleaner than scraping Google.”
- **Hard allowlist of `.edu`/`.gov` only:** CRAAP treats TLD as a hint; Wikipedia RS forbids treating any class of source as always reliable; OER and encyclopedias would be excluded.
- **Scholarly APIs alone (OpenAlex, Semantic Scholar, Crossref, Wikimedia):** Excellent overlays, not a general lesson-search index (no Khan, no textbooks, no how-to pages).

---

## 3. API comparison

Facts below are from vendor docs, pricing pages, or ToS. “Own index” means the vendor claims to search its own crawl, not to return another engine’s SERP.

| API | What it searches | Auth | TS/JS | Result fields useful for trust/cite | Domain include/exclude | Extra features | Free / price (2026) | Rate limits | ToS / store & cite | Vendor RAG/AI claim |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **You.com Web Search** | Own crawler/index (ZDR docs: queries do not go to Google or Bing) | API key | Official `@youdotcom-oss/sdk`; REST `POST /v1/search` | `url`, `title`, `description`, `snippets[]`, `page_age`, `favicon_url`; optional `contents.highlights`, `contents.markdown`, OpenGraph `site_name` | `include_domains` / `exclude_domains` / **`boost_domains`** (≤500); `site:` operator | News auto-mix; freshness; `filetype:`; highlights vs full page | $5 / 1k calls; $100 new-account credits; full-page extract $1 / 1k pages | Not published on the search guide fetched | No public ban on storing citations found; ZDR is enterprise opt-in for *You.com’s* retention, not yours | “Designed for developers building RAG systems”; citation-ready snippets |
| **Tavily Search** | Vendor: “online search engine” for LLM agents (not described as a Google scrape) | API key (`tvly-…`) | Official `@tavily/core`; REST `POST https://api.tavily.com/search` | `title`, `url`, `content` (chunks ≤500 chars), `score`, `favicon`, optional `raw_content`; **no published-date field in the documented result schema** | `include_domains` ≤300; `exclude_domains` ≤150 | `search_depth` basic/advanced/fast/ultra-fast; news/finance topics; Extract/Crawl/Map; `time_range` / `start_date` / `end_date` | 1,000 credits/month free (no CC); basic search = 1 credit; advanced = 2; PAYG $0.008/credit; plans $30–$500 | Not on the credits page fetched | Output is defined separately from “Services”; Customer Applications integration allowed; AI Output may be retained by Tavily to train unless settings say otherwise; use is “internal business purposes” | “Search engine tailored for use by LLMs in agentic applications” |
| **Brave Web Search / LLM Context** | Own index (“over 30 billion pages”); not a Big Tech scrape (vendor) | `X-Subscription-Token` | REST + JS `fetch` examples; no first-party npm SDK emphasized | Web: `title`, `url`, `description`, `age`, optional `extra_snippets` (≤5). LLM Context: `grounding.generic[].{url,title,snippets}`, `sources[url].{title,hostname,age[4 formats]}` | No includeDomains array. `site:` / `-term` / `filetype:` in `q`. **Goggles** boost/discard domains (≤3 goggles) | News, images, videos, freshness `pd/pw/pm/py`, extra snippets, LLM Context token budgets | Search plan **$5 / 1k requests**; **$5 free credits / month**; 50 QPS | 50 req/s (Search); LLM Context docs mention a 1-second sliding window | **Cannot store/cache/create a DB of Search Results except transient storage**; no training/fine-tune; storage rights need a special plan; FAQ: “prohibited to retain any and all data” | LLM Context “specifically built for machine consumption” / RAG |
| **Exa Search** | Own neural/keyword index (vendor search API) | API key (`EXA_API_KEY`) | Official `exa-js` | `title`, `url`, `id`, `publishedDate`, `author`, `score`, `favicon`; optional `text`, `highlights`, `summary` | `includeDomains` / `excludeDomains` ≤**1,200**; host, **path prefix**, `*.subdomain` wildcards | `type` auto/fast/deep; category news/publication; contents/highlights; Answer API with citations | New accounts $20 credits (~2,800 searches) + $10/month free tier; `/search` **$7 / 1k** (≤10 results); extra results $1/1k; contents $1/1k pages | Basic plans max 10 results; enterprise for higher QPS | Not fetched in full; ZDR is an enterprise option | Docs framed for RAG/agents; Answer returns `citations[]` |
| **Perplexity Search API** | First-party search (not Sonar chat). `POST https://api.perplexity.ai/search` | Bearer `PERPLEXITY_API_KEY` | Official `@perplexity-ai/perplexity_ai` | `title`, `url`, `snippet`, `date`, `last_updated` | `search_domain_filter` ≤**20**; allowlist *or* denylist (minus prefix), not both; path suffixes allowed | Multi-query (≤5 queries = 1 bill); recency; language; region; `search_context_size` | **$5 / 1k successful requests**; no token charge | Rate limit counts each query in a multi-query array | Not fully fetched | “Raw, ranked web search results” for developers (distinct from Sonar answers) |
| **Google Custom Search JSON API** | Google Programmable Search Engine (Google’s web index, configured CSE) | API key + `cx` | REST `GET https://customsearch.googleapis.com/customsearch/v1`; client libraries exist | OpenSearch JSON: `title`, `link`, `snippet`, `displayLink`, `pagemap` | CSE control panel site list; `siteSearch` + `siteSearchFilter`; `cr` country; `rights` CC filter | `dateRestrict`, `fileType`, `sort=date`, SafeSearch | **Closed to new customers.** Existing: 100 free queries/day; $5 / 1k; cap 10k/day; **discontinued 1 Jan 2027** | 10 results/page; max 100 results total | Google API ToS apply; product is sunsetting | Not positioned as RAG. Google points new users to Vertex AI Search (up to 50 domains) |
| **Bing Web Search / Azure** | **Retired 11 Aug 2025.** Replacement: Grounding with Bing Search in Foundry Agent Service | Azure resource + agent | JS SDK for *agents*, not a SERP API | Developers **do not receive raw Bing snippets**. Model response includes citations + Bing query URL that **must** be displayed | “Designed to retrieve real-time information from web, NOT specific web domains” | Freshness, market, count (max 50) as tool params | Paid Azure only; sponsored/free-credit subs ineligible | Tool-call metered | Strict Bing grounding display/legal terms; data leaves Azure compliance boundary | Grounding for LLMs, not a search-results API |
| **SerpApi** | **Scrapes** Google (default) and other engines into JSON | `api_key` | REST `https://serpapi.com/search.json`; official clients | Organic: title, link, snippet, source, date (engine-dependent); `output=md` for LLMs | Google operators in `q` (`site:`, `inurl:`) | Google Scholar *engine* (scrape, not Google-official); many engines | Free 250 searches/mo; Starter $25 / 1k; Legal Shield from Production $150/mo | Throughput/hr by plan (Free = 50/hr) | ToS: you may not use for illegal purposes; SerpApi “assumes liabilities of scraping” only on higher plans (U.S. Legal Shield). **Does not license Google’s ToS to you.** | Markdown output “optimized for LLMs and AI agents” |
| **Semantic Scholar** | Own Academic Graph (~214M papers) | Optional API key; unauthenticated allowed | REST `https://api.semanticscholar.org/graph/v1` | `title`, `url`, `abstract`, `year`, `venue`, `citationCount`, `isOpenAccess`, `openAccessPdf`, `tldr`, authors | Paper/author search, not web-domain filters | Recommendations; bulk datasets | Free. Unauth: 1000 rps *shared*; keyed intro limit **1 rps** | Shared unauth pool; keyed 1 rps intro | Open research API; link to semanticscholar.org | Scholarly metadata, not web RAG |
| **Crossref REST** | Member-deposited scholarly metadata | None required; polite pool via `mailto=` | REST `https://api.crossref.org/` | DOI, title, author, published date, `license`, abstract (some copyrighted), funder, ISSN | Journal/member/funder filters, not web TLDs | Content negotiation; works/journals/members | Free. “Almost none of the metadata is subject to copyright… use it for any purpose.” Abstracts may be copyrighted | Polite pool recommended | Metadata mostly uncopyrighted; abstracts may be | Bibliographic, not web search |
| **OpenAlex** | Open scholarly graph (works, authors, sources) | REST; response included `cost_usd` on a sample call | REST e.g. `https://api.openalex.org/works?search=` | `id`, `doi`, `title`, `publication_date`, `open_access`, `cited_by_count`, `authorships`, `primary_location.landing_page_url`, license on locations | Filters on works/sources, not arbitrary web domains | Full-text search filter observed on live API | Live `GET /works?search=` succeeded unauthenticated (sample charged `$0.001` in `meta.cost_usd`) | Help-center docs did not render useful rate-limit text in this fetch | Open catalog; landing pages still under publisher copyright | Scholarly overlay |
| **Wikimedia REST** | Wikipedia/Wikimedia content + metadata | None for low volume; access policy for high volume | REST e.g. `https://en.wikipedia.org/api/rest_v1/page/summary/{title}` | Summary, title, extract, content_urls, timestamp | N/A (project-scoped) | MediaWiki Action API also exists | Free | High-volume caching/access policy | CC BY-SA / GFDL for Wikipedia text (project licenses); cite + share-alike | Encyclopedia retrieval, not web search |
| **Google Scholar** | **No official public API.** Publisher inclusion docs only | — | — | — | — | SerpApi offers an unofficial Scholar *scrape* engine | — | — | Do not spec a Scholar API | — |

Sources for this table are listed in §7.

---

## 4. Trust-scheme options and what each API can implement

Wikipedia:Reliable sources is the strongest canonical policy in this set. It says: articles must rest on **reliable, independent, published** sources with a reputation for fact-checking; reliability is **contextual** (work, author, publication, publisher); **academic secondary sources** (review articles, textbooks, monographs) beat isolated primary studies and news for scholarly topics; news is generally OK for facts from well-established outlets; self-published, predatory, sponsored, and rumor sources are weak; **no source is always reliable**.

CRAAP (Meriam Library, CSU Chico, 2010 handout, CC BY 4.0) is a *human checklist*: Currency, Relevance, Authority, Accuracy, Purpose. The only mechanical URL hint it names is TLD (`.edu` `.gov` `.org` `.com` `.net`) under Authority — as a question, not a rule.

SIFT (Mike Caulfield, 2019, CC BY 4.0) is the opposite of a domain whitelist: **Stop; Investigate the source; Find better coverage; Trace to original context.** It is a *lateral-reading* procedure. A generator cannot “SIFT” in the human sense, but the spec can mimic **Find better coverage** (prefer consensus/educational sources) and **Trace** (cite the page you actually used, with `retrievedAt`).

### Option A — Hard allowlist

Only return results whose host is on a fixed list (OpenStax, MIT OCW, Khan, Britannica, Wikipedia, named `.edu` departments).

| API | Can it? |
| --- | --- |
| You.com | Yes: `include_domains` ≤500 |
| Tavily | Yes: `include_domains` ≤300 |
| Exa | Yes, strongest: ≤1200, path prefixes (`openstax.org/books`), wildcards |
| Perplexity | Weak: ≤20 domains, allow *or* deny |
| Brave | Partial: `site:a.com OR site:b.com` and/or Goggles `$discard` everything else |
| Google CSE | Yes historically via engine config / `siteSearch` — **unavailable to new customers** |
| Bing grounding | **No** — “NOT specific web domains” |

**Verdict:** Too brittle for a general course generator. Khan, Wikipedia, OpenStax, Britannica are different TLDs; many excellent explainers are not on any static list. Use as a *first pass* for K–12 core subjects, not as the only pass.

### Option B — Ranked preference (boost, don’t exclude the rest)

Prefer a list; still allow other domains if the boosted set has nothing on-topic.

| API | Can it? |
| --- | --- |
| **You.com** | **Native `boost_domains`** (cannot combine with `include_domains`; *can* combine with `exclude_domains`). Boost is “not quantified.” |
| Brave | Native **Goggles** (`$boost` / `$discard` / site rules); up to 3 goggles |
| Tavily / Exa / Perplexity | No boost parameter. Emulate with two searches (allowlist pass + open pass) and merge by score — extra credits/cost |
| SerpApi / Google CSE | Emulate with `site:` operators or two queries |

**Verdict:** This is the scheme to pin. It matches Wikipedia RS (context, not a banned/allowed binary) and CRAAP (TLD is a hint). You.com implements it in one call.

### Option C — Hybrid (recommended)

1. **Preference list** (spec constant): `openstax.org`, `khanacademy.org`, `ocw.mit.edu`, `britannica.com`, `en.wikipedia.org`, `*.edu`, `*.gov`, plus subject-specific bodies (e.g. `nist.gov`, `nasa.gov`, `cdc.gov` for STEM/health).
2. **Boost** that list (`boost_domains` on You.com; Goggles on Brave).
3. **Denylist** content farms / UGC dumps / answer-mills (maintain in spec; `exclude_domains`).
4. **Post-filter in app:** drop results whose host is on the denylist even if the API misses; do **not** auto-promote every `.edu` (student blogs, predatory campus pages); do **not** treat Wikipedia as a primary source for contested claims (Wikipedia itself says it is often secondary — prefer its *references*).
5. **Scholarly overlay** when the assessed level and topic warrant it: OpenAlex or Semantic Scholar for review papers; Crossref for DOI + license; Wikimedia REST if Wikipedia is used, citing a **stable oldid** (APA’s Wikipedia rule).
6. **OER licensing gate:** if the generator *reproduces* OpenStax or MIT OCW text, that is not “just a citation” — it is a CC reuse. OpenStax textbooks are **CC BY-NC-SA 4.0** (credit OpenStax, title, link to free version; no commercial use; share-alike). MIT OCW is **CC BY-NC-SA 4.0** with an explicit non-commercial interpretation and extra AI-training rules (attribution in training docs; NC; ShareAlike on derivative models). A commercial product cannot wholesale remix those corpora without permission. **Citing and paraphrasing** is the safe prototype path; **quoting short excerpts** plus TASL is the next; **adapting chapters into lessons** is a later legal ticket.

### Mechanical mapping for the recommended API (You.com)

```
POST /v1/search
{
  "query": "<topic> <level> <site:.edu optional>",
  "count": 8,
  "boost_domains": ["openstax.org", "khanacademy.org", "ocw.mit.edu", "britannica.com", "en.wikipedia.org", ...],
  "exclude_domains": ["pinterest.com", "...content-farm..."],
  "extraction": { "extraction_mode": "highlights" }   // RAG passages; snippets omitted
}
```

Fallback if highlights are thin: same query without boost, or `include_domains` restricted to the preference list (hard allowlist pass). Do not use `include_domains` and `boost_domains` together (vendor forbids).

Tavily equivalent: `include_domains` first; if `results.length` is low, second `search` without include, with `exclude_domains`, merge by `score`. Extra credit cost.

Brave equivalent: inline Goggle boosting those hosts on `/v1/llm/context` with `enable_source_metadata=true` — excellent metadata, **illegal to persist under default ToS**.

---

## 5. Citation rule options

### What first-party citation systems actually do

**Wikipedia:Citing sources.** A citation has two parts: (1) an **inline** marker next to the supported claim (usually a superscript footnote); (2) a **full reference list** that identifies the source so a reader can find it. Inline citations are required for quotations, close paraphrase, and material likely to be challenged. In-text attribution (“Rawls argues…”) is required for quotes, close paraphrase, and opinion. Consistency of style inside one article matters more than which academic style is chosen. Purpose: verifiability, not original research, anti-plagiarism.

**APA Style (official Wikipedia-entry example).** For a wiki page: cite an **archived revision** (`oldid`) so readers retrieve the same version; parenthetical `("Title," year)`. APA’s broader webpage pattern was not successfully fetched (Incapsula block); the Wikipedia-entry page is the first-party APA artifact in hand.

**Creative Commons TASL** (Title, Author, Source, License), with links. Required when *reusing* CC-licensed work, not merely when pointing at a URL. Reasonable for the medium. Do not credit “Creative Commons” as author. Adaptations must be labeled. ND licenses forbid adaptations; NC forbids commercial reuse — relevant to OpenStax and MIT OCW.

**Anthropic Citations / search_result.** Enable `citations.enabled` on documents or `search_result` blocks. Claude returns text blocks with a `citations[]` array: `type: search_result_location`, `source`, `title`, `cited_text`, `search_result_index`, block indices. `cited_text` is the supporting passage and is not counted as output tokens. This is the closest vendor primitive to “the generator cites sources in lessons.”

**OpenAI file_search.** Annotations on `output_text`: `{ type: "file_citation", file_id, filename, index }`. Designed for **files you uploaded**, not live web URLs. Do not use it as the web-citation design; it is a pattern (inline annotation → source id) to copy.

**You.com grounding guide (first-party).** Each result is “citation ready”: `url`, `title`, snippet/highlight the model can quote.

**Brave Answers** (not the recommended Search plan) claims “grounding supported by citations.” Unused if we own the LLM.

### Three citation rules the spec could pick

| Rule | Lesson UX | Store | Fits prototype? |
| --- | --- | --- | --- |
| **A. Numbered footnotes + source list (recommended)** | `[1]` after supported sentences; “Sources” at end with title, publisher/domain, URL, retrieved date | `url`, `title`, `publisher`/`domain`, `retrievedAt`, `usedAs`, optional `quotedText`, `license` | Yes. Matches Wikipedia. Works with any LLM. |
| **B. Vendor-native Claude citations only** | Render Anthropic citation payloads as footnotes | Persist API citation objects | Only if Claude is the generator; still store URL/title/retrievedAt |
| **C. Academic APA bibliography only (no inline)** | End list, no superscripts | Same metadata | Weaker verifiability; Wikipedia and Wikipedia:V require inline for quotes/challengeable claims |

### Recommended generator behavior (Rule A, with B if Claude)

1. Retrieve 5–10 sources (You.com highlights).
2. Pass them to the LLM as numbered sources (or Claude `search_result` blocks). Instruct: every factual claim that is not elementary common knowledge gets a footnote; do not invent URLs; paraphrase unless quoting ≤25 words.
3. After generation, **drop any footnote whose URL was not in the retrieval set** (hallucinated citations).
4. Persist the citation record on the lesson. Use `retrievedAt` because pages change (APA wiki rule; SIFT “trace”).
5. Quotes: in-text attribution + footnote + stored `quotedText`. Paraphrase: footnote only.
6. If a source is CC-licensed and the lesson *reproduces* more than a short quote, emit TASL in the source list and refuse NC material in a commercial build.
7. Wikipedia: if used, prefer `https://en.wikipedia.org/w/index.php?title=…&oldid=…` (Action API `revisions`) over the moving `wiki/` URL.
8. Scholarly hits: store DOI when OpenAlex/Crossref provided one; link `landing_page_url` / `openAccessPdf` only if OA.

**Minimum TypeScript shape for the spec:**

```ts
type LessonSource = {
  url: string;
  title: string;
  publisher: string;      // hostname or OpenGraph site_name
  retrievedAt: string;    // ISO 8601
  usedAs: "quote" | "paraphrase";
  quotedText?: string;    // required if usedAs === "quote"
  license?: string;       // e.g. "CC BY-NC-SA 4.0"
  doi?: string;
};
```

---

## 6. Risks / ToS / failure modes (for later tickets)

**Generation pipeline**

- **Brave storage ban.** Default ToS (11 Feb 2026): no store/cache/database of Search Results except transient operation; destroy on termination; no training. A lesson table of URLs+snippets is likely a “database of Search Results.” Do not pick Brave unless legal signs a storage-rights order form. FAQ is even stricter (“retain any and all data”).
- **Tavily “internal business purposes.”** Customer Applications integration is allowed, but a consumer-facing product should have counsel read §2–3 and the AUP. AI Functionality outputs may be used to train Tavily/third parties unless query-data use is turned off.
- **You.com ToS** for *customer* storage of results was not found as a standalone legal page in this pass; ZDR docs govern *You.com’s* retention. Generation-pipeline ticket should fetch the customer ToS before locking the vendor in a contract.
- **SerpApi / Google scrape.** SerpApi’s own ToS admits the product is scraping/parsing search engines; Legal Shield is not a license from Google. Out of scope for “legally cleaner than scraping Google.”
- **Bing grounding.** No raw results; mandatory display of Bing query URLs; data leaves Azure compliance boundary; classic agents retire 31 Mar 2027. Unusable as the retrieval API for this spec.
- **Google CSE sunset.** New customers blocked; hard stop 1 Jan 2027. Vertex AI Search is Google’s stated alternative for **up to 50 domains** (site-restricted), not open web.
- **CC NC/SA.** OpenStax and MIT OCW cannot be the *body* of a commercial generated course without permission. Citation + paraphrase is the prototype path. MIT OCW additionally restricts **AI training** on OCW content to NC + ShareAlike + attribution — a later ticket if the product trains on fetched OCW text.
- **Crossref abstracts** may be copyrighted even when bibliographic metadata is not.
- **Wikipedia text** is CC BY-SA / GFDL: reproducing article prose in a lesson is a share-alike event, not a normal web citation.

**Quality bar**

- **Boost is not a guarantee.** You.com: if boosted domains have no match, other domains still appear; boost magnitude is unpublished.
- **TLD is not authority.** CRAAP asks “does the URL reveal anything?” — student `.edu` pages, `.gov` press offices, and `.org` advocacy groups fail Accuracy/Purpose often. Wikipedia RS: context.
- **News vs textbook.** Wikipedia RS: scholarly topics should not be taught from news wire copy when a textbook/review exists. Preference list should put OpenStax/OCW/Britannica above news. You.com will mix `results.news` by query intent — drop or downrank news for evergreen lessons.
- **Freshness vs curriculum stability.** Extra snippets/highlights help the LLM; `page_age` / Brave `age` help Currency. For math/history, old OpenStax is often *better* than a 2026 blog. Do not apply `freshness=week` globally.
- **Empty trusted set.** Hard allowlist will fail long-tail topics. Hybrid must fall back to open search + denylist + “low confidence” flag on the lesson.
- **Hallucinated citations.** Always intersect model footnotes with the retrieval set (Anthropic’s structured citations reduce but do not eliminate the need to persist `source`).

**Web-search synthesis fog**

- Snippets/highlights are **not the page**. SIFT’s “trace to original context” is violated if the model quotes a snippet that was truncated or query-biased. For quotes, call You.com highlights or Tavily Extract / Exa contents on the cited URL and quote from that extract.
- Extra/alternate snippets (Brave) and Tavily `chunks_per_source` (max 3 × 500 chars) still omit caveats, paywalls, and retractions.
- Aggregators (Wikipedia RS: MSN/Yahoo) should be skipped in favor of the original publisher — implement as denylist + prefer canonical host.
- Perplexity/You.com/Tavily “include answer” / Answer APIs synthesize *for you*. This product wants **your** LLM + **your** citations. Use search-results APIs, not vendor answer APIs, or you will double-synthesize and lose control of the footnote graph.
- Rate/cost fog: a course from skill 40→100 with ~20 lessons × 2 searches ≈ 40 calls — fine on free credits. Regeneration loops and per-section search will not be. Cap searches per lesson in the spec.
- **No Google Scholar API.** Do not write “fetch Google Scholar.” Use OpenAlex / Semantic Scholar / Crossref.

---

## 7. Sources

Every claim above traces to one of these. Secondary blogs were not used as authorities.

### Search APIs

- Brave product + pricing + JS example: https://brave.com/search/api/
- Brave Web Search get-started (index, extra snippets, Goggles, operators, freshness, pagination): https://api-dashboard.search.brave.com/app/documentation/web-search/get-started
- Brave official pricing: https://api-dashboard.search.brave.com/documentation/pricing
- Brave Terms of Use (store/cache ban, training ban, attribution, last updated 11 Feb 2026): https://api-dashboard.search.brave.com/terms-of-service
- Brave help FAQ (“prohibited to retain any and all data”): https://api-dashboard.search.brave.com/documentation/resources/help-feedback
- Brave LLM Context (RAG endpoint, Goggles, source age metadata): https://api-dashboard.search.brave.com/documentation/services/llm-context
- Google Custom Search overview (closed to new customers; $5/1k; discontinue 1 Jan 2027; Vertex AI Search ≤50 domains): https://developers.google.com/custom-search/v1/overview
- Google Custom Search introduction: https://developers.google.com/custom-search/v1/introduction
- Google `cse.list` parameters (`siteSearch`, `dateRestrict`, `rights`, `num`): https://developers.google.com/custom-search/v1/cse/list
- Vertex AI / Agent Search (Google’s current search product family): https://cloud.google.com/generative-ai-app-builder/docs/enterprise-search-introduction
- Bing Search APIs retirement (11 Aug 2025) → Grounding with Bing Search: https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement
- Grounding with Bing Search (no raw results to developers; display requirements; not domain-specific): https://learn.microsoft.com/en-us/azure/ai-services/agents/how-to/tools/bing-grounding
- SerpApi Google Search API (scrape; `site:`; `output=md`): https://serpapi.com/search-api
- SerpApi pricing: https://serpapi.com/pricing
- SerpApi Terms (Legal Shield for scraping, last updated 8 Apr 2026): https://serpapi.com/legal
- Tavily Search OpenAPI (`include_domains` 300, `exclude_domains` 150, result fields, depths): https://docs.tavily.com/documentation/api-reference/endpoint/search
- Tavily credits & pricing: https://docs.tavily.com/documentation/api-credits
- Tavily JS SDK: https://docs.tavily.com/sdk/javascript/quick-start
- Tavily JS reference (linked from quickstart): https://docs.tavily.com/sdk/javascript/reference
- Tavily Terms: https://www.tavily.com/terms
- Tavily query-data setting: https://help.tavily.com/articles/4205958832-understanding-the-allow-use-of-query-data-setting
- Exa Search API (`includeDomains` 1200, path/wildcard): https://exa.ai/docs/reference/search
- Exa coding-agent search guide: https://exa.ai/docs/reference/search-api-guide-for-coding-agents
- Exa pricing: https://exa.ai/docs/reference/pricing
- Exa TypeScript SDK (`exa-js`): https://exa.ai/docs/sdks/typescript-sdk-specification
- Perplexity Search quickstart (domain filter, TS SDK, result date): https://docs.perplexity.ai/docs/search/quickstart
- Perplexity Search POST reference: https://docs.perplexity.ai/api-reference/search-post
- Perplexity platform overview (Search API = raw results): https://docs.perplexity.ai/docs/getting-started/overview
- Perplexity pricing (Search API $5/1k): https://docs.perplexity.ai/docs/getting-started/pricing
- You.com Web Search guide (RAG, operators, domain filters, boost, pricing, ZDR): https://you.com/docs/guides/search
- You.com TypeScript SDK: https://you.com/docs/sdks/typescript-sdk
- You.com Search API reference fields: https://you.com/docs/api-reference/search/v1-search
- You.com ZDR (independent index; queries not to Google/Bing): https://you.com/docs/administration/zero-data-retention
- You.com grounding/citations capability: https://you.com/docs/capabilities/grounding-llm-responses-with-citations
- You.com changelog (extraction billing 11 Aug 2026): https://you.com/docs/changelog/2026/8/11

### Scholarly / encyclopedia APIs

- Semantic Scholar API overview: https://www.semanticscholar.org/product/api
- Semantic Scholar tutorial: https://www.semanticscholar.org/product/api/tutorial
- Crossref REST API: https://www.crossref.org/documentation/retrieve-metadata/rest-api/
- Crossref live API: https://api.crossref.org/
- OpenAlex live works search (used as primary API evidence when the help center rendered as a shell): https://api.openalex.org/works?search=photosynthesis&per-page=1
- Wikimedia REST API: https://www.mediawiki.org/wiki/Wikimedia_REST_API
- Google Scholar inclusion (webmaster/publisher docs; not an API): https://scholar.google.com/scholar/inclusion.html
- Google Scholar publishers: https://scholar.google.com/intl/en/scholar/publishers.html

### Trust frameworks and OER licenses

- Wikipedia:Reliable sources: https://en.wikipedia.org/wiki/Wikipedia:Reliable_sources
- Wikipedia:Citing sources: https://en.wikipedia.org/wiki/Wikipedia:Citing_sources
- CRAAP Test PDF (Meriam Library, CSU Chico, 9/17/10, CC BY 4.0): https://library.csuchico.edu/sites/default/files/craap-test.pdf
- CRAAP library landing: https://library.csuchico.edu/help/source-or-information-good
- SIFT (Mike Caulfield, Hapgood, 19 Jun 2019, CC BY 4.0): https://hapgood.us/2019/06/19/sift-the-four-moves/
- OpenStax licensing (CC BY-NC-SA): https://help.openstax.org/s/article/Licensing-information-of-OpenStax-textbooks
- MIT OCW about (cite OCW; OER): https://ocw.mit.edu/about/
- MIT OCW terms (CC BY-NC-SA 4.0, NC interpretation, AI training rules, updated 11 Aug 2026): https://ocw.mit.edu/terms/
- Creative Commons recommended attribution (TASL): https://wiki.creativecommons.org/wiki/Best_practices_for_attribution

### Vendor RAG citation

- Anthropic Citations: https://platform.claude.com/docs/en/build-with-claude/citations
- Anthropic search_result citations: https://platform.claude.com/docs/en/build-with-claude/search-results
- OpenAI file_search citations: https://platform.openai.com/docs/guides/tools-file-search
- APA Style Wikipedia entry references: https://apastyle.apa.org/style-grammar-guidelines/references/examples/wikipedia-references

### Unreached / uncertain

- **APA webpage/website reference examples** (`apastyle.apa.org/…/webpage-website-references`): Incapsula block. Used the Wikipedia-entry APA page instead.
- **Khan Academy Terms of Service** (`khanacademy.org/about/tos`): client-challenge block. Khan is on the preference list as a well-known OER site; **reuse/licensing of Khan *content* is unverified from first party in this file.**
- **Britannica reuse/licensing:** fetch timed out. Britannica is listed as a preference *domain* for ranking, not as a confirmed remixable corpus.
- **OpenAlex human docs** (`docs.openalex.org`): help-center shell, little API text. Live REST API was used instead. Rate limits/pricing beyond the sample `cost_usd` field are uncertain.
- **You.com customer Terms of Service** (what *you* may store): **resolved after this note was first written** — see Addendum below. The MSA is https://you.com/msa.
- **Exa and Perplexity full ToS:** not fetched. Pricing and API behavior are first-party; storage/training clauses are uncertain.
- **Google Scholar official API:** none found on Google developer or Scholar properties. Absence is inferred from Scholar only publishing inclusion/publisher docs, not an API reference.
- **Brave Goggles language reference:** Web Search docs point to Goggles documentation/repo; syntax examples appear in the API reference (`$discard,site=…`). Full Goggle grammar was not separately fetched.
- **Vertex AI Search “50 domains”:** stated on the Custom Search JSON API overview as Google’s alternative; the Agent Search intro fetched here did not restate the number. Treat 50 as Google’s CSE-overview figure, not re-verified on the Agent Search page.

---

## Addendum (2026-08-14, follow-up)

**You.com MSA now retrieved** ([https://you.com/msa](https://you.com/msa), SuSea, Inc. MSA v.121525). Unlike Brave, there is no ban on storing Search Results. §6.1 assigns You.com’s interest in Outputs to the customer. §2.1 explicitly contemplates Customer Applications calling the API. §3.5(q) forbids extracting data *other than through the APIs* — using `POST /v1/search` and persisting citation metadata is the permitted path. §3.3(c) still says use the Platform “only for its internal business purposes”; that is a yellow flag for a later consumer product, not a blocker for this prototype spec. **Do not treat “confirm You.com storage ToS” as an open procurement gate.**

**`boost_domains` wildcards are undocumented.** Official examples are concrete hosts (`reuters.com`). TLD preference (`*.edu` / `*.gov`) is *not* a documented `boost_domains` value. Pin TLD preference as optional `site:.edu` / `site:.gov` query operators, and keep `boost_domains` as a list of named hosts.

**`include_domains` cannot be combined with `exclude_domains`** (422), in addition to the already-noted ban on combining `include_domains` with `boost_domains`. The recommended call is `boost_domains` + `exclude_domains` only.

---

*End of research note.*
