"""
Data-flow tracer: walks each workflow forward, collecting what fields
each node sets in $json, then verifying that downstream nodes only
reference fields that exist.

This catches the subtle "I wrote {{ $json.photoFileId }} but the previous
node set $json.bestFileId instead" class of bug.
"""
import json
import re
import sys
from pathlib import Path
from collections import defaultdict

WORKFLOW_DIR = Path(__file__).parent.parent

def load(p):
    return json.loads(p.read_text(encoding="utf-8"))

# Fields a Code node "sets" (return [{ json: {...} }]) — we extract from the
# object literal in the return statement.
CODE_FIELD_RE = re.compile(r"return\s*\[\s*\{\s*json:\s*\{", re.DOTALL)
OBJECT_LITERAL_RE = re.compile(r"return\s*\[\s*\{\s*json:\s*(\{.*?\})\s*\}\s*\]", re.DOTALL)

# Fields referenced in {{ $json.X }} and $json.X
JSON_REF_RE = re.compile(r"\$\.json\.(\w+)")

# Fields referenced via $('NodeName').item.json.X
ITEM_REF_RE = re.compile(r"\$\(\s*['\"][^'\"]+['\"]\s*\)\.item\.json\.(\w+)")

def extract_keys_from_obj(s):
    """Best-effort: pull out top-level keys from a JS object literal string."""
    keys = set()
    # match key: value pairs where value is NOT another nested object/array starting
    # Simple regex: "key": <value>, at the top level
    depth = 0
    i = 0
    while i < len(s):
        c = s[i]
        if c == '{':
            depth += 1
            i += 1
            continue
        if c == '}':
            depth -= 1
            i += 1
            continue
        # Look for quoted keys at depth 1
        if depth == 1 and c == '"':
            # Find closing quote
            j = i + 1
            while j < len(s) and s[j] != '"':
                if s[j] == '\\':
                    j += 2
                else:
                    j += 1
            if j < len(s):
                key = s[i+1:j]
                # Look for the colon after
                k = j + 1
                while k < len(s) and s[k] in ' \n\t':
                    k += 1
                if k < len(s) and s[k] == ':':
                    keys.add(key)
                    i = k + 1
                    continue
        i += 1
    return keys

def fields_set_by_code(code):
    """Find all keys that the Code node puts into $json, including via ...spread."""
    keys = set()
    # 1) ...spread references: ...data, ...meta, ...incoming
    for spread in re.findall(r"\.\.\.(\w+)", code):
        pass  # we can't resolve these without running the code
    # 2) Top-level return object literal
    m = OBJECT_LITERAL_RE.search(code)
    if m:
        obj = m.group(1)
        keys.update(extract_keys_from_obj(obj))
    # 3) catch block: { json: { parseError: true, parseErrorMessage: err.message } }
    for m in re.finditer(r"json:\s*\{([^}]+)\}", code):
        inner = m.group(1)
        for km in re.finditer(r"(\w+)\s*:", inner):
            keys.add(km.group(1))
    return keys

def fields_referenced(node):
    """Pull all field names referenced via $json.X or $(...).item.json.X."""
    refs = set()
    blob = json.dumps(node.get("parameters", {}))
    for m in JSON_REF_RE.finditer(blob):
        refs.add(m.group(1))
    for m in ITEM_REF_RE.finditer(blob):
        refs.add(m.group(1))
    if node.get("type") == "n8n-nodes-base.code":
        code = node.get("parameters", {}).get("jsCode", "")
        for m in JSON_REF_RE.finditer(code):
            refs.add(m.group(1))
        for m in ITEM_REF_RE.finditer(code):
            refs.add(m.group(1))
    return refs

def topo_sort(nodes, conns):
    """Return nodes in topological order from the trigger forward."""
    incoming = defaultdict(set)
    outgoing = defaultdict(list)
    for src, c in conns.items():
        for outputs in c.get("main", []):
            for c0 in outputs:
                outgoing[src].append(c0.get("node"))
                incoming[c0.get("node")].add(src)
    # Kahn's algorithm
    result = []
    ready = [n["name"] for n in nodes if n["name"] not in incoming]
    visited = set()
    while ready:
        name = ready.pop(0)
        if name in visited:
            continue
        visited.add(name)
        result.append(name)
        for child in outgoing.get(name, []):
            incoming[child].discard(name)
            if not incoming[child] and child not in visited:
                ready.append(child)
    # Append any unreachable nodes at the end (defensive)
    for n in nodes:
        if n["name"] not in visited:
            result.append(n["name"])
    return result

def validate(path, label):
    print("\n" + "="*70)
    print("  " + label + ": " + path.name)
    print("="*70)
    wf = load(path)
    nodes = wf.get("nodes", [])
    conns = wf.get("connections", {})
    node_by_name = {n["name"]: n for n in nodes}

    # Fields available in $json at each node = union of fields set by all upstream nodes
    available = defaultdict(set)
    order = topo_sort(nodes, conns)

    issues = []

    for name in order:
        n = node_by_name.get(name)
        if not n:
            continue
        ntype = n.get("type", "")

        # What does this node set?
        if ntype == "n8n-nodes-base.code":
            available[name] = fields_set_by_code(n.get("parameters", {}).get("jsCode", ""))
        elif ntype == "n8n-nodes-base.set":
            for v in n.get("parameters", {}).get("values", {}).get("string", []):
                available[name].add(v.get("name"))
        elif ntype == "n8n-nodes-base.if":
            # If nodes pass through, so they keep their upstream's fields
            for src in incoming_for(conns, name):
                available[name] |= available.get(src, set())
        else:
            # For HTTP/Gmail/Drive/Sheets/Telegram nodes, the field set is hard to
            # know statically. We *assume* they pass through their input fields,
            # plus the fields explicitly mapped in their config.
            for src in incoming_for(conns, name):
                available[name] |= available.get(src, set())
            # Also pull in any keys set via {{ $json.X }} mapped columns (Sheets)
            blob = json.dumps(n.get("parameters", {}))
            for m in re.finditer(r'"([^"]+)"\s*:\s*"=\{\{\s*\$json\.(\w+)\s*\}\}"', blob):
                available[name].add(m.group(1))  # the column name is the key

        # Now check: does this node reference any field that is NOT in available?
        # (We only check the immediately-upstream union to avoid being overly strict.)
        upstream = set()
        for src in incoming_for(conns, name):
            upstream |= available.get(src, set())
        # Special: $('NodeName').item.json.X references — these point to a SPECIFIC upstream
        # node, not the immediate one. We treat those as allowed if the named node sets it.
        blob = json.dumps(n.get("parameters", {}))
        refs_in_self = set()
        if ntype == "n8n-nodes-base.code":
            refs_in_self |= fields_referenced(n)
        # Check $json.X references
        for m in re.finditer(r"\{\{\s*\$json\.(\w+)[^}]*\}\}", blob):
            field = m.group(1)
            refs_in_self.add(field)
        # Check $('Node').item.json.X references
        named_refs = re.findall(r"\$\(\s*['\"]([^'\"]+)['\"]\s*\)\.item\.json\.(\w+)", blob)
        if ntype == "n8n-nodes-base.code":
            named_refs += re.findall(r"\$\(\s*['\"]([^'\"]+)['\"]\s*\)\.item\.json\.(\w+)",
                                      n.get("parameters", {}).get("jsCode", ""))
        for refnode, field in named_refs:
            if refnode in available and field not in available[refnode]:
                issues.append(name + " -> $" + refnode + ".item.json." + field +
                              " (not set by " + refnode + ")")

        for field in refs_in_self:
            if field not in upstream:
                # Common false-positive: HTTP nodes output response data, not input data
                if ntype in ("n8n-nodes-base.httpRequest", "n8n-nodes-base.gmail",
                             "n8n-nodes-base.googleDrive", "n8n-nodes-base.googleSheets",
                             "n8n-nodes-base.telegram"):
                    continue
                issues.append(name + " -> $json." + field + " (not in upstream fields)")

    if issues:
        print("  WARNINGS / SUSPECT REFERENCES:")
        for i in sorted(set(issues)):
            print("    - " + i)
    else:
        print("  All field references trace to upstream producers")

    return issues

def incoming_for(conns, name):
    out = []
    for src, c in conns.items():
        for outputs in c.get("main", []):
            for c0 in outputs:
                if c0.get("node") == name:
                    out.append(src)
    return out

w1 = WORKFLOW_DIR / "Workflow 1- Multi-Label Gmail to Google Sheets and Drive Automation" / "gmail-attachments-workflow.json"
w2 = WORKFLOW_DIR / "Workflow 2- Telegram Receipt Photo Processing" / "telegram-receipt-workflow.json"

i1 = validate(w1, "Workflow 1 (Gmail)")
i2 = validate(w2, "Workflow 2 (Telegram)")

print("\n" + "="*70)
print("Done.")
