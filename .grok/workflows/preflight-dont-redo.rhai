// Loom — preflight match of intent against traps / don't-redo / lessons index

let meta = #{
    name: "preflight-dont-redo",
    description: "Match a work intent against HANDOFF don't-redo, traps, and lessons index before coding",
    when_to_use: "Start of a wave or before claiming a board task",
    phases: [
        #{ title: "Load", detail: "traps, handoff, lessons index" },
        #{ title: "Match", detail: "parallel relevance scoring" },
        #{ title: "Brief", detail: "short force list for implementer" },
    ],
};

let hits_schema = #{
    "type": "object",
    "required": ["hits"],
    "properties": #{
        "hits": #{
            "type": "array",
            "maxItems": 12,
            "items": #{
                "type": "object",
                "required": ["source", "rule", "severity", "why"],
                "properties": #{
                    "source": #{ "type": "string" },
                    "rule": #{ "type": "string" },
                    "severity": #{ "type": "string" },
                    "why": #{ "type": "string" },
                },
            },
        },
    },
};

let intent = if args == () { () } else { args.intent };
if intent == () {
    pause("verification", "Pass args.intent — one-line description of the work about to start.");
}

let paths = if args == () { () } else { args.paths };
let paths_text = "";
if paths != () {
    paths_text = json_encode(paths);
} else {
    paths_text = "[]";
}

phase("Load");
log("preflight-dont-redo intent loaded");

// Parallel load+match by source (fixed sources — script scoped)
phase("Match");
let sources = [
    #{ id: "traps", file: "tasks/traps.md" },
    #{ id: "dont-redo", file: "HANDOFF.md" },
    #{ id: "lessons-index", file: "tasks/lessons.md" },
    #{ id: "invariants", file: "HANDOFF.md" },
];

let jobs = [];
for s in sources {
    let p = "";
    p += "Preflight re-offense scan for Loom.\n";
    p += "Work intent: " + json_encode(intent) + "\n";
    p += "Touched paths hint (may be empty): " + paths_text + "\n";
    p += "Read with tools: " + s.file + "\n";
    p += "Source focus id: " + s.id + "\n";
    p += "If source is HANDOFF.md, focus Don't redo + Invariants sections for id=" + s.id + ".\n";
    p += "If traps.md, focus 활성 함정 + 하지 말 것.\n";
    p += "If lessons index, list only index lines that match the intent category.\n";
    p += "Return hits {source, rule, severity, why}. severity high|medium|low.\n";
    p += "source field must be " + s.id + ".\n";
    p += "Empty hits only after reading the file and finding no relevance.\n";
    p += "Do not invent rules not present in the file.\n";
    jobs.push(#{
        prompt: p,
        label: "match:" + s.id,
        capability_mode: "read-only",
        output_schema: hits_schema,
    });
}
let results = parallel(jobs);

let hits = [];
for r in results {
    if r != () && r.success && r.output != () && r.output.hits != () {
        for h in r.output.hits {
            if h != () && h.rule != () {
                hits.push(h);
            }
        }
    }
}

phase("Brief");
let enc = json_encode(hits);
let bp = "";
bp += "Write a SHORT implementer preflight brief (max ~25 lines Markdown).\n";
bp += "Intent: " + json_encode(intent) + "\n";
bp += "Matched hits JSON:\n" + enc + "\n";
bp += "Sections: Must not redo, Active traps, Lessons to load, Safe to proceed checklist.\n";
bp += "If hits empty, still remind to run bun run status and read HANDOFF Current action.\n";
bp += "Do not invent new product requirements.\n";
let brief_r = agent(bp, #{
    label: "brief",
    capability_mode: "read-only",
});

let report = "# Preflight don't-redo\n\nintent: " + intent + "\n\nhits: " + hits.len().to_string() + "\n";
if brief_r != () && brief_r.success && brief_r.output != () {
    if type_of(brief_r.output) == "string" {
        report = brief_r.output;
    } else {
        report = json_encode(brief_r.output);
    }
}

let path = write_scratch_file("preflight-dont-redo.md", report);
complete(#{
    summary: hits.len().to_string() + " hits for intent",
    intent: intent,
    hit_count: hits.len(),
    hits: hits,
    path: path,
    report: report,
});
