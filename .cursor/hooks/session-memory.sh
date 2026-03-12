#!/bin/bash
#
# sessionStart hook — reads memory files and injects them as
# additional_context so the agent has instant recall without tool calls.
#
# Reads:
#   memory/MEMORY.md          (long-term)
#   memory/<today>.md          (today's daily log)
#   memory/<yesterday>.md      (yesterday's daily log)
#
# Outputs JSON with additional_context to stdout.
#

set -euo pipefail

cat > /dev/null

PROJECT_DIR="${CURSOR_PROJECT_DIR:-.}"
MEMORY_DIR="${PROJECT_DIR}/memory"
MAX_CHARS=8000

TODAY=$(date +%Y-%m-%d)
YESTERDAY=$(date -v-1d +%Y-%m-%d 2>/dev/null || date -d "yesterday" +%Y-%m-%d 2>/dev/null || "")

CONTEXT=""

if [ -f "${MEMORY_DIR}/MEMORY.md" ]; then
  CONTENT=$(head -c 3000 "${MEMORY_DIR}/MEMORY.md")
  CONTEXT="${CONTEXT}## Long-Term Memory (memory/MEMORY.md)\n\n${CONTENT}\n\n"
fi

if [ -f "${MEMORY_DIR}/${TODAY}.md" ]; then
  CONTENT=$(tail -c 3000 "${MEMORY_DIR}/${TODAY}.md")
  CONTEXT="${CONTEXT}## Today's Log (memory/${TODAY}.md)\n\n${CONTENT}\n\n"
fi

if [ -n "$YESTERDAY" ] && [ -f "${MEMORY_DIR}/${YESTERDAY}.md" ]; then
  CONTENT=$(tail -c 2000 "${MEMORY_DIR}/${YESTERDAY}.md")
  CONTEXT="${CONTEXT}## Yesterday's Log (memory/${YESTERDAY}.md)\n\n${CONTENT}\n\n"
fi

if [ -z "$CONTEXT" ]; then
  echo '{}'
  exit 0
fi

CONTEXT=$(echo -n "$CONTEXT" | head -c "$MAX_CHARS")

jq -n --arg ctx "$CONTEXT" '{"additional_context": $ctx}'

exit 0
