# Workflow Operating Manual
### A practitioner's handover for analyzing, designing, documenting, and improving workflows

**Who this is for.** A capable operator — human or model — who will analyze, redesign, document, and launch real business workflows. Everything below is field-tested heuristics, not theory. Read it once end-to-end, then use sections 1–10 in order during an engagement; they follow the natural sequence of the work. The 8-question checklist at the end is mandatory before anything you produce is called "final."

**If you are a model reading this:** you usually cannot shadow people at their desks. Your instruments are (a) the interview questions in §1, (b) demands for artifacts — screenshots, exports, real items with timestamps — instead of prose descriptions, and (c) ruthless labeling. Mark every process detail you did not verify as **[ASSUMED]** and list open assumptions at the end of every deliverable. A plausible fabrication is more dangerous than an acknowledged gap, because nobody checks it.

**Operating principles (internalize these — every section is an application of one):**

1. **The official process is a hypothesis.** There are always three versions: documented, believed-by-management, and actual. Only the third one pays rent.
2. **Improvement lives in the waiting, not the working.** In most workflows, touch time is under 10% of elapsed time. The treasure is in the white space between steps.
3. **Every metric you push will be gamed.** Pair every primary metric with a guardrail that would expose the obvious gaming.
4. **Eliminate → Simplify → Automate, in that order.** Automating waste just produces faster waste.
5. **Exceptions are workflow.** If 15% of items are "exceptions," that's an undesigned variant path currently running on heroism.
6. **No item may ever sit in limbo.** Every item is always in exactly one named state, with an owner and a timer. This single discipline enables tracking, metrics, and automation.
7. **Documents are products, not artifacts.** Each has an owner, a version, a verified date, and one canonical home — or it will rot into a liability.

---

## 1. Map the As-Is workflow — the real one, including hidden steps and workarounds

The single biggest failure in workflow work happens here: mapping the fiction instead of the reality, then building everything downstream on that fiction. People do not lie to you; they describe the idealized version because that's how memory works. Your job is to defeat that.

### Procedure

1. **Fix the scope.** Name the trigger event that starts the workflow and *all* end states that finish it, including failure endings (rejected, cancelled, expired). Everything between is in scope. Resist scope creep now; it kills engagements later.
2. **Collect artifacts before opinions.** Existing SOPs, the actual forms, system screenshots, exported tickets or email threads with timestamps. Treat existing documentation as a hypothesis to be tested, never as truth.
3. **Interview the doers, not only the manager.** Minimum one doer per role. Ideal pair: the longest-tenured person (knows every workaround) and the newest (still remembers what was confusing and what they were told "unofficially").
4. **Use last-instance walkthroughs.** Say "show me the last one you completed" and have them replay it screen by screen, email by email. Never open with "how do you usually do it?" — that question retrieves the idealized version. Specific instances retrieve reality.
5. **Hunt hidden steps with these questions** (they work verbatim):
   - "What do you check before you pass it on?"
   - "What do you do when the input is wrong or the system fails?"
   - "Where do you keep your own notes, trackers, or copies?"
   - "What would break if you were out for two weeks?"
   - "Who do you ping when it's stuck?"
   Personal spreadsheets, sticky notes, and "I keep a copy because the system loses things" are not noise — they are the shadow system, and it exists because the official system fails at something. Find out what.
6. **Trace 2–3 real items end-to-end using timestamps** (ticket logs, email headers, file modification dates). This gives you elapsed time per stage without trusting anyone's memory, and memory about durations is reliably wrong.
7. **Draft the map as swimlanes** — one lane per role or system. Annotate each step with: actor, tool, input → output, touch time, typical wait after, and the volume share of each path (happy path 82%, variant A 11%, etc.).
8. **Validate by playback.** Show the draft to the doers and ask "what's wrong or missing?" Humans are poor at *describing* processes and excellent at *correcting* them. Update, replay once more, stop. Three to five interviews plus two item traces is usually enough for a first accurate map; returns diminish fast after that.

### Example

**Good:** Mapping invoice approval, you trace invoice #4471 by timestamps and find 6 silent days between "received" and "entered in ERP." The AP clerk's walkthrough reveals she keeps a personal Excel tracker (the ERP sends no notifications) and batches entry on Fridays. You have now found a hidden step, its hidden cause, and the batching policy responsible for most of the delay — none of which appears in the official 6-step SOP.

**Common mistake:** Interviewing only the finance manager, producing a clean diagram of the official 6 steps, and designing automation on top of it. It breaks in week one because 30% of invoices arrive as photos attached to emails — a variant the manager forgot exists and the clerk handles daily.

### What this prevents

Redesigning a fiction; automation that dies on real-world variants; deleting a workaround that was silently performing quality control; and missing the actual constraint (batching, waiting, notification gaps) because you only mapped actions, never the waits.

---

## 2. Identify pain points, bottlenecks, redundancies, and unnecessary handoffs

Get the vocabulary right first, because each problem type has a different cure. Tag every issue as one of: **bottleneck** (a capacity constraint where work-in-progress piles up), **delay** (waiting without a capacity cause — batching, approval latency), **redundancy** (same data entered or same check performed twice), **rework loop** (items sent back), **unnecessary handoff** (transfer of work without transformation of work), or **overprocessing** (more precision or review than the outcome requires).

### Procedure

1. **Overlay data on the §1 map:** volumes per path, queue time before each step, rework percentage, first-time-right rate.
2. **Compute touch time vs elapsed time per stage.** Expect 1:10 or worse. Wherever the big number sits is your treasure map — the fix is almost never "make people work faster."
3. **Mark every handoff and every approval.** For each approval, ask two questions: "What percentage gets rejected or changed?" (under ~2–5% means rubber stamp — pure delay wearing a control costume) and "What information does the approver have that the requester lacks?" (if none, the rule belongs with the requester).
4. **Find THE constraint** — the step where the queue grows fastest. There is usually exactly one. Per the Theory of Constraints, improving anything else first changes nothing end-to-end; it just moves inventory around.
5. **Collect complaints, but score by frequency × impact** (hours or currency), not loudness. "Annoying" and "costly" are different lists, and people report the former.
6. **Separate special cause from common cause.** One horror story from March is an anecdote. Ask for three examples before treating anything as systemic; otherwise you'll redesign a whole workflow around a one-off.
7. **Rank Pareto and take the top 3 into design.** Validate them with doers: "If we fixed only these three, would your week actually change?" Two or three issues typically account for 80% of the pain.

### Example

**Good:** In a marketing content flow, the data shows legal review holds items for 4 days, touches them for 25 minutes, and modified 3 of the last 200. Diagnosis: batching plus rubber stamp. Fix candidate: risk-tiering — only tier-A content goes to legal, the rest gets a weekly sampled audit. Projected cycle time drops ~60% before anyone touches a tool.

**Common mistake:** The team loudly hates the CMS, so leadership buys a new one for ₩80M. Cycle time doesn't move, because the constraint was the legal queue — which the shiny new CMS faithfully preserves.

### What this prevents

Spending money on non-constraints for zero end-to-end gain; removing a check that turned out to be load-bearing (before deleting any control, find the incident that created it — Chesterton's fence); and mistaking the loudest pain for the largest one.

---

## 3. Define goals and success metrics

A workflow project without a measured baseline and an operationally defined target is unfalsifiable — six months later everyone declares success and nothing provably changed. This section exists to make your work falsifiable, which is the same thing as making it credible.

### Procedure

1. **Ask the sponsor:** "What business outcome does this workflow serve, and what hurts most when it's slow, wrong, or expensive?" The answer selects your primary dimension: speed, quality, cost, error rate, or satisfaction.
2. **Choose ONE primary metric** on that dimension. One. Five co-equal goals is zero goals.
3. **Attach 1–2 guardrail metrics** that would expose the obvious gaming of the primary. Pushing speed? Guard error/escape rate. Pushing cost? Guard satisfaction and rework. Pushing throughput? Guard defect escapes. The pair is the design; a lone metric is a gaming invitation.
4. **Write operational definitions:** exact formula, exact source timestamps and fields, population included and excluded, and the statistic. Report **median and p90, not the average** — averages hide disasters, and p90 is what users actually remember about your workflow.
5. **Measure the baseline over a representative window** covering at least one full business cycle (include month-end, seasonal peaks). Baseline and post-change measurement must use the identical method or the comparison is theater.
6. **Set the target from something:** the baseline distribution, an external SLA, a benchmark, or capacity arithmetic. "50% faster" needs a *why*; round-number wishes get negotiated into meaninglessness.
7. **Define the measurement plan:** source system, cadence, owner. Hard rule: if measurement requires manual effort, it will silently stop within a month. Instrument it automatically or choose an automatic proxy.

### Example

**Good:** Customer onboarding. Primary: median calendar days from contract-signed to first-value-event — baseline 21 days (p90: 44), target 10 (p90: 21) within one quarter. Guardrails: 30-day churn of new accounts and support tickets per new account, neither may worsen. All pulled automatically from CRM and support-system timestamps.

**Common mistake:** Goal = "make onboarding more efficient while improving quality and customer happiness." No baseline, no definitions, three dimensions at once. Six months later the project reports success with a slide full of adjectives, and nobody can prove or disprove a thing.

### What this prevents

Unfalsifiable "success"; teams optimizing the number while damaging the outcome (the guardrail catches it); and having no defense when someone senior asks, "Did it actually work?"

---
## 4. Break the workflow into steps, decision points, branches, and exception handling

Model the workflow as a **state machine**: at any moment, every item is in exactly one named state. Actions move items between states. This one discipline is what later makes tracking, metrics, and automation possible — flows drawn as vague arrows between vague activities enable none of it.

### Procedure

1. **Fix the trigger and ALL end states**, including the unhappy ones (rejected, cancelled, expired, abandoned). Every ending you fail to name becomes limbo later.
2. **List steps at the granularity of one actor, one purpose, one verifiable output.** Three tests: if you can't name the output, it isn't a step; if the description needs "and then," split it; if you're documenting keystrokes, you've descended into work-instruction territory — pull back up (that detail belongs in the §8 SOP, not the flow).
3. **Give each step entry criteria (definition of ready) and exit criteria (definition of done).** Most cross-team friction is an undefined "done" — one side hands over something the other side considers half-baked.
4. **Convert every "it depends" into a decision node** with a written, testable rule and mutually exclusive, collectively exhaustive branches. "Manager judges if it's OK" is not a rule. "Amount > ₩5M OR vendor is new → senior approval; else → auto" is a rule — and it is automatable tomorrow because it is already code-shaped.
5. **Trace every branch until it rejoins the flow or reaches a named end state.** No dangling arrows. A dangling arrow on the diagram is a lost item in production.
6. **Keep the happy-path spine clean.** Route variants out early rather than letting a 2% case complicate the 90% path. Add explicit routes for the top exceptions (you know their frequencies from §1) plus one catch-all: "anything else → triage state, owner X, SLA Y." Do not attempt to enumerate the universe.
7. **Verify by replay.** Push at least three real historical items — including one weird one — through the model. Any forcing, any "well, in that case actually…" means the model is wrong. Fix the model, not the story.

### Example

**Good:** Refund flow. Decision node: "amount ≤ ₩50,000 AND ≤ 30 days since purchase AND original payment = card → auto-refund; else → manual review (CS lead queue, 24h SLA)." Every agent decides identically, customers get consistent treatment, and the auto path can be automated whenever convenient.

**Common mistake:** A flowchart diamond labeled "Valid?" with no criteria anywhere. Five agents produce five refund policies; customers compare notes publicly; and when the automation team finally arrives, they discover there is no rule to automate — only folklore.

### What this prevents

Inconsistent outcomes across people; "judgment" that is really an unwritten rule nobody standardized; items vanishing down unhandled branches; and processes that can never be automated because their logic was never made explicit.

---

## 5. Assign clear roles, responsibilities, and ownership

The purpose of this section is to make exactly one throat available to choke per step — said with affection. Diffusion of responsibility is the default state of organizations; ownership must be designed against it.

### Procedure

1. **Build the step × role matrix.** Assign **roles, never individual names** ("AP Clerk," not "Jisoo") — people leave, and role-view exposes when one person secretly holds five roles.
2. **Exactly one Accountable (A) per step.** Two A's equals zero A's. Multiple Responsible (R) doers is fine.
3. **Interrogate every Consulted (C):** "What input do they give that changes the result?" No concrete answer → demote to Informed (I). Every C you keep is a wait you are purchasing.
4. **Interrogate every approval:** "When did this approver last reject or change something?" Effectively never → remove it, or convert to after-the-fact inform plus a sampled audit. Approval ≠ ownership; an approver who never rejects is a delay in a control costume.
5. **Appoint the most commonly missing role: the end-to-end workflow owner** — accountable for the seams between steps, the §3 metrics, and the change process. Everyone owns steps; the problems live in the seams; someone must own the whole.
6. **For each step, define the SLA, a named backup/deputy, and the escalation path** when the owner is unavailable. Check bus factor while you're at it: a role that is A on many steps is a fragility — surface it now, not at resignation time.
7. **Get explicit acceptance from each role-holder** in a meeting or in writing. A RACI nobody agreed to is wall art. Also verify authority: an owner who cannot change the thing they're accountable for is a design flaw to escalate, not a fact to accept.

### Example

**Good:** Incident postmortems. Incident Commander is A for delivery within 5 business days; the on-call engineer is R for drafting; the service owner is C with a 24-hour review window before publishing; the org is I via a channel. Backups named. Postmortems ship on time because exactly one person is answerable for each.

**Common mistake:** A RACI with four A's and nine C's on the "publish" step. Every postmortem takes three weeks of sign-off chasing, and when leadership asks why, all four A's point at each other — which is precisely what four A's means.

### What this prevents

"The team owns it," which means nobody owns it; approval theater; single-person dependencies discovered the week that person resigns; and seam problems — the item stuck *between* two teams — that no step-owner will ever claim.

---

## 6. Design the improved (To-Be) workflow

Design is not creativity here; it is a disciplined sequence of moves applied to the evidence from §1–2, aimed at the targets from §3. Every change must justify its existence by pointing at a ranked pain point — a change that maps to none is risk without purpose, and it gets cut.

### Procedure

1. **Restate the top-3 ranked problems (§2) and the target metrics (§3)** at the top of the design document. This header is your discipline: it is what every change below must trace back to.
2. **Run an ECRS pass over the As-Is, in strict order of preference:**
   - **Eliminate:** for each step ask "what actually breaks if this disappears?" Many steps exist for reasons that expired years ago.
   - **Combine:** merge steps sharing an actor and context; kill re-keying by making the *first* entry of data the system of record.
   - **Rearrange:** parallelize independent steps (serial-by-habit is everywhere); move validation to the point of entry so garbage never enters the flow (poka-yoke beats inspection).
   - **Simplify:** reduce variants, standardize inputs, shrink batch sizes — smaller batches cut elapsed time even when touch time rises slightly.
   Only what survives ECRS earns consideration for automation (§7). Automating a step you could have eliminated is the classic expensive mistake.
3. **Replace status-request handoffs with visible state.** A large share of "communication work" in any flow is people asking where things are. A shared board or state field kills that entire category of messages.
4. **For every control you remove, write the compensating control beside it** — sampled audit, threshold alarm, entry validation. Removing checks without replacement is exactly how quality collapses two months after launch, when it's too late to blame the design quietly.
5. **Pressure-test on paper.** Run last month's five strangest items plus one peak-volume day through the To-Be. A design that only works on the happy path at average load is not a design yet.
6. **Project the metrics arithmetically:** new expected p50/p90 computed from the changed waits and touches. Vibes are not a forecast; arithmetic survives stakeholder questioning.
7. **Produce the change table:** change → pain point it addresses → expected metric effect → risk → mitigation. This single table is 80% of your stakeholder communication.
8. **Review with doers before executives.** Doers find the landmines; executives find the budget. That order. Also minimize the learning delta: two modest redesigns six months apart usually beat one heroic big bang, because migration cost and adoption risk are part of the design, not externalities.

### Example

**Good:** Purchase requests. Eliminate re-keying (the requester's form becomes the system record). Rearrange: budget check and security check run in parallel — they were serial by habit, with no dependency. Eliminate-with-compensation: auto-approve under ₩1M, compensated by a monthly sampled spend audit. Projected p50: 9 days → 2. Every change maps to a ranked pain point in the header.

**Common mistake:** Buying a workflow platform and faithfully rebuilding the existing 14 steps inside it — same serial approvals, same batching, now with license fees and a migration project. This is "paving the cowpath": the flow was the problem, not its container.

### What this prevents

Faster waste; quality regressions from blindly deleted controls; redesigns that never touch the constraint and therefore move no metric; and big-bang changes that fail on adoption rather than on logic.

---

## 7. Decide what to automate, what stays manual, and what needs human judgment

Automation is a ladder, not a switch: **full automation → automation with a human exception queue → human with machine assist (pre-fill, drafts, retrieval, checklists) → fully manual.** The workhorse pattern of good design is *auto happy path + human exception queue*. Chasing 100% automation is how projects die.

### Procedure

1. **Score each surviving step on six criteria:** (a) rule-clarity — can the decision be written as testable rules *today*? (b) volume and frequency; (c) input variability and machine-readability; (d) error cost and reversibility; (e) need for empathy, negotiation, or relationship; (f) need for a human to be *answerable* (legal or compliance weight).
2. **Classify along the ladder.** High volume + low variance + writable rules + reversible errors → automate. Genuine judgment, irreversible high stakes, human moments, or accountability requirements → keep human, possibly assisted.
3. **Automate the boring glue first:** data transfer between systems, validation at entry, notifications, reminders, status updates, formatting. Highest volume, lowest ambiguity, weakest egos, fastest payback.
4. **When a step is claimed to require judgment, test the claim with a decision log:** the expert records inputs, decision, and reasoning for 30–50 real cases. Rules usually emerge for 70–80% of them → automate those, queue the rest. If no rules emerge, it is genuine judgment: *assist* it (surface the right information at the right time), don't replace it. "Sarah's intuition" is often a rule Sarah never had to articulate — but sometimes it isn't, and the log tells you which.
5. **For EVERY automation, design four things before building:** failure detection (how do we know it broke?), alerting (who is told?), a manual fallback (how does work continue while it's down?), and an owner of the automation itself. Hard rule: **an automation that fails silently is worse than no automation** — it corrupts at scale while everyone relaxes.
6. **Do not chase the tail.** Auto-handling the standard 80% and routing 20% to humans *with full context attached* is cheaper, safer, and more robust than heroically covering the last weird 10%, which costs more than the first 90% and breaks on every upstream change.
7. **Sanity-check ROI:** (build + maintenance + failure-handling cost) versus (hours saved × volume × expected lifetime). Rare tasks rarely justify automation, however satisfying the build.
8. **Place the human where judgment adds value, never as a rubber stamp on machine output.** A human "reviewing" 500 machine decisions a day approves essentially all of them without reading — automation complacency. That is not a control; it is a costume. If human review matters, sample deeply rather than skimming everything.

### Example

**Good:** Expense claims. OCR plus policy rules auto-approve receipts ≤ ₩100K in standard categories — 78% of volume, seconds instead of days. The remaining 22% queue to finance with the receipt image and the *specific failed rule* highlighted. An alarm fires if the auto-approval rate drops below 60% — an early warning that something upstream changed. The manual fallback is documented and rehearsed.

**Common mistake:** "Let AI read and approve all vendor contracts." Low volume, high stakes, irreversible, rules unwritable — one bad auto-approval outweighs a year of saved time. Meanwhile the genuinely automatable part — extracting contract metadata into the tracker — stays manual because it was less exciting.

### What this prevents

Silent failures corrupting weeks of data; rubber-stamp "human oversight"; expensive automation of rare work; de-skilled teams who can no longer run the manual fallback; and trust destroyed by automating the moments that needed a person.

---
## 8. Document workflows clearly and usefully

Match the artifact to the question the reader is asking. A flowchart/swimlane answers "how does this flow, and where does my part sit?" An SOP answers "how exactly do I perform my step, right now?" A checklist answers "did I miss anything?" — and belongs only on error-prone, costly-to-omit, or infrequent steps. A RACI answers "who does what, who decides?" A one-page overview answers "what is this and why?" for executives and newcomers. Pick the minimal set the audiences actually need; producing all five for a trivial flow is its own kind of waste.

### Procedure

1. **List the audiences and the question each is asking;** choose artifacts accordingly. One artifact cannot serve all readers, and trying makes it serve none.
2. **Draft the SOP by walking the real task** and writing each action *as performed*: exact system names, exact button and field labels, screenshots for UI steps, and the expected result after each action ("you should now see…"). Expected results are what let a stressed reader self-verify at 2 a.m.
3. **Add per-step "if this fails" notes and one escalation contact** — a role, not a name.
4. **Usability-test the document:** someone who has never done the task executes it with the doc alone while you watch silently. Every stumble and every question is a defect in the document, not in the person. Fix; retest once. Write for the reader on their worst day: the new hire, the 2 a.m. incident, the person covering for someone on leave.
5. **Stamp metadata — owner (role), version, last-verified date — and publish to ONE canonical location.** Link everywhere else; never copy. Two copies means one is wrong, and you don't know which.
6. **Keep checklists aviation-style:** short (5–9 items), placed at the point of use, covering only the historically dangerous omissions. A 40-item checklist is a document nobody reads twice; checklist fatigue is real and it kills the practice.
7. **Wire documentation updates into the change process** ("the change isn't done until the doc is") and set a review trigger: on any process change, plus a calendar check quarterly or semiannually. A confidently wrong SOP is worse than none — people trust it.

### Example

**Good:** Deployment workflow — one swimlane diagram for the flow, one SOP per role with exact commands and expected outputs, and one 7-item pre-deploy checklist encoding the three historical outage causes. A new engineer deploys successfully on day two without asking anyone.

**Common mistake:** A gorgeous 40-page BPMN specification exported to PDF into a folder nobody opens. Three steps change within a quarter; the PDF doesn't. The next new hire follows it faithfully into an outage, and the organization concludes "documentation doesn't work here."

### What this prevents

Tribal knowledge walking out the door; the permanent "ask Bob" tax; inconsistent execution across people and shifts; and documentation that actively misleads because it outlived the process it described.

---

## 9. Test the new workflow, gather feedback, and iterate

The sequence is **paper test → pilot → staged rollout.** Never big-bang a workflow change onto a whole organization: the launch will fail before the design gets a fair trial, and the design will take the blame.

### Procedure

1. **Desk-check first.** With the doers in a room, walk 5–10 historical items — including the weird ones — through the new design on paper. One hour; catches the majority of logic flaws for free.
2. **Design the pilot:** a representative slice (one team, region, or category — representative, *not* the friendliest volunteers), running at least one full business cycle including a peak, typically 2–4 weeks. Keep the old path warm throughout.
3. **Before day one, write down success criteria AND rollback criteria:** for example, "revert if error rate exceeds baseline +2pp for 3 consecutive days, or backlog exceeds X." Deciding rollback thresholds during a crisis produces politics, not decisions.
4. **Instrument:** the §3 metrics measured identically to the baseline, plus a structured friction log from pilot users — which step, what happened, what did you do instead. "What did you do instead" is the gold field: **new workarounds appearing in the pilot are the design critiquing itself.** Treat them as feature requests, not user error.
5. **Expect the J-curve.** Week-one performance dips from learning effects. Don't judge the design in week one; *do* watch the guardrails from day one. Triage feedback into teething problems (fix with a doc tweak or training — ship the fix immediately) versus design flaws (a recurring workaround, a rule that doesn't fit reality — log for redesign). Confusing these two categories wastes the whole pilot.
6. **Decide at pilot end against the pre-agreed criteria** — rollout, iterate, or rollback. Not vibes. Not sunk cost.
7. **Roll out in stages** with training, the §8 documentation, a named support channel, and 2–4 weeks of hypercare (rapid-response fixes). Then run 30- and 90-day reviews against the baseline and publish the numbers either way — credibility compounds, and so does its absence.

### Example

**Good:** A new ticket-triage design piloted on the billing queue for three weeks, rollback criterion pre-signed by the sponsor. Week one dips 10% (expected); week three beats baseline by 30%. Two SOP fixes shipped mid-pilot straight from the friction log. Rollout proceeds queue by queue, each with its own hypercare window.

**Common mistake:** Switching the entire company Monday at 9 a.m. with no baseline and no rollback plan. Wednesday is chaos; Friday leadership orders reversion; and a fundamentally sound design is now politically dead for two years. The launch failed — but the design takes the blame, permanently.

### What this prevents

Organization-wide disruption from untested logic; good designs killed by bad launches; mistaking the learning-curve dip for a regression (or a real regression for a dip); and improvement claims nobody believes because nothing was measured the same way twice.

---

## 10. Handle edge cases, errors, and exceptions without breaking the workflow

Mindset first: exceptions are not outside the workflow — they are the part of the workflow you haven't designed yet. And the mortal sin of workflow design is **limbo**: an item that is nowhere, owned by no one, aging silently. Everything in this section exists to make limbo structurally impossible.

### Procedure

1. **From the §1 data, list exception types with frequencies.** Anything at roughly ≥2–3% of volume gets a designed path with explicit entry criteria, like any other branch — because at that frequency it *is* another branch.
2. **Everything else routes to ONE catch-all triage state** with an owner (a role), an SLA, and a short playbook: assess → resolve, route, or escalate. The catch-all-plus-human-plus-SLA pattern beats forty hand-crafted branches for cases that happen once a year — and it degrades gracefully when reality invents case forty-one.
3. **Enforce the no-limbo law:** every state has an owner and a timer. Add aging alerts — anything sitting in any state beyond its threshold pings the item's owner; beyond 2× threshold, pings the workflow owner. If you cannot produce, on demand, a list of every item currently in an exception state, you do not have exception handling; you have exception hoping.
4. **Handle errors close to the source:** validate at entry so garbage never enters the flow; fail loudly, never silently; prefer resumable states (retry or continue mid-flow) over restart-from-zero, which punishes the customer twice for one failure.
5. **For irreversible actions, define compensating actions in advance:** the wrong email went out → the correction protocol; the wrong payment executed → the clawback procedure. "Pretend it didn't happen" is not a procedure, and improvising one during the incident produces worse outcomes than a mediocre plan written calmly.
6. **Define degraded mode before you need it:** what pauses the workflow entirely (an upstream system down), what the manual fallback looks like, and who declares degraded mode on and off. Write it now — nobody writes well during an outage.
7. **Close the loop:** review the exception log monthly with the workflow owner. A recurring exception is either a missing designed path or — very often — an upstream data-quality problem to fix at the source. Fixing one upstream feed regularly halves total exception volume; hand-solving the same exception 200 times is 199 times too many.

### Example

**Good:** Order fulfillment. Address-validation failure — the top exception at 6% of orders — gets an automated SMS-to-customer path. Everything else lands in "Needs Review," owned by the ops lead, 4-hour SLA, aging alarm at 8 hours. The monthly review shows 60% of catch-all items trace to one supplier's malformed feed; the supplier fixes the feed; exception volume halves without touching the workflow itself.

**Common mistake:** Exceptions handled by "reply-all and someone will grab it." An order sits invisible for 11 days until the customer posts publicly. The investigation's most damning finding: nobody could even produce a list of in-limbo orders, because limbo had no state, no owner, and no timer.

### What this prevents

Silent losses; hero-dependency for anything unusual; the same exception hand-solved hundreds of times instead of designed once or fixed upstream; and workflows that shatter the first time an upstream system hiccups because degraded mode was never written.

---

## Final self-checklist — run before finalizing ANY workflow design or documentation

Answer all eight honestly. A "no" or "not sure" means you return to the referenced section. It does not mean you add a disclaimer and ship anyway.

1. **Reality check (§1).** Is this based on observed reality — real items, real timestamps, doer interviews — and can I point to the evidence behind each part of the map? Is every unverified detail explicitly marked **[ASSUMED]** rather than silently invented?
2. **Constraint check (§2).** Does every proposed change trace to a specific, ranked pain point, and does the design attack the actual constraint — where work *waits* — rather than the loudest complaint?
3. **Metric check (§3).** Is there exactly one primary metric with a measured baseline, a written operational definition (source, population, median and p90), and at least one guardrail that would expose gaming — with measurement that happens automatically?
4. **Logic check (§4).** Does every decision point have explicit, testable criteria; does every branch rejoin or reach a named end state; and did at least three real historical items — including one weird one — replay through the model without forcing?
5. **Ownership check (§5).** Does every step, and the end-to-end flow itself, have exactly one accountable owner — with an SLA, a named backup, an escalation path, real authority over what they own, and their explicit acceptance?
6. **Safety-symmetry check (§§6–7).** For every control removed and every step automated: what now catches that failure mode? Does every automation have failure detection, alerting, a manual fallback, and a named owner of the automation itself?
7. **Exception-integrity check (§10).** Can any item ever sit in limbo — is there any state without an owner and a timer? Do the top exceptions have designed paths, does a catch-all with owner, SLA, and playbook exist, and is degraded mode written down?
8. **Launch check (§§8–9).** Could a stranger execute this from the documentation alone (usability-tested, single canonical copy, owner and review date stamped)? And is there a pilot plan with success *and* rollback criteria agreed before day one, measured identically to the baseline?

---

**If you keep only three things from this manual:** map reality, not the org chart's fantasy; find where the work *waits*; and never, ever let an item sit in limbo. Everything else is technique.

*— End of handover. Good luck. The queues will tell you the truth when people can't.*
