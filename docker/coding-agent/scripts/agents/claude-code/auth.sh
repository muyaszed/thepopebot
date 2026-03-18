#!/bin/bash
# Claude Code auth — use OAuth token, not API key
# API key is for the event handler, not agents

unset ANTHROPIC_API_KEY
export CLAUDE_CODE_OAUTH_TOKEN="${CLAUDE_CODE_OAUTH_TOKEN}"
