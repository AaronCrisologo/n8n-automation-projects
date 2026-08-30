# Test — Workflow Validators

Three scripts that check the n8n workflow JSONs in this repo. The two Python scripts do static structural / data-flow checks; the Node.js script runs the actual Code-node JS in a sandboxed VM against realistic fixtures. None require a running n8n instance or any external services.

## Why this exists

Both workflows in this portfolio are non-trivial (23 and 20 nodes). Before submitting, I wanted confidence that:
- Every node in the graph is reachable from the trigger
- No node references another node by name that doesn't exist
- No Code node uses Jinja syntax (which n8n doesn't support)
- Every `{{ $json.X }}` expression points to a field that's actually set by an upstream node
- **The JS in Code nodes actually does what it claims** (regex stripping, currency parsing, filename building, etc.)

The last one is what `test_code_nodes.js` covers — the other two scripts can't see inside JS function bodies.

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

### `test_code_nodes.js` — Code-node unit tests

Extracts the JavaScript from each Code node in `telegram-receipt-workflow.json` and runs it in a `vm` sandbox with a mock n8n runtime (`$('NodeName')` and `$input.first().json`).

Tests cover the 4 Code nodes in Workflow 2:

- **Pick Best Photo** — picks the largest photo, handles missing fields (caption, from), single-photo messages, empty array
- **Build Receipt Payload** — filename format `receipt_<userid>_<timestamp>.<ext>`, anon fallback, jpg extension fallback
- **Parse & Normalize Gemini Output** — markdown fence stripping, `toNumber` with currency strings (`"$1,234.56"`), negative values, non-numeric → null, malformed JSON → `parseError: true`, line_items serialization
- **Prepare Date Folder Name** — illegal char replacement, single-quote escaping, today fallback
- **Merge: Resolve Date Folder ID** — newly created vs existing branch, throws on failure
- **Build Confirmation Message** — full format, missing-field fallbacks, omits time when absent

Currently **28 test cases**, all passing. Catches real bugs like the `toNumber` regex silently producing `NaN` for non-numeric strings, or the markdown-fence stripper failing on edge cases.

## How to run

```bash
# From the repo root
PYTHONIOENCODING=utf-8 python Test/validate_workflows.py
PYTHONIOENCODING=utf-8 python Test/trace_data_flow.py
node Test/test_code_nodes.js
```

All scripts expect to be run from the parent `PDS/` directory because they use `Path(__file__).parent` / `__dirname` to locate the workflow JSONs.

## Requirements

- Python 3.8+ (no third-party deps — just `json`, `re`, `sys`, `pathlib`, `collections`)
- Node.js 18+ (no third-party deps — just `fs`, `path`, `vm`)

## What they do NOT check

- Runtime behavior (does the API call succeed?)
- Credential validity
- n8n UI rendering quirks
- Whether the placeholder values (sheet IDs, folder IDs, API keys) have been replaced
- HTTP node request/response shape (we test the JS that processes them, not the HTTP calls themselves)
