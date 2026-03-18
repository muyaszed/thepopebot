#!/bin/bash
# Run Claude Code headlessly with the given PROMPT
# Sets AGENT_EXIT for downstream scripts (commit, push, etc.)
# PERMISSION: plan = restricted mode, code or empty = full access
# CONTINUE_SESSION: 1 = continue most recent session (-c)

CLAUDE_ARGS=(-p "$PROMPT" --verbose --output-format stream-json)

if [ -n "$LLM_MODEL" ]; then
    CLAUDE_ARGS+=(--model "$LLM_MODEL")
fi

if [ -n "$SYSTEM_PROMPT" ]; then
    CLAUDE_ARGS+=(--append-system-prompt "$SYSTEM_PROMPT")
fi

if [ "$PERMISSION" = "plan" ]; then
    CLAUDE_ARGS+=(--permission-mode plan)
else
    CLAUDE_ARGS+=(--dangerously-skip-permissions)
fi

if [ "$CONTINUE_SESSION" = "1" ]; then
    CLAUDE_ARGS+=(-c)
fi

set +e
claude "${CLAUDE_ARGS[@]}"
AGENT_EXIT=$?
set -e
