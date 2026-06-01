#!/bin/bash
#
# Entropy GC — Automated verification
# Run weekly or on-demand: bash .cursor/hooks/entropy-gc-verify.sh
#
# Outputs a report with PASS/FAIL for each check and remediation instructions.

set -euo pipefail

PROJECT_DIR="${1:-$(cd "$(dirname "$0")/../.." && pwd)}"
PASS=0
FAIL=0

check() {
  local status="$1" label="$2" detail="$3"
  if [ "$status" = "PASS" ]; then
    PASS=$((PASS + 1))
    printf "  ✓ %s\n" "$label"
  else
    FAIL=$((FAIL + 1))
    printf "  ✗ %s\n    → %s\n" "$label" "$detail"
  fi
}

echo "═══ Entropy GC Report ═══"
echo "Project: ${PROJECT_DIR}"
echo "Date: $(date '+%Y-%m-%d %H:%M')"
echo ""

# ── Memory ───────────────────────────────────────────────────
printf "\n[Memory]\n"

MEMORY_FILE="${PROJECT_DIR}/memory/MEMORY.md"
if [ -f "$MEMORY_FILE" ]; then
  LC=$(wc -l < "$MEMORY_FILE" | tr -d ' ')
  if [ "$LC" -le 200 ]; then
    check "PASS" "MEMORY.md size: ${LC}/200 lines" ""
  else
    check "FAIL" "MEMORY.md size: ${LC}/200 lines" "Consolidate stale entries. Move detail to daily logs or docs/."
  fi
else
  check "FAIL" "MEMORY.md exists" "Create memory/MEMORY.md with at least Identity and Architecture sections."
fi

TODAY=$(date +%Y-%m-%d)
if [ -f "${PROJECT_DIR}/memory/${TODAY}.md" ]; then
  check "PASS" "Today's daily log exists" ""
else
  check "FAIL" "Today's daily log exists" "Create memory/${TODAY}.md and record session work."
fi

# Check phantom skill references
if [ -f "$MEMORY_FILE" ]; then
  PHANTOMS=""
  while IFS= read -r skill_path; do
    full_path="${PROJECT_DIR}/${skill_path}"
    if [ ! -f "$full_path" ]; then
      PHANTOMS="${PHANTOMS}  ${skill_path}\n"
    fi
  done < <(grep -oE '\.cursor/skills/[a-zA-Z0-9_-]+\.md' "$MEMORY_FILE" 2>/dev/null || true)

  if [ -z "$PHANTOMS" ]; then
    check "PASS" "All skill references resolve to existing files" ""
  else
    check "FAIL" "Phantom skill references found" "Missing files: $(echo "$PHANTOMS" | tr '\n' ' '). Create them or remove from MEMORY.md."
  fi
fi

# ── Rules ────────────────────────────────────────────────────
printf "\n[Rules]\n"

OVERSIZED=""
for rule_file in "${PROJECT_DIR}"/.cursor/rules/*.mdc; do
  [ -f "$rule_file" ] || continue
  RLINES=$(wc -l < "$rule_file" | tr -d ' ')
  RNAME=$(basename "$rule_file")
  if [ "$RLINES" -gt 120 ]; then
    OVERSIZED="${OVERSIZED}  ${RNAME}: ${RLINES} lines\n"
  fi
done

if [ -z "$OVERSIZED" ]; then
  check "PASS" "All rules under 120 lines" ""
else
    check "FAIL" "Oversized rules" "Extract procedures to skills/: $(echo "$OVERSIZED" | tr '\n' ' ')"
fi

# ── Skills ───────────────────────────────────────────────────
printf "\n[Skills]\n"

SKILL_COUNT=0
MISSING_WHEN=0
for skill_file in "${PROJECT_DIR}"/.cursor/skills/*.md; do
  [ -f "$skill_file" ] || continue
  SKILL_COUNT=$((SKILL_COUNT + 1))
  if ! grep -q "## When to use" "$skill_file" 2>/dev/null; then
    MISSING_WHEN=$((MISSING_WHEN + 1))
  fi
done

check "PASS" "Skills count: ${SKILL_COUNT}" ""
if [ "$MISSING_WHEN" -eq 0 ]; then
  check "PASS" "All skills have 'When to use' section" ""
else
  check "FAIL" "${MISSING_WHEN} skill(s) missing 'When to use'" "Add a '## When to use' section to each skill file."
fi

# ── Code ─────────────────────────────────────────────────────
printf "\n[Code]\n"

if [ -d "${PROJECT_DIR}/src" ]; then
  TRUTHY=$(grep -rEn 'if[[:space:]]*\([[:space:]]*id[[:space:]]*\)' "${PROJECT_DIR}/src/" 2>/dev/null | grep -v '!= null' || true)
  TRUTHY_COUNT=$(printf '%s' "$TRUTHY" | grep -c . || true)
  if [ "$TRUTHY_COUNT" -eq 0 ]; then
    check "PASS" "No falsy-value traps on 'id'" ""
  else
    check "FAIL" "${TRUTHY_COUNT} falsy-value trap(s)" "Replace 'if (id)' with 'if (id != null)' in src/."
  fi

  # Multi-line aware: for each .then() line, check if .catch() appears within 30 lines after
  UNCAUGHT=""
  while IFS=: read -r file lineno _rest; do
    [ -z "$file" ] && continue
    HAS_CATCH=$(awk -v start="$lineno" 'NR >= start && NR <= start+30 && /\.catch\(/ {found=1; exit} END {print found+0}' "$file")
    HAS_TWO_ARG=$(awk -v ln="$lineno" 'NR == ln && /\.then\([^,]+,/ {print 1; exit} END {}' "$file")
    if [ "$HAS_CATCH" -eq 0 ] && [ "${HAS_TWO_ARG:-0}" -ne 1 ]; then
      UNCAUGHT="${UNCAUGHT}${file}:${lineno}\n"
    fi
  done < <(grep -rn '\.then(' "${PROJECT_DIR}/src/" 2>/dev/null | grep -v 'test' || true)
  UNCAUGHT_COUNT=$(printf '%s' "$UNCAUGHT" | grep -c . || true)
  if [ "$UNCAUGHT_COUNT" -eq 0 ]; then
    check "PASS" "No uncaught promise chains" ""
  else
    check "FAIL" "${UNCAUGHT_COUNT} .then() without .catch() within 30 lines" "Files: $(printf '%s' "$UNCAUGHT" | tr '\n' ' ')"
  fi
else
  check "PASS" "No src/ directory (skip code checks)" ""
fi

# ── Fitness ──────────────────────────────────────────────────
printf "\n[Fitness]\n"

FITNESS_DIR="${PROJECT_DIR}/docs/fitness"
if [ -d "$FITNESS_DIR" ]; then
  TODO_MATCHES=$(grep -rl 'status: TODO' "$FITNESS_DIR" 2>/dev/null || true)
  TODO_COUNT=$(printf '%s' "$TODO_MATCHES" | grep -c . || true)
  VERIFIED_MATCHES=$(grep -rl 'status: VERIFIED' "$FITNESS_DIR" 2>/dev/null || true)
  VERIFIED_COUNT=$(printf '%s' "$VERIFIED_MATCHES" | grep -c . || true)
  check "PASS" "Fitness rules: ${VERIFIED_COUNT} verified, ${TODO_COUNT} TODO" ""
  if [ "$TODO_COUNT" -gt 0 ]; then
    check "FAIL" "${TODO_COUNT} fitness rule(s) still TODO" "Review docs/fitness/ and either verify or document blockers."
  fi
else
  check "FAIL" "No fitness rules directory" "Create docs/fitness/ with at least memory-integrity.md and acp-safety.md."
fi

# ── Summary ──────────────────────────────────────────────────
echo ""
echo "═══════════════════════════"
echo "Result: ${PASS} passed, ${FAIL} failed"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "Action required: fix the ✗ items above."
  exit 1
else
  echo "All checks passed. Harness is healthy."
  exit 0
fi
