# Drumming source availability

**Date:** 2026-08-21

Can the locked You.com Web Search API plus hybrid ranked preference (`boost_domains` + `exclude_domains`, numbered citations, cite-and-paraphrase) supply enough reliable **text, image, animation, audio, and video Sources** to generate a drum-kit Test course from beginner fundamentals through the Learning Goal of playing “Iris” by the Goo Goo Dolls? Which educational hosts should be added to the Preference list, and where must the Course rely on demonstrative media inside reading lessons rather than text alone? Locked constraints: lessons are reading + theory quizzes + prescribed offline kit practice; AV is not a teaching-method plugin; generating video lessons is out of scope; demonstrative media may live in reading-lesson content blocks; quotes must come from extracted page text, not truncated snippets; CC BY-NC-SA corpora must not be remixed into lesson bodies.

---

## 2. Recommendation

**Conditional yes for a transferable-skills course; no for teaching “Iris” as a reproduced drum chart or as official audio.** The locked You.com scheme can retrieve and cite enough **text** Sources to generate lessons on kit anatomy, notation conventions, rudiment *names and practice rules*, rock-beat vocabulary (backbeat, fills, grooves), and a word-level description of “Iris” (personnel, time-signature alternation, that Mike Malinin played drums). It cannot natively search images or video as first-class result types. Demonstrative media (kit diagrams, grip stills, notation legends) must be taken from **cited pages** (Contents/HTML extract or Wikimedia Commons files) or from a **separate media API**, not from `POST /v1/search`. The locked Images endpoint is beta, unmaintained, and partner-only; there is **no Videos API** in the current official endpoint index.

**Add to `boost_domains` (named hosts, no wildcards):** `pas.org`, `vicfirth.com`, `ae.vicfirth.com`, `commons.wikimedia.org`. Optionally add `online.berklee.edu` for public catalog/syllabus pages (course bodies are paid). Keep the existing general list (`openstax.org`, `khanacademy.org`, `ocw.mit.edu`, `britannica.com`, `en.wikipedia.org`) even though OpenStax, Khan, and MIT OCW have **almost no drum-kit performance coverage** — they remain useful for adjacent theory (note values, meter) and encyclopedia pages.

**Keep off the Preference list:** `drumeo.com` (membership; licensed third-party song content; personal non-commercial license), `hudsonmusic.com` (single-user digital-product license), `musicnotes.com` (personal sheet-music license), `ultimate-guitar.com` and `songsterr.com` (licensed *for their users*; ToS forbid commercial republication of their content), `youtube.com` (viewing is personal/non-commercial; embed only via the official player; scraping forbidden).

**Denylist (or `exclude_domains`):** unlicensed tab mills and scrape-and-repost transcription sites; Pinterest and similar aggregators. Do **not** denylist Ultimate Guitar or Songsterr solely because they host user tabs — both claim publisher licenses — but do **not** boost them, and do **not** copy their tabs into lessons. Do **not** denylist YouTube; treat it as a *cite-the-URL, do-not-scrape, optional official-player embed* host, not a Preference host.

**Media-reliance map (load-bearing):**

| Skill | Text + still diagrams with citations | Needs animation/audio/video *inside* the reading lesson | Cannot be taught under reading+quiz-only even with embeds |
| --- | --- | --- | --- |
| Kit anatomy / names of parts | Yes (Wikipedia, Commons diagrams, Berklee public syllabus) | Optional photos | — |
| Notation (staff, legend, note values, time signatures) | Yes (Wikipedia percussion notation; Khan *if reachable*; PAS legend cited in Wikipedia) | Notation *images* of example patterns | — |
| Rudiment names, sticking labels, open–close–open rule | Yes (PAS HTML + copyrighted PDF as a *cited* source, not a copied chart) | Audio of each rudiment (Vic Firth / Alfred recordings are copyrighted — cite, do not copy) | Executing the rudiment at tempo |
| Grip and stroke (matched/traditional, fulcrum, rebound) | Partial (Wikipedia grip article; Vic Firth PDF stills) | **Required:** Vic Firth’s own Percussion 101 and beginner series are *video* guides | The motor skill itself (offline practice) |
| Coordination / rock beat / backbeat | Partial (Wikipedia drum kit “Grooves”; Beat/backbeat) | **Required:** audio or short video of a backbeat vs. a fill | Playing four-way coordination |
| Fills, song form | Partial (Wikipedia fills) | Audio examples of fills as section markers | Inventing musical fills in time |
| “Iris” transferable skills (6/8 vs 4/4, power-ballad dynamics) | Yes from Wikipedia composition facts | Optional: cite a licensed recording the *learner* already owns | Playing the song end-to-end |
| “Iris” note-for-note drum transcription / official audio | **No — copyright** | Embedding official audio or a full chart is infringement, not a media-plugin gap | Reproducing the arrangement |

**Rejected alternatives (one line each)**

- **Rely on OpenStax / Khan / MIT OCW for drum-kit content:** OpenStax has physics of sound and anthropology of music, not kit technique. Khan’s music track is notes-and-rhythm theory (and was client-challenge blocked in this pass). MIT OCW has West African / Indian drumming and DAW drum-loop exercises, not drum-kit rudiments.
- **Boost Drumeo / Hudson Music as “the” education hosts:** First-party ToS are personal, non-commercial, no-republish licenses; Drumeo song breakdowns are licensed from Hal Leonard and similar. Preference-list boost would retrieve pages the generator must not remix.
- **Treat You.com Images / a hypothetical Videos API as the media pipeline:** Images is partner-only and unmaintained; no Videos endpoint exists in the official API index. Spec a page-level fetch or Wikimedia Commons instead.
- **Cite-and-embed YouTube as the demonstrative-media strategy:** YouTube ToS allow the official embeddable player and personal viewing; they forbid download, scrape, and non-personal commercial screening. A prototype that *cites* a YouTube URL and sends the learner off-app is a different design from embedding a short grip animation the product hosts.
- **Generate or copy an “Iris” drum transcription from Musicnotes / Songsterr / Ultimate Guitar:** Those sites license *their* users to view tabs; Musicnotes prints a personal-use notice; Songsterr forbids commercial reuse of Site content. The composition and the 1998 sound recording are separate copyrighted works (U.S. Copyright Office Circular 56A). Fair use does not supply a numeric-notes safe harbor.

---

## 3. You.com media capabilities

Facts below are from You.com first-party docs fetched 2026-08-21. Distinguish **what `POST /v1/search` returns** from **what a later fetch of a cited URL could scrape**.

### 3.1 What the Web Search API actually returns

The locked endpoint is still **`POST /v1/search`** (GET is frozen; `extraction` is POST-only). Results are unified **web** and **news** only. Documented web fields: `url`, `title`, `description`, `snippets[]`, `thumbnail_url`, `page_age`, `favicon_url`, and optional `contents` (`markdown` / `html` / `highlights` / `metadata.site_name` / `metadata.favicon_url`). News fields: `title`, `description`, `url`, `page_age`, `thumbnail_url`, plus the same optional `contents` object. ([Web Search guide](https://you.com/docs/guides/search); [API reference](https://you.com/docs/api-reference/search/v1-search); [v1-search.md schema](https://you.com/docs/api-reference/search/v1-search.md).)

**`thumbnail_url` is a UI thumbnail for the *page result*, not an image-search hit.** The search guide’s example JSON uses it as “Thumbnail images and favicons for UI display.” It is not a catalog of every figure on the page, not a video URL, and not an audio file. OpenGraph `site_name` is documented under `contents.metadata`; the documented metadata properties are `site_name` and `favicon_url`, not `og:image`, `og:video`, or `og:audio`. The Contents API text says including `metadata` returns “JSON-LD and OpenGraph information, **if available**,” but the published schema still only lists those two fields. ([contents.md](https://you.com/docs/api-reference/contents.md); [Contents guide](https://you.com/docs/guides/contents).)

**Snippets vs highlights vs full page.** Default: `snippets` (search guide: 100–200 words in the retrieve-page-content guide; “keyword-centered fragments”). `extraction_mode: "highlights"`: query-relevant `contents.highlights`; snippets omitted. `extraction_mode: "full_page"`: `contents.markdown` and/or `contents.html`. The locked citation rule (quotes from extracted page text, not truncated snippets) therefore still requires **highlights or full-page / Contents**, not default snippets. ([Retrieve page content](https://you.com/docs/guides/retrieve-page-content); search guide.)

**First-class result types.** Web pages and news articles. There is **no `results.images` or `results.videos` array** on `/v1/search`. The official API index (`https://you.com/docs/api-reference/llms.txt`) lists: Search, Contents, Answer, Research, Finance Research, Billing, **Images**. No Videos, no News-as-separate-endpoint (news is mixed into Search), no Audio.

### 3.2 Images API (not the locked search)

`GET https://api.you.com/v1/images?q=…` returns `{ images: { results: [{ title, page_url, image_url }] }, metadata }`. The docs banner: **“Beta and unmaintained.”** “The response shape and its availability can change without notice, so do not build a production dependency on it.” **“Access is limited to early access partners.”** Request access via `api@you.com`. ([Images](https://you.com/docs/api-reference/images/images).)

**Implication for the plugin/content-block ticket:** do not spec You.com Images as the media supplier for grip photos or kit diagrams. Even if partner access were granted, the vendor tells you not to depend on it.

### 3.3 Contents / extraction vs scraping a cited page

| Capability | Search + extraction | Contents API (`POST /v1/contents`) | A later app fetch of the cited URL |
| --- | --- | --- | --- |
| Starting point | Query | Known URLs (≤10 per request) | Known URL |
| Text | snippets / highlights / markdown / html | markdown / html | Whatever the origin server returns |
| Documented media | `thumbnail_url` only | markdown/html *may* contain image markup if the crawler keeps it; **not documented as an image/embed extractor** | Full HTML, including `<img>`, `<video>`, `<audio>`, iframes — subject to that site’s ToS/robots |
| OpenGraph | `contents.metadata.site_name` (and favicon) when extraction returns metadata | `formats` includes `metadata` → documented `site_name`, `favicon_url` | Full OG tags if present |
| Price | Search $5 / 1k calls; full-page extract **$1 / 1k pages** (same as Contents) | **$1 / 1k pages** | Your bandwidth; ToS risk |

The Contents guide is explicit: markdown “strips navigation, ads, footers, and other boilerplate” and is “ready to drop into a prompt.” HTML is for “Rendering, scraping structured data, preserving page layout.” That is the closest first-party hook for **later** pulling `<img src>` from a cited educational page — it is still **page extraction**, not image search, and it is not documented to return a structured list of figures, animation files, or audio. ([Contents guide](https://you.com/docs/guides/contents); retrieve-page-content “HTML vs Markdown” table.)

**Audio and video:** not first-class. A You.com result that *happens* to be a YouTube or Drumeo page is still a **web result** with a URL and text. Returning `youtube.com/watch?v=…` is not a license to download the file (YouTube ToS § Permissions and Restrictions, fetched below).

### 3.4 Operators, TypeScript SDK, pricing

Operators on the query string: `site:`, `filetype:`, `+`/`-`, `AND`/`OR`/`NOT`. Official example: `climate change site:.edu filetype:pdf`. That is how TLD preference stays (optional `site:.edu` / `site:.gov`), not `boost_domains: ["*.edu"]`. `filetype:pdf` is the right operator for the PAS rudiments PDF. ([Search operators](https://you.com/docs/guides/search-operators); search guide.)

TypeScript SDK: `@youdotcom-oss/sdk`; `you.search` and `you.contents` are documented. Response mapping uses `thumbnailUrl` / `pageAge` in SDK prose vs `thumbnail_url` / `page_age` in REST. ([TypeScript SDK](https://you.com/docs/sdks/typescript-sdk).)

Pricing unchanged from the trust-scheme note: Search **$5.00 / 1,000 calls** (up to 100 results); **$100** new-account credits; full-page extraction and Contents **$1.00 / 1,000 pages**. Extraction cost matters if the generator quotes from full pages or if HTML is fetched to harvest figure URLs. Highlights are the cheaper RAG path and do **not** give you images. ([Search guide pricing](https://you.com/docs/guides/search); [Contents pricing](https://you.com/docs/guides/contents).)

### 3.5 What this means for the content-block ticket

1. **You.com Search will not “find a grip animation.”** It will find *pages about grip*. Media must be (a) a still/diagram with a free license on a cited host (Wikimedia Commons), (b) extracted from HTML of a cited educational page *if that host’s ToS allows reuse* (Vic Firth’s ToS do **not** grant a remix license — see §4), or (c) produced/licensed by the product.
2. **Citing a YouTube video is in scope as a Source URL; embedding it is a ToS/product decision; downloading it is forbidden.**
3. **Quotes** still need `extraction_mode: "highlights"` or Contents/full_page on the cited URL, per the locked scheme.

---

## 4. Source inventory by topic

Typical path from beginner kit to “Iris”: anatomy → grip/stroke → notation → stickings/rudiments → coordination → rock-beat vocabulary → fills → song-specific transferable skills → prescribed offline practice. For each topic: what first-party hosts actually publish, indexability, license/ToS, Preference / denylist / neither.

### 4.1 Kit anatomy

| Host | What they publish | Indexable? | License / ToS | List |
| --- | --- | --- | --- | --- |
| **en.wikipedia.org** `Drum kit` | Long encyclopedia article: standard configuration (snare, bass, toms, hi-hat, ride, crash), history, grooves vs fills vs solos, grip pointer, numbered kit diagram in the infobox | Yes | Text **CC BY-SA 4.0** (+ often GFDL). Reproducing article prose in a lesson is share-alike, not a normal citation. Images have **per-file** licenses. ([Wikipedia:Copyrights](https://en.wikipedia.org/wiki/Wikipedia:Copyrights); article [Drum kit](https://en.wikipedia.org/wiki/Drum_kit).) | Keep on Preference (already) |
| **commons.wikimedia.org** `File:Drum kit illustration edit.svg` | Vector kit diagram used by Wikipedia | Yes | **CC BY-SA 3.0** and **GFDL 1.2+** (file page). Usable in a lesson with TASL attribution and share-alike on that asset. ([file page](https://commons.wikimedia.org/wiki/File:Drum_kit_illustration_edit.svg).) | **ADD** |
| **britannica.com** | Encyclopedia “drum set” URL exists | **Unreached this pass** (Cloudflare “security verification”) | Unverified. Keep as general Preference domain; do not treat as confirmed drum corpus. | Keep (already); coverage unverified |
| **online.berklee.edu** Drum Set Performance 101 | Public syllabus: grip, playing area, sound, balance; requires acoustic or electronic kit + pad + 5A/5B sticks | Yes (catalog page) | © Berklee College of Music 2001–2026; course body is paid ($1,575 / 12 weeks). Catalog text is citable; do not scrape the LMS. ([course page](https://online.berklee.edu/courses/drum-set-performance-101).) | Optional ADD for catalog pages |
| **ocw.mit.edu** | Music of Africa (West African drumming, in-class), Music of India (tabla), Music and Technology drum-*loop* DAW homework — not drum-kit rudiments | Yes | MIT OCW **CC BY-NC-SA 4.0** (already in the trust-scheme note). Cite/paraphrase only. | Keep (already); **weak for this Test course** |
| **openstax.org** | Physics of musical sound (drumheads as resonators); anthropology of prehistoric percussion. **No performance textbook.** Subjects page required JS and did not render. | Textbook pages yes | CC BY-NC-SA 4.0 (existing note). | Keep; **do not expect kit lessons** |

### 4.2 Grip and stroke

| Host | What they publish | Indexable? | License / ToS | List |
| --- | --- | --- | --- | --- |
| **en.wikipedia.org** `Matched grip` (page title fetched as “Grip (percussion)”) | Traditional vs matched; French / German / American matched variants; still photos (Elvin Jones, etc.); physiology claim that traditional left-hand uses fewer muscles | Yes | CC BY-SA text; photos per-file. ([Grip (percussion)](https://en.wikipedia.org/wiki/Matched_grip).) | Keep |
| **en.wikipedia.org** `Drum stick` | Construction (tip, shoulder, shaft, butt), 5A/7A numbering, two main grips, Moeller 1925 citation | Yes | CC BY-SA. ([Drum stick](https://en.wikipedia.org/wiki/Drum_stick).) | Keep |
| **ae.vicfirth.com** Percussion 101 | **“A Video Guide to Essential Percussion Techniques.”** Collegiate Educator Program curriculum; David Skidmore. Concert snare includes “VIDEO 6: The Grip” and “Basic Stroke (Legato/Rebound Stroke).” | Yes (education subdomain) | Vic Firth / Zildjian **Terms of Use** (updated 3 Nov 2025): prohibited uses include reverse engineer, duplicate, create derivative works, extract information, scrape/index/data-mine; Forums quotes capped at 50 words with attribution. **No grant to remix education videos into a third-party course.** Cite the page; do not copy the videos. ([Percussion 101](https://ae.vicfirth.com/education/percussion-101/); [Terms](https://vicfirth.com/pages/terms-of-use-updated).) | **ADD** `ae.vicfirth.com` + `vicfirth.com` |
| **ae.vicfirth.com** Beginner Drum Set Lessons (Stanton Moore) | Free video: “Gripping the Sticks” — matched and traditional | Yes | Same ToS | ADD (same hosts) |
| **ae.vicfirth.com** `FA-Drumset-Introduction.pdf` | Still diagrams: balance point ~⅓ from butt, fulcrum, 90° stick angle, rebound stroke | Yes (`filetype:pdf`) | Same site ToS; PDF is instructional stills, still Zildjian-owned | Cite; do not republish the PDF |

**Verdict:** trustworthy **text** exists (Wikipedia). The educational hosts that actually *teach grip* do it as **video** (Vic Firth Percussion 101 is labeled a video guide). Still diagrams exist in a Vic Firth PDF and on Wikipedia. Animation/video inside the reading lesson is the honest requirement for grip; the generator can **cite** Vic Firth, not **host** Vic Firth’s video without a license.

### 4.3 Notation

| Host | What they publish | Indexable? | License / ToS | List |
| --- | --- | --- | --- | --- |
| **en.wikipedia.org** `Percussion notation` | Neutral clef, x-noteheads for cymbals, PAS-based kit legend, rolls, open/closed hi-hat, rim shot, ghost-note anti-accents. Cites Weinberg, *Guide To Standardized Drumset Notation* (PAS). | Yes | CC BY-SA. Notation **examples in the article** are encyclopedia illustrations, not a license to copy a commercial chart. ([Percussion notation](https://en.wikipedia.org/wiki/Percussion_notation).) | Keep |
| **en.wikipedia.org** `Drum tablature` | ASCII drum-tab legend and a four-on-the-floor example | Yes | CC BY-SA. Tabs of copyrighted *songs* are a different issue (§6). ([Drum tablature](https://en.wikipedia.org/wiki/Drum_tablature).) | Keep |
| **khanacademy.org** Music Basics: Notes and Rhythm | Glossary and lessons on note values, meter, 6/8 vs 4/4 — **not drums**, but directly useful for “Iris” (Wikipedia: verses/chorus in 6/8, intro in 4/4) | **Client Challenge** this pass; URLs exist in search | Khan ToS unverified (same as trust-scheme note) | Keep; **coverage is theory, not kit** |
| PAS / Wikipedia | Wikipedia states the kit legend above is “based on the recommendations of the Percussive Arts Society” | PAS publication articles on rudiments are **member-gated** (“Subscribe to continue reading”) | PAS HTML rudiments page is public; many *articles* are not | `pas.org` ADD for public pages; do not treat the whole site as OER |

### 4.4 Stickings / rudiments

| Host | What they publish | Indexable? | License / ToS | List |
| --- | --- | --- | --- | --- |
| **pas.org/rudiments/** | Public page: 40 International Drum Rudiments = traditional 26 + drum corps / orchestral / European / contemporary; committee chaired by Jay Wanamaker; practice rule **open (slow) to close (fast) to open (slow)** and/or moderate march tempo; **“The PAS International Drum Rudiments are Copyright © 1984 by the Percussive Arts Society. All Rights Reserved.”** Audio recordings © (p) 2005 Alfred Publishing. PDF download link. | Yes | **All rights reserved** on the list/chart. Citing the page and paraphrasing the *practice rule* and *names* is the safe path. **Reproducing the notation chart in a lesson body is a copy of a 1984 PAS work.** Member articles on the same topic are paywalled. ([rudiments](https://pas.org/rudiments/); [PDF](https://pas.org/wp-content/uploads/2024/04/pas-rudiments.pdf).) | **ADD `pas.org`** |
| **pas.org PDF** | Full 40-item list with notation, four families (roll, diddle, flam, drag), asterisks for the original 26 | Yes (`filetype:pdf`) | Same © 1984 PAS, “International Copyright Secured All Rights Reserved” | Cite URL; do not ingest the notation graphics into generated lessons without permission |
| **ae.vicfirth.com** 40 Essential Rudiments | Play-along audio (Bronze–Diamond + open-close-open), application exercises, **lesson videos** by Dr. John Wooton, 4-tier sequence | **Timeout** on the hub URL this pass; child pages (e.g. Single Paradiddle, Drag) returned in search | Zildjian ToS as above; audio is Vic Firth/Alfred-class material | ADD hosts; treat as cite-not-copy |
| **en.wikipedia.org** `Drum rudiment` | History of rudimental systems; PAS definition quoted as “a particular method for learning the drums—beginning with rudiments, and gradually building up speed and complexity”; NARD 26 vs PAS 40 | Yes | CC BY-SA. ([Drum rudiment](https://en.wikipedia.org/wiki/Drum_rudiment).) | Keep |
| **Stick Control** (George Lawrence Stone, 1935) | Canonical snare book; still sold. Publisher: **Stone Percussion Books LLC**, exclusively distributed by Alfred Music. © Stone Percussion Books. Stone died 1967; the *book* is not a free discussion. Wikipedia biographical facts are citable; **exercise pages are not.** ([stonepercussionbooks.com](https://stonepercussionbooks.com/stick-control.html); [Wikipedia: George Lawrence Stone](https://en.wikipedia.org/wiki/George_Lawrence_Stone).) | Publisher site yes | In-copyright method book | Neither Preference nor denylist as a *web host*; **do not generate Stick Control exercises** |

### 4.5 Coordination, rock-beat vocabulary, fills

| Host | What they publish | Indexable? | License / ToS | List |
| --- | --- | --- | --- | --- |
| **en.wikipedia.org** `Drum kit` § Playing | Groove vs fill vs solo; backbeat named as a groove example; fills as section markers ending in a crash on beat one | Yes | CC BY-SA | Keep |
| **en.wikipedia.org** `Backbeat` | Redirects to **Beat (music)**: pulse, meter, downbeat/upbeat, on-beat/off-beat, with notated drum examples | Yes | CC BY-SA; examples are encyclopedia illustrations | Keep |
| **Berklee Online 101 syllabus** | Four-way coordination; R&B, pop-rock, funk, rock, jazz, Brazilian, Afro-Cuban; meters including 4/4 and 6/8 (the meters Wikipedia attributes to “Iris”); homework is **video of the student playing** with a play-along | Catalog yes | Paid course; public learning outcomes are citable | Optional ADD |
| **Drumeo** | Marketing: “Note-for-note breakdowns of more than 1500 popular songs,” 10-level Method, guided play-alongs, 7-day trial then subscription. Free email video funnels exist. **Terms (27 Sep 2023):** personal non-commercial license; no republish, redistribute, or commercial copy; song content licensed from **Hal Leonard** (and YouTube/Vimeo/SoundSlice). Annual+ vs Annual Base explicitly splits “content that Musora has licensed from third-party rights holders.” | Homepage yes; lessons behind membership | **Do not remix.** ([drumeo.com](https://www.drumeo.com/); [Terms](https://www.drumeo.com/terms).) | **Neither** (do not boost; do not denylist the whole domain — marketing pages are real — but generator must not ingest lesson bodies) |
| **Hudson Music** | Digital books/videos; **single-user, non-transferable, no share/publish/distribute** | Yes | Personal license ([terms](https://hudsonmusic.com/terms-conditions/)) | Neither (same as Drumeo) |

### 4.6 Song-specific “Iris” Sources

| Host | What they publish | Indexable? | License / ToS | List |
| --- | --- | --- | --- | --- |
| **en.wikipedia.org** `Iris (song)` | 1998 *City of Angels* / *Dizzy Up the Girl*; writer John Rzeznik; **Mike Malinin – drums**; time signature **alternates 4/4 (intro/interludes) and 6/8 (verses/chorus)** plus a 3/4 bar before verse 2; guitar tuning BDDDDD; no character named Iris; critical/chart facts | Yes | CC BY-SA. This is the load-bearing **word-level** Source for the Learning Goal’s musical facts. **No drum transcription.** ([Iris (song)](https://en.wikipedia.org/wiki/Iris_(song)).) | Keep |
| **musicnotes.com** | **59 arrangements** of “Iris”; listing emphasizes Piano, Voice, Guitar “and 30 others.” Observed SKUs: PVG, Easy Piano, Guitar TAB, Bass TAB, leadsheets, C-instrument. **No drum-set SKU was present in the fetched listing.** Publisher on a guitar-tab SKU: **Hal Leonard**. Composer/lyricist: John Rzeznik. | Yes | Purchase = **personal enjoyment**; “any duplication, adaptation, arranging and/or transmission … requires the written consent of the copyright owner(s) and of Musicnotes, Inc.” (Help article via search; Musicnotes copyright blog.) | **Neither** (licensed retailer, not a Preference encyclopedia) |
| **ultimate-guitar.com** | Licensed tab platform (Sony/ATV, EMI, Alfred, Hal Leonard, HFA, etc.). First-party: tabs that are not licensed may be **blocked**. DMCA policy. | Yes | UG’s license is **to UG’s service**, not a sublicense to generate a course. | Do not boost; do not copy tabs |
| **songsterr.com** | Archive of guitar, bass, **and drum tabs**; claims publisher licenses and royalties; ToS: content is property of Guitar Tabs LLC or used with permission; **“You may not distribute, modify, transmit, reuse, download, repost, copy, or use said Content … for commercial purposes or for personal gain, without express advance permission.”** Explicit **anti-AI-agent** clause and `ai.txt`. | Yes | Commercial reuse of tabs **forbidden** by ToS even if Songsterr itself is licensed. ([Terms](https://www.songsterr.com/terms).) | Do not boost; **exclude if the generator cannot be trusted not to ingest tab bodies** |
| Official Goo Goo Dolls / Warner recording | Composition © Rzeznik; sound recording is a **separate work** (Circular 56A). Not fetched as an official lyrics/audio license page this pass. | Streaming services are not educational Preference hosts | See §6 | Do not boost |

### 4.7 YouTube as a Source

YouTube Terms of Service (dated **15 December 2023**, Google LLC): you may **view or listen for personal, non-commercial use** and **show videos through the embeddable YouTube player**. You may **not** access, reproduce, download, distribute, display, sell, or modify Content except as authorized by the Service or with written permission. **Automated access (robots, scrapers) is forbidden** except public search engines honoring `robots.txt`, or with written permission. You may not use the Service to view/listen other than personal non-commercial use (example: no public screening). ([YouTube ToS](https://www.youtube.com/t/terms).)

You.com Search **can** return YouTube URLs as ordinary web results (it searches the web). That is not a Videos API and not a license. **Cite the watch URL; do not scrape captions or video files.** Embedding via the official player is the only ToS-described display path — and even then, YouTube’s “personal, non-commercial” viewing language is a yellow flag for a commercial product. **Do not add `youtube.com` to `boost_domains`.** Treat off-app “watch this Vic Firth / Drumeo YouTube” links as a *different prototype* than in-lesson demonstrative media.

### 4.8 Hosts inspected and how to classify them

**Preference ADD:** `pas.org`, `vicfirth.com`, `ae.vicfirth.com`, `commons.wikimedia.org`. Optional: `online.berklee.edu`.

**Preference KEEP (low yield for this subject):** `openstax.org`, `khanacademy.org`, `ocw.mit.edu`, `britannica.com`, `en.wikipedia.org`.

**Neither (citable catalog/marketing, not remixable corpus):** `drumeo.com`, `hudsonmusic.com`, `musicnotes.com`, Berklee paid LMS, Alfred/Hal Leonard product pages.

**Do not boost; consider exclude if ingestion is sloppy:** `songsterr.com`, `ultimate-guitar.com` (licensed *for them*, ToS blocks *your* commercial copy), unlicensed tab clones.

**YouTube:** cite-only / official-player-only; never boost; never scrape.

---

## 5. Demonstrative-media vs text

Grounding is first-party education pages and what they chose to publish, not pedagogy blogs.

### 5.1 What the education hosts themselves imply

- **PAS** publishes a **notation PDF** plus a one-sentence practice method (open–close–open). It does **not** publish a free grip animation on the public rudiments page. Audio on that page is credited to **Alfred (2005)**, i.e. not free. Member articles are gated. The standards body treats rudiments as a **notated, copyrighted list** plus a practice *rule*, not as an OER video course.
- **Vic Firth** titles Percussion 101 **“A Video Guide.”** Beginner kit lessons on grip are **video** (Stanton Moore). The 40 Essential Rudiments product is **video + play-along audio**. The one substantial still-diagram artifact fetched is a **PDF** of fulcrum/balance-point/rebound. The manufacturer that underwrites free education still chose **moving pictures and sound** for grip and rudiments.
- **Berklee Online 101** (Yoron Israel, public syllabus) teaches grip, sound, and coordination in a 12-week **performance** course whose assignments are **etudes and play-alongs recorded on video**. The school does not claim these skills are acquired by reading. Quizzes in *this* platform are theory-only (locked) — that matches Berklee’s *reading* outcomes (note values, chart interpretation) and **does not** match Berklee’s *performance* outcomes.
- **Wikipedia** can carry a kit **diagram**, grip **photographs**, and **notated** backbeat examples. It does not replace a slow-motion rebound stroke.

### 5.2 Concrete map for the Test course

**Teach from text + still diagrams (with citations):**

- Names and roles of bass drum, snare, toms, hi-hat, ride, crash (Wikipedia Drum kit + Commons SVG, CC BY-SA).
- Stick parts and 5A vs 7A labeling (Wikipedia Drum stick).
- Percussion clef, legend, note values, simple vs compound meter, 4/4 vs 6/8 (Wikipedia Percussion notation; Khan notes-and-rhythm *if* the generator can fetch it; “Iris” meters from Wikipedia Iris).
- Rudiment *taxonomy* (roll / diddle / flam / drag families; the 40 names) — paraphrase PAS, **footnote the PAS page/PDF**, do not paste the PAS engraving.
- Definitions: groove vs fill vs solo; backbeat as snare on 2 and 4 in common-time rock (Wikipedia Drum kit; Beat).
- Practice *prescriptions in words*: PAS open–close–open; metronome + pad (Wikipedia Drum rudiment lead); Berklee’s public equipment list (kit or pad, sticks, metronome).

**Put demonstrative media inside the reading lesson (not a new AV teaching method):**

- **Grip / fulcrum / rebound stroke.** Stills from Wikipedia or a licensed diagram are better than nothing; Vic Firth’s own curriculum is video. A short loop (or a sequence of stills) of matched-grip rebound is the minimum honest substitute. Do **not** scrape Vic Firth or YouTube for that loop; license, commission, or use a freely licensed clip if one exists (none was verified on Commons in this pass beyond still kit diagrams).
- **Coordination pattern** (hi-hat eighths + snare 2/4 + kick 1/3): a notation image **plus** a short audio example of that pattern (original recording the product owns, or a CC-licensed click-track demonstration). Text alone cannot convey “this is what locked-in eighths sound like.”
- **Rudiment sound** (what a flam or paradiddle *sounds* like at slow vs fast): PAS/Alfred audio is copyrighted; Vic Firth play-alongs are ToS-restricted. The course needs **original** pad/kit audio or a licensed clip, or it cites an external player and accepts the off-app design.
- **6/8 ballad feel vs 4/4 interlude** (the “Iris” transferable skill): a click in 6/8 vs 4/4 inside the lesson is demonstrative audio, not a Goo Goo Dolls recording.

**Cannot be taught under reading + theory-quiz + embedded media:**

- **Playing “Iris” end-to-end.** Berklee’s own 101 course requires the student to *record themselves playing*. This platform’s quizzes never assess playing (locked). The Learning Goal is therefore a **practice prescription + self-check**, not something the generator can certify. Embedded media can *model* a generic 6/8 ballad beat; it cannot lawfully *be* Mike Malinin’s part, and it cannot close the motor-learning loop.
- **Stick Control / PAS chart fluency as muscle memory.** Those are books and copyrighted engravings plus hours of pad time.
- **Four-way independence at performance tempo.** Wikipedia can define it; Vic Firth/Berklee/Drumeo teach it with play-alongs and video feedback.

**Design fork (state it plainly):** a prototype that **footnotes YouTube** and tells the learner to leave the app is cheaper and ToS-cleaner than **hosting** video. It is also not “demonstrative media inside the reading lesson.” The content-block ticket should pick one. You.com cannot supply the bytes either way.

---

## 6. Copyright and “Iris”

Three legally distinct acts, as requested:

### (a) Teaching rock-beat skills that transfer to the song — allowed with citations

Wikipedia’s composition section is enough to justify modules on: compound vs simple meter, a crash as a section marker, dynamic contrast in a power ballad, and a generic 6/8 ride/hi-hat pattern with snare on the dotted-quarter backbeat. Those are **techniques**, not the Rzeznik composition. Cite Wikipedia (stable `oldid`) and PAS/Vic Firth for rudiments that appear in fills. Do not call the generic 6/8 beat “the Iris drum part.”

### (b) Describing the song’s drum arrangement in words, citing interviews/reviews — allowed if the words are facts, not a substitute chart

Safe, sourced facts from Wikipedia Iris: Malinin played drums; the song is a power ballad; meters alternate 4/4 and 6/8 (and one 3/4 bar). That is encyclopedia paraphrase with footnotes. Going further into “the tom fill before the chorus is …” without a licensed chart is either original transcription (a **derivative work** — Copyright Office FAQ: only the owner may authorize a new version) or copying someone else’s tab.

U.S. Copyright Office: a **musical composition** (music and lyrics — here, Rzeznik) and a **sound recording** (the 1998 Goo Goo Dolls / Warner phonorecord) are **two works**. Copyright in one is not a substitute for the other. Circular 56A’s “Respect” example is the same structure: song vs Aretha’s recording. ([Circular 56A](https://copyright.gov/circs/circ56a.pdf); [PA vs SR](https://www.copyright.gov/register/pa-sr.html).)

Fair use (17 U.S.C. § 107; Copyright Office Fair Use Index, updated July 2026): four factors; teaching is an *example* purpose, not a free pass; **songs are creative works** (factor 2 leans against); there is **no legal number of notes**; “in cases of doubt, the Copyright Office recommends that permission be obtained.” Circular 21 (educators) **prohibits** copying music to substitute for purchase and copying to create anthologies. A generated lesson that *is* the drum chart is the thing Circular 21 forbids. Face-to-face classroom performance (§ 110(1)) is a **nonprofit educational institution** exemption — it does not describe this product. ([Fair Use Index](https://copyright.gov/fair-use/index.html); [Fair Use FAQ](https://www.copyright.gov/help/faq/faq-fairuse.html); [Circular 21](https://copyright.gov/circs/circ21.pdf).)

### (c) Reproducing copyrighted notation or audio — not allowed under the locked scheme

| Artifact | Owner signal (first party) | Generator may |
| --- | --- | --- |
| PAS 40 rudiments **notation PDF** | © 1984 PAS, all rights reserved | Cite; paraphrase names/practice rule; **not** reproduce the engraving |
| Alfred 2005 rudiment **audio** | © (p) Alfred, stated on PAS page | Not copy |
| Vic Firth videos/audio | Zildjian ToS: no extract/scrape/derivative | Cite URL |
| Stick Control exercises | Stone Percussion Books LLC / Alfred | Discuss the book’s existence via Wikipedia; **not** generate the pages |
| “Iris” **composition** (melody, lyrics, drum arrangement as part of the work) | Rzeznik; licensed sheet via Hal Leonard / Musicnotes | Point the learner to a **purchase**; do not generate a drum transcription |
| “Iris” **sound recording** | Separate © in the phonorecord | Do not embed or extract official audio |
| Musicnotes / UG / Songsterr **tabs** | Personal or service-specific licenses; Songsterr forbids commercial reuse | Do not ingest into lesson bodies |
| Wikipedia **text** about Iris | CC BY-SA | Cite/paraphrase; reproducing long prose is share-alike |
| Wikipedia **non-free audio** clips | WP:NFCC — Wikipedia’s own fair-use clips are **not** a license for a third-party course | Do not harvest Wikipedia’s non-free media into lessons |

Musicnotes’ fetched catalog did not show a drum-set arrangement of “Iris”; even if one exists among “30 other” instruments, the cover-page notice (Help article) forbids duplication, adaptation, arranging, and transmission without written consent. Ultimate Guitar’s licensing page is explicit: tab sites that skip licenses get sued and shut down. Songsterr’s ToS is explicit about commercial copy. **There is no legal path in this research to generate or embed an “Iris” drum transcription.**

---

## 7. Risks / gaps for later tickets

**You.com / plugin**

- Search is web+news. **Media content blocks cannot be filled from Search JSON.** Spec Contents `html` (to find `<img>` on a cited Commons or Wikipedia page) or a **separate** media pipeline. Do not spec `/v1/images` (partner-only, unmaintained). There is **no** `/v1/videos`.
- `thumbnail_url` is not a kit diagram. Using it as lesson media would show random OpenGraph pictures (often logos).
- Highlights omit figures. Full-page markdown may drop images; HTML is the documented “preserve layout” format — still not a license to reuse those bytes.
- `boost_domains` for `pas.org` / `vicfirth.com` will surface copyrighted charts and videos. The generator must **cite** them and **not** paste notation graphics or video transcripts into the lesson body (same NC/SA discipline as OpenStax in the trust-scheme note).

**Copyright / ToS**

- PAS © 1984 on the rudiment list is easy to violate by “helpfully” rendering the 40 patterns in generated SVG.
- Vic Firth ToS scrape/extract/derivative-work ban is incompatible with harvesting their education library.
- Drumeo / Hudson / Musicnotes / Songsterr personal or no-commercial-reuse licenses — boosting them without an ingestion gate will launder licensed content into the course.
- YouTube: official embed ≠ license to cache; scraping is banned; “personal, non-commercial” viewing is a counsel question for a commercial app.
- Wikipedia CC BY-SA: long quotes or close paraphrase of article structure without share-alike labeling is a license event (already flagged in the trust-scheme note).
- Fair use will not save a full-song drum chart. Counsel, not the generator, would have to bless even a short notated excerpt of “Iris.”

**Coverage holes**

- OpenStax, Khan, MIT OCW — the current Preference core — **do not teach drum kit**. Without adding PAS / Vic Firth / Wikipedia (already present) / Commons, `boost_domains` will under-rank the only strong public hosts.
- Britannica drum-set article **not retrieved** (Cloudflare). Khan music **not retrieved** (client challenge). Vic Firth 40-rudiment hub **timed out**. Do not assume those pages are empty; assume the crawler may also fail (Contents `crawl_timeout` 10s default; JS-heavy pages).
- Berklee 101 is the closest university *syllabus* to the Test course; the **lessons are paid**. Use the public outcomes as a scope check, not as a corpus.
- No first-party official Goo Goo Dolls / Warner license page was fetched for embedding audio. Treat official audio as unavailable.

**Pedagogy / product honesty**

- The Terminal Learning Goal “play Iris end-to-end” cannot be **assessed** (quizzes are theory-only) and cannot be **notated** (copyright). The honest product is: theory + transferable grooves in 4/4 and 6/8 + a practice plan + “buy licensed sheet if you want the real chart” + optional cite of the Wikipedia facts. Calling generated ASCII tab “Iris” would be both a rights problem and a false Learning Goal.
- Motor learning: PAS, Vic Firth, and Berklee all route technique through **repetition with sound**. Embedded media can demonstrate; it cannot substitute pad time. Do not promise otherwise in lesson copy.

**Denylist maintenance**

- Prefer excluding tab clones that do **not** claim publisher licenses. UG and Songsterr claim licenses **for their own service** — exclude them from *generation ingestion*, not necessarily from `exclude_domains`, unless the pipeline cannot separate “URL in a source list” from “paste the tab.”

---

## 8. Sources

Every URL fetched or used as a primary authority in this note.

### You.com (first-party)

- Web Search API overview (fields, extraction, operators, boost, pricing): https://you.com/docs/guides/search
- Search API reference: https://you.com/docs/api-reference/search/v1-search
- Search API markdown schema (`thumbnail_url`, `page_age`, `snippets`, `highlights`, `contents.metadata`): https://you.com/docs/api-reference/search/v1-search.md
- TypeScript SDK: https://you.com/docs/sdks/typescript-sdk
- Retrieve page content (highlights vs full_page, HTML vs markdown): https://you.com/docs/guides/retrieve-page-content
- Search operators (`site:`, `filetype:`): https://you.com/docs/guides/search-operators
- Contents API overview (pricing $1/1k, formats, metadata): https://you.com/docs/guides/contents
- Contents API reference: https://you.com/docs/api-reference/contents
- Contents API markdown schema: https://you.com/docs/api-reference/contents.md
- Images API (beta, unmaintained, partner-only): https://you.com/docs/api-reference/images/images
- Docs index (Search, Contents, Answer, Research, Finance, Images — **no Videos**): https://you.com/docs/llms.txt
- API reference index: https://you.com/docs/api-reference/llms.txt
- Live news (news mixed into Search): https://you.com/docs/guides/live-news

### Percussive Arts Society / Vic Firth / Berklee

- PAS International Drum Rudiments (HTML, © 1984, Alfred audio credit): https://pas.org/rudiments/
- PAS rudiments PDF: https://pas.org/wp-content/uploads/2024/04/pas-rudiments.pdf
- PAS member-gated rudiment articles (paywall confirmed): https://pas.org/publication-articles/percussive-arts-society-international-drum-rudiments/ and https://pas.org/publication-articles/pas-international-drum-rudiments/
- Vic Firth education hub: https://vicfirth.com/pages/education
- Vic Firth Percussion 101 (video guide): https://ae.vicfirth.com/education/percussion-101/
- Vic Firth concert snare (grip/stroke videos) via search: https://ae.vicfirth.com/education/percussion-101/percussion-101-concert-snare-drum/
- Vic Firth 40 Essential Rudiments hub (timeout on fetch; listed from search): https://ae.vicfirth.com/education/40-essential-rudiments/
- Vic Firth Hybrid Rudiments: https://ae.vicfirth.com/education/hybrid-rudiments/
- Vic Firth Terms of Use (3 Nov 2025): https://vicfirth.com/pages/terms-of-use-updated
- Vic Firth drumset introduction PDF (grip stills): https://ae.vicfirth.com/wp-content/uploads/FA-Drumset-Introduction.pdf
- Berklee Online Drum Set Performance 101: https://online.berklee.edu/courses/drum-set-performance-101

### Encyclopedias / OER / university

- Wikipedia Drum kit: https://en.wikipedia.org/wiki/Drum_kit
- Wikipedia Drum rudiment: https://en.wikipedia.org/wiki/Drum_rudiment
- Wikipedia Drum stick: https://en.wikipedia.org/wiki/Drum_stick
- Wikipedia Matched grip / Grip (percussion): https://en.wikipedia.org/wiki/Matched_grip
- Wikipedia Percussion notation: https://en.wikipedia.org/wiki/Percussion_notation
- Wikipedia Drum tablature: https://en.wikipedia.org/wiki/Drum_tablature
- Wikipedia Iris (song): https://en.wikipedia.org/wiki/Iris_(song) and https://en.wikipedia.org/wiki/Iris_(Goo_Goo_Dolls_song)
- Wikipedia Beat (music) (redirect from Backbeat): https://en.wikipedia.org/wiki/Backbeat
- Wikipedia:Copyrights: https://en.wikipedia.org/wiki/Wikipedia:Copyrights
- Wikipedia:Reusing Wikipedia content: https://en.wikipedia.org/wiki/WP:Reusing_Wikipedia_content
- Wikipedia:Non-free content: https://en.wikipedia.org/wiki/Wikipedia:Non-free_content
- Wikimedia Commons kit diagram (CC BY-SA 3.0 / GFDL): https://commons.wikimedia.org/wiki/File:Drum_kit_illustration_edit.svg
- Wikimedia Commons `File:Drum_set.png` (listing): https://commons.wikimedia.org/wiki/File:Drum_set.png
- OpenStax University Physics 17.5 (musical sound / drumheads): https://openstax.org/books/university-physics-volume-1/pages/17-5-sources-of-musical-sound
- OpenStax College Physics hearing intro: https://openstax.org/books/college-physics/pages/17-introduction-to-the-physics-of-hearing
- OpenStax Introduction to Anthropology 16.2: https://openstax.org/books/introduction-anthropology/pages/16-2-anthropology-of-music
- OpenStax About: https://openstax.org/about/
- MIT OCW Music of Africa: https://ocw.mit.edu/courses/21m-293-music-of-africa-fall-2005/
- MIT OCW Music of India: https://ocw.mit.edu/courses/21m-291-music-of-india-spring-2007/
- Khan Academy glossary of musical terms (URL; client-challenge): https://www.khanacademy.org/humanities/music/music-basics2/notes-rhythm/a/glossary-of-musical-terms
- Khan Academy music hub (URL; client-challenge): https://www.khanacademy.org/humanities/music

### Commercial education / sheet music / tabs

- Drumeo home: https://www.drumeo.com/
- Drumeo Terms of Use: https://www.drumeo.com/terms
- Hudson Music terms: https://hudsonmusic.com/terms-conditions/
- Musicnotes “Iris” catalog: https://www.musicnotes.com/sheetmusic/iris/38091
- Musicnotes Song Permissions FAQs (search; fetch timed out): https://help.musicnotes.com/hc/en-us/articles/360054660151-Song-Permissions-FAQs
- Ultimate Guitar why songs are licensed: https://www.ultimate-guitar.com/article/blog/licensing
- Ultimate Guitar DMCA: https://www.ultimate-guitar.com/about/dmca.htm
- Songsterr Terms of Service: https://www.songsterr.com/terms
- Songsterr help (licensed tabs claim): https://www.songsterr.com/help
- Stone Percussion Books Stick Control: https://stonepercussionbooks.com/stick-control.html
- Wikipedia George Lawrence Stone: https://en.wikipedia.org/wiki/George_Lawrence_Stone
- YouTube Terms of Service: https://www.youtube.com/t/terms

### U.S. Copyright Office

- Fair Use Index (four factors; songs as creative works; no percentage rule): https://copyright.gov/fair-use/index.html
- Fair Use FAQ (no set number of notes; permission when in doubt; § 110(1) classroom): https://www.copyright.gov/help/faq/faq-fairuse.html
- Circular 21 (educators; no copying to replace purchased music): https://copyright.gov/circs/circ21.pdf
- Circular 56A (composition vs sound recording): https://copyright.gov/circs/circ56a.pdf
- Musical compositions vs sound recordings (registration): https://www.copyright.gov/register/pa-sr.html
- MMA explainer PDF: https://copyright.gov/music-modernization/sound-recordings-vs-musical-works.pdf

### Unreached / uncertain

- **Britannica** `https://www.britannica.com/art/drum-set`: Cloudflare bot challenge (“Verification successful. Waiting…”). Britannica stays on the general Preference list; **drum-set article body not verified** this pass.
- **Khan Academy** music pages: “Client Challenge” (same failure mode as the 2026-08-14 trust-scheme note for Khan ToS). Glossary URL exists; **drum-kit coverage is believed none** from search snippets (notes-and-rhythm theory only); body not read.
- **Vic Firth 40 Essential Rudiments hub** `https://ae.vicfirth.com/education/40-essential-rudiments/`: **fetch timed out**. Child pages and the education index confirm the series exists (videos + play-along audio). Treat media types as confirmed via search snippets + sibling pages, not via a full hub extract.
- **PAS old path** `https://www.pas.org/resources/education/drum-rudiments-2`: **404**. Canonical public page is `https://pas.org/rudiments/`.
- **OpenStax subjects catalog** `https://openstax.org/subjects`: JavaScript required; no textbook list rendered. Individual book chapters on sound/anthropology were fetched instead. **No OpenStax percussion method book found.**
- **Musicnotes Song Permissions FAQ**: fetch **timed out**; cover-page personal-use notice taken from first-party search snippet of that Help article plus the live Iris catalog page.
- **Official Goo Goo Dolls / Warner / WMG license or audio pages:** not fetched. Composition/recording split is from Copyright Office circulars + Wikipedia personnel/credits, not from a label license page.
- **You.com returning YouTube in live queries:** inferred from Search being a web index, not demonstrated with a live `POST /v1/search` (no API key in this pass).
- **Whether Musicnotes sells any drum-set SKU of “Iris”:** fetched catalog did not list one among visible arrangements; the page claims “30 other” instruments — **uncertain**, irrelevant to reuse rights even if a SKU exists.
- **Drummerworld** Terms of Use: privacy page fetched via search; full ToS not separately retrieved. Not recommended for Preference.
- **Wikipedia:Backbeat** redirects to Beat (music); backbeat-as-snare-on-2-and-4 is discussed in Drum kit § Grooves, not as a standalone article body in the redirect target’s opening sections.

---

*End of research note.*
