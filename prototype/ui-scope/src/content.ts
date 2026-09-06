export const honestyIntro =
  "This is a short check of knowledge related to your Learning Goal so we can start the Course in the right place. It is not a Quiz, not a grade, and not a test of intelligence. If you are not reasonably sure, choose I don’t know. You will review the Course Blueprint before anything is generated.";

export const remainingGapStatement =
  "We would start with matched-grip mechanics and counting in 4/4, then a standard rock beat, then transferable 4/4–6/8 skills toward playing Iris. Time signatures and kit-piece names look already in place.";

export const coverageNote =
  "This is a small knowledge sample, not a test of kit playing. Quizzes later in the Course do not change this starting point.";

export const profileIntro =
  "These choices set up how your Lessons are presented. They are not a test of intelligence, ability, or disability. You can skip any question and change these choices later.";

export const profileQuestions = [
  {
    id: "q1",
    prompt: "Which language should reading Lessons, Quiz questions, and Quiz feedback use?",
    options: [
      "English",
      "I need a language that is not listed",
      "Prefer not to answer",
    ],
  },
  {
    id: "q2",
    prompt: "Do any of these need to be true for reading Lessons to be usable for you?",
    options: [
      "Use plain, direct wording",
      "Use short paragraphs with clear headings",
      "Define unfamiliar terms where they first appear",
      "None of these",
      "Prefer not to answer",
    ],
  },
  {
    id: "q3",
    prompt: "How much content should one reading Lesson usually cover?",
    options: [
      "Compact — one key idea",
      "Standard — a few connected ideas",
      "Extended — a fuller treatment with fewer Lesson breaks",
      "No preference — use the default",
      "Prefer not to answer",
    ],
  },
  {
    id: "q4",
    prompt: "How should sections inside a reading Lesson advance?",
    options: [
      "Pause after each section until I choose Continue",
      "Keep the Lesson continuous so I can scroll at my own pace",
      "No preference — use the default",
      "Prefer not to answer",
    ],
  },
  {
    id: "q5",
    prompt: "When a new idea has a useful example, which order would you like?",
    options: [
      "Show a concrete or worked example, then explain it",
      "Explain the idea, then show a concrete or worked example",
      "No preference — use the best order for the topic",
      "Prefer not to answer",
    ],
  },
  {
    id: "q6",
    prompt: "How much reading would you like between short Quiz Lessons?",
    options: [
      "A Quiz after every reading Lesson",
      "A Quiz after every 2–3 reading Lessons",
      "A Quiz at the end of each Module",
      "No preference — use the default",
      "Prefer not to answer",
    ],
  },
  {
    id: "q7",
    prompt: "When should a Quiz show the answer and explanation?",
    options: [
      "After each question",
      "After I submit the whole Quiz",
      "No preference — use the default",
      "Prefer not to answer",
    ],
  },
  {
    id: "q8",
    prompt: "How much feedback should each Quiz answer include?",
    options: [
      "Brief — the correct answer and a one-sentence reason",
      "Standard — a concise explanation, including why another choice is wrong when useful",
      "Detailed — a fuller explanation with an example or retry hint",
      "No preference — use the default",
      "Prefer not to answer",
    ],
  },
];

export const diagnosticItems = [
  {
    capability: "Kit-piece names",
    stem: "Which kit piece typically plays a snare backbeat in a standard rock beat?",
    options: ["Ride cymbal", "Snare drum", "Hi-hat foot"],
    key: 1,
  },
  {
    capability: "4/4 identification",
    stem: "In 4/4 time, how many quarter-note pulses sit in one bar?",
    options: ["Three", "Four", "Six"],
    key: 1,
  },
  {
    capability: "6/8 identification",
    stem: "A bar written in 6/8 is most often felt as how many main pulses?",
    options: ["Two (compound duple)", "Four even quarters", "Six unrelated hits"],
    key: 0,
  },
  {
    capability: "Note values",
    stem: "Two eighth notes occupy the same time as:",
    options: ["One half note", "One quarter note", "One sixteenth note"],
    key: 1,
  },
  {
    capability: "Backbeat placement",
    stem: "In a typical 4/4 rock beat, the snare backbeat falls on beats:",
    options: ["1 and 3", "2 and 4", "1 and 4"],
    key: 1,
  },
  {
    capability: "Matched grip concept",
    stem: "In matched grip, both hands hold the sticks:",
    options: [
      "With the same overhand orientation",
      "With the left hand underhand only",
      "With the sticks taped to the palms",
    ],
    key: 0,
  },
  {
    capability: "Hi-hat role",
    stem: "In a basic rock beat, the hi-hat usually supplies:",
    options: [
      "The backbeat accents only",
      "A steady subdivision, often eighth notes",
      "The only bass-drum pattern",
    ],
    key: 1,
  },
  {
    capability: "Iris as transferable skills",
    stem: "For a Learning Goal of playing Iris, which is a lawful teachable unit here?",
    options: [
      "The official transcription of the drum part",
      "Generic 4/4 groove and 6/8 feel skills you can take to the song",
      "A generated stand-in recording of the track",
    ],
    key: 1,
  },
];

export const blueprintSlots = [
  { id: "m1l1", module: "Grip & posture", title: "Matched grip", goal: "Hold both sticks with a matched overhand grip that can bounce.", method: "reading" },
  { id: "m1l2", module: "Grip & posture", title: "Stick height and rebound", goal: "Control rebound so strokes stay even at a slow tempo.", method: "reading" },
  { id: "m1q", module: "Grip & posture", title: "Grip check", goal: "Show the grip ideas in words.", method: "quiz" },
  { id: "m2l1", module: "Timekeeping", title: "Counting 4/4 out loud", goal: "Count a bar of 4/4 with a steady quarter pulse.", method: "reading" },
  { id: "m2l2", module: "Timekeeping", title: "Feeling 6/8 as two pulses", goal: "Describe 6/8 as two main pulses of three eighths.", method: "reading" },
  { id: "m2q", module: "Timekeeping", title: "Timekeeping check", goal: "Distinguish 4/4 from 6/8 on the page.", method: "quiz" },
  { id: "m3l1", module: "Rock beat", title: "Kick on 1 and 3", goal: "Place bass drum on beats 1 and 3 in 4/4.", method: "reading" },
  { id: "m3l2", module: "Rock beat", title: "Hi-hat eighths", goal: "Keep even eighths on the hi-hat over the kick-snare skeleton.", method: "reading" },
  { id: "m3q", module: "Rock beat", title: "Rock beat check", goal: "Name the parts of a basic rock beat.", method: "quiz" },
  { id: "m4l1", module: "Toward Iris", title: "4/4–6/8 skills for the song", goal: "Name which generic skills transfer toward playing Iris — not a chart.", method: "reading" },
];

export const courseLessons = [
  { id: "l1", module: "Grip & posture", title: "Matched grip", method: "reading" as const, status: "complete" as const },
  { id: "l2", module: "Grip & posture", title: "Stick height and rebound", method: "reading" as const, status: "complete" as const },
  { id: "l3", module: "Grip & posture", title: "Grip check", method: "quiz" as const, status: "complete" as const },
  { id: "l4", module: "Timekeeping", title: "Counting 4/4 out loud", method: "reading" as const, status: "current" as const },
  { id: "l5", module: "Timekeeping", title: "Feeling 6/8 as two pulses", method: "reading" as const, status: "locked" as const },
  { id: "l6", module: "Timekeeping", title: "Timekeeping check", method: "quiz" as const, status: "locked" as const },
  { id: "l7", module: "Rock beat", title: "Kick on 1 and 3", method: "reading" as const, status: "locked" as const },
  { id: "l8", module: "Rock beat", title: "Hi-hat eighths", method: "reading" as const, status: "locked" as const },
  { id: "l9", module: "Rock beat", title: "Rock beat check", method: "quiz" as const, status: "locked" as const },
  { id: "l10", module: "Toward Iris", title: "4/4–6/8 skills for the song", method: "reading" as const, status: "locked" as const },
];

export const readingSections = [
  {
    heading: "Why count out loud",
    blocks: [
      "A Course Goal of playing Iris still starts with a pulse you can name. Counting 4/4 is a skill, not a transcription of the song.[1]",
      "Say “1-2-3-4” with even spacing. The numbers are the quarter-note grid the rest of the kit will sit on.",
    ],
  },
  {
    heading: "The quarter-note grid",
    blocks: [
      "Each number is one quarter note. Two eighth notes fit inside one quarter: “1-and-2-and”.[2]",
      "If the count rushes, the rock beat that comes later will rush too. Slow is useful here.",
    ],
  },
  {
    heading: "What this Lesson is not",
    blocks: [
      "This Lesson does not include a chart or recording of Iris. Those stay at the Source as a link when we cannot display a licensed copy.",
      "When you can count a bar steadily, mark this Lesson complete. Opening it was not completion.",
    ],
  },
];

export const readingSources = [
  { n: 1, title: "Vic Firth: rudiments and timing primers", url: "https://vicfirth.com" },
  { n: 2, title: "Percussive Arts Society education pages", url: "https://pas.org" },
];

export const quizItems = [
  {
    stem: "How many quarter-note counts are in one bar of 4/4?",
    options: ["Two", "Three", "Four", "Six"],
    key: 2,
    why: "4/4 means four quarter-note pulses per bar.",
  },
  {
    stem: "“1-and-2-and” is counting which subdivision?",
    options: ["Whole notes", "Eighth notes", "Triplets only", "Sixteenth-note sextuplets"],
    key: 1,
    why: "The “and” splits each quarter into two eighths.",
  },
  {
    stem: "Why does this Course count 4/4 before teaching a rock beat?",
    options: [
      "So the Generator can skip Demonstrative media",
      "Because the kit parts sit on a named pulse",
      "Because Iris must be transcribed first",
      "Because Progress requires a 0–100 Starting Level",
    ],
    key: 1,
    why: "The beat is placed on a grid you can already count.",
  },
  {
    stem: "Opening a reading Lesson without marking it complete:",
    options: [
      "Moves Progress",
      "Does not count as Lesson completion",
      "Unlocks the next Lesson in linear mode",
      "Re-estimates Starting Level",
    ],
    key: 1,
    why: "Completion is an explicit mark at the end of the reading.",
  },
  {
    stem: "A licensed Iris chart is unavailable. The Lesson should:",
    options: [
      "Invent a close transcription",
      "Generate a fake recording",
      "Teach generic skills and link the Source",
      "Fail the whole Course Request",
    ],
    key: 2,
    why: "Named-work goals pass; we display licensed copies or link, never invent a substitute.",
  },
  {
    stem: "This Quiz completes for Progress when:",
    options: [
      "Any attempt is submitted",
      "Best score is at least 70%",
      "Every item is peeked in the answer key",
      "The Learner opens it",
    ],
    key: 1,
    why: "Best score ≥ 70% of equal-weight items, unlimited retakes of the same items.",
  },
];

export const homeItems = [
  {
    kind: "course" as const,
    title: "Drum kit fundamentals",
    goal: "Play Iris by the Goo Goo Dolls",
    status: "3 / 10 Lessons complete",
    tag: "Published",
  },
  {
    kind: "request" as const,
    title: "Microbiology lab fundamentals",
    goal: "Perform a Gram stain in words: reagents, order, and what the colors mean",
    status: "Blueprint ready to review",
    tag: "Blueprint review",
  },
  {
    kind: "request" as const,
    title: "Norse mythology",
    goal: "Retell the mythic corpus around Ragnarök without franchise inventions",
    status: "Lesson 4 of 12 could not be grounded after repair",
    tag: "Generation failed",
  },
  {
    kind: "request" as const,
    title: "How to feed unicorns",
    goal: "Real-world animal care for unicorns",
    status: "Rejected: that premise is not a documented animal-care subject. Study the mythic unicorn instead.",
    tag: "Rejected",
  },
];
