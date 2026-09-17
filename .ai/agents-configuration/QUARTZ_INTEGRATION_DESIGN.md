# Luna-Quartz Integration Design

## Status

- Requirements approved: 2026-09-13
- Design approach approved: project-scoped Quartz routing
- Implementation status: implemented and runtime-verified

## Requirements

1. When a usable `quartz-local` MCP server is available, Luna must use Quartz
   as the exclusive source for indexed code navigation and context.
2. When Quartz is absent at session start, Luna may use its existing read-only
   `Read`, `Glob`, `Grep`, `List`, and LSP tools.
3. When Quartz is present but a Quartz call fails or reports stale data, Luna
   must report the problem instead of silently falling back to other code
   search tools.
4. Luna may use direct file reads for files outside the index and after Quartz
   confirms that a file contains no parseable chunks, as allowed by the
   `quartz-local` skill.
5. Luna must remain read-only. Quartz mutation tools must remain unavailable.
6. The implementation and complete removal procedure must remain documented in
   `.ai/agents-configuration/README.md`.
7. Verification must prove that Sol delegates to Luna and that Luna executes a
   read-only `quartz-local` MCP tool.

## Verified Preconditions

- `qgenie quartz --version` reports Quartz `1.4.0`.
- `.quartz/last_run_id` exists.
- The syntactic cache contains chunks, metadata, graph, print, and body data.
- `opencode mcp list` reports `quartz-local` as connected.
- The running MCP processes use the same run ID as `.quartz/last_run_id`.
- The project already has `.opencode/opencode.json` configured for this
  repository.
- A direct primary-agent query successfully called
  `quartz-local_search_components` and
  `quartz-local_search_files_by_pattern`.
- A Sol-to-Luna test confirmed that Luna currently cannot see Quartz tools.
  This is caused by the built-in explorer's deny-all baseline and the absence
  of an explicit Quartz permission in the custom explorer override.

## Decision

Use project-scoped MCP configuration and update the global Luna explorer's
permissions and instructions.

### MCP Scope

Retain the working project MCP configuration in:

`<project>/.opencode/opencode.json`

Remove the duplicate `mcp.quartz-local` entry from:

`~/.config/opencode/opencode.json`

The project configuration ensures Quartz tools appear only when OpenCode is
running in this indexed repository. It avoids exposing this repository's index
to Luna while the user is working in another project.

### Luna Permissions

Update `~/.config/opencode/agents/explore.md` to:

- Allow loading only the `quartz-local` skill needed for indexed exploration.
- Allow `quartz-local_*` MCP tools.
- Explicitly deny known update, write, create, and delete tool patterns after
  the broad Quartz allow rule, relying on OpenCode's last-match-wins behavior.
- Preserve existing read-only local tools for repositories without Quartz and
  for the exceptions permitted by the Quartz skill.
- Continue denying edits, shell execution, and nested subagents.

### Luna Instructions

Before code exploration, Luna checks whether `quartz-local_*` tools are present.

When present:

1. Load the `quartz-local` skill.
2. Follow its tool-selection and token-efficiency guidance.
3. Use Quartz exclusively for indexed code context.
4. Never invoke mutation tools.
5. Do not silently fall back when a Quartz request fails or appears stale.
6. Report the failure so the primary agent can run the `quartz-status` or
   `quartz-update` workflow.

When absent, Luna uses its existing read-only tools. This preserves exploration
in projects that have not configured Quartz.

## Alternatives Rejected

### Keep The Global MCP Entry

This requires fewer edits but makes the use-case-creator index available while
working in unrelated projects. Luna could return valid Quartz data from the
wrong repository, so this option was rejected.

### Custom Routing Plugin

A plugin could inspect and filter tools dynamically, but native project MCP
scoping, agent permissions, and instructions already provide the required
behavior. A plugin adds maintenance and failure modes without a concrete need.

## Validation

1. Run the Quartz status script and require `STATUS: FRESH`.
2. Run `opencode mcp list` from this repository and require `quartz-local` to
   be connected.
3. Run `opencode agent list` and confirm Luna allows read-only Quartz tools but
   denies mutation tools.
4. Run a Sol request that delegates a code lookup to Luna and requires Quartz.
5. Inspect the child task metadata for model `gpt-5.6-luna` and its result for
   the exact `quartz-local_*` tool used.
6. Confirm no repository files are modified by the runtime test.

## Rollback

1. Revert `~/.config/opencode/agents/explore.md` to its pre-Quartz prompt and
   permission list.
2. Restore the global `mcp.quartz-local` block only if global exposure of this
   repository's index is intentionally required. The project MCP configuration
   remains independently usable.
3. Revert the Quartz sections added to
   `.ai/agents-configuration/README.md`.
4. Restart OpenCode after any rollback.
