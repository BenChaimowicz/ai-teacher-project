import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanDisplayName, DISPLAY_NAME_MAX_LENGTH, initialsOf, NAME_THINGS, NAME_TRAITS, randomDisplayName } from "./learner-name.ts";

test("A random name joins a trait and a thing with an underscore", () => {
  assert.equal(randomDisplayName(() => 0), `${NAME_TRAITS[0]}_${NAME_THINGS[0]}`);
  assert.equal(randomDisplayName(() => 0.999999), `${NAME_TRAITS.at(-1)}_${NAME_THINGS.at(-1)}`);
  assert.match(randomDisplayName(), /^[A-Z][a-z]+_[A-Z][a-z]+$/);
});

test("Initials take the first letter of up to two words", () => {
  assert.equal(initialsOf("Curious_Owl"), "CO");
  assert.equal(initialsOf("yarden farag"), "YF");
  assert.equal(initialsOf("Yarden"), "Y");
  assert.equal(initialsOf("Mary Jane Watson"), "MJ");
  assert.equal(initialsOf("ירדן פרג"), "יפ");
  assert.equal(initialsOf("  "), "?");
});

test("A typed name is trimmed, and empty or too long names are refused", () => {
  assert.equal(cleanDisplayName("  Yarden   Farag "), "Yarden Farag");
  assert.equal(cleanDisplayName("   "), null);
  assert.equal(cleanDisplayName("x".repeat(DISPLAY_NAME_MAX_LENGTH)), "x".repeat(DISPLAY_NAME_MAX_LENGTH));
  assert.equal(cleanDisplayName("x".repeat(DISPLAY_NAME_MAX_LENGTH + 1)), null);
});
