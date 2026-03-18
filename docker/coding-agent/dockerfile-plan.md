# Unified Coding Agent Docker Image — Plan

## Architecture

Two axes, both selected at runtime:
- **`RUNTIME`** — the workflow (job, headless, workspace, cluster-worker)
- **`AGENT`** — the coding agent (claude-code, pi, opencode, gemini, etc.)

Base image has everything shared. Per-agent images extend it with one install + `ENV AGENT=<name>`.

```
coding-agent-base               →  Ubuntu 24.04, Node.js 22, GitHub CLI, ttyd, tmux, Playwright
  ├── Dockerfile.claude-code    →  + Claude Code CLI (npm), ENV AGENT=claude-code
  ├── Dockerfile.pi             →  + Pi CLI (npm), ENV AGENT=pi
  ├── Dockerfile.opencode       →  + OpenCode CLI (curl/npm), ENV AGENT=opencode
  └── Dockerfile.gemini         →  + Gemini CLI, ENV AGENT=gemini (future)
```

Entrypoint sources `/scripts/${RUNTIME}/*.sh` sequentially. Runtime scripts use `source` to call shared (`common/`) and agent-specific (`agents/${AGENT}/`) scripts. No symlinks, no build-time processing.

---

## Done (built + tested)

- [x] **Dockerfile** (base) — Ubuntu 24.04, system packages, GitHub CLI, ttyd, Node.js 22, Playwright Chromium, non-root `coding-agent` user
- [x] **Dockerfile.claude-code** — extends base, installs Claude Code CLI, sets AGENT=claude-code
- [x] **Dockerfile.pi** — extends base, installs Pi CLI, creates ~/.pi/agent, sets AGENT=pi
- [x] **entrypoint.sh** — validates RUNTIME + AGENT, sources scripts in order, full env var reference
- [x] **common/** — setup-git.sh, clone-or-reset.sh, feature-branch.sh, rebase-push.sh
- [x] **agents/claude-code/** — auth.sh, setup.sh, run.sh, merge-back.sh, interactive.sh
- [x] **agents/pi/** — auth.sh, setup.sh, run.sh, merge-back.sh, interactive.sh
- [x] **headless/ runtime** — 7 numbered scripts wiring common + agent steps
- [x] **CLAUDE.md** — full configuration reference
- [x] **test-headless.sh** — tested: headless + claude-code + plan mode ✅
- [x] **test-headless-pi.sh** — tested: headless + pi + anthropic auto-detect ✅

---

## Remaining: New Agents

### OpenCode

Install: `npm i -g opencode-ai` or `curl -fsSL https://opencode.ai/install | bash`

Key differences from Claude Code / Pi:
- **Headless invocation**: `opencode run "prompt"` (not `-p`)
- **Model flag**: `--model provider/model` (combined format, e.g. `--model anthropic/claude-sonnet-4-6`)
- **Output format**: `--format json`
- **Session continue**: `-c` (same as others)
- **Auth**: `opencode auth login` or config file with `{env:VARIABLE_NAME}` syntax
- **System prompt**: TBD — needs investigation (may use AGENTS.md like Pi, or config)
- **Permissions**: Built-in "build" (full access) and "plan" (read-only) agents, selected via `--agent`
- **Config**: `OPENCODE_CONFIG_CONTENT` env var for inline JSON config — useful for Docker

Files needed:
- [ ] `Dockerfile.opencode`
- [ ] `agents/opencode/auth.sh` — write config with API key from env vars
- [ ] `agents/opencode/setup.sh` — system prompt, provider config via OPENCODE_CONFIG_CONTENT
- [ ] `agents/opencode/run.sh` — `opencode run "$PROMPT" --model ... --format json`
- [ ] `agents/opencode/merge-back.sh`
- [ ] `agents/opencode/interactive.sh`
- [ ] Test: headless + opencode

### Gemini CLI

- [ ] Investigate Gemini CLI (google/gemini-cli) — install, flags, headless mode, auth
- [ ] `Dockerfile.gemini`
- [ ] `agents/gemini/` scripts
- [ ] Test: headless + gemini

---

## Remaining: Runtimes

### job/

Port the existing `claude-code-job` + `pi-coding-agent-job` entrypoints into the new format.

- [ ] `job/1_unpack-secrets.sh` — SECRETS/LLM_SECRETS JSON → env vars
- [ ] `job/2_setup-git.sh` — source common/setup-git.sh
- [ ] `job/3_clone.sh` — git clone --single-branch --depth 1
- [ ] `job/4_agent-auth.sh` — source agents/${AGENT}/auth.sh
- [ ] `job/5_agent-setup.sh` — source agents/${AGENT}/setup.sh
- [ ] `job/6_install-skills.sh` — npm install in skills/active/*/
- [ ] `job/7_build-prompt.sh` — concat SOUL.md + JOB_AGENT.md, resolve {{datetime}}
- [ ] `job/8_agent-run.sh` — source agents/${AGENT}/run.sh
- [ ] `job/9_commit-and-pr.sh` — commit, push, remove logs, gh pr create
- [ ] Test: job + claude-code
- [ ] Test: job + pi

### workspace/

- [ ] `workspace/1_setup-git.sh` — source common/setup-git.sh
- [ ] `workspace/2_clone-or-reset.sh` — source common/clone-or-reset.sh
- [ ] `workspace/3_feature-branch.sh` — source common/feature-branch.sh
- [ ] `workspace/4_agent-auth.sh` — source agents/${AGENT}/auth.sh
- [ ] `workspace/5_agent-setup.sh` — source agents/${AGENT}/setup.sh (extends with SessionStart hook for chat context)
- [ ] `workspace/6_chat-context.sh` — write CHAT_CONTEXT to .claude/chat-context.txt
- [ ] `workspace/7_start-interactive.sh` — source agents/${AGENT}/interactive.sh
- [ ] Test: workspace + claude-code
- [ ] Test: workspace + pi

### cluster-worker/

- [ ] `cluster-worker/1_setup-git.sh` — source common/setup-git.sh (conditional — skips if no GH_TOKEN)
- [ ] `cluster-worker/2_agent-auth.sh` — source agents/${AGENT}/auth.sh
- [ ] `cluster-worker/3_agent-setup.sh` — source agents/${AGENT}/setup.sh
- [ ] `cluster-worker/4_setup-logging.sh` — mkdir LOG_DIR, prep meta.json
- [ ] `cluster-worker/5_agent-run.sh` — source agents/${AGENT}/run.sh (with tee to log files)
- [ ] `cluster-worker/6_finalize-logging.sh` — write endedAt to meta.json
- [ ] Test: cluster-worker + claude-code

---

## After: Caller Updates

These changes happen in the npm package source code after the image is built and tested.

- [ ] **Volume mount scope** — change from `/home/coding-agent/workspace` to `/home/coding-agent` in `lib/tools/docker.js` so agent sessions persist for CONTINUE_SESSION
- [ ] **Image references** — update callers to use unified image tags + pass RUNTIME env var:
  - `lib/tools/docker.js` — runCodeWorkspaceContainer(), runHeadlessCodeContainer(), runClusterWorkerContainer()
  - `lib/cluster/execute.js` — runClusterRole()
  - `lib/code/actions.js` — startInteractiveMode(), ensureCodeWorkspaceContainer()
- [ ] **run-job.yml workflow** — update to use unified image + RUNTIME=job + AGENT from AGENT_BACKEND
- [ ] **AGENT_BACKEND mapping** — map existing GitHub variable values to AGENT env var
- [ ] **Env var rename** — OPENAI_BASE_URL → CUSTOM_OPENAI_BASE_URL in callers + docs + setup wizard
- [ ] **Remove old images** — delete docker/claude-code-job/, docker/claude-code-headless/, docker/claude-code-workspace/, docker/claude-code-cluster-worker/, docker/pi-coding-agent-job/

---

## Notes

- **PERMISSION** — only Claude Code supports plan/code mode natively. Pi has no built-in permission system (could be done via extensions, out of scope). OpenCode has built-in "plan" and "build" agents.
- **SYSTEM_PROMPT** — agent-specific handling. Claude Code: `--append-system-prompt`. Pi: `.pi/SYSTEM.md` (cleared each run if empty). OpenCode: TBD.
- **CONTINUE_SESSION=1** — adds `-c` to agent CLI. Requires volume at `/home/coding-agent`. Saves ~40% tokens on multi-step workflows.
- **CUSTOM_OPENAI_BASE_URL** — triggers `models.json` generation for Pi custom providers. This is the only time `--provider custom` is passed to Pi. Built-in providers auto-detect from API keys.
- **Pi --provider flag** — only used for custom providers (triggered by CUSTOM_OPENAI_BASE_URL). Built-in providers auto-detect.
