#!/bin/bash
# run_tests.sh — Runs the extension test suite.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
FAIL=0

echo "╔══════════════════════════════════════════════════════╗"
echo "║        Running Tests for $(basename "$PROJECT_DIR")"
echo "╚══════════════════════════════════════════════════════╝"

run_test() {
    local label="$1"
    local file="$2"
    echo ""
    echo "┌── $label ──"
    if node "$SCRIPT_DIR/$file"; then
        echo "└── $label: PASSED ✔"
    else
        echo "└── $label: FAILED ✘"
        FAIL=1
    fi
}

run_test "Standard Assertions" test_assertions.js

echo ""
echo "══════════════════════════════════════════════════════"
if [ $FAIL -eq 0 ]; then
    echo "  ALL TESTS PASSED ✔"
else
    echo "  SOME TESTS FAILED ✘"
fi
echo "══════════════════════════════════════════════════════"

exit $FAIL
