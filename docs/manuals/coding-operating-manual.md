# Coding Operating Manual

*A senior staff engineer's personal playbook, handed over to a strong engineer — human or model — who executes well but needs the judgment layer made explicit. Every technique here was paid for by a production incident, a wasted week, or a review that went badly.*

**How to use this manual**

- Treat **§0 (Prime Directives)** and the **Final Gate** (end of document) as hard rules. Everything between them is the reasoning you apply when the situation matches.
- When any advice below conflicts with the existing codebase's established conventions, **the codebase wins**. When it conflicts with the Prime Directives, **the Directives win**.
- Each section follows the same shape: *Procedure* (do this), *Worked example* (what it looks like), *What this prevents* (why it exists).

---

## 0. Prime Directives

These target the failure modes most common in capable-but-unsupervised engineers, and especially in AI models writing code.

1. **Read before you write.** Never edit a file you haven't read. Never call an API from memory — verify the actual signature in the codebase, the installed version, or the docs. A plausible-sounding method name that doesn't exist is worse than admitting you need to check.
2. **Verify by execution, not by confidence.** "This should work" is banned vocabulary. Either you ran it and saw it pass, or you say explicitly: *"I have not executed this."* No third option.
3. **Smallest complete change.** Solve the whole stated problem and nothing adjacent. Do not refactor, reformat, rename, or "improve" untouched code in the same change. Drive-by improvements go in a separate commit or don't happen.
4. **Match the codebase, not your preferences.** Its error style, import order, naming, and test patterns override your taste and even this manual's stylistic advice. Consistency is a feature; personal style in a shared repo is a bug.
5. **Assume-and-state, or ask — never silently guess.** For reversible choices, pick a sensible default and state it prominently. For irreversible or correctness-critical choices (money, deletion, external messages, public API contracts), ask — in **one batched question**, not a drip-feed.
6. **Never fabricate.** Not file contents, not test results, not benchmark numbers, not library behavior. "I don't know" is a valid, professional answer. A confident guess presented as fact is the single worst failure mode, because it costs someone else's trust and debugging time.
7. **Root cause or nothing.** A fix you can't explain is a symptom you've hidden. If you don't know *why* the fix works, you haven't fixed it.

---

## 1. Understanding ambiguous requirements

The most expensive bug is a perfectly implemented misunderstanding. Requirements work is not "asking questions" — it's *reducing the question count* until only the ones that truly need a human remain.

### Procedure

1. **Write the contract sentence.** One sentence: "When *X* happens, the system does *Y*, observable by *Z*." If you can't write it, you don't understand the request yet.
2. **Enumerate the three lists:** inputs (sources, formats, who sends them), outputs (consumers, formats, who reads them), side effects (writes, emails, charges, deletions).
3. **Hunt the invisible requirements.** Eight axes that are almost never stated but always exist:
   scale (n = 10 or 10 million?) · latency expectations · concurrency (can two of these run at once?) · persistence/durability · auth & permissions · failure behavior (retry? drop? alert?) · backwards compatibility · observability (how will we know it's working?).
4. **Mine the codebase before asking.** Most "open questions" are already answered by how the last similar feature was built: its error conventions, auth pattern, pagination style, config mechanism. Reading first turns ten questions into two.
5. **Classify every remaining unknown:**
   - **Type A** — answer doesn't change the design → pick the industry-standard default, note it in the deliverable.
   - **Type B** — changes the design but is reversible/isolated → choose, state the assumption prominently, keep it behind config or a small seam.
   - **Type C** — changes correctness or is irreversible → **ask.** Batch all Type C unknowns into one message, with your recommended answer for each so the human can just say "yes."
6. **Convert to acceptance criteria:** 3–7 statements phrased as tests. If a criterion can't be phrased as a test, you haven't finished step 1.

### Worked example

Request: *"Add rate limiting to the API."*

After reading the codebase (auth middleware exists and yields `api_key_id`; deploy is a single instance in docker-compose; only `/v1/generate` is expensive):

| Unknown | Type | Resolution |
|---|---|---|
| Which endpoints? | B | Only `/v1/generate` is costly → start there; endpoint list in config |
| Keyed by user / IP / API key? | C→B | Auth already yields `api_key_id` → per key. *Stated as assumption.* |
| Limit values? | B | 60 req/min default, env-configurable — product can tune without a deploy |
| Single-node or distributed? | B | One instance today → in-memory token bucket; leave a comment naming the Redis upgrade path |
| Behavior at the limit? | A | HTTP 429 + `Retry-After` header (industry standard) |

Zero Type C unknowns survived the codebase read, so: proceed, with assumptions stated at the top of the PR. Had "keyed by what?" stayed open, that would have been *the one question* — asked with a recommendation attached.

Acceptance criteria produced:

- 61st request within a 60s window from the same key → 429 with `Retry-After`.
- Requests from different keys never affect each other.
- The window resets: after 60s, requests succeed again.
- Unauthenticated requests are rejected by auth (401) *before* the limiter — never counted, never 429.

### What this prevents

- Building the wrong thing perfectly, discovered at demo time.
- The 12-question interrogation that stalls work and trains people to give you vague specs.
- Assumption archaeology in review ("wait — why is this per-IP?").

---

## 2. Planning: decompose into small, verifiable steps

A plan is not a list of files to touch. It's a sequence of *independently checkable states*, ordered so the scariest unknown dies first.

### Procedure

1. **Define done first.** Sketch the end state in ≤10 lines before writing code: the final API shape, the data flow, or the UI behavior. This is the target the steps converge on.
2. **Map the seams.** List every existing file/function the change will touch. This is your blast radius; if it's large, the design is wrong or the task needs splitting.
3. **Slice vertically, not horizontally.** Prefer thin end-to-end slices ("one row exports as CSV through the whole stack") over layers ("all the models, then all the services, then…"). Every step must be:
   - **verifiable** — a named test, a curl command, an expected log line;
   - **revertible** — one commit, cleanly removable;
   - **explainable** — one sentence of purpose.
4. **Front-load risk.** Identify the step you understand least and spike it *first*, timeboxed (30–60 min). Learning on day 1 is a plan change; learning on day 4 is a rewrite.
5. **Write each step's verification before its code.** If you can't say how you'll check it, the step is too vague.
6. **Re-plan after the first step or two.** A plan is a hypothesis; contact with the code falsifies parts of it. Update it — don't push through a dead plan out of momentum.

**Step-size heuristic:** one step = one commit = reviewable in under 10 minutes.

### Worked example

Request: *"Add CSV export to the reports page."* Suspected risk: memory blowup streaming large reports.

| # | Step | Verified by | Risk |
|---|---|---|---|
| 0 | **Spike:** stream 1M synthetic rows through a streaming HTTP response, watch process RSS | script printing peak memory | **HIGH — do first** |
| 1 | `fetch_report_rows(filters) -> Iterator[Row]` | unit test against seeded DB (3 rows) | low |
| 2 | `rows_to_csv(rows) -> Iterator[bytes]` with proper quoting | golden-file test: commas, quotes, newline-in-field, 한글/emoji | med |
| 3 | `GET /reports/{id}/export` streaming endpoint | `curl ... > out.csv`; open in Excel — check UTF-8 BOM (`utf-8-sig`) so non-ASCII isn't garbled | med |
| 4 | Export button + loading state in UI | manual click-through | low |

The spike (step 0) either confirms the streaming approach in an hour or redirects the whole plan to "background job + download link" *before* four steps are built on the wrong foundation.

### What this prevents

- Big-bang integration where everything fails at once and nothing is isolatable.
- Discovering the hard part on day 4 of 5.
- 800-line PRs that reviewers rubber-stamp because reading them properly is impossible.

---

## 3. Abstractions, patterns, and trade-offs

Most abstraction damage is done with good intentions. The skill is not knowing patterns — it's knowing the *price* of each one and when you can't afford it.

### Procedure

1. **Default priority stack:** Correct > Readable > Changeable > Fast. Reorder only with evidence: a measured profile, or a stated SLO. "It might be slow" is not evidence.
2. **Rule of three.** Two occurrences of similar code: duplication is fine — cheaper than coupling. Third occurrence: extract, and extract *only the part that is actually identical*.
3. **The wrong abstraction costs more than duplication.** Warning signs you've built one: boolean/config flags steering behavior *inside* it; callers fighting it with workarounds; names like `BaseHandler`, `Manager`, `Util`, `Helper`.
4. **Prefer deep modules:** small interface, real work inside. A class that wraps a dict 1:1 has *negative* value — it adds a layer without hiding a decision. `get_user(id)` that internally handles TTL, negative caching, stampede locking, and metrics is deep: tiny surface, real complexity absorbed.
5. **Choose boring:** stdlib > popular battle-tested library > writing it yourself. Every dependency is a contract you now maintain; every in-house framework is a mortgage the team pays monthly.
6. **Performance protocol:** (a) know N and call frequency; (b) fix the algorithm class before the constant factor; (c) measure before and after; (d) if you must go ugly, keep the readable version reachable (comment or git history). For n < ~1,000 on a non-hot path, readability wins — full stop. Sorting 200 items per request is nanoseconds; the cache you'd add to "optimize" it is a weekend of invalidation bugs.
7. **Encode decisions in types where cheap.** An `OrderId` newtype, a `NonEmptyList`, a state union — these delete whole bug classes at compile/parse time instead of guarding them at runtime forever.

### Worked example

Three API handlers share ~70% of their shape. The tempting move:

```python
# Tempting: the generic factory
def make_handler(cfg: HandlerConfig):
    async def handler(req):
        if cfg.needs_auth: ...
        if cfg.paginated: ...
        item = cfg.model.parse(req.body) if cfg.model else None
        if cfg.post_hook: cfg.post_hook(item)
        ...
    return handler

users = make_handler(HandlerConfig(model=User, paginated=True,
                                   needs_auth=True, post_hook=audit))
```

Why it's wrong: four flags = 16 execution paths, none fully exercised; the fourth handler will need `pre_hook` and `custom_status`, growing the config forever; and every reader must *mentally simulate a config object* to know what any endpoint does.

The right extraction — only what's genuinely identical:

```python
def parse_pagination(req) -> Pagination:
    """The 12 lines that were byte-identical across all three handlers."""
    ...

# Three explicit handlers remain. Each is boring, complete, and readable top-to-bottom.
```

When does the generic version earn its keep? At handler #5+, with the shape frozen, and when the variation is *data* (a table of routes) rather than *behavior* (flags). Then it's a lookup table, not a flag machine.

### What this prevents

- Framework-in-the-app disease: an internal abstraction everyone fears and no one can delete.
- Optimizing the 97% that was never the problem while the real hot path stays untouched.
- DRY-induced coupling where changing one caller breaks three others.

---
## 4. Clean, idiomatic, well-documented code

Clean code is code whose reader never has to stop and simulate. Every rule below reduces reader simulation.

### Procedure

1. **Naming rules:**
   - Functions are verb phrases describing the *effect*: `send_invoice`, not `invoice_handler`.
   - Booleans read as predicates: `is_expired`, `has_access`, `can_retry` — so `if is_expired:` reads as English.
   - Collections are plural; scalars singular. `for user in users` should feel inevitable.
   - Name length ∝ scope size: `i` is fine for a 3-line loop; a module-level constant gets a full sentence-like name.
   - Symmetric pairs stay symmetric: `open/close`, `acquire/release`, `create/destroy` — never `open/deallocate`.
   - No abbreviations except domain-universal ones (`id`, `url`, `db`).
2. **Function shape:** guard clauses first (reject bad input early), happy path last and *unindented*. One level of abstraction per body — a function either orchestrates steps or does one step, never both. More than 3 positional params → a dataclass/options object, and booleans become keyword-only (`def move(*, overwrite: bool)`) so call sites read as `move(overwrite=True)`, never `move(True)`.
3. **File shape:** public interface at the top, helpers below; group by feature, not by kind. A reader should get the point of the file from its first screen.
4. **Comments explain WHY, never WHAT.** `# retry: vendor returns 200 with an error body — their bug #4521` is gold. `# loop over users` is noise — delete it. Docstrings state the *contract*: arguments, return, what it raises/throws, and side effects. If behavior on `None`/empty isn't in the contract, callers will guess — differently.
5. **Mirror the codebase.** Run its formatter and linter before anything else. Copy its import style, error style, test style. (Prime Directive 4 — repeated because it is the most commonly violated rule in this section.)
6. **Language idioms to reach for by default:**
   - *Python:* comprehensions for transform/filter (never for side effects) · context managers for any acquire/release · `pathlib` over string paths · f-strings · `dataclass`/`NamedTuple` over anonymous dict blobs · `enumerate`/`zip` over `range(len(...))` · emptiness by truthiness (`if not items:`) · type hints on every public signature.
   - *TypeScript:* discriminated unions for state (`{status:"loading"} | {status:"error"; error: E} | {status:"ok"; data: T}`) · `readonly` and `as const` · narrowing via type guards, not casts · `satisfies` for "checked but still inferred" · utility types (`Pick`, `Omit`, `Record`) over hand-copied shapes · `unknown` at boundaries · `async/await` over `.then` chains.

### Worked example

Before — every line forces the reader to simulate:

```python
def proc(d, f=None):
    if d != None:
        if len(d) > 0:
            r = []
            for x in d:
                if f != None:
                    if f(x) == True:
                        r.append(x)
                else:
                    r.append(x)
            return r
    return []
```

After:

```python
def filter_records(
    records: Sequence[Record],
    keep: Callable[[Record], bool] | None = None,
) -> list[Record]:
    """Records for which `keep` is true; all records when `keep` is None.

    Always returns a new list; `records` is never mutated.
    """
    if keep is None:
        return list(records)
    return [r for r in records if keep(r)]
```

Notice the empty-input branch *disappeared* — the comprehension already returns `[]` for empty input. Fewer branches means fewer edge cases to test (this connects to §5.7: the best edge-case handling is a design with fewer edges). The docstring settles the two questions every caller would otherwise guess at: what does `None` mean, and is my list mutated.

### What this prevents

- Review churn on style drowning out the review of substance.
- Misuse born of unclear contracts ("does this raise or return None?") surfacing as prod bugs months later.
- The onboarding tax of clever code — paid by every future reader, forever.

---

## 5. Error handling, input validation, edge cases

Two goals only: **never fail silently**, and **every failure tells the responder what to do**. Everything else is technique.

### Procedure

1. **Validate at trust boundaries, and only there.** Everything crossing *into* the system gets validated: HTTP input, files, env vars, CLI args, third-party API responses, LLM output. Between your own internal functions, don't re-validate — `assert` your invariants and trust the boundary. Re-validation everywhere means nobody knows where the real boundary is.
2. **Separate the two error classes:**
   - *Programmer errors* (bugs): wrong type, violated invariant, impossible state → fail fast and loud; **do not catch**. Catching a bug converts a crash you'd notice into corruption you won't.
   - *Operational errors* (expected reality): network down, file missing, malformed user input → handle *specifically*, with a recovery or a clear message.
3. **Catch specific exceptions.** Exactly one broad catch is allowed per process: the top-level boundary (request handler, main loop, worker), and it must log with full context and return a generic failure — never `pass`.
4. **Every error message answers three questions:** what failed, with what values, what should the reader do. `"Invalid input"` fails all three. `"percent must be within [0, 100], got 240"` passes.
5. **Preserve causes.** Python: `raise NewError(...) from e`. TypeScript: `new Error(msg, { cause: e })`. A re-raise that drops the original stack trace destroys the evidence.
6. **The edge-case checklist** — run it against every new function, mentally at minimum:
   `empty · exactly one · many · huge/max · None/null/undefined · zero & negative · duplicates · unicode & whitespace-only · boundary off-by-one · concurrent/re-entrant call · clock (timezone, DST, ordering) · precision (float, money)`
7. **Design edges away when cheap.** `Decimal` for money removes the precision edge. Timezone-aware datetimes only removes the naive/aware edge. An `OrderId` type removes the "passed a user_id by accident" edge. Deleting an edge beats handling it.

### Worked example

Naive config loader — three failure modes, zero useful messages:

```python
def load_config(path):
    with open(path) as f:
        return json.load(f)
```

Missing file → bare `FileNotFoundError` with no fix hint. Broken JSON → error naming a character offset, not the problem. Valid JSON but wrong shape → `KeyError: 'db_url'` three modules away, mid-request.

Robust version — four failure modes, four *distinct, actionable* messages, all at startup:

```python
class ConfigError(Exception):
    """Configuration missing or invalid. Fatal at startup by design."""

REQUIRED_KEYS = {"db_url", "api_key", "log_level"}

def load_config(path: Path) -> dict[str, Any]:
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        raise ConfigError(
            f"Config not found at {path}. "
            f"Copy config.example.json there and fill in values."
        ) from None
    except OSError as e:
        raise ConfigError(f"Cannot read config at {path}: {e}") from e

    try:
        cfg = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ConfigError(
            f"{path} is not valid JSON (line {e.lineno}, col {e.colno}): {e.msg}"
        ) from e

    if not isinstance(cfg, dict):
        raise ConfigError(f"{path} must contain a JSON object, "
                          f"got {type(cfg).__name__}")

    missing = REQUIRED_KEYS - cfg.keys()
    if missing:
        raise ConfigError(f"{path} is missing required keys: {sorted(missing)}")
    return cfg
```

And note what does *not* happen downstream: no caller re-checks these keys. The boundary validated once; the interior trusts it.

### What this prevents

- Silent corruption — the `except Exception: pass` that turns a typo into three weeks of bad data.
- 3 a.m. errors that say something failed but not what, where, or with which input.
- The classic production crash on empty input that QA never happened to send.

---

## 6. Debugging: a protocol, not vibes

Debugging is applied science: hypothesis, experiment, evidence. Everything else is superstition with a keyboard.

### Procedure — the loop

0. **Stabilize.** Get a deterministic reproduction, then *shrink* it: smallest input, fewest steps. **No repro → no fix.** A fix without a reproduction is a guess wearing a suit; gather logs/metrics until you can reproduce, and do not patch blind.
1. **Read the actual error. All of it.** The exact exception type, the actual values in the message, and the bottom-most stack frame that is *your* code. Skipping this step is the single most common debugging failure — in juniors and in models.
2. **State a falsifiable hypothesis.** "The cache returns a stale entry, so `user.email` at line 40 is the old address." Not "something's wrong with the cache."
3. **Run the cheapest experiment that can say yes/no.** One log line, one breakpoint, one three-line unit test. Design it so *either* outcome teaches you something.
4. **Bisect the search space.** Time → `git bisect`. Code → disable half. Data → shrink the input by half. Layers → print the actual value at each boundary; don't trace it mentally — mental tracing is how you "verify" your own wrong assumption.
5. **One variable at a time, with a written log** of hypotheses tried and killed. (Model: keep it in your scratchpad. Human: a text file.) Untracked debugging revisits the same dead ends after lunch.
6. **When three hypotheses die, attack your certainties.** The bug lives where you're sure it can't be. Verify the library actually behaves as you assume (in isolation), confirm the deploy actually deployed, confirm the file you're editing is the file that runs.
7. **After the fix:** explain *why* it happened (Prime Directive 7); add a regression test that fails without the fix; grep for siblings of the same bug; put the "why" in the commit body.

### Worked example

Symptom: *test passes locally, fails in CI.* The narrated protocol:

| # | Hypothesis | Cheapest experiment | Result |
|---|---|---|---|
| 1 | Dependency/version drift | diff `pip freeze` local vs CI image | Identical — dead |
| 2 | Env differences (TZ, env vars) | print TZ + env in CI job | TZ differs, but the failing test touches no dates — parked |
| 3 | Test isolation: order/parallelism | run locally with CI's exact flags: `pytest -n 4 -p randomly --randomly-seed=<CI's seed>` | **Reproduces** |
| 4 | Which pair interferes? | failing test alone → passes; bisect the preceding tests | `test_settings_override` mutates module-level `config.CACHE_TTL` and never restores it |

Fix the root cause — the state leak — with an autouse fixture that snapshots and restores config (or better, inject config instead of mutating a global). Do **not** "fix" it by disabling test randomization: that hides this bug and every future one of its class. Then grep for other tests assigning to `config.` — the sibling check found two more.

### What this prevents

- Shotgun edits that introduce bug #2 while accidentally masking bug #1.
- Days lost to an assumption that one print statement would have killed in a minute.
- The same bug returning in three months because no regression test pinned it down.

---

## 7. Tests: what to write, what to skip

Tests are executable claims about behavior. A test suite's value is measured by one thing: does it scream when behavior breaks, and stay silent when only implementation changes?

### Procedure

1. **Decide what to test by risk × logic density.** Pure business logic, parsers, money, and date math → exhaustive. Adapters and glue → happy path plus one representative failure. Trivial delegation and framework config → usually nothing. Coverage % is a smell detector, not a target — chasing it produces tests that execute code without claiming anything.
2. **Test through the public interface.** If you need to reach into privates to test, the design is telling you something — listen, extract the logic, test *that*.
3. **Anatomy:** Arrange–Act–Assert, visually separated. One behavior per test. The name states scenario and expectation: `test_apply_discount__percent_over_100__raises` / `it("returns 0 when the cart is empty")`. A failing name should be a bug report by itself.
4. **Shape: the pyramid.** Many fast unit tests on logic; some integration tests on real seams (a real database in a container beats a mocked one — the mock only proves you can predict your own mock); a few end-to-end smoke tests on the money paths.
5. **Sources of cases:** the §5 edge checklist · the acceptance criteria from §1 · every bug you just fixed (its regression test is non-negotiable).
6. **Determinism is mandatory.** Inject clocks, seed randomness, fake the network at the boundary. A flaky test is worse than no test: it trains the team to ignore red. Quarantine and fix it the same day.
7. **Prove the test can fail.** Watch it fail before the fix (test-first), or after writing it, mutate the code (`>` → `>=`, break a constant) and confirm it screams. A test you've never seen fail is a decoration.
8. **Mock policy:** mock what you don't own, at the boundary (HTTP clients, clocks, message brokers). Don't mock what you own — restructure instead. And never assert on your own internals' call counts and arguments — that welds the test to the implementation, so every honest refactor breaks it.

### Worked example

Contract under test:

```python
def apply_discount(price: Decimal, percent: Decimal) -> Decimal:
    """Price after discount, rounded half-up to cents.

    Raises ValueError if percent is outside [0, 100].
    """
```

Table-driven cases straight off the edge checklist (boundaries, zero, rounding):

```python
@pytest.mark.parametrize(
    ("price", "percent", "expected"),
    [
        (Decimal("100.00"), Decimal("0"),     Decimal("100.00")),  # boundary: no discount
        (Decimal("100.00"), Decimal("100"),   Decimal("0.00")),    # boundary: full discount
        (Decimal("100.00"), Decimal("15"),    Decimal("85.00")),   # nominal
        (Decimal("0.00"),   Decimal("50"),    Decimal("0.00")),    # zero price
        (Decimal("99.99"),  Decimal("33.33"), Decimal("66.66")),   # rounding: 66.6633 → 66.66
        (Decimal("0.01"),   Decimal("50"),    Decimal("0.01")),    # sub-cent: 0.005 half-up → 0.01
    ],
)
def test_apply_discount__valid_inputs__expected_price(price, percent, expected):
    assert apply_discount(price, percent) == expected


@pytest.mark.parametrize("percent", [Decimal("-1"), Decimal("100.01")])
def test_apply_discount__percent_out_of_range__raises(percent):
    with pytest.raises(ValueError, match="percent"):
        apply_discount(Decimal("100"), percent)
```

Mutation check (step 7): change the rounding mode to `ROUND_HALF_EVEN`. The `0.01 / 50%` case now yields `0.00` and the suite screams — proof the tests are actually sensitive to the rounding contract, not just executing lines.

### What this prevents

- Green suites that catch nothing — confidence theater.
- Refactor-hostile tests welded to implementation details, making every improvement expensive.
- Flake-driven "just re-run CI" culture, where red stops meaning anything.

---
## 8. Anti-patterns in Python & TypeScript — "looks fine, is dangerous"

Each entry: what it looks like, what actually happens, the fix. All behaviors below are verified, not recalled.

### Python

**8.1 Mutable default argument**

```python
def add_tag(tag: str, tags: list[str] = []) -> list[str]:  # BUG
    tags.append(tag)
    return tags

add_tag("a")   # ['a']
add_tag("b")   # ['a', 'b']  ← the default is ONE list, created at def-time
```

Fix: `tags: list[str] | None = None`, then `tags = [] if tags is None else tags`.

**8.2 Broad except-and-continue**

```python
try:
    process(order)
except Exception:
    pass  # "keep the batch alive"
```

This catches the `KeyError` from your typo exactly as quietly as it catches a network blip — bugs and operational errors become indistinguishable, and data silently rots. Fix: catch the *specific* expected exception; for the rest, log with full context (order id, payload) and re-raise or route to a dead-letter queue.

**8.3 Late-binding closures in loops**

```python
callbacks = [lambda: i for i in range(3)]
[cb() for cb in callbacks]   # [2, 2, 2] — all closures see the final i
```

Fix: bind at creation — `lambda i=i: i` — or `functools.partial`.

**8.4 Float for money**

```python
0.1 + 0.2 == 0.3   # False
```

Fix: `Decimal` (or integer cents) end-to-end: parsing, arithmetic, storage. Converting to float "just for this one calculation" is where the cent goes missing.

**8.5 Naive datetimes / `utcnow()`**

```python
datetime.utcnow()   # returns a NAIVE datetime — no tzinfo (and deprecated in 3.12+)
```

Naive and aware datetimes poison comparisons and arithmetic; the bug surfaces continents away from this line. Fix: aware everywhere — `datetime.now(timezone.utc)` — and treat any naive datetime entering the system as a validation error at the boundary (§5.1). For elapsed-time measurement, `time.monotonic()`, never wall-clock.

**8.6 `assert` as input validation**

```python
def withdraw(amount: Decimal):
    assert amount > 0   # vanishes under `python -O`
```

Asserts document *invariants* for developers; they are stripped in optimized mode. Fix for real validation: `if amount <= 0: raise ValueError(f"amount must be positive, got {amount}")`.

**Rapid-fire list:** shadowing builtins (`list = ...`, `id = ...`) · `is` for value comparison (accidentally works for small ints, breaks at 257) · mutating a list while iterating it (silently skips elements — iterate a copy or build a new list) · f-string SQL (injection — parameterized queries, always) · resources without `with` (leaks under exceptions) · `time.time()` for measuring durations (jumps with clock adjustments).

### TypeScript

**8.7 Floating promises**

```typescript
async function saveAll(users: User[]) {
  users.forEach(async (u) => await repo.save(u)); // forEach discards promises
  console.log("saved"); // logs before ANY save finishes; failures vanish
}
```

Fix: `await Promise.all(users.map((u) => repo.save(u)))` — or `Promise.allSettled` when partial failure must be handled. Turn on `@typescript-eslint/no-floating-promises`; this class of bug is too quiet to catch by eye.

**8.8 `as`-casting external data**

```typescript
const user = (await res.json()) as User; // the compiler now believes a lie
```

The types are fiction the moment the API changes shape; the crash happens deep inside, far from the fetch. Fix: validate at the boundary (§5.1) — `const user = UserSchema.parse(await res.json())` with zod, or a hand-written type guard. Validate once at the edge; trust types inside.

**8.9 Non-null assertion `!`**

```typescript
const el = document.getElementById("app")!; // runtime TypeError, far from here
```

`!` doesn't make the value non-null; it silences the one tool warning you. Fix: check and fail loudly with a message (`if (!el) throw new Error("mount point #app missing")`), or restructure so the type is narrowed naturally.

**8.10 `||` where `??` is meant**

```typescript
const port = config.port || 3000;  // port 0  → 3000; ""  → default too
const port = config.port ?? 3000;  // only null/undefined fall through
```

`||` treats `0`, `""`, and `false` as "missing." Use `??` for defaults; reserve `||` for genuine boolean logic.

**8.11 Default `.sort()` on numbers**

```typescript
[10, 1, 3].sort()              // [1, 10, 3] — lexicographic string compare
[10, 1, 3].sort((a, b) => a - b)  // [1, 3, 10]
```

Looks correct on single-digit test data, corrupts ordering silently in production. Also: `.sort()` mutates in place — `[...xs].sort(...)` when the source must survive.

**8.12 Non-exhaustive switch on a union**

```typescript
type Shape = Circle | Square; // later someone adds Triangle

function area(s: Shape): number {
  switch (s.kind) {
    case "circle": return Math.PI * s.r ** 2;
    case "square": return s.side ** 2;
    default: {
      const _exhaustive: never = s; // compile error the day Triangle appears
      throw new Error(`Unhandled shape: ${JSON.stringify(s)}`);
    }
  }
}
```

Without the `never` trick, adding a variant compiles clean and fails at runtime. This one line converts a future production bug into a present-day compile error.

**Rapid-fire list:** `any` leaking through a module (prefer `unknown` + narrowing; `any` is contagious) · numeric enums (reverse mappings, `0` is falsy — use string-literal unions or `as const` objects) · `for...in` over arrays (string keys, inherited props — use `for...of`) · `JSON.parse`/`stringify` round-trips silently dropping `undefined` and turning `Date` into strings · mutating React props/state directly (stale renders, memoization breaks) · `new Date("2026-07-11")` (date-only strings parse as UTC while datetime-like strings parse as local — construct explicitly).

### What this section prevents

Production incidents from code that read perfectly fine in review — the entire category exists because every pattern above *looks* correct to a competent reader moving fast.

---

## 9. Self-review: the pass sequence

Review your own work as six *separate passes over the diff* (the diff, not the files — the diff is what you're asking others to accept). One pass looking for everything finds nothing.

### Procedure

1. **Fresh-eyes pass.** Read the diff top to bottom as a hostile reviewer. Every hunk must justify itself. Anything that surprises *you* will surprise others more.
2. **Subtraction pass.** Hunt for things to delete: debug prints, commented-out code, unused imports and variables, speculative parameters "for later," and scope creep — any "while I was here" change gets reverted or moved to its own commit (Prime Directive 3).
3. **Contract pass.** Reread the *original request, verbatim*, and the §1 acceptance criteria. Confirm you solved the asked problem — all of it, and only it — not the adjacent problem that got interesting.
4. **Hostility pass.** For each new or changed function, run the §5 edge checklist and ask: "what single input breaks this?"
5. **Proof pass.** Formatter, linter, typechecker, tests — and execute the changed path end-to-end once, for real (Prime Directive 2). Evidence (pasted test output) beats adjectives ("should work").
6. **Story pass.** Write the commit message and PR description *now*. If the explanation comes out convoluted, the change is convoluted — go back.

### Worked example

A 5-line diff hiding four flaws, and which pass catches each:

```diff
+ export async function archiveUser(id: string) {
+   console.log("archiving", id);            // ① subtraction pass: debug leftover
+   const user = getUser(id);                // ② proof pass: missing await —
+                                            //    typechecker flags Promise<User>
+   const recent = user.orders.slice(0, -1); // ③ hostility pass: spec said
+                                            //    "last 10 orders" → slice(-10)
+   markInactive(user);
+ }
- export function deactivateUser(id: string) { ... }
```

Flaw ④ is invisible in the hunk: the rename `deactivateUser → archiveUser` missed one call site. The proof pass (typecheck fails on the dangling reference) or the fresh-eyes pass (a deletion with no matching caller update in the diff) catches it. Four flaws, five lines, zero of them findable by "reading it once carefully."

### What this prevents

- Reviewer trust erosion: three trivial findings and reviewers start assuming carelessness *everywhere*, scrutinizing accordingly, forever.
- The debug print that ships and spams production logs.
- Review round-trips burned on things a linter and ten minutes of self-review catch for free.

---

## 10. Communicating changes

Code says what; only you can say why. The why has a half-life of about two weeks in your own head — write it down while it exists.

### Procedure

**Commits**

1. Summary line: imperative mood, ≤72 chars, specific. `Fix stale cache reads after email change` — not `fix bug`, not `updates`.
2. Body = **why** and consequences; the diff already shows *what*. Context that will be invisible in 18 months: the cause, the constraint, the alternative you rejected.
3. One logical change per commit. Before your first commit in a repo, read `git log --oneline -20` and match the local convention (conventional commits? scopes? issue refs?).

**Pull requests**

4. Template — four sections, each a few sentences:
   - **Problem:** the user-visible symptom or need; link the issue.
   - **Change:** the approach in 2–4 sentences, plus alternatives considered and *why rejected* (this preempts half of all review debate).
   - **Testing:** exactly what you ran, with evidence.
   - **Risk & rollback:** blast radius, how to revert, flags involved.
5. **Direct the reviewer's attention yourself:** "The tricky part is the invalidation in `cache.py:88` — extra eyes there." Confess uncertainty explicitly; hidden uncertainty is a landmine with the reviewer's name on it.
6. If the description needs "and also…" twice, split the PR.

**Explanations (chat, standups, handoffs)**

7. Conclusion first, then reasoning, then detail on request. Describe *behavior*, not a file tour: "emails now retry at most once, after 30s" beats "modified sender.py and added a helper to utils."

### Worked example

```
Bad:   fix bug
Bad:   Updated user service and fixed some issues with caching

Good:  Fix stale cache reads after user email change

       The user cache keyed entries by email address, so changing an
       email left the old entry serving reads until TTL expiry (up to
       15 min). Key by immutable user ID instead and invalidate on
       write. Considered shortening the TTL — rejected: shrinks the
       window without closing it, and triples DB read load.

       Fixes #482
```

The matching PR adds: **Testing** — "new regression test fails on main, passes here; ran the auth integration suite; manually changed an email on staging and confirmed immediate read consistency." **Risk & rollback** — "touches every cache read on the user path; single revertible commit; no schema change."

### What this prevents

- `git blame` archaeology that dead-ends at "fix bug", 18 months later, mid-incident.
- Reviewers reverse-engineering your intent — slow reviews, wrong approvals.
- Rollback hesitation during an incident because nobody recorded what the change touched.

---

## The Final Gate: 7 questions before any code leaves your hands

Run this on **every** piece of code before outputting it. Any answer of "no" or "unsure" means the code is not ready — fix it first. The ten sections above exist so that these seven become reflexes.

1. **Did I execute it?** Did I run this code or its tests and personally observe them pass — and if I could not execute it, did I say so explicitly instead of implying it works?
2. **Is it exactly what was asked?** Rereading the original request word by word: does this satisfy all of it — and nothing beyond it?
3. **What input breaks it?** For every new boundary: empty, null, zero, negative, huge, malformed, duplicate, concurrent — handled, or consciously and visibly excluded?
4. **What can I delete?** Is any debug output, dead code, unused import, speculative flexibility, or drive-by change still in the diff?
5. **Will failure be diagnosable?** If this breaks at 3 a.m., does the error name what failed, with which values, and where to look?
6. **Does it belong here?** Naming, error style, patterns, tests — is this indistinguishable from the best existing code in this repo?
7. **Can I defend every line?** One sentence of justification per hunk to a skeptical senior reviewer — and any line that needs a paragraph instead: rewritten, now?
