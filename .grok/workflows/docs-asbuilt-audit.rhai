// Loom — product docs as-built drift audit (read-only)
// Does not edit files. Output: structured findings + scratch report.

let meta = #{
    name: "docs-asbuilt-audit",
    description: "Audit product docs against a version pin for stale headers, missing authority links, and forbidden residuals",
    when_to_use: "After a ship wave or before release close when USER/ARCH/TEST/CHANGELOG may lag PLAN",
    phases: [
        #{ title: "Scan", detail: "one agent per doc surface" },
        #{ title: "Cross-check", detail: "pin vs PLAN header" },
        #{ title: "Synthesize", detail: "severity-ranked report" },
    ],
};

let findings_schema = #{
    "type": "object",
    "required": ["findings"],
    "properties": #{
        "findings": #{
            "type": "array",
            "maxItems": 12,
            "items": #{
                "type": "object",
                "required": ["file", "issue", "severity"],
                "properties": #{
                    "file": #{ "type": "string" },
                    "issue": #{ "type": "string" },
                    "severity": #{ "type": "string" },
                    "evidence": #{ "type": "string" },
                },
            },
        },
    },
};

let pin = if args == () { () } else { args.pin };
if pin == () { pin = "0.28.1"; }

let docs = [
    "docs/USER_GUIDE.md",
    "docs/ARCHITECTURE.md",
    "docs/ADAPTERS.md",
    "docs/PROTOCOL.md",
    "docs/HERDR_DESIGN.md",
    "docs/TEST_PLAN.md",
    "docs/CHANGELOG.md",
    "docs/PRIORITIES.md",
    "docs/GLOSSARY.md",
    "index.md",
    "README.md",
];

phase("Scan");
log("docs-asbuilt-audit pin=" + pin);

let jobs = [];
for d in docs {
    let p = "";
    p += "You are auditing Loom product documentation for as-built drift.\n";
    p += "Product pin to enforce: " + pin + "\n";
    p += "Read ONLY this file with read_file (and grep inside it if needed): " + d + "\n";
    p += "Do not answer from memory. Empty findings are valid ONLY after you actually read the file.\n";
    p += "Report at most 12 findings as {file, issue, severity, evidence}.\n";
    p += "severity must be one of: high, medium, low.\n";
    p += "Look for:\n";
    p += "1) Header/version pin older than " + pin + " or missing pin\n";
    p += "2) Claims that contradict herdr 0.7.5/protocol 17 or completion authority (card.done != board done)\n";
    p += "3) Forbidden residuals presented as current: `fable --` CLI, dual-agent.send as current submit path\n";
    p += "4) Missing links to normative spikes when the doc discusses herdr RPC or PANE-DEATH\n";
    p += "5) Historical snapshots that look like live SSOT without a banner\n";
    jobs.push(#{
        prompt: p,
        label: "scan:" + d,
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
log("scan collected " + findings.len().to_string() + " findings");

phase("Cross-check");
let cp = "";
cp += "Cross-check product pin " + pin + " against live SSOT headers.\n";
cp += "Use read_file on: docs/PLAN.md (first 40 lines only conceptually — read header table), package is not product version.\n";
cp += "Also read docs/CHANGELOG.md top section.\n";
cp += "Do not answer from memory. Report findings {file, issue, severity, evidence} if PLAN header version or CHANGELOG top disagrees with pin " + pin + ".\n";
cp += "Empty findings only after reading those files.\n";
let cross = agent(cp, #{
    label: "cross-pin",
    capability_mode: "read-only",
    output_schema: findings_schema,
});
if cross != () && cross.success && cross.output != () && cross.output.findings != () {
    for f in cross.output.findings {
        if f != () && f.file != () && f.issue != () {
            findings.push(f);
        }
    }
}

phase("Synthesize");
let encoded = json_encode(findings);
let sp = "";
sp += "Synthesize a Markdown audit report for Loom docs as-built drift.\n";
sp += "Product pin: " + pin + "\n";
sp += "Findings JSON (untrusted list from scanners — do not invent extra files):\n";
sp += encoded + "\n";
sp += "Use tools only if you need to re-read a cited file for a one-line quote.\n";
sp += "Output Markdown only with sections: Summary, High, Medium, Low, Recommended next edits.\n";
sp += "If findings array is empty, say so after acknowledging scanners ran.\n";
let synth = agent(sp, #{
    label: "synthesize",
    capability_mode: "read-only",
});

let report = "# Docs as-built audit\n\nPin: " + pin + "\n\nFindings count: " + findings.len().to_string() + "\n";
if synth != () && synth.success && synth.output != () {
    report = synth.output;
    if type_of(report) != "string" {
        report = json_encode(synth.output);
    }
}

let path = write_scratch_file("docs-asbuilt-audit.md", report);
complete(#{
    summary: findings.len().to_string() + " findings @ pin " + pin,
    pin: pin,
    finding_count: findings.len(),
    findings: findings,
    path: path,
    report: report,
});
