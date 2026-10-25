# Reading modes: research and proposal

SEN-52 · 2026-10-25. Question: how do people prefer to read long text on a computer, and what reading modes should the lesson page offer?

## What the research says

1. **Line length matters most.** Aim for 50–75 characters per line. Long lines feel intimidating and get skipped; very short lines make the eye jump back too often. WCAG caps it at 80. ([Baymard](https://baymard.com/research-articles/line-length-readability), [literature review](https://journals.uc.edu/index.php/vl/article/view/5765))
2. **There is no single best font. It depends on the reader.** In a large crowdsourced study, readers were 35% faster in their best font than in their worst, with no loss of comprehension. The best font differed from person to person. A follow-up that recommended a font to each reader gained 14–25 words per minute. This is the strongest argument for letting people choose. ([Wallace et al., TOCHI 2022](https://research.adobe.com/publication/towards-individuated-reading-experiences-different-fonts-increase-reading-speed-for-different-individuals), [Readability Matters](https://readabilitymatters.org/articles/readability-individuation))
3. **Extra letter spacing helps dyslexic readers.** Wider spacing roughly doubled reading accuracy and raised speed by more than 20% in dyslexic children. It made no difference for typical readers. The cause is "crowding" between letters. ([Zorzi et al., PNAS 2012](https://m.medicalxpress.com/news/2012-06-wider-letter-spacing-dyslexics.html))
4. **Light pages measure slightly better; dark is preferred by many.** Dark text on a light background gave better proofreading and acuity scores, especially at small sizes. Readers didn't *feel* a difference, and dark backgrounds can help some low-vision readers (for example, people with cataracts). The usual answer is to offer both. ([cogsci.nl summary of Piepenbrock et al. 2013](https://cogsci.nl/blog/is-bright-text-on-a-dark-background-a-good-idea))
5. **Common practice.** Kindle, Apple Books, Safari Reader and Firefox Reader View all settle on the same small panel: font, size, line spacing, width/margins, and page colour (light / sepia / dark). People already know this "Aa" panel.

What we drop: serif vs sans as a rule (no reliable difference on modern screens; it comes down to personal fit, per point 2), "bionic reading" (no evidence it helps), and dyslexia fonts such as OpenDyslexic (spacing does the work, not the letter shapes).

## Proposal

An **Aa** button in the lesson top bar opens a small panel. It has presets (one click) and fine controls underneath. The choice is remembered per user.

| Mode | For | What changes |
| --- | --- | --- |
| **Comfort** (default) | Most reading | Serif (Literata), ~19px, line height 1.75, ~66-character column |
| **Focus** | Concentrating | Sidebar and chrome hidden. The paragraph you're on stays bright and the rest dims. Bao's notes fold into small markers. |
| **Spaced** | Dyslexic or tired readers | Atkinson Hyperlegible, larger text, extra letter and word spacing, line height 1.9, narrower column, left-aligned |
| **Book** | Big screens, long lessons | Two columns, one page at a time, turned with ← → like an e-reader, with a page count |
| **Skim** | Reviewing a finished lesson | Sans, compact, key sentences highlighted, sections folded down to their first line |

**Fine controls:** font (Serif · Sans · Hyperlegible), size (A− / A+), width (narrow · medium · wide), line spacing (3 steps), letter spacing (on/off), and page colour (Dark · Dim · Sepia · Paper).

**"Help me pick":** Bao offers a short font test based on point 2: "Read both. Which one felt easier?", three rounds, two samples each, then that font is applied. This is the same tap-to-choose pattern used everywhere else.

**Decided (2026-10-25):** the app is always dark, and *Sepia* and *Paper* ship as light **reading surfaces inside a dark app**, because the evidence favours offering a light page. Dark is the default page colour. All five modes ship, with Comfort the default.
