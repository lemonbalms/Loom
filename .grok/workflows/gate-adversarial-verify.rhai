// Loom — adversarial multi-dimension review + skeptic panel (read-only)
// Does NOT replace formal R{n}/fable-advisor when WORKFLOW §5.1 requires it.

let meta = #{
    name: "gate-adversarial-verify",
    description: "Review a git range across Loom risk dimensions then adversarially verify each finding",
    when_to_use: "After a PATCH/docs/impl wave for cheap second-pass; not a substitute for formal R{n}",
    phases: [
        #{ title: "Review", detail: "one reviewer per dimension" },
        #{ title: "Verify", detail: "one skeptic per finding" },
        #{ title: "Report", detail: "confirmed only" },
    ],
};

let findings_schema = #{
    "type": "object",
    "required": ["findings"],
    "properties": #{
        "findings": #{
            "type": "array",
            "maxItems": 8,
            "items": #{
                "type": "object",
                "required": ["file", "issue"],
                "properties": #{
                    "file": #{ "type": "string" },
                    "issue": #{ "type": "string" },
                    "dim": #{ "type": "string" },
                },
            },
        },
    },
};

let verdict_schema = #{
    "type": "object",
    "required": ["real", "reason", "evidence"],
    "properties": #{
        "real": #{ "type": "boolean" },
        "reason": #{ "type": "string" },
        "evidence": #{ "type": "string" },
    },
};

let target = if args == () { () } else { args.target };
if target == () { target = "HEAD~15..HEAD"; }

// Fixed dimension list in script (do not trust agent to invent scope)
let dimensions = [
    "completion-authority",
    "herdr-compat",
    "docs-sync",
    "test-locks",
];

phase("Review");
log("gate-adversarial-verify target=" + target);

let jobs = [];
for d in dimensions {
    let p = "";
    p += "Review git range " + target + " for Loom dimension: " + d + ".\n";
    p += "You MUST use tools: run git diff / git log as needed, read_file, grep. Do not answer from memory.\n";
    p += "Dimension guidance:\n";
    p += "- completion-authority: card.done, pane exit, remote result -> board done, false success\n";
    p += "- herdr-compat: protocol 17, agent.prompt, named agent target, config-only 17 bypass\n";
    p += "- docs-sync: USER/ARCH/TEST/CHANGELOG pins lag code\n";
    p += "- test-locks: missing red tests, weakened asserts, expected-red left as greenwash\n";
    p += "Report at most 8 findings {file, issue, dim}. dim must equal " + d + ".\n";
    p += "Empty list is valid only after inspecting the actual diff.\n";
    jobs.push(#{
        prompt: p,
        label: "review:" + d,
        capability_mode: "read-only",
        output_schema: findings_schema,
    });
}
let results = parallel(jobs);

let findings = [];
for r in results {
    if r != () && r.success && r.output != () && r.output.findings != () {
        for f in r.output.findings {
            if f != () && f.file != () && f.issue != () {
                findings.push(f);
            }
        }
    }
}

// Cap findings for verify budget
let MAX_F = 12;
if findings.len() > MAX_F {
    log("truncating findings from " + findings.len().to_string() + " to " + MAX_F.to_string());
    let trimmed = [];
    let i = 0;
    while i < MAX_F {
        trimmed.push(findings[i]);
        i += 1;
    }
    findings = trimmed;
}

if findings.len() == 0 {
    complete(#{
        summary: "No review findings in " + target,
        target: target,
        confirmed: [],
        finding_count: 0,
    });
}

phase("Verify");
let vjobs = [];
for f in findings {
    let issue = f.issue;
    let file = f.file;
    let vp = "";
    vp += "Adversarially verify this review finding by reading shipped code/docs yourself.\n";
    vp += "Finding issue: " + json_encode(issue) + "\n";
    vp += "File: " + json_encode(file) + "\n";
    vp += "Git range context: " + target + "\n";
    vp += "Use read_file/grep/git show. Set real=true ONLY with concrete evidence you independently inspected.\n";
    vp += "Default real=false when uncertain. evidence must quote path or symbol.\n";
    vjobs.push(#{
        prompt: vp,
        label: "verify",
        capability_mode: "read-only",
        output_schema: verdict_schema,
    });
}
let verdicts = parallel(vjobs);

let confirmed = [];
let i = 0;
for v in verdicts {
    if v != () && v.success && v.output != ()
        && v.output.real == true
        && v.output.evidence != () && v.output.evidence != "" {
        confirmed.push(#{
            file: findings[i].file,
            issue: findings[i].issue,
            evidence: v.output.evidence,
            reason: v.output.reason,
        });
    }
    i += 1;
}

phase("Report");
log(confirmed.len().to_string() + "/" + findings.len().to_string() + " survived verification");

let rep = "# Gate adversarial verify\n\n";
rep += "target: " + target + "\n";
rep += "reviewed: " + findings.len().to_string() + "\n";
rep += "confirmed: " + confirmed.len().to_string() + "\n\n";
rep += "## Confirmed\n\n";
rep += json_encode(confirmed);
rep += "\n";

let path = write_scratch_file("gate-adversarial-verify.md", rep);
complete(#{
    summary: confirmed.len().to_string() + " confirmed / " + findings.len().to_string() + " reviewed",
    target: target,
    reviewed: findings.len(),
    confirmed: confirmed,
    path: path,
    report: rep,
    note: "Not a formal R{n}. Use fable-advisor when WORKFLOW requires it.",
});
