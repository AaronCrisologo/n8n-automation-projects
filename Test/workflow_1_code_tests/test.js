/**
 * Unit tests for the 6 Code nodes in Workflow 1 (Gmail attachments).
 *
 * Why this exists: validate_workflows.py only checks structural integrity
 * (graph connectivity, $('NodeName') references). It does NOT verify that
 * the JS code in Code nodes produces correct output. This file extracts the
 * actual JS from the workflow JSON and runs it against realistic fixtures.
 *
 * Run from repo root:
 *   node Test/workflow_1_code_tests/test.js
 *
 * No external dependencies. Exits 0 on success, 1 on failure.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WORKFLOW_PATH = path.join(
    __dirname,
    '..',
    '..',
    'Workflow 1- Multi-Label Gmail to Google Sheets and Drive Automation',
    'gmail-attachments-workflow.json'
);

const wf = JSON.parse(fs.readFileSync(WORKFLOW_PATH, 'utf-8'));

// --- Tiny test harness ----------------------------------------------------

let pass = 0;
let fail = 0;
const failures = [];

function test(name, fn) {
    try {
        fn();
        pass++;
        console.log(`  ok  ${name}`);
    } catch (err) {
        fail++;
        failures.push({ name, err });
        console.log(`  FAIL ${name}`);
        console.log(`       ${err.message}`);
    }
}

function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
}

function assertEqual(actual, expected, msg) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) {
        throw new Error(`${msg || 'assertEqual failed'}\n         got: ${a}\n    expected: ${e}`);
    }
}

// --- Run a Code node's JS with a fake n8n context ------------------------

/**
 * Builds a sandbox that mimics the n8n Code node runtime.
 *
 * n8n exposes two things inside a Code node:
 *   - $('NodeName')             -> proxy that returns items from a registered
 *                                  upstream node (calls .first()/.item.json)
 *   - $input.first().json       -> the current input item's json payload
 *   - `this` and `console`      -> standard JS
 *
 * Convention for test calls:
 *   - `input` is the current input item's json payload (plain object)
 *   - `upstream` is { nodeName: [itemJson, itemJson, ...] } where each
 *     `itemJson` is the plain JSON object that would be that item's `$json`
 */
function runCodeNode(jsCode, { input, upstream = {} } = {}) {
    const itemsByNode = {};
    for (const [name, items] of Object.entries(upstream)) {
        itemsByNode[name] = items.map((it) => ({ json: it }));
    }

    const $ = (name) => {
        const items = itemsByNode[name] || [];
        const firstItem = items[0];
        return {
            first: () => firstItem,
            item: {
                json: (firstItem && firstItem.json) || {},
            },
            all: () => items,
        };
    };

    const inputItem = { json: input || {} };
    const $input = {
        first: () => inputItem,
        all: () => [inputItem],
    };
    const context = { $, $input, console };
    vm.createContext(context);
    const wrapped = `(function(){\n${jsCode}\n})()`;
    return vm.runInContext(wrapped, context, { filename: 'codeNode.js' });
}

// --- Extract a Code node's JS by name ------------------------------------

function codeByName(name) {
    const n = wf.nodes.find((x) => x.name === name);
    if (!n) throw new Error(`No node named ${name}`);
    return n.parameters.jsCode;
}

// --- Fixtures -------------------------------------------------------------

// A realistic Gmail message payload (subset of fields the Code node reads)
function gmailMessageFixture(overrides = {}) {
    return {
        id: '18d4f2a1b3c9e0f5',
        threadId: '18d4f2a1b3c9e0f5',
        subject: 'Q3 Report + Invoice',
        snippet: 'Please find attached the Q3 report and invoice...',
        date: 'Fri, 29 Aug 2026 14:23:00 +0000',
        internalDate: '1724941380000',
        labelIds: ['INBOX', 'UNREAD', 'Label_123', 'Important'],
        headers: [
            { name: 'From', value: 'John Doe <john.doe@example.com>' },
            { name: 'To', value: 'me@example.com' },
            { name: 'Subject', value: 'Q3 Report + Invoice' },
        ],
        payload: {
            mimeType: 'multipart/mixed',
            parts: [
                {
                    mimeType: 'text/plain',
                    body: { size: 200 },
                },
                {
                    filename: 'invoice_aug.pdf',
                    mimeType: 'application/pdf',
                    body: { attachmentId: 'ANGjdJ-abc123', size: 145000 },
                },
                {
                    filename: 'q3_report.xlsx',
                    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    body: { attachmentId: 'ANGjdJ-xyz789', size: 38000 },
                },
            ],
        },
        ...overrides,
    };
}

// =====================================================================
// Tests
// =====================================================================

console.log('Code-node unit tests for Workflow 1 (Gmail)\n');
console.log('Build Dynamic Gmail Search Query');

// -- Build Dynamic Gmail Search Query ------------------------------------

test('picks label_1 when present and strips the label: prefix', () => {
    const code = codeByName('Build Dynamic Gmail Search Query');
    const out = runCodeNode(code, {
        input: { label_1: 'label:Invoices', label_2: 'label:Receipts' },
    });
    assertEqual(out[0].json.labelName, 'Invoices');
    assertEqual(out[0].json.searchQuery, 'label:Invoices is:unread newer_than:1d');
});

test('falls back to label_2 when label_1 is empty', () => {
    const code = codeByName('Build Dynamic Gmail Search Query');
    const out = runCodeNode(code, {
        input: { label_1: '', label_2: 'label:Receipts', label_3: 'label:Other' },
    });
    assertEqual(out[0].json.labelName, 'Receipts');
});

test('falls back through all 5 labels in order', () => {
    const code = codeByName('Build Dynamic Gmail Search Query');
    const out = runCodeNode(code, {
        input: { label_1: '', label_2: '', label_3: '', label_4: '', label_5: 'label:Fifth' },
    });
    assertEqual(out[0].json.labelName, 'Fifth');
});

test('handles label without the label: prefix', () => {
    const code = codeByName('Build Dynamic Gmail Search Query');
    const out = runCodeNode(code, {
        input: { label_1: 'CustomLabel' },
    });
    assertEqual(out[0].json.labelName, 'CustomLabel');
    assertEqual(out[0].json.searchQuery, 'label:CustomLabel is:unread newer_than:1d');
});

test('trims trailing whitespace after the label: prefix', () => {
    const code = codeByName('Build Dynamic Gmail Search Query');
    const out = runCodeNode(code, {
        input: { label_1: 'label:Spaced  ' },
    });
    assertEqual(out[0].json.labelName, 'Spaced');
});

test('DOCUMENTED LIMITATION: does not handle leading whitespace before label:', () => {
    // The code uses /^label:/ (anchored) then .trim(). If the label has leading
    // whitespace, the regex doesn't match and the prefix survives. In practice
    // labels come from a Set node with fixed values so this never happens,
    // but it's a real edge case to be aware of.
    const code = codeByName('Build Dynamic Gmail Search Query');
    const out = runCodeNode(code, {
        input: { label_1: '  label:Spaced  ' },
    });
    // Document the actual (buggy) behavior:
    assertEqual(out[0].json.labelName, 'label:Spaced');
});

console.log('\nExtract Sender & Email Metadata');

// -- Extract Sender & Email Metadata -------------------------------------

test('parses "Name <email@x>" format into separate name and email', () => {
    const code = codeByName('Extract Sender & Email Metadata');
    const out = runCodeNode(code, {
        input: gmailMessageFixture(),
        upstream: {
            'Build Dynamic Gmail Search Query': [{ labelName: 'Invoices' }],
        },
    });
    const j = out[0].json;
    assertEqual(j.senderName, 'John Doe');
    assertEqual(j.senderEmail, 'john.doe@example.com');
    assertEqual(j.messageId, '18d4f2a1b3c9e0f5');
    assertEqual(j.threadId, '18d4f2a1b3c9e0f5');
    assertEqual(j.subject, 'Q3 Report + Invoice');
    assertEqual(j.searchLabel, 'Invoices');
});

test('handles bare email without display name', () => {
    const code = codeByName('Extract Sender & Email Metadata');
    const email = gmailMessageFixture();
    email.headers = [{ name: 'From', value: 'jane@example.com' }];
    const out = runCodeNode(code, {
        input: email,
        upstream: { 'Build Dynamic Gmail Search Query': [{ labelName: 'X' }] },
    });
    assertEqual(out[0].json.senderName, 'jane@example.com');
    assertEqual(out[0].json.senderEmail, 'jane@example.com');
});

test('strips quotes from quoted display names', () => {
    const code = codeByName('Extract Sender & Email Metadata');
    const email = gmailMessageFixture();
    email.headers = [{ name: 'From', value: '"Smith, John" <john@example.com>' }];
    const out = runCodeNode(code, {
        input: email,
        upstream: { 'Build Dynamic Gmail Search Query': [{ labelName: 'X' }] },
    });
    // The current code's regex captures everything before <, then strips quotes
    assertEqual(out[0].json.senderName, 'Smith, John');
    assertEqual(out[0].json.senderEmail, 'john@example.com');
});

test('handles missing From header gracefully', () => {
    const code = codeByName('Extract Sender & Email Metadata');
    const email = gmailMessageFixture();
    email.headers = [{ name: 'Subject', value: 'No from here' }];
    const out = runCodeNode(code, {
        input: email,
        upstream: { 'Build Dynamic Gmail Search Query': [{ labelName: 'X' }] },
    });
    assertEqual(out[0].json.senderName, '');
    assertEqual(out[0].json.senderEmail, '');
});

test('filters out Gmail system labels (INBOX, UNREAD, etc.) but keeps user labels', () => {
    const code = codeByName('Extract Sender & Email Metadata');
    const email = gmailMessageFixture();
    // Note: the current regex has 'CATEGORY_' followed by $ which only matches the
    // literal string 'CATEGORY_' (no children). Actual Gmail category labels like
    // 'CATEGORY_Promotions' are NOT filtered by the current code. This is a real
    // gap in the label filter — they leak through as 'labels'.
    email.labelIds = ['INBOX', 'UNREAD', 'STARRED', 'CATEGORY_Promotions', 'Label_ProjectX', 'SENT', 'TRASH'];
    const out = runCodeNode(code, {
        input: email,
        upstream: { 'Build Dynamic Gmail Search Query': [{ labelName: 'X' }] },
    });
    // Documents actual behavior: only exact-match system labels are filtered
    assertEqual(out[0].json.labels, ['CATEGORY_Promotions', 'Label_ProjectX']);
});

test('label filter is case-insensitive for exact-match system labels', () => {
    const code = codeByName('Extract Sender & Email Metadata');
    const email = gmailMessageFixture();
    email.labelIds = ['inbox', 'MyProjectLabel', 'custom_label'];
    const out = runCodeNode(code, {
        input: email,
        upstream: { 'Build Dynamic Gmail Search Query': [{ labelName: 'X' }] },
    });
    // 'inbox' (lowercase) matches the regex case-insensitively, so it's filtered.
    // 'MyProjectLabel' and 'custom_label' don't match any pattern and pass through.
    assert(!out[0].json.labels.includes('inbox'),
        'lowercase "inbox" should be filtered (regex is case-insensitive)');
    assert(out[0].json.labels.includes('MyProjectLabel'));
    assert(out[0].json.labels.includes('custom_label'));
});

test('collects attachments from a flat parts array', () => {
    const code = codeByName('Extract Sender & Email Metadata');
    const out = runCodeNode(code, {
        input: gmailMessageFixture(),
        upstream: { 'Build Dynamic Gmail Search Query': [{ labelName: 'X' }] },
    });
    assertEqual(out[0].json.hasAttachments, true);
    assertEqual(out[0].json.attachments.length, 2);
    assertEqual(out[0].json.attachments[0].filename, 'invoice_aug.pdf');
    assertEqual(out[0].json.attachments[0].attachmentId, 'ANGjdJ-abc123');
    assertEqual(out[0].json.attachments[0].size, 145000);
});

test('recursively collects attachments from nested parts (e.g. message/rfc822 with inline)', () => {
    const code = codeByName('Extract Sender & Email Metadata');
    const email = gmailMessageFixture();
    email.payload.parts = [
        {
            mimeType: 'multipart/mixed',
            parts: [
                {
                    mimeType: 'multipart/alternative',
                    parts: [
                        { mimeType: 'text/plain', body: { data: 'hi' } },
                    ],
                },
                {
                    filename: 'outer.pdf',
                    mimeType: 'application/pdf',
                    body: { attachmentId: 'OUTER', size: 1000 },
                },
            ],
        },
        {
            filename: 'sibling.csv',
            mimeType: 'text/csv',
            body: { attachmentId: 'SIBLING', size: 500 },
        },
    ];
    const out = runCodeNode(code, {
        input: email,
        upstream: { 'Build Dynamic Gmail Search Query': [{ labelName: 'X' }] },
    });
    assertEqual(out[0].json.attachments.length, 2);
    const names = out[0].json.attachments.map((a) => a.filename).sort();
    assertEqual(names, ['outer.pdf', 'sibling.csv']);
});

test('returns hasAttachments=false and empty attachments for plain text email', () => {
    const code = codeByName('Extract Sender & Email Metadata');
    const email = gmailMessageFixture();
    email.payload = { mimeType: 'text/plain', body: { data: 'just text' } };
    const out = runCodeNode(code, {
        input: email,
        upstream: { 'Build Dynamic Gmail Search Query': [{ labelName: 'X' }] },
    });
    assertEqual(out[0].json.hasAttachments, false);
    assertEqual(out[0].json.attachments, []);
});

test('falls back to internalDate when date is missing', () => {
    const code = codeByName('Extract Sender & Email Metadata');
    const email = gmailMessageFixture();
    delete email.date;
    const out = runCodeNode(code, {
        input: email,
        upstream: { 'Build Dynamic Gmail Search Query': [{ labelName: 'X' }] },
    });
    assertEqual(out[0].json.dateReceived, '1724941380000');
});

test('falls back to current time when both date and internalDate are missing', () => {
    const code = codeByName('Extract Sender & Email Metadata');
    const email = gmailMessageFixture();
    delete email.date;
    delete email.internalDate;
    const before = Date.now();
    const out = runCodeNode(code, {
        input: email,
        upstream: { 'Build Dynamic Gmail Search Query': [{ labelName: 'X' }] },
    });
    const after = Date.now();
    const t = new Date(out[0].json.dateReceived).getTime();
    assert(t >= before && t <= after, 'should fall back to current time as ISO string');
});

test('preserves searchLabel from Build Dynamic Gmail Search Query', () => {
    const code = codeByName('Extract Sender & Email Metadata');
    const out = runCodeNode(code, {
        input: gmailMessageFixture(),
        upstream: { 'Build Dynamic Gmail Search Query': [{ labelName: 'Q4-Followup' }] },
    });
    assertEqual(out[0].json.searchLabel, 'Q4-Followup');
});

console.log('\nPrepare: Mark Email as Read');

// -- Prepare: Mark Email as Read -----------------------------------------

test('passes through messageId from upstream', () => {
    const code = codeByName('Prepare: Mark Email as Read');
    const out = runCodeNode(code, {
        upstream: {
            'Extract Sender & Email Metadata': [{ messageId: '18d4f2a1b3c9e0f5' }],
        },
    });
    assertEqual(out[0].json.messageId, '18d4f2a1b3c9e0f5');
});

console.log('\nPrepare Sender & Date Folder Names');

// -- Prepare Sender & Date Folder Names -----------------------------------

test('sanitizes illegal Drive characters in sender name', () => {
    const code = codeByName('Prepare Sender & Date Folder Names');
    // Each illegal char in /[<>:"/\\|?*]/ becomes one underscore.
    // 'Acme/Co: Sales*?' has /, :, *, ? — four illegal chars, four underscores.
    const out = runCodeNode(code, {
        input: { senderName: 'Acme/Co: Sales*?', dateReceived: '2026-08-29T14:23:00Z' },
    });
    assertEqual(out[0].json.senderFolderName, 'Acme_Co_ Sales__');
});

test('collapses whitespace runs to single spaces', () => {
    const code = codeByName('Prepare Sender & Date Folder Names');
    const out = runCodeNode(code, {
        input: { senderName: 'John    Q.   Doe', dateReceived: '2026-08-29T14:23:00Z' },
    });
    assertEqual(out[0].json.senderFolderName, 'John Q. Doe');
});

test('truncates sender name at 100 characters', () => {
    const code = codeByName('Prepare Sender & Date Folder Names');
    const longName = 'A'.repeat(150);
    const out = runCodeNode(code, {
        input: { senderName: longName, dateReceived: '2026-08-29T14:23:00Z' },
    });
    assertEqual(out[0].json.senderFolderName.length, 100);
});

test('falls back to "Unknown Sender" when senderName is missing', () => {
    const code = codeByName('Prepare Sender & Date Folder Names');
    const out = runCodeNode(code, {
        input: { dateReceived: '2026-08-29T14:23:00Z' },
    });
    assertEqual(out[0].json.senderFolderName, 'Unknown Sender');
});

test('formats date as YYYY-MM-DD from ISO 8601', () => {
    const code = codeByName('Prepare Sender & Date Folder Names');
    const out = runCodeNode(code, {
        input: { senderName: 'X', dateReceived: '2026-08-29T14:23:00Z' },
    });
    assertEqual(out[0].json.dateFolder, '2026-08-29');
});

test('formats date as YYYY-MM-DD from RFC 2822 (Gmail `date` field)', () => {
    const code = codeByName('Prepare Sender & Date Folder Names');
    const out = runCodeNode(code, {
        input: { senderName: 'X', dateReceived: 'Fri, 29 Aug 2026 14:23:00 +0000' },
    });
    assertEqual(out[0].json.dateFolder, '2026-08-29');
});

test('falls back to today when dateReceived is invalid', () => {
    const code = codeByName('Prepare Sender & Date Folder Names');
    const out = runCodeNode(code, {
        input: { senderName: 'X', dateReceived: 'not a date' },
    });
    assert(/^\d{4}-\d{2}-\d{2}$/.test(out[0].json.dateFolder), `expected YYYY-MM-DD, got ${out[0].json.dateFolder}`);
});

test('escapes single quotes in sender name for Drive query', () => {
    const code = codeByName('Prepare Sender & Date Folder Names');
    const out = runCodeNode(code, {
        input: { senderName: "O'Brien", dateReceived: '2026-08-29T14:23:00Z' },
    });
    assert(out[0].json.senderFolderNameEscaped.includes("O\\'Brien"),
        `expected escaped apostrophe, got ${out[0].json.senderFolderNameEscaped}`);
});

console.log('\nMerge: Resolve Sender/Date Folder ID');

// -- Merge nodes (both share the same pattern) ----------------------------

function makeMergeTests(nodeName, idField) {
    const createNodeName = idField === 'senderFolderId'
        ? 'HTTP: Create Sender Folder'
        : 'HTTP: Create Date Folder';
    const findNodeName = idField === 'senderFolderId'
        ? 'HTTP: Find Existing Sender Folder'
        : 'HTTP: Find Existing Date Folder';

    test(`[${nodeName}] uses newly created folder id when create branch fires`, () => {
        const code = codeByName(nodeName);
        const out = runCodeNode(code, {
            input: { chatId: 1 },
            upstream: {
                [createNodeName]: [{ id: 'NEW_ID' }],
                [findNodeName]: [{ files: [] }],
            },
        });
        assertEqual(out[0].json[idField], 'NEW_ID');
    });

    test(`[${nodeName}] throws when neither branch resolves a folder id`, () => {
        const code = codeByName(nodeName);
        let threw = false;
        try {
            runCodeNode(code, {
                input: {},
                upstream: {
                    [createNodeName]: [{}],
                    [findNodeName]: [{ files: [] }],
                },
            });
        } catch (e) {
            threw = true;
            assert(e.message.toLowerCase().includes('could not resolve'),
                'should throw a clear error, got: ' + e.message);
        }
        assert(threw, 'should have thrown');
    });
}

makeMergeTests('Merge: Resolve Sender Folder ID', 'senderFolderId');
makeMergeTests('Merge: Resolve Date Folder ID', 'dateFolderId');

// --- Result ----------------------------------------------------------------

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
    console.log('\nFailures:');
    for (const f of failures) {
        console.log(`  - ${f.name}: ${f.err.message}`);
    }
    process.exit(1);
}
process.exit(0);
