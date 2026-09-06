import type { LessonCase } from "./types.ts";

const RETRIEVED = "2026-09-04T13:00:00Z";

export const cases: LessonCase[] = [
  {
    id: "gram-stain",
    subject: "microbiology lab fundamentals",
    learningGoal:
      "Perform and interpret a Gram stain in a teaching lab, naming reagents, expected colors, and common timing errors.",
    remainingGap:
      "The Learner can define a bacterium and name a cell wall, but has not performed a differential stain and cannot yet say why some cells stay purple.",
    lessonTitle: "The four-step Gram stain",
    lessonGoal:
      "Distinguish gram-positive from gram-negative cells by the four-step stain sequence and the peptidoglycan difference.",
    objectives: [
      "Name the four Gram stain reagents in order and the role of each.",
      "Explain why gram-positive cells remain purple after decolorization.",
      "State the expected colors of gram-positive and gram-negative cells after a correctly timed stain.",
      "Identify over-decolorization as a common error that can make gram-positive cells appear gram-negative.",
    ],
    topicTags: ["gram-stain", "peptidoglycan", "differential-stain"],
    sources: [
      {
        id: "S1",
        url: "https://reach.cdc.gov/sites/default/files/job-aids-resources/Gram_Stain_Procedure_Branded_508.pdf",
        title: "Gram Stain Procedure (OneLab REACH job aid)",
        publisher: "reach.cdc.gov",
        retrievedAt: RETRIEVED,
        content: `The Gram stain is a differential staining procedure used to categorize bacteria as Gram-positive or Gram-negative based on the chemical and physical properties of their cell walls. The bacteria are differentiated through a series of staining and decolorization steps. Gram-positive cells will stain purple and Gram-negative cells will stain red to pink.

Supplies and reagents include personal protective equipment, a slide rack, a timer, absorbent paper, water, crystal violet, Gram's iodine, decolorizer, safranin (or carbol fuchsin), and a brightfield microscope with a 100X objective and immersion oil.

Instructions:
1. Place the prepared fixed smear on a slide rack then flood the slide with crystal violet.
2. Wait 15 seconds then rinse the slide with water.
3. Flood the slide with Gram's iodine.
4. After 15 seconds rinse the slide with water.
5. Apply the decolorizer to the slide.
6. Rinse the slide immediately with water.
7. Flood the slide with counterstain.
8. Wait 15 seconds then rinse the slide with water.
9. Blot the slide with absorbent paper. Be careful not to wipe the cells off the slide.
10. Allow the newly stained slide to air dry completely.
11. View the slide under oil using the oil immersion objective for a total magnification of 1000X.
12. Record results based on your laboratory's criteria.

A companion CDC transcript notes that timing and reagents vary by institution, but the basic steps are the same, and this demonstration follows the American Society of Microbiology's clinical microbiology procedures. After safranin, gram-positive cells will appear purple and gram-negative cells will appear pink. Add decolorizer and rinse immediately with water to help prevent over-decolorizing.`,
      },
      {
        id: "S2",
        url: "https://openstax.org/books/microbiology/pages/2-4-staining-microscopic-specimens",
        title: "2.4 Staining Microscopic Specimens",
        publisher: "openstax.org",
        retrievedAt: RETRIEVED,
        content: `The Gram stain procedure is a differential staining procedure that involves multiple steps. It was developed by Danish microbiologist Hans Christian Gram in 1884 as an effective method to distinguish between bacteria with different types of cell walls, and even today it remains one of the most frequently used staining techniques.

The steps of the Gram stain procedure:
1. First, crystal violet, a primary stain, is applied to a heat-fixed smear, giving all of the cells a purple color.
2. Next, Gram's iodine, a mordant, is added. A mordant is a substance used to set or stabilize stains or dyes; in this case, Gram's iodine acts like a trapping agent that complexes with the crystal violet, making the crystal violet–iodine complex clump and stay contained in thick layers of peptidoglycan in the cell walls.
3. Next, a decolorizing agent is added, usually ethanol or an acetone/ethanol solution. Cells that have thick peptidoglycan layers in their cell walls are much less affected by the decolorizing agent; they generally retain the crystal violet dye and remain purple. However, the decolorizing agent more easily washes the dye out of cells with thinner peptidoglycan layers, making them again colorless.
4. Finally, a secondary counterstain, usually safranin, is added. This stains the decolorized cells pink and is less noticeable in the cells that still contain the crystal violet dye.

The purple, crystal-violet stained cells are referred to as gram-positive cells, while the red, safranin-dyed cells are gram-negative. Older bacterial cells may have damage to their cell walls that causes them to appear gram-negative even if the species is gram-positive. Thus, it is best to use fresh bacterial cultures for Gram staining. Errors such as leaving the decolorizer on for too long can affect the results. For example, if the decolorizer is left on a slide of pure gram-positive bacterial cells for too long, some of the gram-positive cells will be decolorized and stained red with safranin, suggesting a mixed culture.

Gram-negative bacteria tend to be more resistant to certain antibiotics than gram-positive bacteria.`,
      },
      {
        id: "S3",
        url: "https://en.wikipedia.org/wiki/Gram_stain",
        title: "Gram stain",
        publisher: "en.wikipedia.org",
        retrievedAt: RETRIEVED,
        content: `Gram stain is a method of staining used to classify bacterial species into two large groups: gram-positive bacteria and gram-negative bacteria. The name comes from the Danish bacteriologist Hans Christian Gram, who developed the technique in 1884.

Gram-positive cells have a thick layer of peptidoglycan in the cell wall that retains the primary stain, crystal violet. Gram-negative cells have a thinner peptidoglycan layer that allows the crystal violet to wash out on addition of ethanol. They are stained pink or red by the counterstain, commonly safranin or fuchsine. Lugol's iodine solution is always added after addition of crystal violet to form a stable complex with crystal violet that strengthens the bonds of the stain with the cell wall.

There are four basic steps of the Gram stain:
- Applying a primary stain (crystal violet) to a heat-fixed smear of a bacterial culture. Heat fixation kills some bacteria but is mostly used to affix the bacteria to the slide so that they do not rinse out during the staining procedure.
- The addition of iodine, which binds to crystal violet and traps it in the cell
- Rapid decolorization with ethanol or acetone
- Counterstaining with safranin. Carbol fuchsin is sometimes substituted for safranin since it more intensely stains anaerobic bacteria, but it is less commonly used as a counterstain.

When a decolorizer such as alcohol or acetone is added, it interacts with the lipids of the cell membrane. A gram-negative cell loses its outer lipopolysaccharide membrane, and the inner peptidoglycan layer is left exposed. The CV–I complexes are washed from the gram-negative cell along with the outer membrane. In contrast, a gram-positive cell becomes dehydrated from an ethanol treatment. The large CV–I complexes become trapped within the gram-positive cell due to the multilayered nature of its peptidoglycan. The decolorization step is critical and must be timed correctly; the crystal violet stain is removed from both gram-positive and negative cells if the decolorizing agent is left on too long (a matter of seconds).`,
      },
    ],
  },
  {
    id: "matched-grip",
    subject: "drum kit fundamentals",
    learningGoal:
      "Play a rock ballad on a drum kit using transferable 4/4 and 6/8 skills; never a copied chart or official audio of a named song.",
    remainingGap:
      "The Learner can name snare, bass, and hi-hat but has not been shown how to hold the sticks. Grip and fulcrum are untaught.",
    lessonTitle: "Matched grip and the fulcrum",
    lessonGoal:
      "Describe matched grip, locate the stick fulcrum, and explain why beginners start with matched rather than traditional grip.",
    objectives: [
      "Define the fulcrum as the pivot between thumb and index finger on the stick.",
      "Describe matched grip as both hands holding the sticks the same way.",
      "Contrast German, French, and American palm orientations within matched grip.",
      "State that matched grip transfers across snare, kit, and keyboard percussion, which is why many teachers start beginners there.",
    ],
    topicTags: ["matched-grip", "fulcrum", "stick-technique"],
    sources: [
      {
        id: "S1",
        url: "https://en.wikipedia.org/wiki/Grip_(percussion)",
        title: "Grip (percussion)",
        publisher: "en.wikipedia.org",
        retrievedAt: RETRIEVED,
        content: `In percussion, grip refers to the manner in which the player holds the sticks or mallets. When two identical beaters are used, one in each hand, there are two main varieties of grip: unmatched grips, known as traditional grips, in which the right and left hands grip the sticks in different ways; and matched grips in which the hands hold the sticks in similar, mirror image fashion.

Matched grip (also known as parallel grip) is a method of holding drum sticks and mallets to play percussion instruments. In the matched grip, each hand holds the stick in the same way, whereas in the traditional grip, each hand holds the stick differently. Almost all commonly used matched grips are overhand grips. Specific forms of the grip are French grip, German grip, and American grip.

The matched grip is performed by gripping the drum sticks with one's index finger and middle finger curling around the bottom of the stick and the thumb on the top. This allows the stick to move freely and bounce after striking a percussion instrument. Any of the major grips below can be played with an index finger fulcrum, a middle finger fulcrum, or a combination of both.

In French grip, the palms of the hands face directly toward each other and the stick is moved primarily with the fingers rather than the wrist as in German grip. This allows a greater degree of finesse and the addition of forearm rotation to the stroke, which is why many timpanists prefer French grip.

In German grip, the palms of the hands are parallel to the drumhead or other playing surface, and the stick is moved primarily with the wrist. German grip provides a large amount of power, but sacrifices the speed provided by the use of the fingers as in French grip.

American grip is a hybrid of the French grip and German grip. The palms of the hands typically are at about a 45-degree angle to the drum and both the fingers and wrist are used to move the stick. This grip is considered a general-purpose grip by percussionists because it combines the power and larger wrist motion of the German grip with the quick finger strokes of the French grip.

Matched grips are common for snare drum, drum kit, glockenspiel, xylophone and vibraphone, tenor drum, bass drum, and timpani. Traditional grip is almost exclusively used to play the snare drum, especially the marching snare drum, and the jazz drum kit.`,
      },
      {
        id: "S2",
        url: "https://hub.yamaha.com/music-educators/instruments/perc/a-guide-to-proper-stick-grips/",
        title: "A Guide to Proper Stick Grips",
        publisher: "hub.yamaha.com",
        retrievedAt: RETRIEVED,
        content: `Before exploring our grip options, we must understand the term fulcrum. The Oxford Dictionary defines fulcrum as "the point at which a lever rests or is supported and on which it pivots." The lever is the drumstick, and in most circumstances, it rests between the pad of the thumb and the first or second joint of the index finger and pivots back and forth using a combination of hinges — fingers, wrist and arm.

Matched grip is the most common grip used for today's percussive world of instruments. It's called matched grip because of the identical hold used by the left and right hands. Simply grab the stick naturally as if you are picking up a small object off a desk or table. Most percussion students start their musical journey by playing matched grip, often on practice pads or practice keyboard instruments. Matched grip can also be used when performing concert snare drum, concert toms, timpani, drum set, crash and suspended cymbals, and all major keyboard instruments.

Front fulcrum: The stick should be held firmly by the pad of the thumb and the second joint of the index finger, about a third of the way up the stick. Back fulcrum: The back three fingers (middle, ring and pinky) should wrap around the stick naturally and completely. Wrist orientation: When in set position on the drum, keyboard or cymbal, the backs of the wrists should be almost completely flat, facing the ceiling.

A firm fulcrum is one that does not leave a large gap between the thumb and the side of the hand. Ensure that the thumb is resting flat on the stick. In French grip, the thumbs should face upward and the inside of the palms should face each other. This grip is often used by timpanists but is also utilized by drum-set players as well as orchestral snare drummers.

Matched grip provides clear benefits in terms of symmetry, ergonomic efficiency and transferability across all areas of percussion playing. It's often easier for beginners to learn and allows seamless movement between concert percussion, marching battery, drum set and keyboards.`,
      },
      {
        id: "S3",
        url: "https://pas.org/wp-content/uploads/2024/04/ECV0803-035.pdf",
        title: "Building A Strong Foundation Of The Snare Drum Fulcrum",
        publisher: "pas.org",
        retrievedAt: RETRIEVED,
        content: `A strong foundation is key in learning any new technique or method. I teach matched grip to all beginning students because it translates to every percussion instrument.

A good fulcrum on the drumstick is one of the most important things we can teach a student. Without a good fulcrum, it will be difficult to learn how to produce a good roll. Using the dominant hand, put the drumstick inside the first knuckle of your pointer finger. Position the drumstick so you have approximately two-thirds of the stick coming out the front of your hand. Let the drumstick drop and count how many bounces are created. Reposition the drumstick and try a different fulcrum. Again, count the number of bounces. If there are less bounces, try moving the drumstick the opposite way. You have found the optimal fulcrum when you find the position on the drumstick where you achieve the most bounces.

Once you have marked the fulcrum on the drumstick, take your thumb and put it opposite the first knuckle. Make sure the thumb is parallel to the drum stick. Once you have the fulcrum, the back of the drumstick touches the love line as the drumstick goes out of your hand. Wrap the other fingers loosely around the drumstick. Do not squeeze or clench the drumstick. Your hand should be relaxed and there should be no tension in the hand or in the fingertips.

Matched grip is used on snare drum, marimba, xylophone, timpani, bells and most percussion instruments in a concert ensemble.`,
      },
    ],
  },
  {
    id: "loki-corpus",
    subject: "Norse mythology",
    learningGoal:
      "Explain who Loki is in the medieval mythic corpus (Eddas and related sources), not as a modern franchise character.",
    remainingGap:
      "The Learner has heard the name Loki from popular culture but cannot name medieval sources, parentage, or the Baldr episode from the corpus.",
    lessonTitle: "Loki in the Eddas, not on screen",
    lessonGoal:
      "Identify Loki's family, the main medieval sources, and his role in Baldr's death from the mythic corpus.",
    objectives: [
      "Name the Prose Edda and Poetic Edda as primary medieval textual sources for Loki.",
      "State that Loki is son of the jötunn Fárbauti and Laufey, counted among the Æsir, and father of Fenrir, Jörmungandr, and Hel.",
      "Describe Loki's role in Baldr's death (mistletoe; Hodr) and the subsequent binding with Sigyn and the serpent.",
      "Distinguish this corpus figure from later popular depictions that make him Odin's adopted son in a superhero setting.",
    ],
    topicTags: ["loki", "prose-edda", "baldr", "ragnarok"],
    sources: [
      {
        id: "S1",
        url: "https://en.wikipedia.org/wiki/Loki",
        title: "Loki",
        publisher: "en.wikipedia.org",
        retrievedAt: RETRIEVED,
        content: `Loki is a god in Norse mythology. Loki engineers the death of the beloved god Baldr and is bound by the gods and suffers from serpent venom. His wife Sigyn collects the venom in a bowl. However, she must empty the bowl when it is full and the venom that drips in the meantime causes Loki to writhe in pain, thereby causing earthquakes.

As part of the events of Ragnarök, Loki is foretold to eventually break free from his bonds and, among the forces of the jötnar, to go to battle with the gods. He is the son of Fárbauti (a jötunn) and Laufey, and the brother of Helblindi and Býleistr. Loki is married to the goddess Sigyn. By the jötunn Angrboða, Loki is the father of Hel, the wolf Fenrir and the world serpent Jörmungandr. In the form of a mare, Loki was chased down and impregnated by the stallion Svaðilfari and gave birth to the eight-legged horse Sleipnir. Like other gods, Loki is a shape shifter.

Loki is attested in the Poetic Edda, compiled in the 13th century from earlier traditional sources; the Prose Edda and Heimskringla, composed or compiled in the 13th century by Snorri Sturluson; the Norwegian Rune Poem, in the poetry of skalds, and in Scandinavian folklore. Scholars have debated Loki's origins and role in Norse mythology, noting that he is unlikely to have received any kind of veneration but played a notable role in myth. Some have described him as a trickster god. Loki has been depicted in, or referenced in, a variety of media in modern popular culture.

The poem Lokasenna (Old Norse "Loki's Flyting") centers around Loki flyting with other gods. Frigg reminds the hall that Loki is responsible for the death of her son Baldr.`,
      },
      {
        id: "S2",
        url: "https://www.worldhistory.org/Loki/",
        title: "Loki",
        publisher: "worldhistory.org",
        retrievedAt: RETRIEVED,
        content: `Loki is a god in Norse mythology who is often simply described as the 'trickster' god for his love of playing pranks on both his fellow gods and his or their opponents. Sworn brother of Odin and often the one to dig the other gods out of inconveniently deep holes, Loki's name nonetheless has many negative connotations due to his deceitful nature and especially the hand he had in the death of the god Baldr, thus setting in motion the coming of the Ragnarök.

The richest amount of information on Loki can be mined from Snorri Sturluson's Prose Edda (c. 1220 CE) — albeit seen through the goggles of a 13th-century CE Icelandic writer from a time Christianity had already taken hold of the island. Loki also pops up in some very early skaldic poems as well as in the Lokasenna and the Þrymskviða poems from the Poetic Edda (c. 1270 CE, but containing material which probably dates back to before the 10th century CE).

In terms of family, Snorri's Prose Edda has Loki down as son of the giant Fárbauti and a mother named Laufey or Nál. With his wife Sigyn he had a son named Nari or Narfi. Loki fathered three more children by the giantess Angrboda: the wolf Fenrir, the Midgard Serpent who coils around the world, and Hel, goddess of the Underworld. There is even a strange tale in which Loki shape-shifts into a mare and gives birth to the eight-legged horse Sleipnir.

After the goddess Frigg, mother of Baldr, makes her son invulnerable by making everything except for the weak mistletoe swear not to harm him, the gods have fun shooting at Baldr. Loki hands the blind god Hodr — Baldr's brother — an arrow made of mistletoe, which Hodr unintentionally kills his brother with. Loki is then captured by the other gods and tied to a rock with a poison-oozing snake suspended above him; his wife Sigyn catches the worst of it in a bowl.

A common thread throughout many myths surrounding Loki are his malicious intentions but also his willingness to help solve the problems he has created. He once cut off all of Sif's hair out of pure malice but then has the black-elves make Sif hair of gold. In the myth of the master builder, cunning Loki plays a trick to delay the giant causing him to miss his deadline, after which the giant is slain by Thor.

Snorri describes him as 'beautiful and comely to look upon, evil in spirit, very fickle in habit.' (Gylfaginning, 33). He is Odin's sworn brother in these sources, not an adopted cinematic son of Odin in Asgard as a royal household.`,
      },
    ],
  },
];
