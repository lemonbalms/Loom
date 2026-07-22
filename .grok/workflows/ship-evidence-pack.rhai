// Loom — assemble ship evidence pack (pins + optional command checks + authority spot)

let meta = #{
    name: "ship-evidence-pack",
    description: "Assemble a ship-readiness evidence pack: version pins, lint/test notes, authority spot-check",
    when_to_use: "Before commit/push of a completed gate wave",
    phases: [
        #{ title: "Pins", detail: "doc/plan version pins" },
        #{ title: "Commands", detail: "status and lint surfaces" },
        #{ title: "Authority", detail: "false-success spot check on recent diff" },
        #{ title: "Pack", detail: "single markdown evidence table" },
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
                "required": ["check", "status", "detail"],
                "properties": #{
                    "check": #{ "type": "string" },
                    "status": #{ "type": "string" },
                    "detail": #{ "type": "string" },
                },
            },
        },
    },
};

let pin = if args == () { () } else { args.pin };
if pin == () { pin = "0.28.1"; }

let include_herdr = if args == () { () } else { args.include_dogfood_herdr };
if include_herdr == () { include_herdr = false; }

phase("Pins");
log("ship-evidence-pack pin=" + pin);

let pin_jobs = [];
let pin_files = [
    "docs/PLAN.md",
    "docs/CHANGELOG.md",
    "docs/USER_GUIDE.md",
    "docs/TEST_PLAN.md",
    "docs/ARCHITECTURE.md",
    "HANDOFF.md",
    "index.md",
];
for f in pin_files {
    let p = "";
    p += "Ship pin check for " + f + " against product pin " + pin + ".\n";
    p += "Read the file with tools. Report findings as {check, status, detail}.\n";
    p += "status must be pass|fail|skip.\n";
    p += "check should name the file. detail one line on version/header alignment.\n";
    p += "fail if document claims an older product version as current without historical banner.\n";
    pin_jobs.push(#{
        prompt: p,
        label: "pin:" + f,
        capability_mode: "read-only",
        output_schema: findings_schema,
    });
}
let pin_results = parallel(pin_jobs);

let checks = [];
for r in pin_results {
    if r != () && r.success && r.output != () && r.output.findings != () {
        for f in r.output.findings {
            if f != () { checks.push(f); }
        }
    } else {
        checks.push(#{
            check: "pin-agent",
            status: "skip",
            detail: "scanner failed or empty",
        });
    }
}

phase("Commands");
let cmd_p = "";
cmd_p += "Run Loom ship command surfaces and report {check, status, detail}.\n";
cmd_p += "Working directory is the Loom repo root.\n";
cmd_p += "Run if possible:\n";
cmd_p += "1) bun run status\n";
cmd_p += "2) bun run handoff:lint\n";
cmd_p += "3) bun run session-context:lint\n";
cmd_p += "4) bun run loom --version\n";
cmd_p += "Do NOT run full bun test suite unless quick and safe; if skipped, status=skip with reason.\n";
if include_herdr == true {
    cmd_p += "5) bun run dogfood:herdr (may fail if herdr missing — then skip with reason)\n";
} else {
    cmd_p += "5) dogfood:herdr SKIP by args.include_dogfood_herdr=false\n";
}
cmd_p += "status pass|fail|skip. Be honest.\n";
let cmd_r = agent(cmd_p, #{
    label: "commands",
    capability_mode: "execute",
    output_schema: findings_schema,
});
if cmd_r != () && cmd_r.success && cmd_r.output != () && cmd_r.output.findings != () {
    for f in cmd_r.output.findings {
        if f != () { checks.push(f); }
    }
} else {
    checks.push(#{
        check: "commands",
        status: "skip",
        detail: "command agent failed — run bun test / handoff:lint manually",
    });
}

phase("Authority");
let auth_p = "";
auth_p += "Spot-check recent changes for completion-authority regressions.\n";
auth_p += "Use git log/diff for HEAD~20..HEAD and grep for card.done, board done, pane.close, agent.prompt, herdrProtocol.\n";
auth_p += "Report findings {check, status, detail}. status fail only with concrete path evidence.\n";
auth_p += "If clean, one pass finding.\n";
let auth_r = agent(auth_p, #{
    label: "authority",
    capability_mode: "read-only",
    output_schema: findings_schema,
});
if auth_r != () && auth_r.success && auth_r.output != () && auth_r.output.findings != () {
    for f in auth_r.output.findings {
        if f != () { checks.push(f); }
    }
}

phase("Pack");
let enc = json_encode(checks);
let pack_p = "";
pack_p += "Build a ship evidence Markdown pack for Loom pin " + pin + ".\n";
pack_p += "Checks JSON:\n" + enc + "\n";
pack_p += "Format:\n";
pack_p += "# Ship evidence pack\n";
pack_p += "Pin, date note (no wall clock invent — say session run),\n";
pack_p += "Table: check | status | detail\n";
pack_p += "Overall: READY | NOT READY | PARTIAL based on any fail (fail => NOT READY).\n";
pack_p += "Next actions list.\n";
let pack_r = agent(pack_p, #{
    label: "pack",
    capability_mode: "read-only",
});

let report = "# Ship evidence pack\n\npin: " + pin + "\n\n" + enc + "\n";
if pack_r != () && pack_r.success && pack_r.output != () {
    if type_of(pack_r.output) == "string" {
        report = pack_r.output;
    } else {
        report = json_encode(pack_r.output);
    }
}

// Fail-closed overall if any status == fail
let failed = 0;
for c in checks {
    if c != () && c.status == "fail" {
        failed += 1;
    }
}
let overall = "PARTIAL";
if failed > 0 {
    overall = "NOT_READY";
} else if checks.len() > 0 {
    overall = "READY_OR_PARTIAL";
}

let path = write_scratch_file("ship-evidence-pack.md", report);
complete(#{
    summary: overall + " pin=" + pin + " checks=" + checks.len().to_string() + " fails=" + failed.to_string(),
    pin: pin,
    overall: overall,
    fail_count: failed,
    checks: checks,
    path: path,
    report: report,
});
