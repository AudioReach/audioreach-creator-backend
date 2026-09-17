# Luna-Quartz Integration Implementation Plan

> **For agentic workers:** Use the executing-plans skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Luna exploration subagent use a healthy project-scoped Quartz index while preserving safe read-only fallback for projects without Quartz.

**Architecture:** Keep Quartz MCP registration in the indexed project's `.opencode/opencode.json`, not in global configuration. Extend the global Luna explorer with narrowly controlled skill and MCP permissions plus an availability-gated Quartz-first prompt; retain local read-only tools for non-Quartz projects and documented Quartz exceptions.

**Tech Stack:** OpenCode 1.18.29 agent Markdown, OpenCode MCP configuration, Quartz 1.4.0, Bash runtime verification

---

### Task 1: Scope Quartz MCP To This Project

**Package:** `OpenCode configuration`

**Files:**
- Modify: `~/.config/opencode/opencode.json`
- Verify: `.opencode/opencode.json`

- [x] **Step 1: Confirm the project MCP configuration is complete**

Read `.opencode/opencode.json` and confirm `mcp.quartz-local` contains:

```json
{
  "command": [
    "qgenie",
    "quartz",
    "mcp-server",
    "--repo-path",
    "/local/mnt/workspace/arc-repos/use-case-creator"
  ],
  "enabled": true,
  "type": "local"
}
```

Keep its generated environment values unchanged.

- [x] **Step 2: Confirm the project MCP is healthy before changing scope**

Run:

```bash
bash .ai/skills/quartz-status/check_status.sh /local/mnt/workspace/arc-repos/use-case-creator
```

Expected: at least one `STATUS: FRESH` and no `STATUS: STALE`.

- [x] **Step 3: Remove the duplicate global MCP entry**

Remove the complete top-level `mcp.quartz-local` configuration from
`~/.config/opencode/opencode.json`. If `quartz-local` is the only MCP entry,
remove the now-empty top-level `mcp` object. Preserve every unrelated global
configuration property.

- [x] **Step 4: Confirm project-scoped discovery still works**

Run from this repository:

```bash
opencode mcp list
```

Expected: `quartz-local` is `connected` and its command points to
`/local/mnt/workspace/arc-repos/use-case-creator`.

- [x] **Step 5: Confirm the global configuration remains valid**

Run:

```bash
opencode models
```

Expected: exit code `0` and the configured Sol, Terra, and Luna model IDs are
listed.

### Task 2: Give Luna Read-Only Quartz Access

**Package:** `OpenCode configuration`

**Files:**
- Modify: `~/.config/opencode/agents/explore.md`

- [x] **Step 1: Preserve the observed failing behavior as the baseline**

The pre-change Sol-to-Luna runtime check returned:

```text
Unable: no `quartz-local` MCP tools are available in this session.
```

This is the behavior the permission change must correct.

- [x] **Step 2: Replace the explorer definition**

Set `~/.config/opencode/agents/explore.md` to:

```markdown
---
description: Luna-powered read-only codebase exploration using Quartz when available.
mode: subagent
model: QGenie_oai/gpt-5.6-luna
permission:
  read: allow
  glob: allow
  grep: allow
  list: allow
  lsp: allow
  skill:
    "*": deny
    quartz-local: allow
  "quartz-local_*": allow
  "quartz-local_update_*": deny
  "quartz-local_write_*": deny
  "quartz-local_create_*": deny
  "quartz-local_delete_*": deny
  edit: deny
  bash: deny
  task: deny
---

Explore the codebase without changing it.

Before exploring code, check whether `quartz-local_*` tools are available.

When Quartz tools are available:
1. Load the `quartz-local` skill and follow it.
2. Use Quartz as the exclusive source for indexed code navigation and context.
3. Never call Quartz update, write, create, or delete tools.
4. Use direct file tools only for files outside the index or after Quartz
   confirms that a file has no parseable chunks.
5. If a Quartz call fails or appears stale, report the failure. Do not silently
   fall back to direct file tools.

When Quartz tools are not available, use the permitted read-only file and LSP
tools for exploration.

Return:
- Relevant file paths and line numbers.
- The Quartz or direct-read tools used.
- Directly observed facts.
- Inferences clearly labeled as inferences.
- Conflicting or missing evidence.
- Remaining uncertainty.

Do not make unsupported conclusions.
```

- [x] **Step 3: Validate agent loading and permission order**

Run:

```bash
opencode agent list
```

Expected for `explore`: the broad `quartz-local_*` allow rule appears before
the specific update/write/create/delete deny rules, so OpenCode's
last-match-wins evaluation preserves read-only behavior.

- [x] **Step 4: Confirm Luna can use Quartz through Sol**

Run:

```bash
opencode run --agent sol --auto --format json "Delegate to the explore subagent. Require it to load the quartz-local skill and use only read-only quartz-local MCP tools to find BaseEntity in source code. Ask it to return the source path and exact MCP tool name. Verify the returned source path yourself."
```

Expected: the task metadata reports model `gpt-5.6-luna`; the child result
reports a `quartz-local_*` tool and the source path
`packages/core/src/domain/entities/common/base-entity.ts`; Sol verifies the
result.

- [x] **Step 5: Confirm mutation tools remain denied**

Inspect the `explore` section from `opencode agent list`.

Expected: `quartz-local_update_*`, `quartz-local_write_*`,
`quartz-local_create_*`, and `quartz-local_delete_*` resolve to `deny` after
the broad allow rule.

### Task 3: Update Maintenance Documentation

**Package:** `Repository documentation`

**Files:**
- Modify: `.ai/agents-configuration/README.md`
- Modify: `.ai/agents-configuration/QUARTZ_INTEGRATION_DESIGN.md`

- [x] **Step 1: Document project-scoped MCP configuration**

Add `.opencode/opencode.json` to the installed-files table and explain that it
owns the repository-specific `quartz-local` connection. State that the global
OpenCode config no longer contains this project-specific MCP entry.

- [x] **Step 2: Document Luna's conditional Quartz behavior**

Update the Luna section and routing diagram to cover:

```text
Quartz available -> load quartz-local skill -> Quartz-only indexed code context
Quartz absent -> Read/Glob/Grep/List/LSP fallback
Quartz present but failed/stale -> report failure; no silent fallback
```

- [x] **Step 3: Document the read-only permission boundary**

List the allowed Quartz tool wildcard and the denied update, write, create, and
delete patterns. Explain that specific deny rules must follow the broad allow
rule because the last matching permission wins.

- [x] **Step 4: Update maintenance and removal instructions**

Document how to change or remove Luna's Quartz permission and prompt additions.
Clarify that deleting `.opencode/opencode.json` removes this project's Quartz
MCP integration and is separate from removing the global Sol/Terra/Luna agents.

- [x] **Step 5: Mark the design implemented and check formatting**

Change the design status from `pending` to `implemented` after runtime tests
pass, then run:

```bash
git diff --check -- .ai/agents-configuration
```

Expected: exit code `0` with no whitespace errors.

### Task 4: Final End-To-End Validation

**Package:** `OpenCode configuration`

**Files:**
- Verify: `~/.config/opencode/opencode.json`
- Verify: `~/.config/opencode/agents/explore.md`
- Verify: `.opencode/opencode.json`
- Verify: `.ai/agents-configuration/README.md`

- [x] **Step 1: Recheck Quartz freshness**

Run:

```bash
bash .ai/skills/quartz-status/check_status.sh /local/mnt/workspace/arc-repos/use-case-creator
```

Expected: `STATUS: FRESH`.

- [x] **Step 2: Recheck MCP connectivity**

Run:

```bash
opencode mcp list
```

Expected: one connected project-scoped `quartz-local` server.

- [x] **Step 3: Recheck model and agent discovery**

Run:

```bash
opencode models
opencode agent list
```

Expected: all three GPT-5.6 model IDs and all four custom agents load without a
configuration error.

- [x] **Step 4: Repeat the Sol-to-Luna-to-Quartz runtime test**

Run the Task 2 Step 4 command again after a fresh OpenCode process starts.

Expected: Sol delegates to Luna, Luna reports a read-only Quartz MCP tool, and
Sol independently verifies the source path.

- [x] **Step 5: Review the final diff**

Run:

```bash
git diff --check
```

Expected: no whitespace errors; only intended project documentation or existing
unrelated worktree changes are reported.
