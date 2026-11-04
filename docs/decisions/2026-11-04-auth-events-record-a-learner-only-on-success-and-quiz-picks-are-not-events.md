---
date: 2026-11-04
tickets: SEN-127, SEN-74
people: Yarden
status: active
---

# An auth event names a Learner only when it succeeds, opening a Course is an event, a Quiz pick is not, and Blueprint revise records blueprint_rejected

**Why:** SEN-127 gives every Learner action a product event, and four cases needed a call.

**Auth before an account exists.** Sign-up, sign-in, sign-in with an email code and setting a password record the Learner when they succeed. A failed sign-in, forgot password and resend verification record `learnerId = null`, and `detail` holds only the outcome. We turned down looking up the account by email to fill in the Learner on a failure. It would show who struggles to sign in, but it adds a lookup to every auth route and links attempts to an account for anyone who types that email. The cost: the feed cannot tell one failing Learner from many. No email address or password is ever stored in `detail`.

**Opening a Course or Request is an event** (`library_item_opened`). We turned down a counter only. `glossary_term_opened` and `course_words_opened` are already one event per open, so this kind is no noisier than those. It costs the most rows of any kind in the feed.

**Saving a Quiz answer is not an event.** The app saves on every pick, and `quiz_submitted` already holds the final answers. Checking an answer and retaking a Quiz are events. The cost: the feed cannot show a Learner changing their mind before they check.

**Blueprint revise records `blueprint_rejected`.** Marking Lessons irrelevant and asking for a new Blueprint is the reject, so the kind that was listed but never recorded now has a caller. We turned down removing it and adding `blueprint_revised`, because that renames a kind the console glossary already explains.
