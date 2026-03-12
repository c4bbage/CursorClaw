#!/bin/bash
#
# stop hook — extracts a brief session summary from the JSONL logs
# captured by log-event.sh and appends it to today's daily memory file.
#
# Reads:
#   .cursor/logs/<today>/<conversation_id>/responses.jsonl
#   .cursor/logs/<today>/<conversation_id>/tools.jsonl
#
# Writes:
#   memory/<today>.md  (append)
#

set -euo pipefail

INPUT=$(cat)

PROJECT_DIR="${CURSOR_PROJECT_DIR:-.}"
MEMORY_DIR="${PROJECT_DIR}/memory"
LOG_ROOT="${PROJECT_DIR}/.cursor/logs"

TODAY=$(date +%Y-%m-%d)
NOW_TIME=$(date +%H:%M)

CONV_ID=$(echo "$INPUT" | jq -r '.conversation_id // "unknown"')
STATUS=$(echo "$INPUT" | jq -r '.status // "unknown"')

CONV_LOG_DIR="${LOG_ROOT}/${TODAY}/${CONV_ID}"

if [ ! -d "$CONV_LOG_DIR" ]; then
  echo '{}'
  exit 0
fi

mkdir -p "$MEMORY_DIR"

SUMMARY=""

if [ -f "${CONV_LOG_DIR}/tools.jsonl" ]; then
  TOOL_COUNT=$(wc -l < "${CONV_LOG_DIR}/tools.jsonl" | tr -d ' ')
  TOOLS_USED=$(jq -r '.tool' "${CONV_LOG_DIR}/tools.jsonl" 2>/dev/null | sort -u | head -10 | paste -sd ", " -)
  if [ -n "$TOOLS_USED" ]; then
    SUMMARY="${SUMMARY}- Tools (${TOOL_COUNT} calls): ${TOOLS_USED}\n"
  fi
fi

if [ -f "${CONV_LOG_DIR}/responses.jsonl" ]; then
  RESP_COUNT=$(wc -l < "${CONV_LOG_DIR}/responses.jsonl" | tr -d ' ')
  LAST_RESPONSE=$(tail -1 "${CONV_LOG_DIR}/responses.jsonl" | jq -r '.text // ""' 2>/dev/null | head -c 200)
  SUMMARY="${SUMMARY}- Responses: ${RESP_COUNT} total\n"
  if [ -n "$LAST_RESPONSE" ]; then
    LAST_LINE=$(echo "$LAST_RESPONSE" | head -1 | head -c 120)
    SUMMARY="${SUMMARY}- Last: ${LAST_LINE}...\n"
  fi
fi

if [ -f "${CONV_LOG_DIR}/thoughts.jsonl" ]; then
  THOUGHT_COUNT=$(wc -l < "${CONV_LOG_DIR}/thoughts.jsonl" | tr -d ' ')
  SUMMARY="${SUMMARY}- Thoughts: ${THOUGHT_COUNT} blocks\n"
fi

if [ -z "$SUMMARY" ]; then
  echo '{}'
  exit 0
fi

DAILY_FILE="${MEMORY_DIR}/${TODAY}.md"

if [ ! -f "$DAILY_FILE" ]; then
  echo "# ${TODAY}" > "$DAILY_FILE"
  echo "" >> "$DAILY_FILE"
fi

{
  echo ""
  echo "## ${NOW_TIME} Session (${STATUS}) — conv:${CONV_ID:0:8}"
  echo -e "$SUMMARY"
} >> "$DAILY_FILE"

echo '{}'
exit 0
