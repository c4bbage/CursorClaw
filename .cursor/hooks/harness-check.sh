#!/bin/bash
#
# stop hook — Harness health check
# Validates that the Harness itself hasn't degraded during this session.
# Outputs warnings as additional_context so the agent sees them.
#

set -euo pipefail

INPUT=$(cat)

PROJECT_DIR="${CURSOR_PROJECT_DIR:-.}"
WARNINGS=""

# 1. MEMORY.md line count (max 200)
MEMORY_FILE="${PROJECT_DIR}/memory/MEMORY.md"
if [ -f "$MEMORY_FILE" ]; then
  LINE_COUNT=$(wc -l < "$MEMORY_FILE" | tr -d ' ')
  if [ "$LINE_COUNT" -gt 200 ]; then
    WARNINGS="${WARNINGS}⚠ MEMORY.md is ${LINE_COUNT} lines (limit: 200). Consolidate stale entries.\n"
  fi
fi

# 2. Rules total size (warn if any single file > 120 lines)
for rule_file in "${PROJECT_DIR}"/.cursor/rules/*.mdc; do
  [ -f "$rule_file" ] || continue
  RLINES=$(wc -l < "$rule_file" | tr -d ' ')
  RNAME=$(basename "$rule_file")
  if [ "$RLINES" -gt 120 ]; then
    WARNINGS="${WARNINGS}⚠ Rule ${RNAME} is ${RLINES} lines. Consider splitting or moving detail to skills/.\n"
  fi
done

# 3. Check for common anti-patterns in src/ (if modified this session)
if [ -d "${PROJECT_DIR}/src" ]; then
  TRUTHY_TRAPS=$(grep -rn 'if\s*(\s*id\s*)' "${PROJECT_DIR}/src/" 2>/dev/null | grep -v '!= null' | head -3 || true)
  if [ -n "$TRUTHY_TRAPS" ]; then
    WARNINGS="${WARNINGS}⚠ Potential truthy check on 'id' found:\n${TRUTHY_TRAPS}\n  FIX: Use 'id != null' instead. See .cursor/skills/acp-debugging.md\n"
  fi

  MISSING_CATCH=$(grep -rn '\.then(' "${PROJECT_DIR}/src/" 2>/dev/null | grep -v '\.catch(' | grep -v 'test' | head -3 || true)
  if [ -n "$MISSING_CATCH" ]; then
    WARNINGS="${WARNINGS}⚠ Promise .then() without .catch() found:\n${MISSING_CATCH}\n  FIX: Add .catch() to prevent stream chain breakage.\n"
  fi
fi

# 4. Daily log exists for today
TODAY=$(date +%Y-%m-%d)
DAILY_FILE="${PROJECT_DIR}/memory/${TODAY}.md"
if [ ! -f "$DAILY_FILE" ]; then
  WARNINGS="${WARNINGS}⚠ No daily log for today (${TODAY}). Significant work should be captured.\n"
fi

if [ -n "$WARNINGS" ]; then
  ESCAPED=$(echo -e "$WARNINGS" | jq -Rs .)
  echo "{\"additional_context\": \"[Harness Check]\\n${WARNINGS}\"}"
else
  echo '{}'
fi
