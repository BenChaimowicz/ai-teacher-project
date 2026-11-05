# SEN-143: which model draws the best scene plan for the money

**Status: decided on 2026-11-05: the illustrator runs on Terra at medium with Sol as fallback ([decision](../decisions/2026-11-05-the-illustrator-plans-on-terra-at-medium-with-sol-as-fallback.md)). The rest of this note is the evidence as it was presented.**

Run on 2026-11-05 by `pnpm check:illustrator-models:live`. Total spend $2.85 of a $3.00 cap, 516 Usage Records under the `live_check` Pipeline Event `check:illustrator-models:live`.

## The question

Which model, at which reasoning effort, produces illustrations that pass the Vision Judge most often per dollar, without a visible drop in how the pictures look? Ben also asked to try GLM 5.3 Flash, Kimi K3.1, and a text-to-image model given the papercraft style as reference images.

## What was run

- **Brief set** ([`sen-143-illustrator-brief-set.json`](sen-143-illustrator-brief-set.json)): 14 Visual briefs, copied verbatim from `pipeline_events.detail.brief`. These are the 12 briefs of the Norse Course of 2026-11-04 (request `2b5f4e9d`), plus one Yggdrasil depiction and one drum-stroke diagram from the reading-media live checks of 2026-11-03. 11 diagrams and 3 depictions. **There is no Gram brief:** no Gram stain brief has ever reached the illustrator, and the Gram fixture is one of the two worked examples in the prompt anyway.
- **Scene-plan candidates** run the production illustrator unchanged: same prompt, same two worked examples, two attempts, and on a fail a second plan with the Judge's reasons. Each candidate is pinned to one model and effort, with no fallback model.
- **The image-model path** sends the same brief JSON to a text-to-image model, with the two committed fixture renders (`yggdrasil.png`, `gram.png`) as style references, in the same two-attempt loop. The retry gets the previous picture plus the Judge's reasons. The prompt is a first draft adapted from the illustrator prompt, not tuned.
- **Two Judges look at every picture:**
  - The **production Judge** decides pass or fail and feeds the retry. That is `gpt-6-luna`. When the planner is `gpt-6-luna` itself, ADR 0015 moves the call to its fallback `gpt-5.6-luna`, exactly as production would.
  - A **uniform Judge**, `gpt-5.6-luna`, judges every picture again, so every candidate is also compared on one standard.
- **Sol at high** was not re-run. Its row is production's own attempts on these briefs from 2026-11-03/04 ([`sen-143-sol-high-production.json`](sen-143-sol-high-production.json)), re-rendered and judged by the uniform Judge. Two of its plans from 11-03 no longer render (see finding 9); their stored verdicts stand.
- **Budget order:** Kimi got the money left after the others and ran 9 of the 14 briefs. Gemini 3.1 Flash Image ran on one brief, in the pilot. Luna-medium ran twice to see how much one run moves.

Raw results, every plan, verdict, cost and time: [`sen-143-illustrator-eval.json`](sen-143-illustrator-eval.json). The pictures are in the contact sheets, one per brief: [`sen-143-contact-sheets/`](sen-143-contact-sheets/).

## Results

All rows cover the same 14 briefs except Kimi (9). "First" is the first plan's verdict; "illustrated" means passed within the two attempts. "$/brief" is the illustrator and production-Judge spend averaged over every brief, including fails. "$/illustrated" is total spend divided by passing briefs.

| Candidate | First pass, production Judge | Illustrated | First pass, uniform Judge | $/brief | $/illustrated | Median s/brief | Est. $ for the Norse Course's 12 visuals |
|---|---|---|---|---|---|---|---|
| Sol high (production, before SEN-142) | 10/14 | 13/14 | 11/12 | 0.072 | 0.077 | 122 | 0.86 (actual: 0.89) |
| **Sol medium** (today's default) | 9/14 | 13/14 | 11/14 | 0.042 | 0.045 | 55 | 0.51 |
| **Terra medium** | 9/14 | 13/14 | 12/14 | **0.019** | **0.021** | 45 | **0.23** |
| Kimi K3.1 Pro medium (9 briefs) | 5/9 | 8/9 | 7/9 | 0.076 | 0.086 | 44 | 0.92 |
| Luna medium ¹ | 13/14 ¹ | 13/14 | 12/14 | 0.003 | 0.003 | 46 | 0.04 |
| Luna medium, second run ¹ | 13/14 ¹ | 14/14 | 13/14 | 0.003 | 0.003 | 53 | 0.03 |
| Luna high ¹ | 11/14 ¹ | 13/14 | 13/14 | 0.006 | 0.006 | 83 | 0.07 |
| GLM 5.3 Flash medium | 0/14 | 5/14 | 4/12 | 0.004 | 0.012 | 67 | — |
| GLM 5.3 Flash high | 3/14 | 4/14 | 7/13 | 0.007 | 0.025 | 111 | — |
| Nano Banana 2.1 (image model) | 7/14 ² | 9/14 | 7/11 | 0.049 | 0.076 | 23 | 0.58 |
| Gemini 3.1 Flash Image (1 brief) | 1/1 | 1/1 | 1/1 | 0.069 | 0.069 | 20 | — |

¹ Luna's own pictures are judged in production by `gpt-5.6-luna`, the lenient Judge (finding 1), so this column is not comparable with the rows above it. Compare Luna on the uniform-Judge column.
² 3 of the 14 briefs were refused outright by Google's content filter (finding 7).

Per-brief verdicts, as production Judge then uniform Judge per attempt (P pass, f fail, E/! error or refusal):

```
brief                      sol-high    sol-med     terra-med   kimi        luna-med    luna-med-2  luna-high   glm-med     glm-high    nano-banana
odin-frigg-marriage        P/P         P/P         P/P         fP/PP       P/P         P/P         P/P         ff/ff       P/P         P/P
freyr-freyja-roles         P/P         P/P         P/P         P/P         P/P         P/P         P/P         fP/fP       fP/fP       P/P
thor-hammer-storm          ff/fP       ff/fP       fP/fP       fP/fP       ff/ff       fP/fP       fP/PP       ff/ff       ff/Pf       refused
heimdall-bridge            P/P         P/f         fP/PP       ff/ff       P/P         P/P         P/P         ff/Pf       ff/ff       P/P
loki-children              fP/PP       P/P         P/P         P/P         P/P         P/P         P/P         error       f/f!        refused
tyr-pledge-panels          fP/PP       fP/fP       fP/PP       P/P         P/P         P/P         fP/PP       f/f!        ff/ff       P/P
thor-serpent-nine-steps    P/P         P/P         P/P         P/P         P/f         P/P         P/P         fP/fP       ff/fP       ff/ff
fenrir-odin-vidar          P/P         fP/PP       ff/PP       fP/PP       P/P         P/P         P/P         fP/fP       ff/PP       fP/fP
tyr-pledge-vs-garm         P/P         P/P         P/P         P/P         P/P         P/P         ff/ff       timeout     timeout     fP/fP
freyr-surt                 P/P         fP/PP       P/P         —           P/P         P/P         P/P         ff/PP       ff/PP       P/P
loki-heimdall-both-die     fP/PP       fP/PP       fP/fP       —           P/P         P/P         P/P         ff/ff       ff/PP       refused
renewed-world-routes       P/P         P/P         P/P         —           P/P         P/P         P/P         fP/PP       ff/fP       P/P
yggdrasil-nine-worlds      P/—         P/P         P/P         —           P/P         P/P         P/P         fP/PP       P/P         ff/fP
drum-full-stroke           P/—         P/P         P/P         —           P/P         P/P         P/P         ff/fP       P/P         P/P
```
`—`: not run (Kimi's last five briefs), or for sol-high a stored plan that no longer renders, so only its production verdict exists. `!`: the second attempt ended in an error after a failed first.

## Findings

1. **The two Luna Judges disagree a lot, and the strict one is right.** Both Judges saw 128 of the pictures. `gpt-6-luna` passed 64 (50%) and `gpt-5.6-luna` passed 93 (73%). They split 30 times one way and once the other. The 30 strict fails are real defects, the kinds the ticket lists: a line that stops short of Jörmungandr, a hammer floating with no arm, figures labelled "facing" but drawn front-on, a "red beard" that is a red triangle on the forehead. `gpt-5.6-luna` agrees with itself (44 of 47 pictures it judged twice), so it is consistent, just lenient.
2. **Judged on one standard, every OpenAI plan model passes about as often.** Sol, Terra, Kimi and Luna score 11–13 of 14 with the uniform Judge, and 9–10 of 14 first plans with the strict Judge where it applies. At 14 briefs, a difference of one or two is noise. Pass rate does not separate them; cost and looks do.
3. **Terra at medium matches Sol at medium on every pass measure, at 46% of the cost and a little faster.** Both had 9/14 first plans and 13/14 illustrated under the strict Judge, and 12 against 11 under the uniform one. The pictures are comparable on the contact sheets. Terra is sometimes a little plainer (Heimdall's bridge), and sometimes the cleaner of the two (Loki's children).
4. **Luna is 6× cheaper than Terra and 13× cheaper than Sol at medium, but it fails in two ways the pass rate hides:**
   - Choosing Luna as the illustrator moves every illustration onto the lenient Judge, because an author never judges its own work (ADR 0015). The defects in finding 1 would then reach Learners.
   - The pictures are visibly weaker in ways no Judge caught. The "nine worlds" are nine blank coloured blocks, which the prompt explicitly forbids. Fenrir is drawn with the spiky dragon block in every Luna run whenever the brief does not say "wolf". Figures are smaller and labels crowd. Luna at high fixes some of this (the nine worlds became little scenes) and still costs 3× less than Terra.
5. **Sol at medium versus Sol at high** (SEN-142, already shipped): 9 against 10 first plans, 13 against 13 illustrated, at 58% of the cost and half the time. SEN-142 cost nothing measurable here.
6. **GLM 5.3 Flash is not usable as an illustrator:**
   - 0/14 first plans at medium and 3/14 at high.
   - Several plans the engine refused, two 5-minute timeouts, and near-empty panels.
   - OpenRouter spread it across at least five hosts.
7. **Kimi:** there is no plain "Kimi K3.1" on OpenRouter. The only K3.1 is `moonshotai/kimi-k3.1-pro`, priced like Sol. On its 9 briefs it passed 5 first plans and illustrated 8. It costs more than Sol at medium ($0.076 a brief) and does no better. Its pictures look like Sol's and Terra's.
8. **The image model draws by far the richest pictures, but it is not a drop-in replacement:**
   - **Looks:** Nano Banana 2.1 takes the papercraft look from the two references well, and most readers would prefer its pictures (see Heimdall's rainbow bridge, Tyr's pledge, Fenrir and Odin). It is also 2× faster (23 s median).
   - **Refusals:** Google's filter (`PROHIBITED_CONTENT`) refused 3 of the 14 briefs outright: Thor with his hammer, Loki's children, and "each kills the other". A mythology Course will keep hitting this.
   - **Pass rate:** 7/14 first and 9/14 illustrated, the worst of the OpenAI-class results.
   - **House style:** it ignores the house rules. It draws faces, fingers, horned helmets and snarling jaws over a fallen Odin, and on Tyr's pledge it put light panels over the dark sheet. The Judge's house-style rule lets all of that pass.
   - **Not data:** a picture is pixels. A scene plan is data that renders identically every time and can be checked and repaired; the picture can be neither.
   - **Cost:** $0.049 a brief, about Sol at medium. Gemini 3.1 Flash Image costs $0.069 a brief.
   - **It reverses a decision:** the decision of [2026-11-03](../decisions/2026-11-03-readings-aim-for-a-drawn-papercraft-illustration-and-fall-back-to-the-library.md) turned down AI image generation. [`generated-demonstrative-media.md`](generated-demonstrative-media.md) §3.3 rejected Gemini over SynthID, the clinical-practice clause and Grounded-Results storage, and those terms apply through OpenRouter too.
9. **Two side findings:**
   - **Thor fails for every plan model.** A figure block has no hands, so "holds a hammer" cannot be drawn. That is an engine gap, not a model choice.
   - **Two Sol plans from 2026-11-03 no longer render.** The engine has since tightened its sheet bounds and its limb-in-crown rule, so stored plans are not forward-compatible. That matters if a Course is ever re-rendered.

## Recommendation (for discussion)

**Run the illustrator on Terra at medium:**
- Set `ILLUSTRATOR_MODEL=openai/gpt-6.1-terra` and `ILLUSTRATOR_FALLBACK_MODEL=openai/gpt-6.1-sol`. It is an env change and no code.
- It keeps the strict Judge and Sol's pass rate, and halves the illustration bill again on top of SEN-142.
- On the Norse Course that is about $0.23 instead of $0.51 at Sol medium (and $0.89 actually spent at Sol high), and roughly 10 s faster a picture.

**The trade-off:**
- **What we give up by not taking Luna:** another ~$0.016 a picture, about $0.20 a Course. In exchange we keep the strict Judge and the better pictures. At today's volumes, $0.20 a Course does not justify letting the defects in finding 1 through.
- **When Luna becomes worth it:** if the money ever matters, Luna at high with a *different strict Judge* for illustrations is the option worth testing. That needs its own Judge eval first.
- **What we give up by not taking the image model:** the better-looking pictures.

**Not recommended now:**
- **GLM:** unreliable.
- **Kimi:** dearer than Sol, no better.
- **Luna as it stands:** the lenient Judge plus a visible quality drop.
- **The image model as a replacement.** If the team likes how its pictures look, it deserves its own ticket that revisits the 2026-11-03 decision on purpose. That ticket would have to cover:
  - what happens on a refusal (fall back to the engine);
  - whether faces and hands are now allowed in the house style;
  - a Judge check for house style;
  - a review of Google's terms.

## Caveats

- 14 briefs and one run per candidate (Luna medium twice), so a difference of one or two passes is noise.
- The Judges are models, not people, and the "looks" calls above are mine from the contact sheets. Look at them yourself.
- The Yggdrasil brief overlaps the Yggdrasil worked example in the prompt. The drum-stroke brief is the only technique-like one.
- Costs are OpenRouter's reported `usage.cost` on 2026-11-05. Five GLM calls timed out with an unknown cost.
- The image-model prompt is a first draft. Tuning it might lift its pass rate, but it cannot remove the refusals.
