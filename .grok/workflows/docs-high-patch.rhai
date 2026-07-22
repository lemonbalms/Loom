// Loom — semi-auto docs High finding patch (plan → human gate → fix → verify)
// Does NOT commit/push. Does NOT replace formal R{n} or product code lanes.
// Authority edits must cite PLAN / spikes / 0.28.0 completion rules — never invent policy.

let meta = #{
    name: "docs-high-patch",
    description: "Plan High-severity doc drift fixes, pause for human approval, apply minimal edits, then re-verify",
    when_to_use: "After docs-asbuilt-audit (or similar) when High findings need a gated patch wave",
    phases: [
        #{ title: "Select", detail: "normalize High findings" },
        #{ title: "Plan", detail: "minimal edit plan per finding" },
        #{ title: "Approve", detail: "human gate before any write" },
        #{ title: "Fix", detail: "apply approved doc edits" },
        #{ title: "Verify", detail: "confirm each finding is gone" },
    ],
};

let plan_schema = #{
    "type": "object",
    "required": ["file", "issue", "edits_summary", "authority", "risk", "proceed"],
    "properties": #{
        "file": #{ "type": "string" },
        "issue": #{ "type": "string" },
        "edits_summary": #{ "type": "string" },
        "authority": #{ "type": "string" },
        "risk": #{ "type": "string" },
        "proceed": #{ "type": "boolean" },
        "skip_reason": #{ "type": "string" },
    },
};

let fix_schema = #{
    "type": "object",
    "required": ["file", "changed", "summary"],
    "properties": #{
        "file": #{ "type": "string" },
        "changed": #{ "type": "boolean" },
        "summary": #{ "type": "string" },
        "paths_touched": #{
            "type": "array",
            "items": #{ "type": "string" },
        },
    },
};

let verify_schema = #{
    "type": "object",
    "required": ["file", "issue", "fixed", "evidence"],
    "properties": #{
        "file": #{ "type": "string" },
        "issue": #{ "type": "string" },
        "fixed": #{ "type": "boolean" },
        "evidence": #{ "type": "string" },
        "residual": #{ "type": "string" },
    },
};

let pin = if args == () { () } else { args.pin };
if pin == () { pin = "0.28.1"; }

// Optional: only apply plans with proceed=true that user already expects.
// findings: [{file, issue, evidence?, severity?}] — if omitted, use last-audit High defaults.
let findings = [];
let src = "defaults-high3";
if args != () && args.findings != () {
    findings = args.findings;
    src = "args.findings";
}

if findings.len() == 0 {
    // Defaults from docs-asbuilt-audit pin 0.28.1 High cluster (override via args.findings).
    findings.push(#{
        file: "docs/HERDR_DESIGN.md",
        issue: "§4.1.1 state-machine table maps logical done / [DONE] → board status done; contradicts 0.28.0 completion authority (card.done ≠ board done; remote result → blocked only)",
        evidence: "done mapping and one-way transition to done unmarked as superseded while banner/§3.5 correctly require blocked",
        severity: "High",
    });
    findings.push(#{
        file: "docs/TEST_PLAN.md",
        issue: "Footer product pin is 0.13.12 while header pins CLI v0.28.1 · herdr 0.7.5 / p17 — self-invalidating",
        evidence: "header current pin vs footer *기준 버전: 제품 0.13.12*",
        severity: "High",
    });
    findings.push(#{
        file: "README.md",
        issue: "Relay inbox/roster described as in-memory in body while Features claims durable inbox/roster across restarts (0.14.x; LOOM_RELAY_EPHEMERAL=1 opt-out)",
        evidence: "body in-memory vs Features durable 0.14.x claim",
        severity: "High",
    });
}

// Filter: defaults/src without explicit findings → High only.
// Explicit args.findings → keep all items (caller already selected the batch).
// Optional args.severity ("High"|"Medium"|"Low") re-filters either source.
let want_sev = if args == () { () } else { args.severity };
let selected = [];
for f in findings {
    if f == () { continue; }
    if f.file == () || f.issue == () { continue; }
    let sev = if f.severity == () { "High" } else { f.severity };
    let keep = false;
    if want_sev != () {
        // Explicit filter wins (case-insensitive High/Medium/Low).
        if want_sev == sev || want_sev == "all" || want_sev == "ALL" {
            keep = true;
        } else if want_sev == "High" || want_sev == "high" {
            if sev == "High" || sev == "high" || sev == "HIGH" { keep = true; }
        } else if want_sev == "Medium" || want_sev == "medium" {
            if sev == "Medium" || sev == "medium" || sev == "MEDIUM" { keep = true; }
        } else if want_sev == "Low" || want_sev == "low" {
            if sev == "Low" || sev == "low" || sev == "LOW" { keep = true; }
        }
    } else if src == "args.findings" {
        keep = true;
    } else {
        if sev == "High" || sev == "high" || sev == "HIGH" { keep = true; }
    }
    if keep {
        selected.push(#{
            file: f.file,
            issue: f.issue,
            evidence: if f.evidence == () { "" } else { f.evidence },
            severity: sev,
        });
    }
}

if selected.len() == 0 {
    pause("verification", "No findings to patch. Pass args.findings as [{file, issue, evidence?, severity}] or args.severity.");
}

phase("Select");
log("docs-high-patch pin=" + pin + " source=" + src + " count=" + selected.len().to_string());

// --- Plan (read-only, parallel) ---
phase("Plan");
let pjobs = [];
let pi = 0;
for f in selected {
    let p = "";
    p += "You are planning a MINIMAL documentation fix for Loom product docs.\n";
    p += "Product pin: " + pin + "\n";
    p += "Target file (read with read_file/grep; do not edit): " + f.file + "\n";
    p += "Finding issue: " + f.issue + "\n";
    p += "Evidence hint: " + f.evidence + "\n\n";
    p += "Also read authority SSOT as needed (do not invent product policy):\n";
    p += "- docs/PLAN.md header / completion authority notes for this pin\n";
    p += "- docs/CHANGELOG.md relevant 0.28.x entries\n";
    p += "- docs/spikes/HERDR-0.7.5-COMPAT.md and/or PANE-DEATH design if herdr/card.done related\n";
    p += "- docs/GLOSSARY.md if terms conflict\n\n";
    p += "Rules:\n";
    p += "1. Prefer the smallest edit that removes the contradiction (table row, one paragraph, footer pin).\n";
    p += "2. Cite authority in the authority field (file + section).\n";
    p += "3. Set proceed=false if the fix would change product behavior claims without clear SSOT, or if the finding is already fixed.\n";
    p += "4. risk: short note on what could go wrong (wrong terminal state, etc.).\n";
    p += "5. edits_summary: concrete steps a fixer agent can follow (section, old meaning → new meaning). No full file rewrite.\n";
    p += "6. Do not edit files in this phase.\n";
    pjobs.push(#{
        prompt: p,
        label: "plan:" + pi.to_string() + ":" + f.file,
        capability_mode: "read-only",
        output_schema: plan_schema,
    });
    pi += 1;
}
let plans_raw = parallel(pjobs);

let plans = [];
let plan_md = "";
plan_md += "# Docs High Patch — Plan (awaiting approval)\n\n";
plan_md += "**Pin:** " + pin + "  \n";
plan_md += "**Source:** " + src + "  \n";
plan_md += "**Findings:** " + selected.len().to_string() + "\n\n";
plan_md += "Resume this workflow only if you approve applying the **proceed=true** plans below.\n";
plan_md += "On resume, Fix agents will edit the working tree (no commit).\n\n";

let pi2 = 0;
for r in plans_raw {
    let base = selected[pi2];
    if r != () && r.success && r.output != () {
        let o = r.output;
        let proceed = if o.proceed == () { false } else { o.proceed };
        let entry = #{
            file: if o.file == () { base.file } else { o.file },
            issue: if o.issue == () { base.issue } else { o.issue },
            edits_summary: if o.edits_summary == () { "" } else { o.edits_summary },
            authority: if o.authority == () { "" } else { o.authority },
            risk: if o.risk == () { "" } else { o.risk },
            proceed: proceed,
            skip_reason: if o.skip_reason == () { "" } else { o.skip_reason },
            evidence: base.evidence,
        };
        plans.push(entry);
        plan_md += "### " + (pi2 + 1).to_string() + ". `" + entry.file + "`\n";
        plan_md += "- **proceed:** " + if entry.proceed { "YES" } else { "NO" } + "\n";
        plan_md += "- **issue:** " + entry.issue + "\n";
        plan_md += "- **edits:** " + entry.edits_summary + "\n";
        plan_md += "- **authority:** " + entry.authority + "\n";
        plan_md += "- **risk:** " + entry.risk + "\n";
        if entry.skip_reason != "" {
            plan_md += "- **skip_reason:** " + entry.skip_reason + "\n";
        }
        plan_md += "\n";
    } else {
        plans.push(#{
            file: base.file,
            issue: base.issue,
            edits_summary: "",
            authority: "",
            risk: "planner failed",
            proceed: false,
            skip_reason: "plan agent failed or empty",
            evidence: base.evidence,
        });
        plan_md += "### " + (pi2 + 1).to_string() + ". `" + base.file + "`\n";
        plan_md += "- **proceed:** NO (planner failed)\n";
        plan_md += "- **issue:** " + base.issue + "\n\n";
    }
    pi2 += 1;
}

let plan_path = write_scratch_file("docs-high-patch-plan.md", plan_md);
log("plan written: " + plan_path);

let approved_n = 0;
for p in plans {
    if p.proceed == true { approved_n += 1; }
}
if approved_n == 0 {
    complete(#{
        summary: "No proceed=true plans — nothing to apply. See plan scratch.",
        pin: pin,
        plan_path: plan_path,
        plans: plans,
        fixed: [],
        residuals: [],
    });
}

// --- Human gate ---
phase("Approve");
let gate_msg = "";
gate_msg += "docs-high-patch: " + approved_n.to_string() + "/" + plans.len().to_string();
gate_msg += " plans marked proceed=true for pin " + pin + ".\n";
gate_msg += "Review scratch plan (docs-high-patch-plan.md / run artifacts).\n";
gate_msg += "Resume ONLY to apply those edits in the working tree (no commit).\n";
gate_msg += "If you reject, stop the run instead of resuming.";
await_user("user", gate_msg);

// --- Fix (read-write; sequential by index to reduce same-file races) ---
phase("Fix");
let fix_results = [];
let fi = 0;
for p in plans {
    if p.proceed != true {
        fix_results.push(#{
            file: p.file,
            changed: false,
            summary: "skipped (proceed=false): " + p.skip_reason,
            paths_touched: [],
        });
        fi += 1;
        continue;
    }
    let fp = "";
    fp += "You are applying an APPROVED minimal documentation fix for Loom.\n";
    fp += "Product pin: " + pin + "\n";
    fp += "File to edit: " + p.file + "\n";
    fp += "Original issue: " + p.issue + "\n";
    fp += "Approved edit plan: " + p.edits_summary + "\n";
    fp += "Authority cite: " + p.authority + "\n\n";
    fp += "Requirements:\n";
    fp += "1. Read the file first. Apply the SMALLEST edit that fixes the stated issue.\n";
    fp += "2. Use search_replace (preferred) or write only if necessary. Do not reformat the whole file.\n";
    fp += "3. Do not edit other files unless the plan explicitly requires a one-line cross-link and it is necessary for consistency.\n";
    fp += "4. Do not commit, push, or run destructive git commands.\n";
    fp += "5. Do not invent new product policy; if the plan conflicts with on-disk SSOT, make no edit and set changed=false with summary explaining why.\n";
    fp += "6. Return {file, changed, summary, paths_touched}.\n";
    let fr = agent(fp, #{
        label: "fix:" + fi.to_string() + ":" + p.file,
        capability_mode: "read-write",
        output_schema: fix_schema,
    });
    if fr != () && fr.success && fr.output != () {
        fix_results.push(fr.output);
    } else {
        fix_results.push(#{
            file: p.file,
            changed: false,
            summary: "fix agent failed",
            paths_touched: [],
        });
    }
    fi += 1;
}

// --- Verify (read-only) ---
phase("Verify");
let vjobs = [];
let vi = 0;
for p in plans {
    let vp = "";
    vp += "Verify whether this documentation finding is fixed after an approved patch attempt.\n";
    vp += "Product pin: " + pin + "\n";
    vp += "File: " + p.file + "\n";
    vp += "Original issue: " + p.issue + "\n";
    vp += "Evidence hint: " + p.evidence + "\n";
    vp += "Intended edit: " + p.edits_summary + "\n\n";
    vp += "Read the file with tools. Set fixed=true only with concrete evidence the contradiction is gone.\n";
    vp += "If residual problems remain, set fixed=false and describe residual.\n";
    vp += "Do not edit files.\n";
    vjobs.push(#{
        prompt: vp,
        label: "verify:" + vi.to_string() + ":" + p.file,
        capability_mode: "read-only",
        output_schema: verify_schema,
    });
    vi += 1;
}
let vraw = parallel(vjobs);

let verifications = [];
let fixed = [];
let residuals = [];
let vi2 = 0;
for vr in vraw {
    let base = plans[vi2];
    if vr != () && vr.success && vr.output != () {
        let o = vr.output;
        verifications.push(o);
        if o.fixed == true {
            fixed.push(o);
        } else {
            residuals.push(o);
        }
    } else {
        let fail = #{
            file: base.file,
            issue: base.issue,
            fixed: false,
            evidence: "",
            residual: "verify agent failed",
        };
        verifications.push(fail);
        residuals.push(fail);
    }
    vi2 += 1;
}

// --- Report ---
let report = "";
report += "# Docs High Patch — Result\n\n";
report += "**Pin:** " + pin + "  \n";
report += "**Plans proceed:** " + approved_n.to_string() + "/" + plans.len().to_string() + "  \n";
report += "**Verified fixed:** " + fixed.len().to_string() + "  \n";
report += "**Residuals:** " + residuals.len().to_string() + "\n\n";

report += "## Fix outcomes\n\n";
for fr in fix_results {
    let ch = if fr.changed == true { "changed" } else { "no-change" };
    report += "- `" + fr.file + "` — **" + ch + "**: " + fr.summary + "\n";
}
report += "\n## Verification\n\n";
for v in verifications {
    let st = if v.fixed == true { "FIXED" } else { "RESIDUAL" };
    report += "### `" + v.file + "` — " + st + "\n";
    report += "- issue: " + v.issue + "\n";
    report += "- evidence: " + v.evidence + "\n";
    if v.residual != () && v.residual != "" {
        report += "- residual: " + v.residual + "\n";
    }
    report += "\n";
}

report += "## Next (human)\n\n";
report += "1. `git diff` the touched docs\n";
report += "2. Optionally re-run `/docs-asbuilt-audit`\n";
report += "3. Commit only when the wave is complete (workflow does not commit)\n";

let report_path = write_scratch_file("docs-high-patch-result.md", report);
log("result written: " + report_path);

let summary = "";
summary += "docs-high-patch pin=" + pin;
summary += " fixed=" + fixed.len().to_string();
summary += " residual=" + residuals.len().to_string();

complete(#{
    summary: summary,
    pin: pin,
    plan_path: plan_path,
    report_path: report_path,
    plans: plans,
    fix_results: fix_results,
    fixed: fixed,
    residuals: residuals,
});
