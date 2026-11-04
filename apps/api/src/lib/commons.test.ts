import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  commonsAuthor, commonsCategoryUrl, commonsLicence, commonsQueries, commonsSearchUrl, lookupCommonsPages, parseCommonsSearch, stripHtml, type CommonsExtmetadata,
} from "./commons.ts";

/** Live Commons replies for a matched-grip search, recorded 2026-11-04 (SEN-132). */
const DRUMS = JSON.parse(readFileSync(new URL("./fixtures/media-search-drum-grip.json", import.meta.url), "utf8")) as {
  commons: Record<string, unknown>; pages: { ids: number[]; reply: unknown };
};

/** Live Commons replies for the French grip brief, recorded 2026-11-03. */
const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/commons-french-grip.json", import.meta.url), "utf8")) as { replies: Record<string, unknown> };

/**
 * `extmetadata` with the licence fields a File page carries.
 * @param short - `LicenseShortName`
 * @param code - `License`, the template code
 * @param url - `LicenseUrl`
 * @param terms - `UsageTerms`
 */
function meta(short: string | null, code: string | null = null, url: string | null = null, terms: string | null = null): CommonsExtmetadata {
  const value = (v: string | null) => (v === null ? undefined : { value: v });
  return { LicenseShortName: value(short), License: value(code), LicenseUrl: value(url), UsageTerms: value(terms) };
}

/*
 * The licence line is legal, not style, so these are the strings Commons actually returns. Rows marked "sampled" were
 * read off live File pages on 2026-11-03 (the page is named); the rest are the template codes Commons documents for
 * licences it does not host or that we turn down.
 */
test("Commons licences the product may host map to MEDIA_LICENSES with their deed URL", () => {
  const kept: [string, CommonsExtmetadata, string, string | null][] = [
    // sampled: File:Drumstick regular grip.jpg
    ["CC BY 2.5", meta("CC BY 2.5", "cc-by-2.5", "https://creativecommons.org/licenses/by/2.5", "Creative Commons Attribution 2.5"), "cc_by", "https://creativecommons.org/licenses/by/2.5"],
    // sampled: File:Jon Farriss of INXS drum kit, 2011-02-20 02.jpg
    ["CC BY 2.0", meta("CC BY 2.0", "cc-by-2.0", "https://creativecommons.org/licenses/by/2.0", "Creative Commons Attribution 2.0"), "cc_by", "https://creativecommons.org/licenses/by/2.0"],
    // sampled: File:Rogers Drum set-up.jpg
    ["CC BY-SA 4.0", meta("CC BY-SA 4.0", "cc-by-sa-4.0", "https://creativecommons.org/licenses/by-sa/4.0", "Creative Commons Attribution-Share Alike 4.0"), "cc_by_sa", "https://creativecommons.org/licenses/by-sa/4.0"],
    // sampled: File:DesenhodabandaYggDrasil.jpg (http and a trailing slash)
    ["CC BY-SA 3.0 (http)", meta("CC BY-SA 3.0", "cc-by-sa-3.0", "http://creativecommons.org/licenses/by-sa/3.0/", "Creative Commons Attribution-Share Alike 3.0"), "cc_by_sa", "http://creativecommons.org/licenses/by-sa/3.0/"],
    // sampled: File:Stacks of lobster traps in Norra Grundsund 7.jpg
    ["CC0", meta("CC0", "cc0", "http://creativecommons.org/publicdomain/zero/1.0/deed.en", "Creative Commons Zero, Public Domain Dedication"), "cc0", "http://creativecommons.org/publicdomain/zero/1.0/deed.en"],
    // sampled: File:Traditional Grip.jpg
    ["Public domain", meta("Public domain", "pd", null, "Public domain"), "public_domain", null],
    ["PD-US", meta("PD-US"), "public_domain", null],
    ["PD-USGov code", meta("Public domain", "pd-usgov"), "public_domain", null],
    ["ported CC BY-SA, no URL", meta("CC BY-SA 3.0 de", "cc-by-sa-3.0-de"), "cc_by_sa", "https://creativecommons.org/licenses/by-sa/3.0/de/"],
    ["CC0 with no URL", meta("CC0", "cc0"), "cc0", "https://creativecommons.org/publicdomain/zero/1.0/"],
  ];
  for (const [name, fields, license, licenseUrl] of kept) {
    assert.deepEqual(commonsLicence(fields), { ok: true, license, licenseUrl }, name);
  }
});

test("Non-commercial, no-derivatives, GFDL-only, fair use, other free licences, unknown and missing are never kept", () => {
  const turnedDown: [string, CommonsExtmetadata][] = [
    ["CC BY-NC-SA 2.0", meta("CC BY-NC-SA 2.0", "cc-by-nc-sa-2.0", "https://creativecommons.org/licenses/by-nc-sa/2.0")],
    ["CC BY-NC 4.0, short name only", meta("CC BY-NC 4.0")],
    ["NC only in the URL", meta("CC BY 2.0", "cc-by-2.0", "https://creativecommons.org/licenses/by-nc/2.0/")],
    ["NC only in the usage terms", meta("CC BY 2.0", "cc-by-2.0", null, "Creative Commons Attribution-NonCommercial 2.0")],
    ["CC BY-ND 3.0", meta("CC BY-ND 3.0", "cc-by-nd-3.0", "https://creativecommons.org/licenses/by-nd/3.0")],
    ["CC BY-NC-ND 4.0", meta("CC BY-NC-ND 4.0", "cc-by-nc-nd-4.0")],
    // sampled: File:Microscope Altami PS II.jpg
    ["GFDL", meta("GFDL", null, "http://www.gnu.org/copyleft/fdl.html", "GNU Free Documentation License")],
    // sampled: File:Alpamayo.jpg
    ["Copyrighted free use", meta("Copyrighted free use", null, null, "Copyrighted free use")],
    ["Attribution", meta("Attribution", "attribution")],
    // sampled: File:Piper and Drummer of the 92nd Gordon Highlanders, Edinburgh Castle 2.jpg
    ["Flickr No restrictions", meta("No restrictions", null, "https://www.flickr.com/commons/usage/", "No known copyright restrictions")],
    ["Fair use", meta("Fair use", "fair use")],
    ["Non-free", meta("Non-free logo", "non-free logo")],
    ["CC BY-SA with no version", meta("CC BY-SA")],
    ["code and short name disagree", meta("CC BY 3.0", "cc-by-sa-3.0")],
    ["deed URL for another licence", meta("CC BY 4.0", "cc-by-4.0", "https://creativecommons.org/licenses/by-sa/4.0")],
    ["deed URL off Creative Commons", meta("CC BY 4.0", "cc-by-4.0", "https://example.com/licenses/by/4.0")],
    ["empty fields", meta("", "")],
    ["missing", {}],
  ];
  for (const [name, fields] of turnedDown) {
    const verdict = commonsLicence(fields);
    assert.equal(verdict.ok, false, name);
    if (!verdict.ok) assert.ok(verdict.reason.length > 0, name);
  }
});

test("A file with trademark, personality-rights or insignia restrictions is turned down", () => {
  const verdict = commonsLicence({ ...meta("CC BY-SA 4.0", "cc-by-sa-4.0"), Restrictions: { value: "personality" } });
  assert.equal(verdict.ok, false);
});

test("The author line is the Artist without HTML, hidden text, or entities, else the Credit", () => {
  // sampled: File:Matched Grip.jpg
  assert.equal(stripHtml('<span lang="en">Anonymous</span><span style="display:none">Unknown author</span>'), "Anonymous");
  // sampled: File:Traditional Grip Example.jpg
  assert.equal(stripHtml('<a href="//commons.wikimedia.org/w/index.php?title=User:JazHol&amp;action=edit&amp;redlink=1" title="User:JazHol">JazHol</a>'), "JazHol");
  assert.equal(stripHtml("Dr.&nbsp;Jane &#8220;J&#x2019;&#8221; Doe<br/>CDC"), "Dr. Jane “J’” Doe CDC");
  assert.equal(commonsAuthor({ Credit: { value: 'photo taken by <a href="//commons.wikimedia.org/wiki/User:Uryah">Uryah</a>' } }, "cc_by"), "photo taken by Uryah");
  assert.equal(commonsAuthor({}, "public_domain"), "Unknown author");
  assert.equal(commonsAuthor({ Artist: { value: "<span></span>" } }, "cc_by_sa"), null, "CC BY-SA needs a named author.");
});

test("Searches lead with the first tag and the subject's object words, then every tag, then the subject, each limited to still images", () => {
  assert.deepEqual(commonsQueries({ kind: "technique", subject: "French grip on a drumstick: the right hand with the thumb on top", topicTags: ["french-grip", "right-hand"] }), [
    "french grip drumstick thumb filetype:bitmap",
    "french grip right hand filetype:bitmap",
    "french grip drumstick right filetype:bitmap",
  ]);
  assert.deepEqual(commonsQueries({ kind: "depiction", subject: "Yggdrasil", topicTags: ["yggdrasil"] }), ["yggdrasil filetype:bitmap|drawing"]);
});

test("Words about the picture itself never reach a query: the 2026-11-03 drum grip and Norse briefs", () => {
  // The live run searched "matched grip fulcrum" and got a copper-alloy lid and a mount; "fulcrum" now comes second, behind the drumstick.
  assert.deepEqual(commonsQueries({ kind: "technique", subject: "A close-up photograph shows a hand holding a drumstick in matched grip.", topicTags: ["matched-grip", "fulcrum"] }), [
    "matched grip hand drumstick filetype:bitmap",
    "matched grip fulcrum filetype:bitmap",
  ], "The subject's own words repeat the lead query's, so they are dropped.");
  assert.deepEqual(commonsQueries({
    kind: "depiction",
    subject: "The Course’s own illustration shows the world ash Yggdrasil surrounded by nine symbolic worlds, with three roots and creatures above and below.",
    topicTags: ["yggdrasil", "world-tree", "cosmology"],
  }), [
    "yggdrasil ash symbolic worlds filetype:bitmap|drawing",
    "yggdrasil world tree cosmology filetype:bitmap|drawing",
    "world ash yggdrasil symbolic filetype:bitmap|drawing",
  ]);
  for (const query of [...commonsQueries({ kind: "technique", subject: "A close-up photograph shows a hand holding a drumstick in matched grip.", topicTags: ["matched-grip"] }), ...commonsQueries({ kind: "diagram", subject: "The Course's own schematic shows four moments of a full stroke above a drum.", topicTags: ["full-stroke"] })]) {
    assert.doesNotMatch(query, /\b(photograph|shows|close|up|course|courses|own|schematic|holding|above|four)\b/, query);
  }
  // The 2026-11-04 rerun searched "matched grip drumstick slightly": an adverb about the view is not about the object.
  assert.deepEqual(
    commonsQueries({ kind: "technique", subject: "A right hand holding a drumstick in matched grip, viewed from above and slightly to the side.", topicTags: ["matched-grip"] })[0],
    "matched grip right hand filetype:bitmap",
  );
});

test("A recorded search keeps hostable stills in relevance order and says why it turned the rest down", () => {
  const query = "french grip right hand filetype:bitmap";
  const result = parseCommonsSearch(query, FIXTURE.replies[query]);
  assert.deepEqual(result.candidates.map(({ rank, title }) => [rank, title]).slice(0, 2), [
    [1, "File:French grip right hand 01.jpg"],
    [2, "File:Pistol, percussion (AM 1962.54-15).jpg"],
  ]);
  const french = result.candidates[0]!;
  assert.equal(french.descriptionUrl, "https://commons.wikimedia.org/wiki/File:French_grip_right_hand_01.jpg");
  assert.deepEqual(french.licence, { license: "cc_by", licenseUrl: "https://creativecommons.org/licenses/by/2.5" });
  assert.equal(french.author, "Uryah");
  assert.ok(french.thumbUrl.startsWith("https://upload.wikimedia.org/"));

  const scans = parseCommonsSearch("q", { query: { pages: [
    { pageid: 1, index: 1, title: "File:Book.pdf", imageinfo: [{ mime: "application/pdf", width: 1000, height: 1400, thumburl: "https://u/x.jpg", descriptionurl: "https://c/File:Book.pdf", extmetadata: meta("Public domain", "pd") }] },
    { pageid: 2, index: 2, title: "File:Icon.png", imageinfo: [{ mime: "image/png", width: 16, height: 16, thumburl: "https://u/i.png", descriptionurl: "https://c/File:Icon.png", extmetadata: meta("CC0", "cc0") }] },
    { pageid: 3, index: 3, title: "File:NC.jpg", imageinfo: [{ mime: "image/jpeg", width: 800, height: 600, thumburl: "https://u/n.jpg", descriptionurl: "https://c/File:NC.jpg", extmetadata: meta("CC BY-NC 2.0", "cc-by-nc-2.0") }] },
  ] } });
  assert.equal(scans.candidates.length, 0);
  assert.deepEqual(scans.rejected.map(({ title }) => title), ["File:Book.pdf", "File:Icon.png", "File:NC.jpg"]);
});

test("A candidate carries its description and the categories a person can see, for the librarian to read", () => {
  const search = new URL(commonsSearchUrl("drumstick grip filetype:bitmap")).searchParams;
  assert.equal(search.get("prop"), "imageinfo|categories");
  assert.equal(search.get("clshow"), "!hidden", "Hidden maintenance categories are never offered for browsing.");
  assert.match(search.get("iiextmetadatafilter")!, /ImageDescription/);
  const category = new URL(commonsCategoryUrl("Category:Matched grip")).searchParams;
  assert.deepEqual([category.get("generator"), category.get("gcmtitle"), category.get("gcmtype")], ["categorymembers", "Category:Matched grip", "file"]);

  const { candidates } = parseCommonsSearch("q", DRUMS.commons["matched grip drumstick filetype:bitmap"]);
  const matched = candidates.find(({ title }) => title === "File:Matched Grip.jpg")!;
  assert.deepEqual(matched.categories, ["Category:Drumsticks", "Category:Matched grip"]);
  assert.equal(typeof matched.description, "string");
  assert.doesNotMatch(matched.description, /<[a-z]/i, "The description is plain text.");
});

test("A page lookup reads each file's licence off its own page and keeps the order the ids were asked in", async () => {
  const asked = [124405087, 513833];
  const urls: string[] = [];
  const fetch: typeof globalThis.fetch = async (input) => {
    urls.push(String(input));
    return new Response(JSON.stringify(DRUMS.pages.reply), { status: 200 });
  };
  const result = await lookupCommonsPages({ fetch, userAgent: "Knibbler/1.0 (test)" }, [...asked, 513833]);
  assert.equal(new URL(urls[0]!).searchParams.get("pageids"), "124405087|513833", "Each id is asked for once.");
  assert.deepEqual(result.candidates.map(({ pageId, rank }) => [pageId, rank]), [[124405087, 1], [513833, 2]], "A page the lookup did not ask for is never kept.");
  assert.equal(result.candidates[1]!.licence.license, "cc_by");
  assert.deepEqual(await lookupCommonsPages({ fetch, userAgent: "x" }, []), { query: "pageids:", candidates: [], rejected: [], error: null });
  assert.equal(urls.length, 1, "No ids, no call.");
});
