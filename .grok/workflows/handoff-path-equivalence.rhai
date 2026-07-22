// Loom — SessionStart vs no-hook path equivalence preflight / postcheck
// Phase D related. Read-only judgment + optional execute for bun scripts.

let meta = #{
    name: "handoff-path-equivalence",
    description: "Compare SessionStart injection keys vs no-hook ritual keys for HANDOFF continuity (Phase D V4)",
    when_to_use: "Before or after SESSION-CONTINUITY Phase D automation work",
    phases: [
        #{ title: "Inventory", detail: "nine headings + traps + caps" },
        #{ title: "Path-A", detail: "session-context state shape" },
        #{ title: "Path-B", detail: "no-hook ritual shape" },
        #{ title: "Diff", detail: "equivalence gaps" },
    ],
};

let findings_schema = #{
    "type": "object",
    "required": ["findings"],
    "properties": #{
        "findings": #{
            "type": "array",
            "maxItems": 16,
            "items": #{
                "type": "object",
                "required": ["area", "issue", "severity"],
                "properties": #{
                    "area": #{ "type": "string" },
                    "issue": #{ "type": "string" },
                    "severity": #{ "type": "string" },
                    "evidence": #{ "type": "string" },
                },
            },
        },
    },
};

let mode = if args == () { () } else { args.mode };
if mode == () { mode = "preflight"; }

phase("Inventory");
log("handoff-path-equivalence mode=" + mode);

let inv_p = "";
inv_p += "Inventory Loom session continuity contracts. mode=" + mode + "\n";
inv_p += "You MUST use read_file/grep on these paths (not memory):\n";
inv_p += "- HANDOFF.md\n";
inv_p += "- scripts/handoff-headings.ts\n";
inv_p += "- scripts/session-context.ts\n";
inv_p += "- scripts/session-status.ts\n";
inv_p += "- tasks/traps.md (sections 활성 함정 + 하지 말 것)\n";
inv_p += "- docs/spikes/HANDOFF-CHECKPOINT-DESIGN.md sections about V4 and Phase D if present\n";
inv_p += "Return findings about missing REQUIRED headings, HARD_CAP/SOFT_CAP values, and injection contracts.\n";
inv_p += "severity: high|medium|low. Empty list only after reading the files.\n";
let inv = agent(inv_p, #{
    label: "inventory",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

phase("Path-A");
let a_p = "";
a_p += "Analyze Path A: SessionStart / session-context injection.\n";
a_p += "Read scripts/session-context.ts and scripts/handoff-headings.ts with tools.\n";
a_p += "List the exact HANDOFF section set injected for --part state and whether traps.md sections are included.\n";
a_p += "Note fail-open vs fail-closed behavior and truncate/HARD_CAP handling.\n";
a_p += "Report gaps as findings {area, issue, severity, evidence}. area should be path-a.\n";
a_p += "Empty findings only after reading the sources.\n";
let path_a = agent(a_p, #{
    label: "path-a",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

phase("Path-B");
let b_p = "";
b_p += "Analyze Path B: no-hook session ritual (AGENTS.md partial read).\n";
b_p += "Read AGENTS.md session start ritual and HANDOFF.md nine sections with tools.\n";
b_p += "Describe which keys a no-hook agent is instructed to load vs Path A injection.\n";
b_p += "Report inequivalence risks as findings {area, issue, severity, evidence}. area path-b.\n";
b_p += "Empty findings only after reading sources.\n";
let path_b = agent(b_p, #{
    label: "path-b",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

phase("Diff");
let all = [];
if inv != () && inv.success && inv.output != () && inv.output.findings != () {
    for f in inv.output.findings { if f != () { all.push(f); } }
}
if path_a != () && path_a.success && path_a.output != () && path_a.output.findings != () {
    for f in path_a.output.findings { if f != () { all.push(f); } }
}
if path_b != () && path_b.success && path_b.output != () && path_b.output.findings != () {
    for f in path_b.output.findings { if f != () { all.push(f); } }
}

let enc = json_encode(all);
let d_p = "";
d_p += "Equivalence verdict for Loom HANDOFF SessionStart vs no-hook paths. mode=" + mode + "\n";
d_p += "Input findings JSON from prior agents (may be incomplete):\n";
d_p += enc + "\n";
d_p += "Re-read HANDOFF.md and scripts/handoff-headings.ts if needed.\n";
d_p += "Write Markdown: (1) Key set Path A (2) Key set Path B (3) Gaps (4) Phase D work items\n";
d_p += "Be fail-closed: if evidence is thin, say equivalence UNPROVEN not OK.\n";
let diff = agent(d_p, #{
    label: "diff-verdict",
    capability_mode: "read-only",
});

let report = "# Handoff path equivalence\n\nmode: " + mode + "\nfindings: " + all.len().to_string() + "\n";
if diff != () && diff.success && diff.output != () {
    if type_of(diff.output) == "string" {
        report = diff.output;
    } else {
        report = json_encode(diff.output);
    }
}

let path = write_scratch_file("handoff-path-equivalence.md", report);
let ok = all.len() == 0;
let eq_label = "gaps_reported";
if ok {
    eq_label = "no_scanner_findings";
}
complete(#{
    summary: "mode=" + mode + " findings=" + all.len().to_string(),
    mode: mode,
    finding_count: all.len(),
    findings: all,
    path: path,
    report: report,
    equivalence: eq_label,
});
