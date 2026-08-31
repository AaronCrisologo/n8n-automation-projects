/**
 * Unit tests for the 4 Code nodes in Workflow 2 (Telegram Receipt Inbox).
 *
 * Why this exists: validate_workflows.py only checks structural integrity
 * (graph connectivity, $('NodeName') references). It does NOT verify that
 * the JS code in Code nodes produces correct output. This file extracts the
 * actual JS from the workflow JSON and runs it against realistic fixtures.
 *
 * Run from repo root:
 *   node Test/test_code_nodes.js
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
    'Workflow 2- Telegram Receipt Photo Processing',
    'telegram-receipt-workflow.json'
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
 * We pass the JS source to vm.runInNewContext with a context that defines
 * $ and $input. The JS module expects to `return [...]` (an array of items).
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

// A typical Telegram "message" with photo array of 4 sizes (per Telegram docs).
function telegramMessageFixture(overrides = {}) {
    return {
        message_id: 482391,
        date: Math.floor(new Date('2026-08-29T18:42:15Z').getTime() / 1000),
        chat: { id: 987654321, type: 'private' },
        from: {
            id: 482391,
            is_bot: false,
            first_name: 'Jane',
            username: 'janedoe',
        },
        caption: 'Lunch with client',
        photo: [
            { file_id: 'AgACAgIAAxk...90x90', width: 90, height: 90, file_size: 1200 },
            { file_id: 'AgACAgIAAxk...320x320', file_size: 5400 },
            { file_id: 'AgACAgIAAxk...800x800', file_size: 38000 },
            { file_id: 'AgACAgIAAxk...1280x1280', file_size: 145000 },
        ],
        ...overrides,
    };
}

// Telegram getFile response — wrapped in { result: ... } to match the real shape
function fileInfoFixture(overrides = {}) {
    return {
        result: {
            file_id: 'AgACAgIAAxk...1280x1280',
            file_path: 'photos/file_12.jpg',
            file_size: 145000,
            ...overrides,
        },
    };
}

// Gemini response — wrapped in { candidates: [ ... ] } to match the real shape
function geminiResponseFixture(receipt = {}) {
    const defaults = {
        merchant_name: 'Whole Foods Market',
        merchant_address: '123 Main St, Springfield, IL',
        receipt_date: '2026-08-29',
        receipt_time: '18:42',
        currency: 'USD',
        subtotal: 43.95,
        tax: 3.37,
        tip: 0.00,
        total_amount: 47.32,
        payment_method: 'card',
        card_last4: '4242',
        category: 'meals',
        line_items: [
            { description: 'Salad', quantity: 1, unit_price: 12.50, total: 12.50 },
            { description: 'Sandwich', quantity: 1, unit_price: 14.95, total: 14.95 },
        ],
        notes: null,
    };
    return {
        candidates: [
            {
                content: {
                    parts: [
                        { text: JSON.stringify({ ...defaults, ...receipt }) },
                    ],
                },
            },
        ],
    };
}

// =====================================================================
// Tests
// =====================================================================

console.log('Code-node unit tests for Workflow 2\n');
console.log('Pick Best Photo');

// -- Pick Best Photo -------------------------------------------------------

test('picks the last photo in the array (highest resolution)', () => {
    const code = codeByName('Pick Best Photo');
    const out = runCodeNode(code, {
        upstream: { 'If: Has Photo?': [{ message: telegramMessageFixture() }] },
    });
    assertEqual(out.length, 1, 'expected one item returned');
    assertEqual(out[0].json.bestFileId, 'AgACAgIAAxk...1280x1280', 'should pick last (largest) photo');
    assertEqual(out[0].json.chatId, 987654321);
    assertEqual(out[0].json.messageId, 482391);
    assertEqual(out[0].json.caption, 'Lunch with client');
    assertEqual(out[0].json.messageTimestamp, Math.floor(new Date('2026-08-29T18:42:15Z').getTime() / 1000));
});

test('handles single-photo messages (some clients compress)', () => {
    const code = codeByName('Pick Best Photo');
    const msg = telegramMessageFixture();
    msg.photo = [{ file_id: 'only-one' }];
    const out = runCodeNode(code, {
        upstream: { 'If: Has Photo?': [{ message: msg }] },
    });
    assertEqual(out[0].json.bestFileId, 'only-one');
});

test('handles missing caption by defaulting to empty string', () => {
    const code = codeByName('Pick Best Photo');
    const msg = telegramMessageFixture();
    delete msg.caption;
    const out = runCodeNode(code, {
        upstream: { 'If: Has Photo?': [{ message: msg }] },
    });
    assertEqual(out[0].json.caption, '');
});

test('handles missing `from` user (channel posts) by defaulting to {}', () => {
    const code = codeByName('Pick Best Photo');
    const msg = telegramMessageFixture();
    delete msg.from;
    const out = runCodeNode(code, {
        upstream: { 'If: Has Photo?': [{ message: msg }] },
    });
    assertEqual(out[0].json.fromUser, {});
});

test('throws when photo array is empty (should not happen post-If, but safe)', () => {
    const code = codeByName('Pick Best Photo');
    const msg = telegramMessageFixture();
    msg.photo = [];
    let threw = false;
    try {
        runCodeNode(code, {
            upstream: { 'If: Has Photo?': [{ message: msg }] },
        });
    } catch (e) {
        threw = true;
        assert(e.message.includes('No photo found'), 'should throw a clear error');
    }
    assert(threw, 'should have thrown');
});

console.log('\nBuild Receipt Payload');

// -- Build Receipt Payload -------------------------------------------------

test('builds filename in expected format: receipt_<userid>_<timestamp>.<ext>', () => {
    const code = codeByName('Build Receipt Payload');
    const out = runCodeNode(code, {
        upstream: {
            'Pick Best Photo': [{
                chatId: 987654321,
                messageId: 482391,
                bestFileId: 'AgACAgIAAxk...1280x1280',
                caption: 'Lunch',
                fromUser: { id: 482391, username: 'janedoe', first_name: 'Jane' },
                messageTimestamp: Math.floor(new Date('2026-08-29T18:42:15Z').getTime() / 1000),
            }],
            'Telegram: Get File Info': [fileInfoFixture()],
        },
    });
    const j = out[0].json;
    assert(j.originalFileName.startsWith('receipt_482391_'), `expected filename to start with receipt_482391_, got ${j.originalFileName}`);
    assert(j.originalFileName.endsWith('.jpg'), `expected .jpg extension, got ${j.originalFileName}`);
    assertEqual(j.submissionDateFolder, '2026-08-29');
    assertEqual(j.photoFileId, 'AgACAgIAAxk...1280x1280');
    assertEqual(j.photoFileSize, 145000);
    assertEqual(j.telegramUsername, 'janedoe');
    assertEqual(j.telegramFirstName, 'Jane');
});

test('falls back to "anon" in filename when fromUser has no id', () => {
    const code = codeByName('Build Receipt Payload');
    const out = runCodeNode(code, {
        upstream: {
            'Pick Best Photo': [{
                chatId: 1,
                messageId: 1,
                bestFileId: 'x',
                caption: '',
                fromUser: {},
                messageTimestamp: 1700000000,
            }],
            'Telegram: Get File Info': [fileInfoFixture()],
        },
    });
    assert(out[0].json.originalFileName.startsWith('receipt_anon_'), `expected anon fallback, got ${out[0].json.originalFileName}`);
});

test('uses "jpg" as fallback extension when file_path is empty', () => {
    const code = codeByName('Build Receipt Payload');
    const out = runCodeNode(code, {
        upstream: {
            'Pick Best Photo': [{
                chatId: 1, messageId: 1, bestFileId: 'x', caption: '',
                fromUser: { id: 1 }, messageTimestamp: 1700000000,
            }],
            'Telegram: Get File Info': [{ result: {} }],
        },
    });
    assert(out[0].json.originalFileName.endsWith('.jpg'));
});

console.log('\nParse & Normalize Gemini Output');

// -- Parse & Normalize Gemini Output ---------------------------------------

test('parses clean Gemini JSON and normalizes fields', () => {
    const code = codeByName('Parse & Normalize Gemini Output');
    const out = runCodeNode(code, {
        input: geminiResponseFixture(),
        upstream: {
            'Build Receipt Payload': [{
                chatId: 1, messageId: 1, photoFileId: 'x',
                fromUser: { id: 1 }, submissionDateFolder: '2026-08-29',
            }],
        },
    });
    const j = out[0].json;
    assertEqual(j.parseError, false);
    assertEqual(j.merchantName, 'Whole Foods Market');
    assertEqual(j.totalAmount, 47.32);
    assertEqual(j.tax, 3.37);
    assertEqual(j.lineItemCount, 2);
    assertEqual(j.ocrModel, 'gemini-2.5-flash');
    assert(typeof j.ocrTimestamp === 'string', 'should set ocrTimestamp');
});

test('strips markdown ```json fences defensively', () => {
    const code = codeByName('Parse & Normalize Gemini Output');
    const wrapped = {
        candidates: [{
            content: {
                parts: [{
                    text: '```json\n' + JSON.stringify({ merchant_name: 'Cafe', total_amount: 5.5 }) + '\n```',
                }],
            },
        }],
    };
    const out = runCodeNode(code, {
        input: wrapped,
        upstream: { 'Build Receipt Payload': [{ chatId: 1 }] },
    });
    assertEqual(out[0].json.merchantName, 'Cafe');
    assertEqual(out[0].json.totalAmount, 5.5);
});

test('strips generic ``` fences (no language hint)', () => {
    const code = codeByName('Parse & Normalize Gemini Output');
    const wrapped = {
        candidates: [{ content: { parts: [{ text: '```\n{"total_amount": 99}\n```' }] } }],
    };
    const out = runCodeNode(code, {
        input: wrapped,
        upstream: { 'Build Receipt Payload': [{ chatId: 1 }] },
    });
    assertEqual(out[0].json.totalAmount, 99);
});

test('toNumber strips currency symbols and commas: "$1,234.56" -> 1234.56', () => {
    const code = codeByName('Parse & Normalize Gemini Output');
    const out = runCodeNode(code, {
        input: geminiResponseFixture({ subtotal: '$1,234.56', total_amount: '$1,500.00', tax: '$123.44' }),
        upstream: { 'Build Receipt Payload': [{ chatId: 1 }] },
    });
    assertEqual(out[0].json.subtotal, 1234.56);
    assertEqual(out[0].json.totalAmount, 1500.0);
    assertEqual(out[0].json.tax, 123.44);
});

test('toNumber handles negative values (refunds, credits)', () => {
    const code = codeByName('Parse & Normalize Gemini Output');
    const out = runCodeNode(code, {
        input: geminiResponseFixture({ total_amount: -15.50 }),
        upstream: { 'Build Receipt Payload': [{ chatId: 1 }] },
    });
    assertEqual(out[0].json.totalAmount, -15.5);
});

test('toNumber returns null for non-numeric strings', () => {
    const code = codeByName('Parse & Normalize Gemini Output');
    const out = runCodeNode(code, {
        input: geminiResponseFixture({ total_amount: 'N/A' }),
        upstream: { 'Build Receipt Payload': [{ chatId: 1 }] },
    });
    assertEqual(out[0].json.totalAmount, null);
});

test('toNumber returns null for missing/null fields (not 0)', () => {
    const code = codeByName('Parse & Normalize Gemini Output');
    const out = runCodeNode(code, {
        input: geminiResponseFixture({ tip: null, tax: undefined }),
        upstream: { 'Build Receipt Payload': [{ chatId: 1 }] },
    });
    assertEqual(out[0].json.tip, null, 'null tip should stay null, not become 0');
    assertEqual(out[0].json.tax, null);
});

test('sets parseError=true and parseErrorMessage on malformed JSON', () => {
    const code = codeByName('Parse & Normalize Gemini Output');
    const broken = { candidates: [{ content: { parts: [{ text: '{not valid json' }] } }] };
    const out = runCodeNode(code, {
        input: broken,
        upstream: { 'Build Receipt Payload': [{ chatId: 1 }] },
    });
    assertEqual(out[0].json.parseError, true);
    assert(typeof out[0].json.parseErrorMessage === 'string' && out[0].json.parseErrorMessage.length > 0,
        'parseErrorMessage should be populated');
    // Other fields should default to null
    assertEqual(out[0].json.merchantName, null);
    assertEqual(out[0].json.totalAmount, null);
});

test('handles empty Gemini response gracefully (all nulls, no parse error)', () => {
    const code = codeByName('Parse & Normalize Gemini Output');
    const empty = { candidates: [{ content: { parts: [{ text: '' }] } }] };
    const out = runCodeNode(code, {
        input: empty,
        upstream: { 'Build Receipt Payload': [{ chatId: 1 }] },
    });
    // Empty string -> defaults to '{}' -> parses to {} -> all nulls, no error
    assertEqual(out[0].json.parseError, false);
    assertEqual(out[0].json.merchantName, null);
});

test('serializes line_items to JSON string for Sheets', () => {
    const code = codeByName('Parse & Normalize Gemini Output');
    const out = runCodeNode(code, {
        input: geminiResponseFixture(),
        upstream: { 'Build Receipt Payload': [{ chatId: 1 }] },
    });
    const parsed = JSON.parse(out[0].json.lineItemsJson);
    assertEqual(parsed.length, 2);
    assertEqual(parsed[0].description, 'Salad');
});

test('handles missing line_items array', () => {
    const code = codeByName('Parse & Normalize Gemini Output');
    const out = runCodeNode(code, {
        input: geminiResponseFixture({ line_items: undefined }),
        upstream: { 'Build Receipt Payload': [{ chatId: 1 }] },
    });
    assertEqual(out[0].json.lineItemCount, 0);
    assertEqual(JSON.parse(out[0].json.lineItemsJson), []);
});

console.log('\nPrepare Date Folder Name');

// -- Prepare Date Folder Name ---------------------------------------------

test('passes through a normal YYYY-MM-DD folder name unchanged', () => {
    const code = codeByName('Prepare Date Folder Name');
    const out = runCodeNode(code, {
        input: { submissionDateFolder: '2026-08-29' },
    });
    assertEqual(out[0].json.dateFolder, '2026-08-29');
    assertEqual(out[0].json.dateFolderEscaped, '2026-08-29');
});

test('replaces illegal Drive filename characters with underscores', () => {
    const code = codeByName('Prepare Date Folder Name');
    const out = runCodeNode(code, {
        input: { submissionDateFolder: '2026/08/29:test?' },
    });
    assertEqual(out[0].json.dateFolder, '2026_08_29_test_');
});

test('escapes single quotes (and strips backslashes) for Drive query', () => {
    const code = codeByName('Prepare Date Folder Name');
    // The legal-char sanitiser strips the backslash before the escape function runs,
    // so we just verify the apostrophe is escaped.
    const out = runCodeNode(code, {
        input: { submissionDateFolder: "Jane's 2026" },
    });
    assert(out[0].json.dateFolderEscaped.includes("Jane\\'s"),
        `expected escaped single quote, got ${out[0].json.dateFolderEscaped}`);
});

test('falls back to today if submissionDateFolder is missing', () => {
    const code = codeByName('Prepare Date Folder Name');
    const out = runCodeNode(code, { input: {} });
    assert(/^\d{4}-\d{2}-\d{2}$/.test(out[0].json.dateFolder), `expected YYYY-MM-DD, got ${out[0].json.dateFolder}`);
});

console.log('\nMerge: Resolve Date Folder ID');

// -- Merge: Resolve Date Folder ID ----------------------------------------

test('uses newly created folder id when create branch fires', () => {
    const code = codeByName('Merge: Resolve Date Folder ID');
    const out = runCodeNode(code, {
        input: { chatId: 1, originalFileName: 'x.jpg' },
        upstream: {
            'HTTP: Create Date Folder': [{ id: 'NEW_FOLDER_ID' }],
            'HTTP: Find Date Folder': [{ files: [] }],
        },
    });
    assertEqual(out[0].json.dateFolderId, 'NEW_FOLDER_ID');
});

test('throws when neither branch resolves a folder id', () => {
    const code = codeByName('Merge: Resolve Date Folder ID');
    let threw = false;
    try {
        runCodeNode(code, {
            input: {},
            upstream: {
                'HTTP: Create Date Folder': [{}],
                'HTTP: Find Date Folder': [{ files: [] }],
            },
        });
    } catch (e) {
        threw = true;
        assert(e.message.includes('Could not resolve a date folder ID'), 'should throw a clear error');
    }
    assert(threw, 'should have thrown');
});

console.log('\nBuild Confirmation Message');

// -- Build Confirmation Message ------------------------------------------

test('formats a full receipt confirmation', () => {
    const code = codeByName('Build Confirmation Message');
    const out = runCodeNode(code, {
        upstream: {
            'Parse & Normalize Gemini Output': [{
                chatId: 987654321,
                merchantName: 'Whole Foods Market',
                receiptDate: '2026-08-29',
                receiptTime: '18:42',
                totalAmount: 47.32,
                currency: 'USD',
                category: 'meals',
                submissionDateFolder: '2026-08-29',
            }],
        },
    });
    const text = out[0].json.text;
    assert(text.includes('Receipt logged'));
    assert(text.includes('Whole Foods Market'));
    assert(text.includes('2026-08-29 at 18:42'));
    assert(text.includes('USD 47.32'));
    assert(text.includes('Category: meals'));
    assert(text.includes('2026-08-29'));
});

test('handles missing fields with sensible fallbacks', () => {
    const code = codeByName('Build Confirmation Message');
    const out = runCodeNode(code, {
        upstream: {
            'Parse & Normalize Gemini Output': [{ chatId: 1 }],
        },
    });
    const text = out[0].json.text;
    assert(text.includes('Unknown merchant'), 'should fallback to "Unknown merchant"');
    assert(text.includes('date unclear'), 'should fallback to "date unclear"');
    assert(text.includes('—'), 'should use em-dash when total is missing');
    assert(text.includes('uncategorized'));
});

test('omits time when receiptTime is missing', () => {
    const code = codeByName('Build Confirmation Message');
    const out = runCodeNode(code, {
        upstream: {
            'Parse & Normalize Gemini Output': [{
                chatId: 1, merchantName: 'X', receiptDate: '2026-08-29', totalAmount: 10, currency: 'USD',
            }],
        },
    });
    assert(!out[0].json.text.includes(' at '), 'should not include time when receiptTime missing');
});

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
