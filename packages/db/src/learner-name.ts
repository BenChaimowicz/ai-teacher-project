/** Traits of a good learner: the first half of a new Learner's display name. */
export const NAME_TRAITS = [
  "Curious", "Creative", "Clever", "Bold", "Brave", "Bright", "Calm", "Careful", "Cheerful", "Daring",
  "Eager", "Focused", "Gentle", "Glad", "Happy", "Humble", "Keen", "Kind", "Lively", "Lucky",
  "Mindful", "Nimble", "Patient", "Playful", "Quick", "Quiet", "Sharp", "Steady", "Sunny", "Swift",
  "Thoughtful", "Tidy", "Wise", "Witty", "Zesty", "Hopeful", "Plucky", "Spirited", "Wondering", "Inventive",
] as const;

/** Friendly animals and things: the second half of a new Learner's display name. */
export const NAME_THINGS = [
  "Owl", "Avocado", "Otter", "Fox", "Panda", "Koala", "Penguin", "Dolphin", "Hedgehog", "Raccoon",
  "Badger", "Beaver", "Falcon", "Heron", "Lynx", "Moose", "Puffin", "Robin", "Sparrow", "Turtle",
  "Walrus", "Whale", "Zebra", "Lemur", "Gecko", "Mango", "Peach", "Acorn", "Pebble", "Comet",
  "Maple", "Cactus", "Pumpkin", "Walnut", "Bamboo", "Lantern", "Compass", "Notebook", "Pencil", "Kite",
] as const;

/** The longest display name a Learner may set. */
export const DISPLAY_NAME_MAX_LENGTH = 40;

/**
 * A random display name for a new Learner, such as `Curious_Owl`.
 * @param random - Returns a number in [0, 1); defaults to `Math.random`
 */
export function randomDisplayName(random: () => number = Math.random) {
  const trait = NAME_TRAITS[Math.floor(random() * NAME_TRAITS.length)] ?? NAME_TRAITS[0];
  const thing = NAME_THINGS[Math.floor(random() * NAME_THINGS.length)] ?? NAME_THINGS[0];
  return `${trait}_${thing}`;
}

/**
 * Trims a display name a Learner typed and checks it. Returns the clean name, or null when it is empty or too long.
 * @param input - The name as typed
 */
export function cleanDisplayName(input: string) {
  const name = input.replace(/\s+/g, " ").trim();
  if (name.length === 0 || Array.from(name).length > DISPLAY_NAME_MAX_LENGTH) return null;
  return name;
}

/**
 * Up to two initials for the avatar circle: `Curious_Owl` → `CO`, `Yarden Farag` → `YF`, `Yarden` → `Y`.
 * @param displayName - The Learner's display name
 */
export function initialsOf(displayName: string) {
  const words = displayName.split(/[\s_\-.]+/).filter(Boolean);
  const letters = words.slice(0, 2).map((word) => Array.from(word)[0] ?? "");
  return letters.join("").toLocaleUpperCase() || "?";
}
