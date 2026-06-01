#!/bin/bash
#
# stop hook — Harness health check
# Validates Harness integrity after each session.
# Output format: each warning includes WHAT / WHERE / FIX so the agent
# can act on it directly (inspired by OpenAI Harness Engineering:
# "linter error messages = agent remediation instructions").
#

set -uo pipefail

INPUT=$(cat)

PROJECT_DIR="${CURSOR_PROJECT_DIR:-.}"
WARNINGS=""
WARN_COUNT=0

warn() {
  WARN_COUNT=$((WARN_COUNT + 1))
  WARNINGS="${WARNINGS}[${WARN_COUNT}] $1\n"
}

# ── 1. Memory ────────────────────────────────────────────────
MEMORY_FILE="${PROJECT_DIR}/memory/MEMORY.md"
if [ -f "$MEMORY_FILE" ]; then
  LINE_COUNT=$(wc -l < "$MEMORY_FILE" | tr -d ' ')
  if [ "$LINE_COUNT" -gt 200 ]; then
    warn "WHAT: MEMORY.md bloated (${LINE_COUNT}/200 lines)
   WHERE: memory/MEMORY.md
   FIX: Consolidate stale entries. Move detail to daily logs or docs/. Keep MEMORY.md as a navigation map, not a manual."
  fi
fi

TODAY=$(date +%Y-%m-%d)
DAILY_FILE="${PROJECT_DIR}/memory/${TODAY}.md"
if [ ! -f "$DAILY_FILE" ]; then
  warn "WHAT: No daily log for today (${TODAY})
   WHERE: memory/${TODAY}.md
   FIX: Create the file and record session work under '## HH:MM Session — [topic]'."
fi

# ── 2. Rules health ──────────────────────────────────────────
for rule_file in "${PROJECT_DIR}"/.cursor/rules/*.mdc; do
  [ -f "$rule_file" ] || continue
  RLINES=$(wc -l < "$rule_file" | tr -d ' ')
  RNAME=$(basename "$rule_file")
  if [ "$RLINES" -gt 120 ]; then
    warn "WHAT: Rule '${RNAME}' too long (${RLINES}/120 lines)
   WHERE: .cursor/rules/${RNAME}
   FIX: Extract detailed procedures into docs/ or skills/. Rules should be concise policy, not tutorials."
  fi
done

# ── 3. Code anti-patterns (src/) ─────────────────────────────
if [ -d "${PROJECT_DIR}/src" ]; then
  TRUTHY_TRAPS=$( (grep -rEn 'if[[:space:]]*\([[:space:]]*id[[:space:]]*\)' "${PROJECT_DIR}/src/" 2>/dev/null | grep -v '!= null' | head -3) || true)
  if [ -n "$TRUTHY_TRAPS" ]; then
    warn "WHAT: Falsy-value trap — truthy check on 'id' (id=0 would be falsy)
   WHERE: ${TRUTHY_TRAPS}
   FIX: Replace 'if (id)' with 'if (id != null)'. Ref: memory/MEMORY.md → Resolved Bug Classes."
  fi

  MISSING_CATCH=$( (grep -rn '\.then(' "${PROJECT_DIR}/src/" 2>/dev/null | grep -Ev '\.catch\(' | grep -Ev '\.then\([^,]+,[^)]+\)' | grep -v 'test' | head -3) || true)
  if [ -n "$MISSING_CATCH" ]; then
    warn "WHAT: Stream chain breakage — .then() without .catch()
   WHERE: ${MISSING_CATCH}
   FIX: Append .catch(err => console.error('[module]', err)) to every .then() chain."
  fi
fi

# ── 4. Fitness: evidence status ──────────────────────────────
FITNESS_DIR="${PROJECT_DIR}/docs/fitness"
if [ -d "$FITNESS_DIR" ]; then
  TODO_COUNT=$( (grep -rl 'status: TODO' "$FITNESS_DIR" 2>/dev/null || true) | wc -l | tr -d ' ')
  BLOCKED_COUNT=$( (grep -rl 'status: BLOCKED' "$FITNESS_DIR" 2>/dev/null || true) | wc -l | tr -d ' ')
  if [ "$TODO_COUNT" -gt 0 ] || [ "$BLOCKED_COUNT" -gt 0 ]; then
    warn "WHAT: Fitness rules with unverified evidence (TODO=${TODO_COUNT}, BLOCKED=${BLOCKED_COUNT})
   WHERE: docs/fitness/
   FIX: Review TODO items and either verify them or document why they are blocked."
  fi
fi

# ── 5. Test suite ────────────────────────────────────────────
if [ -f "${PROJECT_DIR}/package.json" ]; then
  if ! grep -q '"test"' "${PROJECT_DIR}/package.json" 2>/dev/null; then
    warn "WHAT: No test script in package.json
   WHERE: package.json
   FIX: Add a 'test' script. Red/Green TDD: always have runnable tests."
  fi
fi

# ── Output ───────────────────────────────────────────────────
if [ -n "$WARNINGS" ]; then
  echo "{\"additional_context\": \"[Harness Check] ${WARN_COUNT} issue(s):\\n${WARNINGS}\"}"
else
  echo '{}'
fi

exit 0
