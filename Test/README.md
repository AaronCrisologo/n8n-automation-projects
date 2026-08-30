# Test — Workflow Validators

Two Python scripts that statically check the n8n workflow JSONs in this repo for structural and data-flow correctness. They don't require a running n8n instance or any external services.

## Why this exists

Both workflows in this portfolio are non-trivial (23 and 20 nodes). Before submitting, I wanted confidence that:
- Every node in the graph is reachable from the trigger
- No node references another node by name that doesn't exist
- No Code node uses Jinja syntax (which n8n doesn't support)
- Every `{{ $json.X }}` expression points to a field that's actually set by an upstream node

These are the kinds of bugs that are easy to miss by reading the JSON but cause silent runtime failures.

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

## How to run

```bash
# From the repo root
PYTHONIOENCODING=utf-8 python Test/validate_workflows.py
PYTHONIOENCODING=utf-8 python Test/trace_data_flow.py
```

Both scripts expect to be run from the parent `PDS/` directory because they use `Path(__file__).parent` to locate the workflow JSONs.

## Requirements

- Python 3.8+
- No third-party dependencies (just `json`, `re`, `sys`, `pathlib`, `collections`)

## What they do NOT check

- Runtime behavior (does the API call succeed?)
- Credential validity
- n8n UI rendering quirks
- Whether the placeholder values (sheet IDs, folder IDs, API keys) have been replaced
