#!/bin/bash
#
# Unified hook logger — writes every Cursor agent event into a
# day-partitioned, conversation-scoped JSONL directory tree.
#
# Directory layout:
#   .cursor/logs/<YYYY-MM-DD>/<conversation_id>/
#     session.jsonl      — sessionStart / sessionEnd
#     thoughts.jsonl     — afterAgentThought
#     responses.jsonl    — afterAgentResponse
#     tools.jsonl        — postToolUse
#

set -euo pipefail

INPUT=$(cat)

PROJECT_DIR="${CURSOR_PROJECT_DIR:-.}"
LOG_ROOT="${PROJECT_DIR}/.cursor/logs"

TODAY=$(date +%Y-%m-%d)
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)

CONV_ID=$(echo "$INPUT" | jq -r '.conversation_id // "unknown"')
HOOK_EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // "unknown"')
GEN_ID=$(echo "$INPUT" | jq -r '.generation_id // ""')
MODEL=$(echo "$INPUT" | jq -r '.model // ""')

CONV_DIR="${LOG_ROOT}/${TODAY}/${CONV_ID}"
mkdir -p "$CONV_DIR"

case "$HOOK_EVENT" in
  sessionStart)
    SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""')
    IS_BG=$(echo "$INPUT" | jq -r '.is_background_agent // false')
    MODE=$(echo "$INPUT" | jq -r '.composer_mode // ""')
    jq -n \
      --arg ts "$NOW" \
      --arg event "$HOOK_EVENT" \
      --arg sid "$SESSION_ID" \
      --arg model "$MODEL" \
      --argjson bg "$IS_BG" \
      --arg mode "$MODE" \
      '{ts:$ts, event:$event, session_id:$sid, model:$model, is_background:$bg, mode:$mode}' \
      >> "${CONV_DIR}/session.jsonl"
    ;;

  sessionEnd)
    SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""')
    REASON=$(echo "$INPUT" | jq -r '.reason // ""')
    DURATION=$(echo "$INPUT" | jq -r '.duration_ms // 0')
    jq -n \
      --arg ts "$NOW" \
      --arg event "$HOOK_EVENT" \
      --arg sid "$SESSION_ID" \
      --arg reason "$REASON" \
      --argjson dur "$DURATION" \
      '{ts:$ts, event:$event, session_id:$sid, reason:$reason, duration_ms:$dur}' \
      >> "${CONV_DIR}/session.jsonl"
    ;;

  afterAgentThought)
    TEXT=$(echo "$INPUT" | jq -r '.text // ""')
    THINK_DUR=$(echo "$INPUT" | jq -r '.duration_ms // 0')
    jq -n \
      --arg ts "$NOW" \
      --arg gen "$GEN_ID" \
      --arg model "$MODEL" \
      --arg text "$TEXT" \
      --argjson dur "$THINK_DUR" \
      '{ts:$ts, generation_id:$gen, model:$model, duration_ms:$dur, text:$text}' \
      >> "${CONV_DIR}/thoughts.jsonl"
    ;;

  afterAgentResponse)
    TEXT=$(echo "$INPUT" | jq -r '.text // ""')
    jq -n \
      --arg ts "$NOW" \
      --arg gen "$GEN_ID" \
      --arg model "$MODEL" \
      --arg text "$TEXT" \
      '{ts:$ts, generation_id:$gen, model:$model, text:$text}' \
      >> "${CONV_DIR}/responses.jsonl"
    ;;

  postToolUse)
    TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""')
    TOOL_INPUT=$(echo "$INPUT" | jq -c '.tool_input // {}')
    DURATION=$(echo "$INPUT" | jq -r '.duration // 0')
    jq -n \
      --arg ts "$NOW" \
      --arg gen "$GEN_ID" \
      --arg tool "$TOOL" \
      --argjson input "$TOOL_INPUT" \
      --argjson dur "$DURATION" \
      '{ts:$ts, generation_id:$gen, tool:$tool, duration_ms:$dur, input:$input}' \
      >> "${CONV_DIR}/tools.jsonl"
    ;;

  *)
    jq -n \
      --arg ts "$NOW" \
      --arg event "$HOOK_EVENT" \
      --argjson raw "$INPUT" \
      '{ts:$ts, event:$event, raw:$raw}' \
      >> "${CONV_DIR}/unknown.jsonl"
    ;;
esac

exit 0
