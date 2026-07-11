# Service Planning Operating Manual

*A working playbook for planning services and products that survive contact with reality. Written as a handover from a senior planner to a capable but less experienced one — human or model. Read it linearly once; after that, use it as a pre-flight reference. The sections follow the natural order of planning work, but real work loops: expect Section 10 to send you back to Section 1.*

## How to use this manual

Every section below has three parts: a **procedure** (do this, in this order), a **worked example** (a good approach next to the common mistake), and **what it prevents** (the specific failure you are buying insurance against). The procedures are deliberately opinionated. Where your situation genuinely differs, deviate — but write down why, because "we skipped step 4" is the first line of most post-mortems.

**If you are a model using this manual**, four standing rules:

1. Never fabricate user evidence. If you have not seen interviews, analytics, or reviews, say so and label the claim as an assumption.
2. Tag every important claim in your output as EVIDENCE (with source) or ASSUMPTION (with a proposed test). This distinction is the backbone of the whole manual.
3. When you cannot run a real-world step (interviewing users, using a competitor's product), produce the artifact that enables it instead: the interview guide, the falsifiable prediction, the test design with pass/fail thresholds.
4. End every plan or proposal by answering the 8-question checklist at the bottom of this manual, explicitly.

## Operating principles (read twice)

1. **Users are experts in their problems and amateurs in solutions.** Take the problem seriously; treat any proposed solution as a clue, not a spec.
2. **Every plan is a stack of guesses.** Your job is to rank the guesses by lethality and test the deadly ones cheapest-first.
3. **Behavior beats opinion.** What people do — and especially what they pay or sacrifice for — outweighs anything they say.
4. **Write to decide, not to describe.** A document that changes no decision is decoration.
5. **Scope is defined by what you refuse.** The non-goals section is where discipline lives.
6. **"Later" is a real place.** Most good ideas belong there.
7. **If you cannot say who it is for, it is for no one.**

---

## 1. Understanding the real problem, not the stated request

Everything downstream inherits the quality of this step. A brilliant execution of the wrong problem is indistinguishable, in outcome, from a bad execution.

### Procedure

1. **Record the request verbatim.** Do not paraphrase yet; paraphrasing this early smuggles in your interpretation.
2. **Classify the phrasing.** Is it a solution ("add Excel export"), a complaint ("this is slow"), or a goal ("I want to close the books faster")? Most requests arrive dressed as solutions.
3. **Recover the underlying job.** For solution-phrased requests, ask or infer, then verify: What would you do with that? What happens right after? What triggers the need? Ladder upward ("why does that matter?") until you reach an outcome the user cares about for its own sake — usually 2–4 levels up.
4. **Find the workaround.** "How do you handle this today?" The workaround tells you three things: the problem is real (people only work around pains that matter), who your true competitor is, and the minimum bar you must beat.
5. **Size the pain.** Frequency × intensity × who feels it. Note whether the pain lands on the user, the buyer, or a bystander stakeholder — these diverge constantly in B2B and the plan must say which one it serves.
6. **Hunt latent needs.** Listen for "of course we do that manually," shadow spreadsheets, and the emotional/social layer (fear of looking incompetent to a boss, dread of a monthly ritual). Users do not volunteer needs they have normalized.
7. **Write the problem statement in this exact shape:** "[Specific user] in [situation], when [trigger], needs to [job/outcome], but [obstacle], which costs them [time / money / risk / emotion]." Solution words are banned from this sentence.
8. **Play it back** to users or the requester. You are listening for "yes — exactly" versus the polite nod. Only the first one counts.

### Example

**Good:** Customers of a B2B tool keep requesting "export to Excel." Interviews reveal the export gets emailed every Friday to a VP who refuses to log in. The real job is "my boss stops chasing me for status." The winning feature is a scheduled stakeholder digest — smaller to build than a full export engine, and it puts the product's name in the VP's inbox weekly, which later shows up in renewal rates.

**Common mistake:** Building the Excel export exactly as requested. It ships in six weeks, gets 4% adoption, the VP still pings people on Slack, and the roadmap has lost six weeks — while the team congratulates itself on being "customer-driven."

### What this prevents

The feature-factory failure: a team that faithfully ships requests and still loses accounts, because it solved the phrasing instead of the problem. Also prevents optimizing for the loudest requester instead of the paying segment, and the slow accumulation of orphan features that make the product harder to learn.

---

## 2. Defining the service concept and unique value proposition

A concept is not a description of the product. It is a compressed decision about who you serve, on what job, against which alternative, with what edge. If the compression fails, every later decision reopens this one.

### Procedure

1. **Choose a beachhead user, narrowly.** "SMB owners" is not a target. "Solo accountants handling 20–60 clients through tax season" is. Test: you can name where these people gather and quote, verbatim, what they say about the pain.
2. **Define the before/after.** What does the target's life look like the day before adopting you, and 30 days after? The delta is your value; if you cannot articulate the delta, you have a feature, not a concept.
3. **Draft the positioning statement:** "For [target] who [situation/need], [name] is a [category] that [key outcome]. Unlike [the primary alternative they use today], it [single sharpest differentiator]." Every blank must be specific. "Unlike other tools, it's easier to use" is an empty differentiator — everyone claims it.
4. **Compress to one sentence a stranger can repeat back** after hearing it once. If they can't repeat it, it is not yet a concept; it is a paragraph with ambitions.
5. **Name the hero capability** — the one thing you would show in a 30-second demo that makes the target lean forward. Products that work have one. Grab-bags don't.
6. **Run the alternatives test.** List everything the target uses today, including "nothing / suffers quietly / a spreadsheet." Your UVP must be dramatically better on the one dimension the target cares about most — not marginally better on five. Rule of thumb: switching happens when the perceived gain feels 3–10x on the axis that matters, because switching costs are real and defended emotionally.
7. **Stress-test with three questions.** Why now (what changed in technology, behavior, or regulation that makes this possible or urgent)? Why us (what do we have that others structurally don't)? Why switch (see step 6)? Weak answers to all three mean a weak concept, regardless of how the deck looks.

### Example

**Good:** "For freelance designers who lose hours chasing overdue invoices, PaidFast is a billing tool that automatically escalates follow-ups and gets you paid about 12 days faster. Unlike generic invoicing apps, it optimizes for collection, not invoice creation." A target, a quantified outcome, a named alternative, a single differentiator you can build a roadmap around.

**Common mistake:** "An all-in-one, AI-powered platform for freelancers to manage their business smarter." Nobody specific, nothing measurable, differentiated from nothing. Marketing cannot write a headline, engineering cannot tell what is core, and sales cannot answer "compared to what?" — so each invents their own answer, and the product becomes the average of four private strategies.

### What this prevents

Positioning mush, which surfaces later as scattershot roadmaps, unconvertible landing pages, and internal debates that never terminate because there is no agreed concept to appeal to. Also prevents the "better at everything for everyone" strategy, which is the strategy of choosing nothing.

---

## 3. Mapping the user journey and finding the moments of truth

A journey map is a decision-generating instrument, not a poster. Its output is a ranked list of pains at the moments where the product is won or lost.

### Procedure

1. **Pick ONE persona and ONE end-to-end scenario.** Journey maps die from averaging several personas into one fictional user whose journey nobody actually takes.
2. **Start the map before your product and end after it.** Typical spine: trigger event → search/evaluation → signup and onboarding → first value → habitual use → expansion or advocacy → decay and exit. The stages outside your product (how the need arises; what happens at renewal) are where most plans are blind.
3. **For each stage record five things:** the user's goal, their concrete actions, the touchpoints, their emotional state, and — critically — the evidence source (analytics, interviews, support tickets, or the honest word "ASSUMED").
4. **Mark the moments of truth:** (a) the first-value moment — the "aha"; (b) the first real friction — imports, integrations, inviting teammates; (c) the first payment decision; (d) the first failure — a bug, a wrong output, a missed expectation; (e) the habit trigger — what would bring them back on an ordinary Tuesday. These five points determine more of your outcome than everything else combined.
5. **Quantify drop-off where data exists; leave visible holes where it doesn't.** An honest journey map has gaps labeled ASSUMED. A map with no gaps was made up.
6. **Compute time-to-first-value,** then design the shortest defensible path to it. Every step between signup and first value is guilty until proven necessary.
7. **Convert to decisions.** The top three pains at moments of truth become explicit requirements or backlog items, each referencing its journey stage. A mapping exercise that produces zero backlog items was a drawing class.

### Example

**Good:** Mapping a data-analytics tool's journey against real funnel data exposes that 70% of trial users never complete the database-connection step — they churn before ever running a query. Priority flips from "more chart types" to a guided connection wizard plus a bundled sample dataset that delivers first value in ninety seconds. Activation rises 18 points.

**Common mistake:** A beautiful journey poster with emotion emojis for a composite persona, produced in a two-day workshop, validated with nobody, admired in Miro, referenced never. Meanwhile the actual funnel leaks at a step the poster doesn't even show — the verification email lands in spam.

### What this prevents

Polishing the interior of a house nobody can enter: deep-product investment while onboarding hemorrhages users. Also prevents journey mapping as theater — a week of workshop time that changes no decision — and the subtler failure of designing for an average user who does not exist.

---

## 4. Breaking a service idea into core, supporting, and nice-to-have features

Classification is not about excitement. It is about whether the user's job survives the feature's absence.

### Procedure

1. **Derive candidates from the job and the moments of truth,** not from a brainstorm. Brainstormed ideas may enter, but only after passing the tests below.
2. **Core test:** "If we cut this, can the target user still complete the primary job end-to-end, and does the one-sentence concept remain true?" If either fails, it is core. Core is defined by the job, never by what demos well.
3. **Supporting test:** "Does this make the core reliable, trustworthy, or usable for the beachhead segment?" Authentication, error and empty states, undo, notifications, basic settings — the unglamorous glue. Not optional at launch, but not the point of the product.
4. **Nice-to-have test:** "Does this delight some users or add efficiency, while the product survives launch without it?" Themes, power-user shortcuts, secondary integrations. These live happily in "later."
5. **Hunt the invisible core.** Data import and migration, permissions, offline and failure behavior, rate limits, admin controls, localization if the beachhead demands it. These sink launches precisely because nobody puts them on slides. List them explicitly under core or supporting.
6. **Write each surviving feature as one line:** "[User], when [trigger], can [action], so that [outcome]." A feature that cannot be written this way is either decoration or not yet understood — send it back to Section 1.
7. **Map dependencies,** technical and experiential, so that sequencing in Section 5 is honest rather than aspirational.

### Example

**Good:** An invoicing tool. Core: create and send an invoice, accept payment, see payment status. Supporting: automatic reminders, receipts, tax fields, failed-payment handling. Nice-to-have: branded templates, multi-currency (the beachhead is domestic freelancers). Unsexy "payment status" is core because the job is *get paid*, not *make PDFs*.

**Common mistake:** Classifying "AI invoice assistant" as core because it demos brilliantly, while payment-status tracking slips to phase 2. Users create gorgeous invoices, cannot tell who has paid, and quietly return to their spreadsheet. Exciting is not the same as core, and the market bills you for the difference.

### What this prevents

The demo-ware MVP — impressive in the pitch meeting, unable to complete the user's actual job — and its mirror-image failure, a v1 stuffed with nice-to-haves that ships two quarters late into a market that has moved.

---

## 5. Prioritizing features

A prioritization framework is a machine for structuring disagreement, not for computing truth. The moment people believe the spreadsheet decides, they start gaming the spreadsheet.

### Procedure

1. **Pick one scoring frame and hold it for the cycle** — RICE (Reach, Impact, Confidence, Effort) or a Value × Confidence ÷ Effort variant. Its job is to expose where people disagree and why.
2. **Score user value with an evidence hierarchy:** observed behavior and data > direct user statements > internal opinion. Write the evidence tier next to every score. A "5" backed by opinion is not the same number as a "5" backed by funnel data.
3. **Score business impact against the current primary goal** — this quarter's North Star input — not against all conceivable goodness. A feature that is great for a goal you are not pursuing this quarter scores low this quarter.
4. **Get effort from the people who will build it,** as ranges (best / likely / worst). Flag any estimate produced without an engineer in the room, and revisit it before it drives a decision.
5. **Apply the confidence discount:** a high-value, low-confidence item's next step is a validation task (Sections 6 and 10), not a build slot. This single rule prevents most roadmap disasters.
6. **Sequence with two lenses the score cannot see:** dependency order, and learning value — sometimes the correct next build is the one that retires the scariest assumption, even if it scores second.
7. **Publish the ranked list AND the not-now list,** each not-now item with a one-line reason. The not-now list is your scope-creep vaccine and your stakeholder-alignment tool; it converts "you ignored my idea" into "we deferred it for this stated reason."
8. **Re-score on a fixed cadence or when evidence materially changes** — not whenever someone senior has a strong feeling. When an executive override happens (it will), record it in the decision log as an explicit strategic bet. Overrides in daylight are legitimate; silently editing scores teaches everyone the process is fake.

### Example

**Good:** Two features score nearly identically. One of them would also validate the riskiest assumption in the plan — that users will connect their bank account. It goes first. Two weeks later the assumption fails in a cheap test, redirecting a full quarter of build effort before it is spent.

**Common mistake:** Prioritization theater. The team runs RICE diligently; then the founder's pet feature jumps the queue with no explanation — twice. By the third cycle, engineers sandbag effort estimates and PMs inflate impact scores, because everyone has learned the numbers are decoration. The framework now actively produces worse decisions than no framework.

### What this prevents

Quarters consumed by high-polish, low-impact work; roadmap whiplash every time a stakeholder gets excited; and the slow institutional rot in which planning becomes a ritual nobody believes in but everyone performs.

---

## 6. Surfacing risks, assumptions, and unknowns early — and planning their validation

The most expensive sentence in product work is "we'll find out after launch." Assumptions are allowed to exist untested — but only visibly, as accepted bets, never by omission.

### Procedure

1. **Extract assumptions by walking four categories** over the draft concept and core scope: desirability (will they want it), viability (will it sustain a business), feasibility (can we build and operate it), usability (can the target actually use it).
2. **Rewrite each as a falsifiable statement with a number.** Not "users will love onboarding" but "at least 40% of new signups complete setup within 24 hours without human help." If you cannot attach a number, you have not finished thinking.
3. **Rate each on impact-if-wrong × current evidence.** The deadly quadrant is high-impact, low-evidence. Everything in it needs a plan; everything outside it needs, at most, a note.
4. **Name the leap-of-faith assumption** — the single belief that, if false, kills the plan regardless of everything else going right. There is almost always exactly one, occasionally two. Write it in the document in plain words.
5. **Match each deadly assumption to the cheapest sufficient test** (method menu in Section 10): interview < landing page / fake door < concierge / Wizard-of-Oz < clickable prototype < scoped MVP. "Sufficient" means it produces behavioral evidence when behavior is what's in doubt — opinions cannot validate a behavioral assumption at any sample size.
6. **Set pass/fail thresholds before running the test, in writing.** Deciding what counts as success after seeing the results is how teams launder failure into "learnings."
7. **Timebox each test, assign an owner, and log outcomes plus the resulting decision** in a running decision log. An assumption register that never changes a decision is a spreadsheet, not a practice.

### Example

**Good:** A restaurant-menu SaaS rests on the assumption that owners will update menus weekly. Before building the CMS, the team runs ten concierge accounts — updating menus by hand from WhatsApp photos. Result: owners send updates monthly at best, and only when nagged. The plan pivots to POS-integrated auto-sync before a single line of CMS code exists. Cost of learning: two weeks and some manual labor.

**Common mistake:** "We'll validate after launch." Six months of building later, launch reveals the core assumption false. The post-mortem discovers that three team members privately doubted it from week one — there was simply no ritual that forced the doubt onto paper where it could be tested.

### What this prevents

The classic product death: building the entire product to test the first assumption. Plus the quieter failure mode where known risks live only in people's heads, surface as "I always thought so" after the damage, and poison trust.

---

## 7. Weaving business viability into the plan (monetization, costs, scalability, retention)

Business model questions answered "later" are answered by default — and the defaults are usually wrong. Pricing and packaging change what you build, so they belong in planning, not in a launch-week scramble.

### Procedure

1. **Identify the money triangle:** who uses it, who pays for it, who approves the purchase. In consumer products they merge; in B2B they rarely do, and each corner needs something from your plan (the user needs value, the buyer needs ROI language, the approver needs risk cover).
2. **Choose the value metric** — the unit in which customers feel value: seats, documents processed, revenue collected, projects shipped. Price along that metric so the bill grows when delivered value grows. A misaligned metric (per-seat pricing on a product whose value doesn't scale with seats) either caps revenue or breeds resentment.
3. **Sketch the monetization model now,** even roughly: subscription, usage, transaction take, freemium. Decide where the free/paid boundary sits relative to the journey: free must reach the first-value moment (or nobody converts), paid should gate habitual or scaling value (or nobody needs to pay).
4. **Do napkin unit economics.** A plausible price anchored to willingness-to-pay evidence or the cost of alternatives; a rough acquisition-cost guess per channel; and — increasingly decisive — variable serving cost per user (API and inference spend, storage, human support minutes). A product whose marginal cost scales with usage while revenue does not is a subsidy program with a logo.
5. **Classify costs:** fixed versus variable; which grow with users versus with revenue. Flag anything manual in the loop — onboarding calls, content review, data cleanup. That manual step is your bottleneck at 10x, and the plan should say whether you automate it, price it, or accept it.
6. **Design retention mechanics into scope, not as a later growth hack.** What is the natural trigger frequency of the underlying job? What accumulates — data, history, integrations, teammates — to make leaving legitimately costly? A product with no accumulation and a monthly trigger is a churn machine, and no re-engagement email campaign will save it.
7. **Record pricing and packaging implications for the feature tiers in the plan itself,** because tier boundaries change the build: usage metering, plan gating, and admin seats are engineering work that must be scoped like any other core feature.

### Example

**Good:** Planning a document-AI tool, the team sets the value metric to documents processed, drafts usage tiers, caps free at 20 documents a month — comfortably above first value, just below habitual use — and models inference cost per document so gross margin per tier is known before build. Metering lands in core scope, not as a post-launch retrofit.

**Common mistake:** "Monetize later." The product habituates 50,000 users as free; the retrofit paywall gates a moment users had come to consider theirs; conversion lands at 0.8% and community sentiment tanks. Bonus failure: nobody built usage metering, so even launching pricing takes an extra quarter.

### What this prevents

Growth that cannot become a business; paywalls placed on the wrong side of the value moment; and margin surprises — especially AI serving costs — discovered only when finance escalates. Also prevents the per-seat-by-default reflex that quietly mismatches price to value.

---

## 8. Competitive analysis and finding real differentiation

The goal is not a features matrix. It is an honest answer to one question: why would a specific person leave what they use today — including "nothing" — for you, and does that reason survive being copied?

### Procedure

1. **Define competitors from the user's point of view, in three rings:** direct (same category), indirect (different tool, same job — spreadsheets, email, an agency, an intern), and non-consumption (they simply endure the pain). Ring three is usually the largest and the most ignored.
2. **Actually use the top alternatives.** Sign up, complete the core job, take notes and screenshots. A hands-on teardown beats matrix guessing every time, and it is the fastest way to calibrate your own product's bar.
3. **Mine public complaints:** app-store reviews, G2/Capterra, Reddit, support forums. Cluster the recurring complaints — each cluster is a candidate wedge. Recurring praise tells you what *not* to fight the incumbent on.
4. **Compare on jobs, not features.** For each key job, grade each alternative on outcome quality, speed, and effort. Feature checklists flatter incumbents (they have everything) and mislead you (a checkmark says nothing about whether it's any good).
5. **Sort your potential edges:** structural (distribution channel, proprietary data, cost structure, position in the workflow, network effects) versus copyable (features, UI polish). Build the strategy on structural edges where you can; copyable edges are one-to-two-quarter head starts, not moats.
6. **Choose one differentiation axis and commit:** meaningfully better on one job, meaningfully cheaper, or meaningfully different — serving a segment the incumbent structurally cannot prioritize without damaging its main business. That last one is the most durable wedge available to a small player.
7. **Write the switch story:** what triggers a user to leave the incumbent, what switching costs them (data, retraining, integrations), and how you neutralize that cost (importers, migration concierge, a coexistence mode). Then war-game the response: if the incumbent copies your headline feature in six months, what remains? If the answer is "nothing," return to step 5 before writing another slide.

### Example

**Good:** A teardown plus review mining on a project-management incumbent shows genuine power — and small-team reviews screaming "it took us three weeks to set up." The wedge: "productive in ten minutes for teams under twenty," shipped with a one-click importer from the incumbent. The edge is structural: the incumbent cannot radically simplify without breaking the enterprise workflows its revenue depends on.

**Common mistake:** A comparison matrix in which the unlaunched product has every checkmark and the rivals have gaps — self-hypnosis in table form. The differentiation rests on two features the incumbent ships eight months later, and the positioning evaporates with one competitor release note.

### What this prevents

"Slightly better X" products that give users no reason to endure switching costs; being blindsided by the real competitor (the spreadsheet, or apathy); and moat-free strategies that die on the incumbent's next keynote.

---

## 9. Structuring and documenting the service plan

A plan document has one job: to make the same picture appear in every reader's head, and to force a decision. Everything about its structure serves those two outcomes.

### Procedure

1. **Decide the document's decision before writing it.** What is the reader being asked to approve, fund, or build? Put that ask in the first five lines. A document that is "just for context" will be read that way — that is, not.
2. **Use a standard skeleton** so readers navigate on autopilot:
   - TL;DR — problem, solution, the ask (five lines maximum)
   - Problem and evidence (from Section 1, with evidence tiers marked)
   - Concept and UVP (from Section 2)
   - Target user and journey summary, with moments of truth (Section 3)
   - Scope: core / supporting / later — and explicit **non-goals** (Section 4)
   - Key flows, as diagrams
   - Metrics and success criteria (see step 4 below)
   - Risks, assumptions, and the validation plan (Section 6)
   - Rollout sequence and milestones
   - Open questions, and the decision log
3. **Write the one-pager first and circulate it.** Expand only the sections that attract questions — the questions tell you where risk and disagreement actually live, which is far cheaper than guessing.
4. **Build the metric tree:** North Star → two to four input metrics → the specific levers this plan moves. Every success criterion carries three attributes: a number, a timeframe, and a measurement source. Missing any one of the three, it is a wish, not a criterion.
5. **Give non-goals a full section, with reasons.** "Not doing multi-currency in v1: the beachhead is domestic; revisit when international signups exceed 15%." This is the single highest-leverage section in the document for preventing scope creep and re-litigation.
6. **Match medium to content:** flows and states as diagrams, rationale as prose, comparisons as tables. A wall of prose describing a flow usually means the author never drew it — and often never fully understood it.
7. **Version and date the document, and keep the decision log inside it:** what was decided, when, by whom, on what evidence. Six months later, this log is the only defense against "why on earth did we…" archaeology.
8. **Run the two-reader test before publishing:** a newly joined engineer can identify what to build first without asking anyone; an executive can state, from the TL;DR alone, what is being requested. Fail either test — rewrite, don't append.

### Example

**Good:** "Success: 40% of new signups create and send their first invoice within 24 hours, measured via the first_invoice_sent event in Amplitude, evaluated over the four weeks post-launch. Guardrail: support tickets per signup rise no more than 10%." Number, timeframe, source, and a guardrail against winning the metric while losing the product.

**Common mistake:** "Success: improved engagement and user satisfaction." Unmeasurable, unfalsifiable, undated. Launch happens, opinions differ, the loudest voice in the retro defines history, and the next plan inherits nothing.

### What this prevents

Write-only documents; three teams building three different products from one spec; post-launch success debates that no one can win; and organizational amnesia, where the same argument is re-fought quarterly because nobody wrote down why it was settled.

---

## 10. Planning validation and interpreting feedback

Most validation failures are not measurement errors. They are category errors — asking a method a question it cannot answer, then believing the answer.

### Procedure

1. **Match the method to the question.** This mapping is most of the skill:
   - *Does the problem exist and matter?* → discovery interviews about past behavior; field observation.
   - *Is there demand for this solution?* → landing page / fake door / waitlist — where the conversion action is costly. An email address is weak evidence; a deposit, a booked call, or an uploaded dataset is strong.
   - *Does the solution actually deliver value?* → concierge or Wizard-of-Oz: deliver the outcome manually before building the machine.
   - *Can the target operate it?* → task-based prototype tests, about five users per round.
   - *Will they keep using it, and pay?* → a scoped MVP or paid pilot; only real usage over weeks answers retention. Nothing else does.
   - *How big, how much, how often?* → surveys — and only for quantifying things already discovered qualitatively. Surveys discover nothing.
2. **Interview with discipline** (the Mom Test rules): ask about the last time the problem occurred, what it cost, what they tried; never pitch; never ask "would you use / pay for X" — people are polite and terrible at predicting themselves. Five to eight interviews per segment per round; patterns stabilize surprisingly fast.
3. **Make prototype tests task-based:** "You need to send an invoice to a new client — go ahead." Count completion, errors, time, and hesitation points. "Do you like it?" is banned; everyone likes things in front of the person who made them.
4. **Scope the MVP around the leap-of-faith assumption, not around "a smaller product."** Often the true MVP isn't software at all: a concierge service, a spreadsheet plus a human, a manual back office behind a real front door.
5. **Interpret with the evidence hierarchy:** behavior (came back, integrated it into their workflow) > sacrifice (paid, prepaid, spent an hour, staked reputation on an intro) > opinion (words). Compliments carry zero evidential weight. Feature requests are data about problems — decompose them through Section 1; never transcribe them into the backlog.
6. **Guard against self-deception:** pre-registered pass/fail thresholds (Section 6); deliberately seek disconfirming users — people who tried the product and stopped; and separate signal (a pattern across independent users) from anecdote (one vivid, loud user, who is suspiciously often the founder's friend).
7. **Close every round with an explicit, logged decision:** persevere, adjust, or kill — plus the single question the next round must answer. Research that ends in "interesting!" and no decision was entertainment.

### Example

**Good:** A fake-door test: 50 of 400 visitors click "Start free"; 18 of those book an onboarding call; 8 prepay a discounted pilot. Interviews with the 32 who clicked but didn't book surface one missing integration, repeatedly. Decision logged: run the pilot for the 8, promote the integration to the top of the validation list, and set the next round's pass bar in writing.

**Common mistake:** "Everyone I demoed to loved it." Twelve enthusiastic conversations; zero asked for a follow-up; zero prepaid. Launch lands to silence. Politeness was recorded as demand because no sacrifice was ever requested — and the team spent six months building on applause.

### What this prevents

The false-positive launch — after the untested-assumption death, the most common way products die. Also prevents infinite research loops that never terminate in a decision, and "MVPs" that are secretly nine-month v1s wearing a lean costume.

---

## Final gate: the 8-question self-checklist

Run this before finalizing any service plan or feature proposal. A weak answer means returning to the referenced section — not noting the weakness and proceeding. If you are a model, answer all eight explicitly at the end of your output.

1. **Problem without solution.** Can I state who has the problem, when it strikes, and what it costs them — in two sentences containing zero solution words? (§1)
2. **Evidence tier.** Is my belief in this problem grounded in observed behavior — workarounds, spend, funnel data — or only in what people said, or what we think? Which tier, honestly, and is it labeled in the document? (§1, §10)
3. **Leap of faith.** What single assumption kills this plan if false — and is its cheapest sufficient test scheduled *before* major build spend, with pass/fail written down in advance? (§6)
4. **Core integrity.** With only the features marked "core," can the target user complete the primary job end-to-end and reach first value quickly? If not, the classification is wrong, not the user. (§3, §4)
5. **Switch story.** Why would the target leave what they use today — including spreadsheets and doing nothing — and does that reason survive the incumbent copying my headline feature within two quarters? (§2, §8)
6. **Falsifiable success.** Does every success criterion carry a number, a timeframe, and a measurement source, agreed before launch — plus at least one guardrail metric? (§9)
7. **Business durability.** Who pays, for what, along which value metric — and do napkin unit economics survive the costs that scale with usage (compute, inference, human support)? Is the free/paid boundary on the correct side of the first-value moment? (§7)
8. **Honest exits.** Are the non-goals written down with reasons, and have I defined in advance what result would make us stop or pivot — and would we actually notice that result when it arrives? (§5, §6, §9)

---

*Closing note from the outgoing planner: none of this replaces talking to users this week. The manual's job is to make sure that when you do, you know what you are listening for — and that what you write afterward changes what gets built. When in doubt: go smaller, test sooner, and write the number down before you see the result.*
