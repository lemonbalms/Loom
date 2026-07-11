# Requirements Analysis Operating Manual

*A field playbook for turning messy requests into buildable, testable, signed-off requirements. Written as a handover from a senior product manager / business analyst to a strong but less experienced analyst. Follow it literally until you have earned the judgment to deviate — and when you deviate, write down why.*

---

## §0. Prime Directives (read first, apply always)

1. **The request is a hypothesis; the problem is the fact.** Every incoming ask ("build a dashboard", "add an export") is someone's guess at a solution. Your first job is always to recover the problem, actor, and outcome behind it (§1). You may end up building exactly what was asked — but only after this check, never before.
2. **Unwritten = nonexistent.** Verbal agreements, hallway asks, "obvious" behaviors, and silent assumptions do not exist until they are written, versioned, and visible. When in doubt, write it down and label it as exactly one of: requirement, assumption, open question, decision, or change request.
3. **Every requirement carries three anchors:** a *source* (who wants it and why), a *goal link* (what business outcome it serves), and a *test* (a pass/fail check a stranger could run). A statement missing any anchor is not a requirement yet — it is raw material.
4. **You propose; stakeholders decide.** Never resolve a business conflict or accept a scope trade yourself. Frame options with consequences, route them to the person who owns that tradeoff, and record the decision (§4, §10).
5. **Proceed on labeled assumptions rather than stall.** When answers don't come, write your best assumption, mark it `ASSUMPTION` with a date and owner, and continue with the smallest reversible step. Stalled analysis is a failure mode too — just a quieter one.
6. **The cheapest place to fix a defect is the requirement.** Every technique below exists for one economic reason: fixing a misunderstanding on paper costs minutes; in code, days; in production, careers.

---

## §1. Turning vague, incomplete, or overly broad requests into actionable requirements

### Procedure

1. **Restate the request in one sentence, in your own words, and send it back.** "So the ask is: X, for Y, so that Z — is that right?" Do nothing else until this lands, because everything downstream inherits its errors.
2. **Recover the problem behind the solution.** Ask, in this order: "What happens today, without this?" → "What does that cost, whom does it hurt, how often?" → "What have you already tried?" → "If this existed and worked perfectly, what would be different on a random Tuesday afternoon?" The last question forces observable outcomes instead of wishes.
3. **Extract the actionability triad: actor, trigger, outcome.** Who does something, what event starts it, what observable result ends it. If any of the three is missing, the request is not yet actionable — go get the missing piece before writing anything else.
4. **Bound with exclusions before inclusions.** Write a short **"Not doing"** list first (platforms, user groups, integrations, and phases that are out of scope). Broad requests shrink faster by cutting than by enumerating, and an explicit exclusion list is your first defense against §6 scope creep.
5. **Slice into candidate capabilities** (verb + object: "search tickets", "export orders", "notify on failure"). For each, note who needs it and roughly what it is worth. Pick the smallest slice that produces observable value end-to-end; park the rest *by name* in a visible backlog. Park, never delete — deleted ideas return as resentment.
6. **Timebox the fog.** If key answers have not arrived within an agreed window (e.g., 3 business days), write labeled assumptions (§0.5) and proceed on the smallest reversible slice. Escalate once, in writing, if the blocker is a person.

### Example

**Bad:** Request: "We need a dashboard." The analyst opens a design tool, drafts twelve charts with metrics that seem sensible, and presents two weeks later. Sponsor: "That's… not what I meant."

**Good:** Same request. Analyst asks: "Who looks at it, when, and what decision do they make right after looking?" Answer: "The ops lead, every morning, decides which stuck orders to escalate." Restated ask: "Ops lead sees all orders older than 24h in status `pending-carrier`, sorted by age, before 08:00 daily." Not-doing list: no historical trends, no exec view, no mobile app (all parked by name). The final deliverable turns out to be a filtered list plus an email digest — one week of work instead of six, and it gets used every day.

### Failure prevented

Building the literal artifact instead of the needed outcome — the project that ships "exactly what was asked" and gets zero adoption; weeks burned polishing the wrong thing before anyone checks the aim.

---

## §2. Asking clarifying and probing questions that surface hidden needs, assumptions, and edge cases

### Procedure

1. **Never ask "what are your requirements?"** People cannot enumerate needs in the abstract; they can narrate incidents. Ask instead: "Walk me through the last time this problem actually happened — step by step, starting from the first click."
2. **Climb the question ladder on every topic:** current behavior ("what do you do now?") → pain ("what's wrong with that?") → attempted fixes ("what have you tried?") → target ("what does *fixed* look like?") → evidence ("how will you *know* it's fixed?").
3. **Probe the standard edge set, deliberately, every time:** the zero case (nothing exists yet / empty state), the one case, the many case (10× expected volume), the concurrent case (two people at once), the failure case (network down, bad input, third-party outage), the permission case (who must *not* be able to do this), and the undo case (how is a mistake reversed?).
4. **Replace adjectives with numbers the moment they appear.** "Lots of rows" → "How many on the worst day of the year?" "Sometimes fails" → "How many times last month?" Write down the number and its source.
5. **Ask the enemy question:** "Who would be unhappy if we shipped this exactly as described?" It reliably surfaces forgotten stakeholders (§4) and negative requirements — things the system must *not* do.
6. **Conserve every answer.** Each reply becomes exactly one of: a requirement, a labeled assumption, or a numbered open question. Nothing is allowed to evaporate inside a call.
7. **Batch, order, and pre-answer your questions.** Send at most ~7 at a time, highest decision-impact first, each with your default assumption attached ("If I don't hear otherwise, I'll assume X"). Stakeholders answer 7 questions with defaults far faster than 25 open-ended ones — and your defaults keep you moving (§0.5) even when they don't reply.

### Example

**Bad:** "What are your requirements for the export feature?" — Answer: "Just export to Excel." The analyst writes "export to Excel" and moves on.

**Good:** "Walk me through what you do right after exporting." (→ a downstream macro parses columns B–F: **column order is now a requirement**.) "How many rows on your worst day?" (→ 500k: **async/streaming export is now a requirement**.) "Who must not be able to export this?" (→ contractors, because of PII: **masking + permission requirement**.) "What should happen if the export dies halfway?" (→ **all-or-nothing with a clear error**.) One vague answer became four real requirements — none of which "just export to Excel" would ever have revealed.

### Failure prevented

Requirements discovered in UAT or production — the two most expensive discovery venues that exist — and the entire "nobody asked me" defect class: edge cases that were always going to happen but were never spoken because nobody asked.

---

## §3. Distinguishing functional requirements, non-functional requirements, constraints, and nice-to-haves

### Procedure

1. **Classify every statement with these tests:**

| Type | Test | Verified by |
|---|---|---|
| Functional (FR) | "The system does X" — a behavior | Running a scenario |
| Non-functional (NFR) | "…and does it *this well*" — speed, capacity, availability, security, usability, compliance level | A measurement |
| Constraint | "We must operate inside X" — imposed from outside the team: law, contract, budget, deadline, mandated platform or standard | Checking the source and the penalty for violation |
| Nice-to-have | "Removing it breaks no stakeholder's core scenario" | The reverse test in step 5 |

2. **Interrogate every FR for its hidden NFRs.** Ask: how fast, how many, how often, how secure, for whom, in what language, on what device? Every functional sentence hides at least one quality requirement — extract it now, or meet it for the first time during load testing.
3. **Convert quality adjectives into measured conditions:** "fast" → "p95 search latency < 2s with 1M records and 200 concurrent users." A number, a percentile, and a load context — all three, or it is not an NFR yet.
4. **Audit constraints for authenticity.** Ask: "Who imposed this, and what concretely happens if we violate it?" If the answer is a shrug, it is a preference wearing a constraint costume — reclassify it as a negotiable requirement or nice-to-have, and note whose preference it was.
5. **Audit nice-to-haves in reverse.** "If we ship without it, whose core scenario fails?" If someone's does, promote it — it was mislabeled, and mislabeled nice-to-haves are how critical requirements get cut in week 9.
6. **Keep the four types in separate, labeled sections of the document.** A mixed list guarantees that NFRs and constraints get lost among the features — they always do.

### Example

**Bad:** "The system shall be fast, use PostgreSQL, support big exports, and ideally have dark mode." (Four types fused into one sentence; nothing testable; the real constraint indistinguishable from the wish.)

**Good:**
- **FR-12:** User exports the filtered order list to `.xlsx`.
- **NFR-4:** Export of 100k rows completes in < 30s (p95) without blocking the UI.
- **CON-2:** Database must be PostgreSQL 15 — organizational standard mandated by the DBA group; exceptions require CTO sign-off. (Source: platform policy v3, verified 2026-07-02.)
- **NTH-1:** Dark mode — no stakeholder scenario depends on it (confirmed with support and ops).

### Failure prevented

Performance and security discovered as launch-blockers ("it works, it's just unusable"); fake constraints silently forbidding better designs for years because nobody ever asked who imposed them; nice-to-haves eating critical-path capacity because nothing was labeled.

---

## §4. Identifying stakeholders, their goals, pain points, and conflicting interests

### Procedure

1. **Cast the net with role prompts, not memory:** Who pays for this? Who uses it daily? Who approves release? Who operates and supports it at 3 a.m.? Who audits it (security, legal, compliance, finance)? Who consumes its data downstream? Who can veto it? And the classic blind spot: who is affected but never invited — frontline staff, and the customers of your customers?
2. **Record four fields per stakeholder:** *goal* (what they want to become true), *pain* (what hurts today), *success measure* (how they will personally judge the result), and *power × interest*. Plot power × interest on a 2×2 — **manage closely / keep satisfied / keep informed / monitor** — because that grid decides whom you interview, whom you copy, and whom you must never surprise.
3. **Interview the silent-but-lethal group first.** Ops, support, compliance, downstream data consumers — the people sponsors forget and who block releases late. Ten minutes each, in week one, is the cheapest insurance in this entire manual.
4. **Hunt conflicts on purpose.** Lay the goals side by side and search for pairs that cannot both be fully true: speed vs. auditability, self-service vs. control, sales flexibility vs. finance standardization, "one click" vs. "four-eyes approval." If you find zero conflicts, you have not found all the stakeholders.
5. **Surface conflicts in writing, early, framed as options.** For each: state the tension in one sentence, offer 2–3 resolutions with their consequences, name the decision-maker who owns that tradeoff, get the call, and log it (decision log: date, decider, choice, rationale). **Never average conflicting requirements yourself** — a compromise nobody chose satisfies nobody and has no defender when it is questioned later. And it will be questioned later.
6. **Revisit the map at every phase gate.** Stakeholders appear (a new integration team) and mutate (a re-org changes the approver). A stale map fails in exactly the same way as no map.

### Example

**Bad:** The analyst gathers everything from the sponsoring VP. At launch review, compliance blocks the release: the workflow lacks an audit trail required by policy. Six weeks of rework — and compliance was one Slack message away the entire time.

**Good:** The week-1 map includes compliance ("keep satisfied") and warehouse staff ("manage closely"). A conflict surfaces immediately: Sales wants one-click discounts; Finance requires dual approval above a threshold. The analyst writes both goals verbatim, proposes three options with consequences, and routes the choice to the COO — the person who actually owns that tradeoff. Decision logged: one-click up to 10%, approval workflow above it. Both parties watched the same decision being made, so neither relitigates it at UAT.

### Failure prevented

The late veto — the single most schedule-destroying event in requirements work; the analyst-brokered "average" that both sides later disown; launches that technically succeed while a key group quietly refuses to use the system.

---

## §5. Breaking high-level goals into specific, testable, measurable requirements

### Procedure

1. **Build a goal tree and keep it traceable in both directions:** business goal → measurable objective → capability → feature → requirement. Every requirement must climb to a goal ("why does this exist?"); every goal must descend to at least one requirement ("what actually delivers this?"). Orphans in either direction are your highest-yield review finding: a requirement with no goal is gold-plating; a goal with no requirement is a promise you are silently breaking.
2. **Write at the altitude of observable behavior:** actor + trigger + behavior + outcome + measure. Not "improve reliability" (a wish), not "retry three times with exponential backoff starting at 200ms" (a design decision that belongs to engineering) — but: "if payment authorization fails transiently, the system retries automatically; the customer sees a single unified result within 10s; a double charge is impossible."
3. **Apply the stranger test for testability:** could a tester who has never spoken to you produce a pass/fail verdict from the text alone? If they would need to ask you anything, the requirement is not done — rewrite until the question disappears into the text.
4. **Force concreteness with Given/When/Then** for behavioral items: *Given* ⟨initial state⟩, *When* ⟨action or event⟩, *Then* ⟨observable result with values⟩. The format physically prevents hand-waving because each slot demands a concrete fact.
5. **Split until estimable.** If the build team cannot estimate an item with confidence, it is too big or too vague — split by workflow step, by data variation (happy path first, then each exception), by user segment, or by CRUD operation. Aim for INVEST-shaped items: independent(ish), negotiable, valuable, estimable, small, testable.
6. **Attach the measure at the requirement level, not only the project level.** "Checkout abandonment −13pp" belongs to the goal; "returning user with a saved card completes purchase in ≤ 3 screens" belongs to the requirement. Both must exist, and they must be linked.

### Example

**Bad:** "Improve the checkout experience." (Unestimable, untestable, un-doneable — the team will argue about "done" forever, and the argument will be nobody's fault and everybody's problem.)

**Good:** Goal: reduce checkout abandonment from 68% to 55% by end of Q3 (metric owner: analytics lead).
→ **REQ-031:** Given a returning customer with a stored card, when they proceed from the cart, then purchase completes in ≤ 3 screens with the address pre-filled from the profile.
→ **REQ-032:** Given a card payment fails for a user-fixable reason (expired card, wrong CVC), then the specific reason is shown, the cart is preserved, and retry is a single action.
Every clause is a pass/fail check; every requirement traces to the abandonment goal.

### Failure prevented

Epics that bounce forever between "too big to build" and "too vague to test"; end-of-sprint "is this done?" wars; features that ship, move no metric, and leave nobody able to say whether the work succeeded.

---

## §6. Detecting ambiguity, contradictions, missing information, and scope creep early

### Procedure

1. **Run the dangerous-words scan on every draft.** Flag and rewrite each instance of: *fast, easy, simple, flexible, robust, user-friendly, seamless, appropriate, efficient, optimal, handle, support, manage, deal with, etc., and so on, as needed, if necessary, all, every, some, may, should, could, TBD.* Each hit is either replaced by numbers/enumerations or explicitly ticketed as an open question. This is a literal word search — automate it, and run it on every revision, not once.
2. **Apply the two-readers ambiguity test:** have two people — or yourself in two roles, "builder" and "tester" — each write one sentence describing what they would build or verify from the requirement. Different sentences = ambiguous = rewrite. Cheap, fast, brutally effective.
3. **Hunt contradictions structurally, not by vibe.** List every requirement touching the same object, field, flow, or role side by side (a simple table: object → requirement IDs). Check the pairs for incompatibility: retention "90 days" vs. "delete on user request"; "all users can comment" vs. "commenting requires verified email"; timestamps "local time" in one section, "UTC" in another.
4. **Sweep for missing information with the completeness set**, per core flow: error path? empty/zero state? boundary and maximum volume? permissions and roles? concurrency? localization and timezone? migration of existing data? observability (how will we know it is working)? Every unanswered cell becomes a numbered `OPEN-n` with an owner and a due date — an unwritten unknown is a defect with a delay timer attached.
5. **Baseline, then tripwire.** Once scope is baselined (§10), *any* addition — including "tiny" ones, and especially verbal ones — must pass through the change path. Train this exact reflex for hallway requests: "Good idea — I'll write it up as CR-*n* so we can slot it properly." Friendly, immediate, and it converts invisible scope into visible scope 100% of the time.
6. **Learn scope creep's disguises:** "clarifications" that alter behavior, "bug fixes" that are new features, "while you're in there" asks, and demo feedback absorbed silently into the backlog. All of them are changes; route all of them as changes.
7. **Re-run scans 1–4 on every revision**, not only the first draft. Edits introduce new ambiguity and new contradictions at a rate that surprises everyone the first time they measure it.

### Example

**Bad:** "The system should handle large files appropriately." It ships. The first 2GB upload crashes a worker. The postmortem reveals the PM meant "reject with a friendly message," the developer meant "stream-process anything," and the tester never tried a file above 10MB — three private definitions of "handle… appropriately," zero shared ones.

**Good:** "Uploads ≤ 500MB process synchronously. 500MB–2GB are accepted, queued, and show progress; the user is notified on completion. > 2GB are rejected with error `UPL-413` and guidance text. (Volume ceiling confirmed with Ops on 2026-07-02; OPEN-7 closed.)"

### Failure prevented

"That's not what I meant" at demo time; two teams shipping mutually contradictory rules; the schedule that dies from forty invisible five-minute additions; the production crash whose root cause is, literally, an adjective.

---

## §7. Prioritizing requirements (business value, effort, risk, dependencies)

### Procedure

1. **Score every candidate on four axes**, quickly and visibly: **value** (revenue gained, cost avoided, risk reduced, or strategic necessity — with the *mechanism* stated: "reduces churn because the top-3 cancellation reason is X"), **effort** (the build team's estimate; T-shirt sizes suffice), **risk** (technical unknowns, fragile dependencies, regulatory exposure), and **dependency position** (what it blocks; what blocks it).
2. **Refuse volume-as-value.** The loudest stakeholder's list is data, not priority. "The CEO wants it" earns a conversation about *why* — which either yields the real value statement or reveals there isn't one. Both outcomes are useful; only one is buildable.
3. **Apply MoSCoW with hard gates:** **Must** = launch is pointless, illegal, or broken without it — and Musts may consume at most ~60% of capacity (the remaining buffer absorbs discovery and change, §10). **Should** = important, but a painful workaround exists. **Could** = first to cut, agreed in advance. **Won't (this time)** = written explicitly on page 1, so that exclusion is a decision people saw, not an accident someone discovers angrily later.
4. **Sequence by dependency and risk, not just value.** Pull the scariest unknowns forward — the integration with the flaky vendor API goes in sprint 1, not sprint 9 — so that failure happens while there is still time to react. Build unblockers before the shinier things they unblock, even when the shinier thing scores higher.
5. **Where numbers exist, sanity-check with value ÷ effort** (WSJF-style: cost of delay over duration). Use it to challenge gut rankings, not to replace judgment — the model is exactly as honest as its inputs.
6. **Publish the ranked list with the reasoning attached, and re-run at fixed checkpoints.** Priorities are perishable: markets move, dependencies slip, a competitor ships. A priority list older than a quarter is a rumor.

### Example

**Bad:** Kickoff ends with 34 of 40 requirements marked "high priority." The team, unable to act on that, quietly re-prioritizes by what is technically interesting. The genuinely critical payment-provider integration starts in month 4, where its API turns out to require a contract amendment — discovered with six weeks left.

**Good:** 18 Musts consuming 55% of capacity. The payment integration is pulled to sprint 1 *despite low demo value*, because three Musts depend on it and it carries the largest unknown (an external vendor). Page 1 states: "Won't this release: bulk import, SSO." When the vendor API turns out to need a contract change, it is month 1 — annoying, survivable, absorbed by the buffer.

### Failure prevented

The all-Must death march; high-value work stalled behind an unbuilt dependency at the worst possible moment; the biggest risk detonating at the end of the schedule, when reaction time is zero; cut-scope surprises ("nobody told me bulk import was out").

---

## §8. Documenting requirements clearly and usefully

### Procedure

1. **Pick the format by consumer and content, not by habit:**

| Situation | Format |
|---|---|
| Incremental product work, agile delivery | User stories + acceptance criteria |
| Complex multi-actor, multi-step flows | Use cases (main flow + alternate flows + exception flows) |
| Rule-dense logic (pricing, permissions, validation) | Decision tables / matrices — prose hides missing cells; tables expose them |
| Lifecycles and statuses | State diagrams |
| Integrations | Interface spec: fields, types, volumes, error codes, owners on both sides |
| Anything visual | Wireframe or mockup attached to the story — words cannot carry layout |

Mixing formats within one document is normal and correct. Forcing everything into stories is how permission matrices end up as forty contradictory sentences.

2. **Hold every story to the earn-your-slot test:** "As a ⟨specific role⟩, I want ⟨capability⟩, so that ⟨verifiable benefit⟩." If the *so that* merely restates the *want* ("…I want export, so that I can export"), the benefit is unknown — go find it, or question whether the story should exist.
3. **Write acceptance criteria as Given/When/Then, 3–8 per story,** covering the happy path, the top failure paths, and the boundary values. More than 8 → split the story. Zero criteria about errors → the story is not done (§6.4).
4. **Give every requirement a stable skeleton:** unique ID, one-sentence statement, source (who / why), goal link, priority, status, dependencies, open questions. IDs make conversations precise ("REQ-014 conflicts with REQ-031") and make traceability possible at all.
5. **Maintain a glossary and enforce it.** Define contested words exactly once — "customer = paying account owner; user = any authenticated person" — and use them consistently everywhere. In practice, a large share of "contradictions" turn out to be two teams using one word for two different things.
6. **One canonical, versioned home.** A requirement living in a Slack thread, an email, or someone's head does not exist (§0.2). Every change bumps the version and lands in the change history.
7. **Write for scanning:** short sentences; one requirement per statement (no "and" chains hiding two requirements inside one ID); tables over paragraphs for anything enumerable. The document's job is to end arguments quickly — not to demonstrate thoroughness by weight.

### Example

**Bad:** "As a user, I want good search so that I can find things quickly." AC: "Search works well and is fast."

**Good:** "As a support agent, I want to search tickets by customer email, so that I can pull a caller's history during a live call (target: history on screen < 10s from call start)."
- **AC-1:** Given 1M stored tickets, when the agent enters a complete email address, then matching tickets appear in < 2s (p95), newest first.
- **AC-2:** Given no tickets match, then "No tickets found" is shown with a create-ticket shortcut.
- **AC-3:** Given ≥ 3 characters typed, then prefix-match suggestions appear.
- **AC-4:** Given the agent lacks the support role, then search is not accessible and the attempt is logged.

### Failure prevented

Documents nobody can build or test from; testers inventing expected behavior on the fly; the same argument re-litigated monthly because the decision has no findable home; two teams building from two different "latest versions."

---

## §9. Validating requirements with stakeholders and getting real sign-off

### Procedure

1. **Validate scenarios, not documents.** Never send a 40-page spec with "any comments by Friday?" Silence means *unread*, not *agreed*. Book short, focused sessions per stakeholder group, covering *their* slice and nothing else.
2. **Walk each stakeholder through their own workflow, concretely:** "It's Monday 8 a.m., you open this screen; here is what happens when you press X; here is the error you would see if Y — is this your job as you actually do it?" Use mockups or clickable prototypes for anything visual; humans cannot reliably validate abstract text against the picture in their head.
3. **Read requirements back in their words and watch for hesitation.** Probe every "I guess so," "probably," and "should be fine" — hesitation is data. "You paused — what case are you thinking of?" is one of the highest-yield questions in this manual.
4. **Validate resolved conflicts with all parties present.** Serial validation lets each side sign a private interpretation of the compromise; joint validation forces one shared version into the record while everyone is looking at it.
5. **Run sign-off as a protocol, not a vibe:**
   - (a) the **right person** — someone with the authority to commit their function;
   - (b) an **explicit object** — document version plus requirement ID range ("approving v1.2, REQ-001–REQ-047");
   - (c) an **explicit meaning** — "this is sufficient to build against, and you will accept delivery evaluated against these criteria";
   - (d) a **recorded artifact** — email, ticket, or signature;
   - (e) a **deadline with a pre-agreed default** — "no response by Friday = approved as drafted." Agree to that rule *before* you ever use it, and use it sparingly; it is a nudge for the chronically unresponsive, not a trap.
6. **Re-validate deltas after every approved change.** Sign-off binds a baseline, not the future; changed requirements return to the affected signers only. Keep it light — §10 exists precisely so this does not become ceremony.

### Example

**Bad:** "Please review the attached BRD by end of week." No replies; the analyst records sign-off by silence. In UAT, the warehouse lead sees the receiving flow for the first time: "I never agreed to scanning every item twice — that doubles my intake time." Four weeks of rework, plus a stakeholder who now distrusts every document with your name on it.

**Good:** A 45-minute walkthrough with the warehouse lead, using screen mockups of the receiving flow. At the double-scan step she stops the session — the same objection, but it is week 3 on paper instead of month 4 in code. The flow is revised to scan-once-with-exception-handling; she replies to a one-page summary: "Approved v1.2, REQ-014–REQ-031." That single sentence later settles two disputes in thirty seconds each.

### Failure prevented

UAT as the first genuine review (the most expensive review venue in existence); "I never said that" wars with no record to consult; rework at 10–100× the paper cost; sign-off theater that binds no one and protects nothing.

---

## §10. Handling changing requirements and managing scope throughout the project

### Procedure

1. **Baseline explicitly.** At an agreed moment — typically right after §9 sign-off — freeze the versioned set: "This is v1.0; all subsequent change is measured against it." Without a baseline there is no such thing as scope creep — only unmeasurable drift and mutual blame.
2. **Route every change through one lightweight path** — including reductions, "clarifications" that alter behavior, and executive drive-bys: written request (two sentences suffice) → **impact analysis** (effort, schedule, affected REQ-IDs, new dependencies and risks) → **decision by the tradeoff owner** → version bump plus decision-log entry → notification of affected parties. Target turnaround in *days*. A heavyweight change process does not stop change; it drives change underground, where it is invisible and unpriced.
3. **Triage by size, with thresholds agreed in advance:** *trivial* (wording only, zero behavior change) — the analyst approves and logs it; *small* (fits within a pre-agreed buffer) — the product owner decides; *large* (breaks the buffer, moves dates, adds dependencies) — a steering decision with an explicit trade: "in, by trading out X or moving the date to Y." There is no third option where it is "in" and nothing moves.
4. **Never absorb change silently to be agreeable.** The professional reflex is: "Yes — and here is what it costs." The impact sentence *is* the job. Omitting it to avoid an awkward moment converts today's comfort into launch-week catastrophe, with your name attached.
5. **Keep a visible change log:** requested / approved / rejected / deferred, each with the reason and the decider. Rejected-with-reason is what prevents the same request resurfacing every quarter as if it were new.
6. **Budget for change instead of pretending it will not come.** Hold 10–20% of capacity in reserve on multi-month efforts (this is why Musts ≤ 60%, §7.3). Treat old requirements as perishable: anything written six-plus months ago and untouched gets re-confirmed with its source before build — the world moves.
7. **Report cumulative drift, not just individual changes.** Each approved CR can be individually reasonable while the sum quietly kills the date. At every checkpoint, show the running total: "Approved changes to date: +21 dev-days; release moved 2026-09-15 → 2026-10-02." Cumulative visibility is what lets sponsors self-regulate — most over-ask because nobody ever showed them the meter.

### Example

**Bad:** In a standup, the PM verbally agrees to "just add SMS notifications too — small thing." No ticket, no estimate. Three weeks later the release slips: the SMS vendor requires a contract and a compliance review nobody planned. In the retrospective, no one can reconstruct when or why scope changed — but everyone remembers who was "managing requirements."

**Good:** The same ask becomes CR-007 within the hour. Impact: +8 dev-days, a new vendor dependency (contract lead time ~3 weeks), and REQ-022 pushed out of the release. The sponsor, seeing the price, defers CR-007 to v1.1. Logged. The release holds — and SMS ships one version later with its contract signed in advance.

### Failure prevented

Death by a thousand small yeses; schedule slips with no traceable cause; the analyst held responsible for scope they never priced; teams building from three private versions of "current scope"; the change process everyone bypasses because it takes three weeks to say yes.

---

## Final gate: the 8-question self-checklist

Run this before finalizing **any** requirements document or story set. Answer each question in writing. Any "no" or "not sure" means the artifact is not done — return to the referenced section and fix it.

1. **Problem & traceability.** Can I state, in one sentence each, the problem, the affected actor(s), and the measurable outcome that defines success — and does every requirement trace up to that outcome, with no orphans in either direction? (§1, §5)
2. **Stranger-testability.** Could a tester who has never met me deliver a pass/fail verdict on every requirement and acceptance criterion without asking a single question — and does the dangerous-words scan (*fast, easy, handle, support, appropriate, etc., all, should, TBD…*) come back clean? (§5, §6)
3. **Ugly-path coverage.** For each core flow, have I specified the error case, the empty/zero case, the boundary/volume case, the permission case, and the concurrency case — not just the happy path? (§2, §6, §8)
4. **Stakeholders & conflicts.** Has every affected party — including ops, support, compliance, and downstream consumers — been heard; and is every conflict resolved by a named decision-maker with a logged decision, none silently averaged by me? (§4)
5. **Classification & quality numbers.** Is every item labeled FR / NFR / constraint / nice-to-have; does every FR carry its quality measures (speed, volume, security, availability); and is every constraint verified as real, with a source and a consequence of violation? (§3)
6. **Zero unwritten unknowns.** Is every open question numbered with an owner and a due date, and every assumption I proceeded on explicitly labeled `ASSUMPTION` with a date — nothing living only in my head or in a chat thread? (§0, §2, §6)
7. **Priority & sequencing sanity.** Would launch genuinely fail without each Must? Do Musts fit within ~60% of capacity? Does the build order respect dependencies and pull the biggest risks forward? Is "Won't this time" written where everyone will see it? (§7)
8. **Validation & change-readiness.** Has each stakeholder walked through *their own scenarios* — a walkthrough, not silence; is sign-off recorded against a specific version and ID range; and is the change path (who decides, how fast, where it is logged, what buffer exists) agreed **before** build starts? (§9, §10)

*If all eight pass: ship the document — then expect it to change, and be glad you built the machinery for exactly that (§10).*
