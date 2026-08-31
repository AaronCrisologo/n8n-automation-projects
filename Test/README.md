# Test — Workflow Validators

Four scripts that check the n8n workflow JSONs in this repo. Two Python scripts do static structural / data-flow checks; two Node.js test files run the actual Code-node JS in sandboxed VMs against realistic fixtures. None require a running n8n instance or any external services.

## Why this exists

Both workflows in this portfolio are non-trivial (23 and 20 nodes). Before submitting, I wanted confidence that:
- Every node in the graph is reachable from the trigger
- No node references another node by name that doesn't exist
- No Code node uses Jinja syntax (which n8n doesn't support)
- Every `{{ $json.X }}` expression points to a field that's actually set by an upstream node
- **The JS in Code nodes actually does what it claims** (regex stripping, currency parsing, filename building, attachment walking, etc.)

The last one is what the `workflow_*_code_tests/` files cover — the static scripts can't see inside JS function bodies.

## Directory layout

```
Test/
├── run_all_tests.js               # runs everything below
├── validate_workflows.py          # static: graph integrity
├── trace_data_flow.py             # static: field reference tracing
├── workflow_1_code_tests/
│   └── test.js                    # 31 unit tests for Gmail workflow
└── workflow_2_code_tests/
    └── test.js                    # 28 unit tests for Telegram workflow
```

## Scripts

### `validate_workflows.py` — Graph integrity checker

Checks:
- All connection sources and targets resolve to a real node
- No orphan nodes (except the trigger)
- Code-node `$('NodeName')` references resolve
- No Jinja-style `{% if %}` / `{% for %}` syntax anywhere
- If-nodes have appropriate branches
- HTTP node URLs don't have unreplaced `YOUR_` placeholders

### `trace_data_flow.py` — Field reference tracer

Walks the graph in topological order, collecting what fields each node sets in `$json`, then verifies that downstream nodes only reference fields that exist upstream.

**Note:** This tracer has some known false positives around HTTP-response fields, spread operators, and ternary expressions. It catches real bugs but may also flag a few things that are actually fine. Always confirm a warning before treating it as a bug.

### `workflow_1_code_tests/test.js` — Gmail Code-node unit tests

Extracts the JavaScript from each of the 6 Code nodes in `gmail-attachments-workflow.json` and runs it in a `vm` sandbox with a mock n8n runtime.

Tests cover:
- **Build Dynamic Gmail Search Query** — picks first non-empty label, strips `label:` prefix
- **Extract Sender & Email Metadata** (most complex, 65 lines) — parses `From` header, recursively walks `payload.parts` to collect attachments, filters out Gmail system labels
- **Prepare: Mark Email as Read** — pass-through
- **Prepare Sender & Date Folder Names** — sanitizes illegal Drive chars, RFC 2822 + ISO date parsing, single-quote escaping
- **Merge: Resolve Sender Folder ID** / **Merge: Resolve Date Folder ID** — newly created vs existing branch, throws on failure

Currently **31 test cases**, all passing. Includes a few "documented limitation" tests that pin down known edge cases in the code (e.g. `CATEGORY_Promotions` is not filtered by the label regex because the pattern is anchored).

### `workflow_2_code_tests/test.js` — Telegram Code-node unit tests

Extracts the JavaScript from each of the 4 Code nodes in `telegram-receipt-workflow.json`.

Tests cover:
- **Pick Best Photo** — picks the largest photo, handles missing fields, single-photo messages, empty array
- **Build Receipt Payload** — filename format `receipt_<userid>_<timestamp>.<ext>`, anon fallback, jpg extension fallback
- **Parse & Normalize Gemini Output** — markdown fence stripping, `toNumber` with currency strings (`"$1,234.56"`), negative values, non-numeric → null, malformed JSON → `parseError: true`, line_items serialization
- **Prepare Date Folder Name** — illegal char replacement, single-quote escaping, today fallback
- **Merge: Resolve Date Folder ID** — newly created vs existing branch, throws on failure
- **Build Confirmation Message** — full format, missing-field fallbacks, omits time when absent

Currently **28 test cases**, all passing. Catches real bugs like the `toNumber` regex silently producing `NaN` for non-numeric strings, or the markdown-fence stripper failing on edge cases.

## How to run

```bash
# Run everything (recommended):
node Test/run_all_tests.js

# Or run individual suites:
PYTHONIOENCODING=utf-8 python Test/validate_workflows.py
PYTHONIOENCODING=utf-8 python Test/trace_data_flow.py
node Test/workflow_1_code_tests/test.js
node Test/workflow_2_code_tests/test.js
```

All scripts are cwd-agnostic — they resolve the workflow JSON paths relative to their own location, so you can run them from anywhere.

## Requirements

- Python 3.8+ (no third-party deps — just `json`, `re`, `sys`, `pathlib`, `collections`)
- Node.js 18+ (no third-party deps — just `fs`, `path`, `vm`)

## What they do NOT check

- Runtime behavior (does the API call succeed?)
- Credential validity
- n8n UI rendering quirks
- Whether the placeholder values (sheet IDs, folder IDs, API keys) have been replaced
- HTTP node request/response shape (we test the JS that processes them, not the HTTP calls themselves)
