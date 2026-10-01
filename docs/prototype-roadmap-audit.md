# Prototype roadmap audit

**Original audit date:** 2026-09-10  
**Applied reorganization:** 2026-09-10  
**Scope:** Senoy implementation issues SEN-30 through SEN-57, the two resulting Linear Projects, six milestones, current issue relations, `docs/spec.md`, `CONTEXT.md`, and current code evidence.

## Applied reorganization — 2026-09-10

The authorized Linear reorganization is complete. Linear is now the operational source of truth for execution; [`docs/spec.md`](spec.md) remains the product source of truth.

Created:

- [Reading + Quiz Course POC](https://linear.app/senoy/project/reading-quiz-course-poc-a8c5ebb0d9f0) — 24 issues across four numbered milestones.
- [Media Course POC](https://linear.app/senoy/project/media-course-poc-aa17e818b4cd) — 3 issues across two numbered milestones.
- [SEN-54 Green workspace verification](https://linear.app/senoy/issue/SEN-54/green-workspace-verification).
- [SEN-55 Demonstrative media vertical slice](https://linear.app/senoy/issue/SEN-55/demonstrative-media-vertical-slice).
- [SEN-56 Conversational Teaching Profile setup](https://linear.app/senoy/issue/SEN-56/conversational-teaching-profile-setup).
- [SEN-57 Generation failure and repair paths](https://linear.app/senoy/issue/SEN-57/generation-failure-and-repair-paths).

Applied outcome:

- The core POC exits at [SEN-45 Publish and complete one generated Course](https://linear.app/senoy/issue/SEN-45/publish-and-complete-one-generated-course): one non-fixture Course with one Reading and one Quiz, atomically published and completable to 2/2.
- Media and the drum Course are a separate follow-on POC, blocked by the core exit through [SEN-45 → SEN-47](https://linear.app/senoy/issue/SEN-47/seeded-demonstrative-media-catalog).
- [SEN-31](https://linear.app/senoy/issue/SEN-31/provision-provider-accounts) remains Done. It represents account and key provisioning for OpenRouter, Parallel, and You.com—not runtime implementation proof.
- [SEN-38](https://linear.app/senoy/issue/SEN-38/reading-lesson-play) is Done after implementation evidence and the green web TypeScript check were verified. The whole workspace is not green; that is SEN-54.
- [SEN-35](https://linear.app/senoy/issue/SEN-35/compose-course-request), [SEN-36](https://linear.app/senoy/issue/SEN-36/two-real-source-packs-for-one-lesson), [SEN-37](https://linear.app/senoy/issue/SEN-37/quiz-play-and-sequence-mode), and SEN-54 are Todo. No product issue is marked In Progress.
- [SEN-53](https://linear.app/senoy/issue/SEN-53/companion-avatar-collection) is Canceled, has no Project, and has no remaining relations.
- One concise reorganization summary comment was added to [SEN-30](https://linear.app/senoy/issue/SEN-30/reading-quiz-course-poc-coordination).

The original SEN-31–53 parent links to SEN-30 were kept as historical grouping. Projects and milestones now define execution phase and outcome. New tickets are not children of SEN-30.

## Executive verdict

The original audit’s central finding was correct: the roadmap had product decisions but no credible path to a generated Course. The reorganization replaces the horizontal/mega-ticket flow with a smaller proof:

1. finish the current fixture and workspace checks;
2. persist a Course Request and prove real providers;
3. approve a one-Reading/one-Quiz Blueprint;
4. generate a grounded Reading and playable Quiz;
5. publish atomically and complete the generated Course to 2/2;
6. harden only after that proof;
7. run media/drum work as a follow-on Project.

Four original audit claims were corrected:

1. **OpenRouter is intentional.** It is the model gateway for Generator and Judge model variety. Direct DeepSeek/OpenAI adapters are not required.
2. **SEN-31 is correctly Done.** It proved account provisioning. Real Parallel/You.com calls belong in SEN-36; real OpenRouter calls belong in SEN-39 and later model-backed tickets.
3. **Teaching Profile is not permanently closed UX.** SEN-33’s data contract remains useful and Done. SEN-56 owns a future streamlined, chat-like setup after core Course proof.
4. **Drum/media is a separate POC.** Reading and theory Quiz alone must not claim to teach or assess end-to-end playing performance.

## Sources of truth

- Product behavior: [`docs/spec.md`](spec.md).
- Domain terms: [`CONTEXT.md`](../CONTEXT.md).
- Execution status, acceptance, and dependencies: Linear Projects, milestones, and issues.
- Coordination and one-time source correction: [SEN-30](https://linear.app/senoy/issue/SEN-30/reading-quiz-course-poc-coordination).

The spec still contains stale direct-provider wording in §1 and §5.4. This task did not edit the spec. SEN-39 now explicitly owns the one-time reconciliation so the spec/config reflect OpenRouter without duplicating the decision across tickets.

## Final Linear organization

### Reading + Quiz Course POC

[Open Project](https://linear.app/senoy/project/reading-quiz-course-poc-a8c5ebb0d9f0)

**1 · Foundation and current fixture**

- Done: SEN-31, SEN-32, SEN-33, SEN-34, SEN-38, SEN-51.
- Todo: SEN-37 and SEN-54.

**2 · Request to approved Blueprint**

- Todo: SEN-35 and SEN-36.
- Backlog: SEN-39, SEN-41, SEN-42.

**3 · Generated Course proof**

- Backlog: SEN-30, SEN-43, SEN-44, SEN-45.
- SEN-45 is the core POC exit.

**4 · Post-proof hardening**

- Backlog: SEN-40, SEN-46, SEN-48, SEN-49, SEN-52, SEN-56, SEN-57.

### Media Course POC

[Open Project](https://linear.app/senoy/project/media-course-poc-aa17e818b4cd)

**1 · Media foundation**

- Backlog: SEN-47 and SEN-55.

**2 · Drum media proof**

- Backlog: SEN-50.

The Linear API exposed no Project-dependency field. The Project dependency is encoded once in the Media Project description and as the blocking relation SEN-45 → SEN-47.

### Current issue status

Across SEN-30 through SEN-57:

- Done: 6.
- Todo: 4.
- Backlog: 17.
- Canceled: 1.
- In Progress: 0.
- Total: 28.

Project placement:

- Reading + Quiz Course POC: 24.
- Media Course POC: 3.
- No Project: 1 canceled issue, SEN-53.

## Immediate execution frontier

The four Todo issues can proceed without pretending work has started:

1. [SEN-35 Compose Course Request](https://linear.app/senoy/issue/SEN-35/compose-course-request) — persist subject and Learning Goal; show unpublished Requests on Home.
2. [SEN-36 Two real Source packs for one Lesson](https://linear.app/senoy/issue/SEN-36/two-real-source-packs-for-one-lesson) — prove direct Parallel and You.com calls on one fixed Norse topic.
3. [SEN-37 Quiz play and Sequence mode](https://linear.app/senoy/issue/SEN-37/quiz-play-and-sequence-mode) — complete the existing fixture to 2/2 and provide the one Quiz player later generation reuses.
4. [SEN-54 Green workspace verification](https://linear.app/senoy/issue/SEN-54/green-workspace-verification) — add root `pnpm check`, fix TS5097 configuration, and add minimal smoke checks.

SEN-54 blocks only the core exit, SEN-45. It does not block account provisioning, independent UI work, research-adapter work, or model-adapter work.

## Final dependency order

Core generated Course:

- SEN-33 → SEN-35 → SEN-39 → SEN-41 → SEN-42.
- SEN-32 → SEN-36.
- SEN-36 + SEN-42 → SEN-43.
- SEN-38 → SEN-37.
- SEN-37 + SEN-43 → SEN-44.
- SEN-44 + SEN-54 → SEN-45.

Post-proof:

- SEN-45 → SEN-40 → SEN-57 → SEN-49.
- SEN-45 + SEN-49 → SEN-46.
- SEN-49 + SEN-55 → SEN-48.
- SEN-45 → SEN-52.
- SEN-45 → SEN-56.

Media:

- SEN-45 → SEN-47 → SEN-55 → SEN-50.
- SEN-55 also feeds SEN-48’s real-media requirement.

SEN-40 no longer blocks SEN-42. Durability follows the first generated Course. SEN-37 directly blocks SEN-44. Lesson reuse, media, visual polish, conversational Profile UX, and the broader proofs do not block SEN-45.

## Corrected provider ownership

### SEN-31 — account provisioning

[SEN-31](https://linear.app/senoy/issue/SEN-31/provision-provider-accounts) remains Done with its original assignee.

Its durable scope now says:

- OpenRouter account/key for Generator and Judge models.
- Parallel Pro direct account/key for Primary research.
- You.com direct account/key for Secondary research.
- Supabase/Postgres/media configuration.
- no runtime adapter or smoke-call proof.

### SEN-36 — research runtime proof

[SEN-36](https://linear.app/senoy/issue/SEN-36/two-real-source-packs-for-one-lesson) must make real direct calls to Parallel and You.com, return stable source IDs/excerpts/URLs/timestamps, apply one host-policy module, and record redacted latency/cost.

### SEN-39 and later — model runtime proof

[SEN-39](https://linear.app/senoy/issue/SEN-39/course-request-validity-outcomes) is the first model-backed implementation ticket. It owns one reusable OpenRouter transport behind domain Generator/Judge ports and one real structured call. SEN-41–44 reuse the same transport; they must not duplicate provider logic.

## Teaching Profile correction

[SEN-33](https://linear.app/senoy/issue/SEN-33/teaching-profile-questionnaire) stays Done. The existing eight-field data contract, defaults, provenance, edit/reassess, and Reset behavior remain valid.

[SEN-56](https://linear.app/senoy/issue/SEN-56/conversational-teaching-profile-setup) is the future UX enhancement. It should collect the same supported facts and preferences through a short guided conversation rather than a monotonous questionnaire. It is blocked by SEN-45 and does not reopen SEN-33.

## Media and competence boundaries

[SEN-43](https://linear.app/senoy/issue/SEN-43/one-grounded-reading-lesson-to-checkpoint) now excludes Demonstrative media. It proves a grounded Reading with real Source packs, OpenRouter generation, citations, checks, Judge, and an unpublished checkpoint.

Media has a separate home:

- [SEN-47 Seeded demonstrative media catalog](https://linear.app/senoy/issue/SEN-47/seeded-demonstrative-media-catalog).
- [SEN-55 Demonstrative media vertical slice](https://linear.app/senoy/issue/SEN-55/demonstrative-media-vertical-slice).
- [SEN-50 Media POC: drum learning and practice support](https://linear.app/senoy/issue/SEN-50/media-poc-drum-learning-and-practice-support).

SEN-50’s claim is intentionally narrow: the app teaches rhythm/notation knowledge and supports offline practice with licensed media and materials. Quizzes assess knowledge only. The ticket cannot claim that the app taught or assessed playing “Iris” end to end.

[SEN-49 Norse mythology content proof](https://linear.app/senoy/issue/SEN-49/norse-mythology-content-proof) is the cheapest first broader Reading + Quiz content proof and is not blocked by media.

[SEN-48 Microbiology knowledge and safety preparation proof](https://linear.app/senoy/issue/SEN-48/microbiology-knowledge-and-safety-preparation-proof) follows Norse plus the media slice. It must not claim sterile technique, microscopy skill, or wet-lab competence.

## Ticket-by-ticket final disposition

### Coordination and completed foundation

- **SEN-30 — rewritten, Backlog.** Outcome/coordination only; tied to the core Project; no duplicated child criteria.
- **SEN-31 — rewritten, Done.** Account provisioning for OpenRouter + Parallel + You.com.
- **SEN-32 — Done.** Core Project, foundation milestone.
- **SEN-33 — Done.** Data contract retained; conversational UX moved to SEN-56.
- **SEN-34 — Done.** Fixture published Course and Study chrome retained.
- **SEN-38 — verified and moved to Done.** Acceptance boxes checked; original assignee preserved.
- **SEN-51 — rewritten as resolved, Done.** Knibbler decision recorded without avatar dependency.

### Actionable now

- **SEN-35 — Todo.** Compose and persist Course Request.
- **SEN-36 — rewritten, Todo.** Two real Source packs from direct research vendors.
- **SEN-37 — Todo.** Fixture Quiz play/Sequence mode; now blocks SEN-44.
- **SEN-54 — created, Todo.** Green workspace verification.

### Request to generated Course

- **SEN-39 — rewritten, Backlog.** Learner-visible validity outcomes plus reusable OpenRouter transport.
- **SEN-41 — rewritten, Backlog.** One real judged Starting Level happy path.
- **SEN-42 — rewritten, Backlog.** Approve exactly one Reading + one Quiz Blueprint; no durability blocker.
- **SEN-43 — rewritten, Backlog.** One grounded Reading checkpoint; no media/reuse/recovery bundle.
- **SEN-44 — rewritten, Backlog.** Generated Quiz uses the existing player.
- **SEN-45 — rewritten, Backlog.** Exact core exit: non-fixture Course, atomic publish, 2/2.

### Deferred after core proof

- **SEN-40 — rewritten, Backlog.** Durable worker on real stages; no fake stage.
- **SEN-46 — rewritten, Backlog.** Lesson reuse after SEN-45 and SEN-49; blocks no POC exit.
- **SEN-48 — rewritten, Backlog.** Microbiology knowledge/safety preparation, not practical competence.
- **SEN-49 — rewritten, Backlog.** First broader Norse content proof.
- **SEN-52 — rewritten, Backlog.** Bounded functional Knibbler pass; no generated card images or avatars.
- **SEN-56 — created, Backlog.** Conversational Teaching Profile setup.
- **SEN-57 — created, Backlog.** Recovery, repair, structural return, Retry, and Revise.

### Follow-on media POC

- **SEN-47 — rewritten and moved, Backlog.** Seeded licensed catalog after SEN-45.
- **SEN-55 — created, Backlog.** Smallest media vertical slice.
- **SEN-50 — rewritten and moved, Backlog.** Honest media-supported drum learning/practice proof.

### Canceled

- **SEN-53 — Canceled.** No Project and no relations. Its original description remains beneath a cancellation note to preserve history.

## Exact applied change log

### Projects and milestones

- Projects created: 2.
- Milestones created: 6.
- Milestones renamed with numeric phase prefixes because the API exposes milestone creation/update but not sort-order mutation.

### Issues

- Issues created: 4 — SEN-54, SEN-55, SEN-56, SEN-57.
- Existing issues fully rewritten: 17 — SEN-30, SEN-31, SEN-36, and SEN-39 through SEN-52.
- Existing issues patched: 2 — SEN-38 acceptance boxes; SEN-53 cancellation note.
- Status changes: 5 — SEN-35, SEN-36, SEN-37 to Todo; SEN-38 to Done; SEN-53 to Canceled.
- Existing issue Project/milestone placements added: 23.
- New issue Project/milestone placements: 4.
- Assignees changed: 0.
- Issues deleted or archived: 0.
- Comments added: 1, on SEN-30.

### Blocking relations added

14 blocking relations were added:

- SEN-37 → SEN-44.
- SEN-54 → SEN-45.
- SEN-45 → SEN-40, SEN-46, SEN-47, SEN-52, SEN-56.
- SEN-40 → SEN-57.
- SEN-57 → SEN-49.
- SEN-49 → SEN-46 and SEN-48.
- SEN-47 → SEN-55.
- SEN-55 → SEN-48 and SEN-50.

### Blocking relations removed

15 blocking relations were removed:

- SEN-32 → SEN-47.
- SEN-34 → SEN-46.
- SEN-35 → SEN-40.
- SEN-37 → SEN-45, SEN-48, SEN-49, SEN-50.
- SEN-40 → SEN-42.
- SEN-43 → SEN-46.
- SEN-45 → SEN-48, SEN-49, SEN-50.
- SEN-47 → SEN-48, SEN-49, SEN-50.

### Non-blocking relations

- Removed both historical Related links from SEN-53: SEN-51 and SEN-52.
- Linear created 11 non-blocking Related links from durable cross-issue references in the rewritten descriptions: SEN-30/SEN-56, SEN-31/SEN-36, SEN-33/SEN-56, SEN-41/SEN-57, SEN-42/SEN-57, SEN-43/SEN-55, SEN-43/SEN-57, SEN-44/SEN-57, SEN-45/SEN-49, SEN-45/SEN-50, and SEN-45/SEN-55.

## Current code evidence

The original audit’s code findings still matter:

- Course Request compose remains a placeholder.
- The worker does not implement generation.
- No product Generator, Judge, or Source-pack adapter exists yet.
- The fixture Reading body, citations, renderer registration, section pacing, completion API, and monotonic completion write exist.
- Web TypeScript passes: `pnpm --filter @senoy/web exec tsc --noEmit`.
- API, database, and worker TypeScript currently fail with TS5097 because `.ts` import paths are used without the matching TypeScript configuration.
- There is no root `pnpm check` yet.

No provider call was run during this roadmap task, and no product code was changed.

## Historical audit value

The pre-application audit correctly identified:

- one-session vertical slices were promised but horizontal adapters and large integration batches were created;
- the fixture demo visibly stopped at 1/2;
- the Course-generation core did not exist;
- SEN-40 blocked useful Blueprint work with a disposable stub stage;
- SEN-43 and SEN-45 bundled too many independent risks;
- media, repair, reuse, and visual scope were ordered before the central product loop was proven.

Useful historical evidence remains in:

- [Spec form Wayfinder session](c2accbc7-0fe6-4bb4-b76b-aabcd6542a06).
- [Spec creation and map handoff](79b4da83-c6ce-4f42-9d11-89f00535e99c).
- [Implementation ticket cutting](4434cf81-9d1e-461b-87dd-dc11ce154e10).
- [SEN-38 implementation session](841018ba-4f21-4792-a4bc-ca4335d50bd4).

The corrected roadmap keeps that evidence but no longer treats OpenRouter as a contradiction, SEN-31 as incomplete, the Teaching Profile questionnaire as permanent UX, or the drum Course as part of the first Reading + Quiz proof.

## API limitations and safe alternatives

- The Linear API exposed no Project dependency field. SEN-45 → SEN-47 and the Media Project description encode the dependency.
- The milestone API exposed no sort-order field. Numeric milestone names make phase order explicit even if Linear displays creation order.
- The task did not edit `docs/spec.md`; SEN-39 owns the one-time provider-transport reconciliation.
- Existing SEN-31–53 parent links were preserved for history instead of performing a broad hierarchy rewrite. Project/milestone placement is the execution grouping.

## Next actions

1. Complete SEN-35, SEN-36, SEN-37, and SEN-54 from Todo.
2. Continue SEN-35 → SEN-39 → SEN-41 → SEN-42.
3. Join that path with SEN-36 at SEN-43.
4. Complete SEN-37 + SEN-43 → SEN-44.
5. Exit the core POC at SEN-44 + SEN-54 → SEN-45.
6. Only then begin durability/recovery, formal content proofs, visual polish, conversational Teaching Profile UX, and the separate Media Course POC.

The execution rule remains: each ticket must end in a visible product artifact or a risky real integration proven against the intended service.
