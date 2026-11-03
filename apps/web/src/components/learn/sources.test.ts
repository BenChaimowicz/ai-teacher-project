import { test } from "node:test";
import assert from "node:assert/strict";
import type { MediaBlock, NumberedSource, ReadingBody } from "@senoy/db/reading-lesson";
import { mostCitedSource } from "./sources.ts";

const sources: NumberedSource[] = [
  { n: 1, title: "One", url: "https://a.example/1" },
  { n: 2, title: "Two", url: "https://a.example/2" },
  { n: 3, title: "Three", url: "https://a.example/3" },
];
const prose = (text: string) => ({ kind: "prose" as const, text });
const body = (...texts: string[]): ReadingBody => ({ sections: [{ heading: "h", blocks: texts.map(prose) }] });

test("no sources gives null, whatever the prose says", () => {
  assert.equal(mostCitedSource(body("Agar sets.[1]"), []), null);
});
test("prose that cites nothing gives null", () => {
  assert.equal(mostCitedSource(body("Agar sets. It is jelly."), sources), null);
});
test("the most cited source wins, counted across sections and blocks", () => {
  const two: ReadingBody = {
    sections: [
      { heading: "a", blocks: [prose("One thing.[1] Another.[2]")] },
      { heading: "b", blocks: [prose("More.[2]"), prose("And again.[2][3]")] },
    ],
  };
  assert.equal(mostCitedSource(two, sources)?.n, 2);
});
test("a tie goes to the lowest n, however the list is ordered", () => {
  assert.equal(mostCitedSource(body("A.[3] B.[1] C.[3] D.[1]"), sources)?.n, 1);
  assert.equal(mostCitedSource(body("A.[3] B.[1] C.[3] D.[1]"), [...sources].reverse())?.n, 1);
});
test("adjacent markers each count", () => {
  assert.equal(mostCitedSource(body("Agar sets.[2][2] Then melts.[1]"), sources)?.n, 2);
});
test("a marker with no source in the list does not count", () => {
  assert.equal(mostCitedSource(body("A.[9] B.[9] C.[9] D.[2]"), sources)?.n, 2);
  assert.equal(mostCitedSource(body("A.[9]"), sources), null);
});
test("only prose counts: a figure's caption does not", () => {
  const figure = {
    kind: "media",
    caption: "A plate.[3][3][3]",
    alt: "A plate.[3]",
    descriptor: {},
  } as unknown as MediaBlock;
  const withFigure: ReadingBody = { sections: [{ heading: "h", blocks: [prose("Agar.[1]"), figure] }] };
  assert.equal(mostCitedSource(withFigure, sources)?.n, 1);
});
test("returns the source row itself", () => {
  assert.deepEqual(mostCitedSource(body("Agar.[2]"), sources), sources[1]);
});
