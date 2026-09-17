# Multi-Model OpenCode Routing

## Scope

This document describes the global OpenCode multi-model routing configuration
installed for the current user and the project-scoped Quartz integration used
by this repository. The global agent definitions affect every project opened
with OpenCode. The Quartz MCP connection is project-scoped so Luna cannot query
this repository's index while working in an unrelated project.

The configuration uses the following model IDs:

| Role | Model |
| --- | --- |
| Sol primary agent | `QGenie_oai/gpt-5.6-sol` |
| Terra primary and reasoning agent | `QGenie_oai/gpt-5.6-terra` |
| Read-only code explorer | `QGenie_oai/gpt-5.6-luna` |

## Installed Files

| Path | Purpose |
| --- | --- |
| `~/.config/opencode/opencode.json` | Sets `sol` as the default primary agent and `subagent_depth` to `2`. |
| `~/.config/opencode/agents/sol.md` | Defines the Sol primary agent and its delegation, validation, and fallback instructions. |
| `~/.config/opencode/agents/terra.md` | Defines the Terra primary agent and its Luna exploration and validation instructions. |
| `~/.config/opencode/agents/explore.md` | Overrides the built-in `explore` subagent with a read-only Luna agent. |
| `~/.config/opencode/agents/terra-medium.md` | Defines the read-only Terra reasoning subagent used by Sol. |
| `.opencode/opencode.json` | Configures the `quartz-local` MCP server for this repository only. |
| `.ai/agents-configuration/README.md` | This project-local implementation, maintenance, and removal guide. |
| `.ai/agents-configuration/QUARTZ_INTEGRATION_DESIGN.md` | Approved requirements, design, alternatives, validation, and rollback details. |
| `.ai/agents-configuration/QUARTZ_INTEGRATION_PLAN.md` | Step-by-step implementation and verification plan. |

## Global Config Change

The following two properties were added to
`~/.config/opencode/opencode.json` immediately after the existing `model`
property:

```json
{
  "default_agent": "sol",
  "subagent_depth": 2
}
```

`default_agent` makes `sol` the primary agent for new sessions. The depth of
`2` allows the `terra-medium` subagent to call Luna's `explore` subagent when
it needs code context. The OpenCode default is `1`, which would block that
nested delegation.

## Agent Implementation

### `sol`

- Mode: `primary`
- Model: GPT-5.6 Sol
- Can delegate only to `explore` and `terra-medium`.
- Uses Luna for routine code discovery, searching, and navigation.
- Delegates self-contained medium-complexity reasoning to Terra.
- Verifies material subagent claims against files, symbols, or tool output.
- Treats errors, timeouts, empty output, contradictions, and unsupported
  claims as failed subagent work.
- When Terra fails or does not align with the task, Sol completes and verifies
  the work itself.

### `terra`

- Mode: `primary`
- Model: GPT-5.6 Terra
- Can delegate only to `explore`.
- Uses Luna for routine code discovery, searching, and navigation.
- Verifies material claims from subagents and investigates directly when
  evidence is missing or contradictory.

### `explore`

- Mode: `subagent`
- Model: GPT-5.6 Luna
- Read-only permissions: `read`, `glob`, `grep`, `list`, and `lsp`.
- Can load only the `quartz-local` skill.
- Can call `quartz-local_*` MCP tools when the current project provides them.
- Explicitly denies Quartz update, write, create, and delete tool patterns.
- Denied permissions: `edit`, `bash`, and nested `task` delegation.
- Uses Quartz exclusively for indexed code when Quartz tools are available.
- Uses direct read-only tools when Quartz is absent, for files outside the
  index, or after Quartz confirms that a file has no parseable chunks.
- Reports Quartz failures or stale results instead of silently falling back.
- Reports cited file paths, line numbers, observed facts, inferences,
  conflicting evidence, and uncertainty.
- Overrides OpenCode's built-in `explore` agent because its filename is
  `explore.md`.

### `terra-medium`

- Mode: `subagent`
- Model: GPT-5.6 Terra
- Cannot read, search, edit, execute shell commands, or use LSP directly.
- Can delegate only to Luna's `explore` agent when code context is necessary.
- Returns a conclusion, supporting evidence, assumptions, confidence, and
  unresolved questions or failure reason.

## Routing Flows

```text
Sol primary agent
  -> routine code exploration -> Luna explore
       -> Quartz available -> quartz-local skill and read-only MCP tools
       -> Quartz absent -> direct read-only file and LSP tools
       -> Quartz fails/stale -> report failure without silent fallback
  -> medium reasoning -> Terra medium
       -> code context when needed -> Luna explore
  -> verifies all material results itself
  -> Terra failure or misalignment -> Sol completes and verifies itself

Terra primary agent
  -> routine code exploration -> Luna explore
  -> verifies all material results itself
```

## Quartz Configuration

Quartz `1.4.0` is configured for this repository in
`.opencode/opencode.json`. The project configuration starts:

```text
qgenie quartz mcp-server --repo-path /local/mnt/workspace/arc-repos/use-case-creator
```

Its generated environment values identify the repository, syntactic cache,
and current index run. Keep those generated values synchronized by using the
Quartz index or update skills rather than editing them manually.

The same MCP entry was removed from `~/.config/opencode/opencode.json` because
a global entry would expose this repository's index while OpenCode is running
in other projects. Other indexed projects should carry their own
`.opencode/opencode.json` configuration.

Luna's effective permission order is significant because OpenCode uses the
last matching rule:

```yaml
skill:
  "*": deny
  quartz-local: allow
"quartz-local_*": allow
"quartz-local_update_*": deny
"quartz-local_write_*": deny
"quartz-local_create_*": deny
"quartz-local_delete_*": deny
```

The broad Quartz allow makes read-only query tools available to the subagent.
The later mutation patterns preserve Luna's read-only boundary.

OpenCode supports fixed model assignment per agent and task allow-lists. It
does not provide a configuration-only conditional fallback mechanism or a
guarantee that a model follows an instruction. The required validation and
Sol fallback behaviors are explicit instructions in `sol.md`.

## Use

1. Restart OpenCode after changing any file listed above. Configuration is
   loaded when OpenCode starts.
2. New sessions use `sol` by default.
3. Switch to the `terra` primary agent with OpenCode's agent switcher, usually
   Tab, when Terra should be the main active model.
4. Do not change only the UI model selector. Model-only selection bypasses the
   `sol` and `terra` prompts that request Luna exploration and verification.
5. For manual delegation, use `@explore` for Luna exploration or
   `@terra-medium` for Terra reasoning.

## Update

- Update primary models in `~/.config/opencode/agents/sol.md` or
  `~/.config/opencode/agents/terra.md`.
- Update the exploration model in `~/.config/opencode/agents/explore.md`.
- Update Luna's Quartz permissions and availability behavior in that same
  explorer file. Keep mutation deny rules after the broad Quartz allow rule.
- Update the delegated reasoning model in
  `~/.config/opencode/agents/terra-medium.md`.
- Update delegation, validation, or fallback behavior in each agent's Markdown
  content below its frontmatter.
- Keep `subagent_depth` at `2` while `terra-medium` is allowed to call
  `explore`.
- Confirm any new model ID is available with `opencode models`.
- After re-indexing, restart OpenCode and run
  `.ai/skills/quartz-status/check_status.sh` against this repository. Its
  on-disk and running MCP run IDs must match.
- Restart OpenCode and repeat the relevant verification commands below.

## Verification Performed

The configuration was loaded by OpenCode and all required models appeared in
`opencode models`.

Runtime routing checks were also completed in this repository:

| Test | Confirmed Result |
| --- | --- |
| Sol to Luna exploration | `sol` invoked `explore`; task metadata reported `QGenie_oai/gpt-5.6-luna`; Sol then independently read and verified `AGENTS.md`. |
| Terra to Luna to Quartz | `terra` invoked `explore`; task metadata reported `QGenie_oai/gpt-5.6-luna`; Luna used `mcp__quartz-local__search_files_by_pattern` and `mcp__quartz-local__get_chunk_lines`; Terra independently verified the result with Quartz. |
| Sol to Terra reasoning | `sol` invoked `terra-medium`; task metadata reported `QGenie_oai/gpt-5.6-terra`; Sol independently verified the response. |
| Sol to Luna to Quartz | `sol` invoked `explore`; task metadata reported `QGenie_oai/gpt-5.6-luna`; Luna loaded `quartz-local` and reported `mcp__quartz-local__search_components`, `mcp__quartz-local__search_files_by_pattern`, and `mcp__quartz-local__get_file_objects`; Sol verified the result with project Quartz tools. |
| Luna fallback without Quartz | Outside this project, no MCP server was configured; Luna reported Quartz unavailable and used the read-only `glob` tool successfully. |

To repeat basic validation:

```bash
opencode models
opencode agent list
```

To exercise Sol-to-Luna routing without modifying the repository:

```bash
opencode run --agent sol --auto --format json "You must delegate this task to the explore subagent. Ask it to identify the root-level AGENTS.md file. Then verify its reported path yourself. Return only the verified path and a one-sentence confirmation that the explorer was used."
```

The JSON task event should report `subagent_type: "explore"` and model ID
`gpt-5.6-luna`.

To verify Quartz itself:

```bash
bash .ai/skills/quartz-status/check_status.sh /local/mnt/workspace/arc-repos/use-case-creator
opencode mcp list
```

Expected results are `STATUS: FRESH` and a connected `quartz-local` server.

## Remove Only The Quartz Addition

To retain Sol/Terra/Luna routing but remove Luna's Quartz integration:

1. Remove the `skill` and `quartz-local_*` permission entries from
   `~/.config/opencode/agents/explore.md`.
2. Remove the Quartz availability instructions from the explorer prompt,
   leaving its original read-only exploration and result-format instructions.
3. Delete `.opencode/opencode.json` only if this repository should no longer
   expose its Quartz MCP server to OpenCode.
4. Restart OpenCode.

Removing only `.opencode/opencode.json` leaves Luna's conditional behavior
intact: because no Quartz tools are available, Luna uses its standard read-only
file and LSP tools.

## Complete Removal

The following deletes only this multi-model routing configuration. Do not run
these steps unless the configuration should be removed.

1. Delete `~/.config/opencode/agents/explore.md` to restore OpenCode's built-in
   explorer.
2. Delete `~/.config/opencode/agents/terra-medium.md`.
3. Delete `~/.config/opencode/agents/sol.md`.
4. Delete `~/.config/opencode/agents/terra.md`.
5. Remove these two properties from `~/.config/opencode/opencode.json`:

```json
"default_agent": "sol",
"subagent_depth": 2,
```

6. Delete `.opencode/opencode.json` if the repository's Quartz MCP integration
   should also be removed.
7. Optionally delete `~/.config/opencode/MULTI_MODEL_ROUTING.md` and the
   `.ai/agents-configuration/` documentation files.
8. Restart OpenCode.

Once the agent files and the `default_agent` property are removed, OpenCode
returns to its built-in `build` primary agent and built-in `explore` subagent.
