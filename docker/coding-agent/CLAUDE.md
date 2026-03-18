# docker/coding-agent/ — Unified Coding Agent Image

## Architecture

Two axes, both selected at runtime:
- **`RUNTIME`** — the workflow (job, headless, workspace, cluster-worker)
- **`AGENT`** — the coding agent (claude-code, pi, gemini, etc.)

Base image (`Dockerfile`) has everything shared. Per-agent images extend it:

```
coding-agent-base               →  Ubuntu 24.04, Node.js 22, GitHub CLI, ttyd, tmux, Playwright
  ├── Dockerfile.claude-code    →  + Claude Code CLI, ENV AGENT=claude-code
  ├── Dockerfile.pi             →  + Pi CLI, ENV AGENT=pi
  └── Dockerfile.gemini         →  (future)
```

## How It Works

`entrypoint.sh` validates `RUNTIME` + `AGENT`, then sources each numbered script in `/scripts/${RUNTIME}/` sequentially. Runtime scripts handle the workflow (clone, branch, commit, push). At agent-specific steps, they delegate to `/scripts/agents/${AGENT}/` scripts.

```
headless/1_setup-git.sh       → source common/setup-git.sh      (shared)
headless/2_clone-or-reset.sh  → source common/clone-or-reset.sh (shared)
headless/3_feature-branch.sh  → source common/feature-branch.sh (shared)
headless/4_agent-auth.sh      → source agents/${AGENT}/auth.sh  (agent-specific)
headless/5_agent-setup.sh     → source agents/${AGENT}/setup.sh (agent-specific)
headless/6_agent-run.sh       → source agents/${AGENT}/run.sh   (agent-specific)
headless/7_rebase-push.sh     → source common/rebase-push.sh    (shared)
```

## Env Vars

### Required

| Variable | Values | Purpose |
|----------|--------|---------|
| `RUNTIME` | `job`, `headless`, `workspace`, `cluster-worker` | Selects workflow script folder |
| `AGENT` | `claude-code`, `pi`, `gemini` | Set by per-agent Dockerfile (not passed at runtime) |

### Git / Repo

| Variable | Used by | Purpose |
|----------|---------|---------|
| `GH_TOKEN` | all | GitHub CLI auth |
| `REPO` | headless, workspace | GitHub `owner/repo` slug |
| `REPO_URL` | job | Full git clone URL (includes token) |
| `BRANCH` | job, headless, workspace | Base branch (default: main) |
| `FEATURE_BRANCH` | headless, workspace | Feature branch to create/checkout. If empty, skips branching and pushing. |

### Agent Task

| Variable | Purpose |
|----------|---------|
| `PROMPT` | Task prompt passed to agent via `-p` flag |
| `SYSTEM_PROMPT` | Optional. Claude Code: `--append-system-prompt`. Pi: written to `.pi/SYSTEM.md`. Cleared on each run if empty. |
| `PERMISSION` | `plan` or `code` (default: `code`). Claude Code only. Pi has no built-in permission system. |
| `CONTINUE_SESSION` | `1` = continue most recent session (`-c` flag). Requires volume mount at `/home/coding-agent`. |
| `LLM_MODEL` | Model override via `-m` flag |

### Auth

Pass whichever key(s) your agent/provider needs:

| Variable | Agent | Purpose |
|----------|-------|---------|
| `CLAUDE_CODE_OAUTH_TOKEN` | claude-code | OAuth token (subscription billing) |
| `ANTHROPIC_API_KEY` | both | Anthropic API key. Claude Code: unset by auth.sh (uses OAuth instead). Pi: used directly. |
| `OPENAI_API_KEY` | pi | OpenAI (built-in provider) |
| `GOOGLE_API_KEY` | pi | Google Gemini (built-in provider) |
| `GROQ_API_KEY` | pi | Groq (built-in provider) |
| `MISTRAL_API_KEY` | pi | Mistral (built-in provider) |
| `XAI_API_KEY` | pi | xAI (built-in provider) |
| `CUSTOM_API_KEY` | pi | Custom provider API key (if endpoint needs auth) |
| `CUSTOM_OPENAI_BASE_URL` | pi | Custom OpenAI-compatible endpoint URL |

### Job Runtime

| Variable | Purpose |
|----------|---------|
| `JOB_TITLE` | PR title and commit message |
| `JOB_DESCRIPTION` | PR body and prompt content |
| `JOB_ID` | Log directory name (fallback: extracted from branch) |
| `SECRETS` | JSON blob of AGENT_* secrets (from GitHub Actions) |
| `LLM_SECRETS` | JSON blob of AGENT_LLM_* secrets (from GitHub Actions) |

### Workspace Runtime

| Variable | Purpose |
|----------|---------|
| `CHAT_CONTEXT` | JSON planning conversation for SessionStart hook |
| `PORT` | ttyd port (default: 7681) |

### Cluster-Worker Runtime

| Variable | Purpose |
|----------|---------|
| `LOG_DIR` | Directory for session logs (stdout/stderr + meta.json) |

## Agent Configuration

### Claude Code

Auth via OAuth token (subscription billing). API key is unset so Claude Code uses OAuth.

```bash
docker run --rm \
    -e RUNTIME=headless \
    -e REPO=owner/repo \
    -e BRANCH=main \
    -e PROMPT="your task" \
    -e GH_TOKEN=ghp_... \
    -e CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-... \
    coding-agent-claude-code
```

With permission mode and system prompt:

```bash
    -e PERMISSION=plan \
    -e SYSTEM_PROMPT="You are a code reviewer..." \
```

### Pi — Built-in Providers

Pi auto-detects the provider from the API key. No `LLM_PROVIDER` needed. Just pass the key.

**Anthropic:**
```bash
    -e ANTHROPIC_API_KEY=sk-ant-api03-... \
    -e LLM_MODEL=claude-sonnet-4-6 \          # optional
```

**OpenAI:**
```bash
    -e OPENAI_API_KEY=sk-... \
    -e LLM_MODEL=gpt-4o \                     # optional
```

**Google:**
```bash
    -e GOOGLE_API_KEY=... \
    -e LLM_MODEL=gemini-2.5-pro \             # optional
```

**Other built-in** (Groq, Mistral, xAI, OpenRouter, Cerebras, etc.):
```bash
    -e GROQ_API_KEY=... \
    -e LLM_MODEL=... \
```

### Pi — Custom Provider (Ollama, vLLM, LM Studio, DeepSeek, etc.)

For any OpenAI-compatible endpoint Pi doesn't know about natively. Setting `CUSTOM_OPENAI_BASE_URL` triggers `setup.sh` to generate `~/.pi/agent/models.json` and tells `run.sh` to pass `--provider custom`.

```bash
    -e LLM_MODEL=qwen3:8b \
    -e CUSTOM_OPENAI_BASE_URL=http://host.docker.internal:11434/v1 \
    -e CUSTOM_API_KEY=not-needed \             # optional, dummy for local models
```

### Session Continuation

Both agents support continuing from the last session, saving ~40% tokens on multi-step workflows. Requires volume mount at `/home/coding-agent` so session files persist.

```bash
    -e CONTINUE_SESSION=1 \
```

## Agent Scripts

Each agent has these scripts in `scripts/agents/<agent>/`:

| Script | Purpose |
|--------|---------|
| `auth.sh` | Set up authentication. Claude Code: swap to OAuth. Pi: no-op (reads env vars directly). |
| `setup.sh` | Configure the agent. Claude Code: trust config + Playwright MCP. Pi: write SYSTEM.md + generate models.json. |
| `run.sh` | Invoke the agent headlessly. Sets `AGENT_EXIT` for downstream scripts. |
| `merge-back.sh` | AI-driven conflict resolution when rebase fails. |
| `interactive.sh` | Start agent in tmux + ttyd (workspace runtime only). |

## Common Scripts

Shared workflow logic in `scripts/common/`:

| Script | Purpose |
|--------|---------|
| `setup-git.sh` | Derive git identity from `GH_TOKEN` via GitHub API |
| `clone-or-reset.sh` | Clone repo or fetch+reset if already present |
| `feature-branch.sh` | Create/checkout feature branch. Skips if `FEATURE_BRANCH` is empty. |
| `rebase-push.sh` | Commit, rebase onto base branch, push. Skips if `FEATURE_BRANCH` is empty. Falls back to agent merge-back on conflict. |

## Volume Mounts

Mount at `/home/coding-agent` (not `/home/coding-agent/workspace`) so both workspace files and agent session data persist between container runs. This is required for `CONTINUE_SESSION=1`.

## Testing

```bash
# Test Claude Code headless (read-only: plan mode, no feature branch)
bash test-headless.sh

# Test Pi headless (read-only: no feature branch)
bash test-headless-pi.sh
```

Both test scripts load credentials from `/Users/stephengpope/my-popebot/.env`, build base + agent images, and run against the real `stephengpope/my-popebot` repo.
