/**
 * Runs every test in this directory.
 *
 * - workflow_1_code_tests/test.js  (Gmail workflow, 31 tests)
 * - workflow_2_code_tests/test.js  (Telegram workflow, 28 tests)
 *
 * Plus the two Python scripts in this directory:
 * - validate_workflows.py  (graph integrity)
 * - trace_data_flow.py    (field reference tracer)
 *
 * Exits 0 if everything passes, 1 otherwise.
 *
 * Usage:  node Test/run_all_tests.js
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const TESTS = [
    {
        name: 'Workflow 1 — Code-node unit tests (Node)',
        cmd: 'node',
        args: ['workflow_1_code_tests/test.js'],
        cwd: __dirname,
    },
    {
        name: 'Workflow 2 — Code-node unit tests (Node)',
        cmd: 'node',
        args: ['workflow_2_code_tests/test.js'],
        cwd: __dirname,
    },
    {
        name: 'validate_workflows.py (Python)',
        cmd: process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),
        args: ['validate_workflows.py'],
        cwd: __dirname,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    },
    {
        name: 'trace_data_flow.py (Python)',
        cmd: process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),
        args: ['trace_data_flow.py'],
        cwd: __dirname,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    },
];

let allPassed = true;
const results = [];

for (const t of TESTS) {
    console.log('\n' + '='.repeat(70));
    console.log('  ' + t.name);
    console.log('='.repeat(70));
    const r = spawnSync(t.cmd, t.args, { cwd: t.cwd, env: t.env, encoding: 'utf-8' });
    process.stdout.write(r.stdout || '');
    if (r.stderr) process.stderr.write(r.stderr);
    const ok = r.status === 0;
    results.push({ name: t.name, ok });
    if (!ok) allPassed = false;
}

console.log('\n' + '='.repeat(70));
console.log('  Summary');
console.log('='.repeat(70));
for (const r of results) {
    console.log(`  ${r.ok ? 'ok  ' : 'FAIL'}  ${r.name}`);
}
console.log('='.repeat(70));
if (allPassed) {
    console.log('  All test suites passed');
    process.exit(0);
} else {
    console.log('  One or more test suites failed');
    process.exit(1);
}
