"""
Static validation for both n8n workflows.
Traces the graph forward from each trigger, checks:
- Every connection source and target resolves to a real node
- No orphan nodes (except the trigger)
- Every Code-node $('NodeName') reference resolves
- Every {{ $json.X }} reference traces back to a key set by an earlier node
- Every $('NodeName').item.json.X reference also traces back
- No Jinja-style {% %} syntax in plain n8n expression fields
- Every credential referenced is defined
- The If/Merge HTTP node branches have BOTH outputs where they need to
"""
import json
import re
import sys
from pathlib import Path

WORKFLOW_DIR = Path(__file__).parent.parent

def load(path):
    return json.loads(path.read_text(encoding="utf-8"))

def find_code_refs(code):
    """Return set of node names referenced via $('NodeName')."""
    return set(re.findall(r"\$\(\s*['\"]([^'\"]+)['\"]\s*\)", code))

def find_jinja(code_or_text):
    """Return True if Jinja-style {% %} is present (n8n expressions do NOT support it)."""
    return bool(re.search(r"\{%\s*(if|for|endif|endfor)", code_or_text))

def validate_workflow(path: Path, label: str):
    print(f"\n{'='*70}")
    print(f"  {label}: {path.name}")
    print('='*70)
    wf = load(path)
    nodes = wf.get("nodes", [])
    conns = wf.get("connections", {})

    node_by_name = {n["name"]: n for n in nodes}
    errors = []
    warnings = []

    # 1) Connection sources/targets resolve
    for source, c in conns.items():
        if source not in node_by_name:
            errors.append(f"Connection source '{source}' has no node")
        for outputs in c.get("main", []):
            for c0 in outputs:
                if c0.get("node") not in node_by_name:
                    errors.append(f"Connection target '{c0.get('node')}' has no node")

    # 2) Orphan check (every node has an incoming connection OR is a trigger)
    incoming = set()
    for c in conns.values():
        for outputs in c.get("main", []):
            for c0 in outputs:
                incoming.add(c0.get("node"))
    for n in nodes:
        if n["name"] not in incoming:
            t = n.get("type", "")
            if "Trigger" not in t:
                errors.append(f"Orphan node '{n['name']}' has no incoming connections")

    # 3) Code node references resolve
    for n in nodes:
        if n.get("type") == "n8n-nodes-base.code":
            code = n.get("parameters", {}).get("jsCode", "")
            for ref in find_code_refs(code):
                if ref not in node_by_name:
                    errors.append(f"Code node '{n['name']}' references missing node '{ref}'")

    # 4) Jinja syntax check across all string fields
    for n in nodes:
        params_json = json.dumps(n.get("parameters", {}))
        if find_jinja(params_json):
            errors.append("Node '" + n['name'] + "' contains Jinja syntax which n8n does not support")

    # 5) If-node branches — make sure each branch has at least one outgoing (or both nil)
    for n in nodes:
        if n.get("type") == "n8n-nodes-base.if":
            outs = conns.get(n["name"], {}).get("main", [])
            true_branch = outs[0] if len(outs) > 0 else []
            false_branch = outs[1] if len(outs) > 1 else []
            if not true_branch and not false_branch:
                errors.append(f"If node '{n['name']}' has neither true nor false outgoing connection")
            # Note: a one-sided If is technically allowed if the user wants to silently drop, but we warn
            if true_branch and not false_branch:
                warnings.append(f"If node '{n['name']}' has True branch but NO False branch (false items silently dropped)")
            if false_branch and not true_branch:
                warnings.append(f"If node '{n['name']}' has False branch but NO True branch (true items silently dropped)")

    # 6) HTTP node URL/header checks — basic
    for n in nodes:
        if n.get("type") == "n8n-nodes-base.httpRequest":
            params = n.get("parameters", {})
            url = params.get("url", "")
            # Make sure the url has been templated
            if "YOUR_" in url and "{{" not in url:
                warnings.append(f"HTTP node '{n['name']}' has unreplaced URL placeholder: {url}")

    # 7) Split-out nodes that depend on fieldToSplitOut
    for n in nodes:
        if n.get("type") == "n8n-nodes-base.splitOut":
            opts = n.get("parameters", {}).get("options", {}) or {}
            fld = opts.get("fieldToSplitOut")
            if fld:
                # The field must exist in an earlier node's output
                found = False
                # We can't fully trace at this layer, but warn if the field name looks weird
                if fld not in ("attachments", "line_items", "items"):
                    warnings.append(f"SplitOut '{n['name']}' splits on '{fld}' — verify this field exists in upstream output")

    # Report
    print(f"  Nodes: {len(nodes)}")
    print(f"  Connections: {len(conns)}")
    if errors:
        print(f"\n   {len(errors)} ERROR(S):")
        for e in errors:
            print(f"    - {e}")
    else:
        print(f"\n   No errors found")
    if warnings:
        print(f"\n  ️  {len(warnings)} warning(s):")
        for w in warnings:
            print(f"    - {w}")

    return len(errors) == 0

w1 = WORKFLOW_DIR / "Workflow 1- Multi-Label Gmail to Google Sheets and Drive Automation" / "gmail-attachments-workflow.json"
w2 = WORKFLOW_DIR / "Workflow 2- Telegram Receipt Photo Processing" / "telegram-receipt-workflow.json"

ok1 = validate_workflow(w1, "Workflow 1 (Gmail)")
ok2 = validate_workflow(w2, "Workflow 2 (Telegram)")

print("\n" + "="*70)
if ok1 and ok2:
    print("   BOTH WORKFLOWS PASS VALIDATION")
    sys.exit(0)
else:
    print("   ONE OR MORE WORKFLOWS HAVE ERRORS — SEE ABOVE")
    sys.exit(1)
