import { test } from "node:test";
import assert from "node:assert/strict";
import { createGlossaryMatcher, markProse, proseParts } from "./glossary-marks.ts";
import { mentionsTerm } from "@senoy/db/reading-lesson";

const g = [
  { term: "cell", definition: "d1" },
  { term: "Cell wall", definition: "d2" },
  { term: "agar", definition: "d3" },
  { term: "E. coli", definition: "d4" },
];
const m = createGlossaryMatcher(g)!;
const marked = (segs: { text: string; entry?: unknown }[]) => segs.filter((s) => s.entry).map((s) => s.text);

test("no glossary gives no matcher", () => {
  assert.equal(createGlossaryMatcher(undefined), null);
  assert.equal(createGlossaryMatcher([]), null);
});
test("first occurrence per section, prose case kept", () => {
  const seen = new Set<string>();
  assert.deepEqual(marked(m.mark("Agar is jelly. agar again.", seen)), ["Agar"]);
  assert.deepEqual(marked(m.mark("More agar.", seen)), []);
  assert.deepEqual(marked(m.mark("More agar.", new Set())), ["agar"]);
});
test("whole word only", () => {
  assert.deepEqual(marked(m.mark("cells and cellular agarose", new Set())), []);
  assert.equal(mentionsTerm("cells", "cell"), false);
});
test("longest term wins, and a seen long term never yields its short one", () => {
  const seen = new Set<string>();
  assert.deepEqual(marked(m.mark("The cell wall of a cell.", seen)), ["cell wall", "cell"]);
  const seen2 = new Set<string>();
  assert.deepEqual(marked(m.mark("A cell wall. Another cell wall. A cell.", seen2)), ["cell wall", "cell"]);
});
test("punctuation in terms, spaces collapse", () => {
  assert.deepEqual(marked(m.mark("We grew E. coli and a CELL   WALL.", new Set())), ["E. coli", "CELL   WALL"]);
});
test("segments rebuild the text", () => {
  const text = "Agar, the cell wall, and agar.";
  assert.equal(m.mark(text, new Set()).map((s) => s.text).join(""), text);
});
test("citations are left alone and do not count", () => {
  const seen = new Set<string>();
  const parts = proseParts("Agar sets.[1][2] Then agar [3] melts.");
  const marks = markProse("Agar sets.[1][2] Then agar [3] melts.", m, seen);
  assert.equal(marks.length, parts.length);
  assert.equal(marks[1], null);
  assert.equal(marks[3], null);
  assert.deepEqual(marks.flatMap((x) => (x ? marked(x) : [])), ["Agar"]);
});
