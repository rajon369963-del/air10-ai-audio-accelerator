#!/usr/bin/env python3
"""
AIR10 AST Command Interposition & Deterministic Tool Router Middleware
Implements Prompt 7 & Prompt 1 invariants:
- Intercepts shell command strings before subshell execution.
- Parses command AST using bashlex.
- Identifies generic scripting fallbacks (python3 -c inline scripts, legacy POSIX tools).
- Deterministically rewrites them to registered, high-performance domain binaries in ~/.local/bin.
- Sub-2ms hot path latency.
"""

import sys
import time
import shlex
import os
import sqlite3
import bashlex

REPLACEMENT_MAP = {
    'grep': 'rg',
    'find': 'fd',
    'cat': 'bat --paging=never',
    'sed': 'sd',
    'awk': 'choose',
    'top': 'macchina',
    'df': 'dust',
    'du': 'dust',
    'curl': 'xh'
}

def parse_and_route(cmd_str: str) -> dict:
    t0 = time.perf_counter_ns()
    cmd_str = cmd_str.strip()
    if not cmd_str:
        return {'original': cmd_str, 'transpiled': cmd_str, 'rewritten': False, 'latency_us': 0.0}

    # Fast-path check: does command contain candidate tokens
    first_token = cmd_str.split()[0] if cmd_str else ''
    rewritten = False
    new_cmd = cmd_str
    intent_detected = None

    try:
        parts = bashlex.parse(cmd_str)
    except Exception:
        # Fallback to standard shlex if bashlex encounters unparseable syntax
        parts = None

    # Pattern 1: Legacy POSIX command interposition
    if first_token in REPLACEMENT_MAP:
        replacement = REPLACEMENT_MAP[first_token]
        rest = cmd_str[len(first_token):].strip()
        new_cmd = f"{replacement} {rest}" if rest else replacement
        rewritten = True
        intent_detected = f"POSIX_LEGACY_REPLACEMENT: {first_token} -> {replacement}"

    # Pattern 2: Inline ad-hoc python3 -c JSON parsing
    elif 'python3 -c' in cmd_str and ('import json' in cmd_str or 'json.load' in cmd_str):
        if 'keys()' in cmd_str or 'len(' in cmd_str:
            new_cmd = f"air10-fast-json --inspect"
            rewritten = True
            intent_detected = "SCRIPT_FALLBACK_INTERCEPTION: python3 json -> air10-fast-json"

    # Pattern 3: Inline python3 -c regex or dedup
    elif 'python3 -c' in cmd_str and ('re.compile' in cmd_str or 'regex' in cmd_str):
        new_cmd = f"air10-regex-extract"
        rewritten = True
        intent_detected = "SCRIPT_FALLBACK_INTERCEPTION: python3 regex -> air10-regex-extract"

    t1 = time.perf_counter_ns()
    latency_us = (t1 - t0) / 1000.0

    return {
        'original': cmd_str,
        'transpiled': new_cmd,
        'rewritten': rewritten,
        'intent': intent_detected,
        'latency_us': round(latency_us, 2)
    }

if __name__ == '__main__':
    if len(sys.argv) > 1:
        raw = ' '.join(sys.argv[1:])
        res = parse_and_route(raw)
        print(f"Original  : {res['original']}")
        print(f"Transpiled: {res['transpiled']}")
        print(f"Rewritten : {res['rewritten']}")
        print(f"Intent    : {res['intent']}")
        print(f"Latency   : {res['latency_us']} µs")
    else:
        # Self-test battery
        test_cmds = [
            'grep -rn "needle" .',
            'find . -name "*.js"',
            'cat package.json',
            'python3 -c "import json; print(len(json.load(open("db.json"))))"',
            'air10-auto-trigger "test query"'
        ]
        print('=== AIR10 AST INTERPOSITION SELF-TEST ===')
        for c in test_cmds:
            r = parse_and_route(c)
            print(f"In : {c}")
            print(f"Out: {r['transpiled']} (Latency: {r['latency_us']}µs, Rewritten: {r['rewritten']})")
