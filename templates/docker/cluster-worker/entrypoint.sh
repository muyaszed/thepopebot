#!/bin/bash
set -e

# Git setup — derive identity from GitHub token (useful if tasks need git)
if [ -n "$GH_TOKEN" ]; then
    gh auth setup-git
    GH_USER_JSON=$(gh api user -q '{name: .name, login: .login, email: .email, id: .id}')
    GH_USER_NAME=$(echo "$GH_USER_JSON" | jq -r '.name // .login')
    GH_USER_EMAIL=$(echo "$GH_USER_JSON" | jq -r '.email // "\(.id)+\(.login)@users.noreply.github.com"')
    git config --global user.name "$GH_USER_NAME"
    git config --global user.email "$GH_USER_EMAIL"
fi

cd /home/claude-code/workspace

# Claude Code auth — use OAuth token, not API key
unset ANTHROPIC_API_KEY
export CLAUDE_CODE_OAUTH_TOKEN="${CLAUDE_CODE_OAUTH_TOKEN}"

# Skip onboarding and trust dialogs
WORKSPACE_DIR=$(pwd)
mkdir -p ~/.claude
cat > ~/.claude/settings.json << 'EOF'
{
  "theme": "dark",
  "hasTrustDialogAccepted": true,
  "skipDangerousModePermissionPrompt": true
}
EOF

cat > ~/.claude.json << ENDJSON
{
  "hasCompletedOnboarding": true,
  "projects": {
    "${WORKSPACE_DIR}": {
      "allowedTools": [],
      "hasTrustDialogAccepted": true,
      "hasTrustDialogHooksAccepted": true
    }
  }
}
ENDJSON

# Run Claude Code headlessly
claude -p "$HEADLESS_TASK" \
    --dangerously-skip-permissions \
    --verbose \
    --output-format stream-json

exit $?
