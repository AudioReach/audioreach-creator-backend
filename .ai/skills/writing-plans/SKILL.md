---
name: writing-plans
description: "Produces comprehensive, TDD-driven implementation plans from specs or requirements, with exact file paths, complete code in every step, and commit checkpoints. Use when the user has a spec or requirements document for a multi-step task and needs a structured plan before touching code."
---

# Writing Plans

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for the codebase and questionable taste. Document everything they need to know: which files to touch for each task, code, testing, docs they might need to check, how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

Assume they are a skilled developer, but know almost nothing about the toolset or problem domain. Assume they don't know good test design very well.

**Save plans to:** `docs/<feature>/plans/<YYYY-MM-DD>-<feature-name>.md`
- `<feature>` is the feature folder under `docs/`. If the spec is at `docs/<feature>/design/...`, use the same `<feature>` for the plan. If the spec location doesn't follow this convention, ask the user which feature folder to use before writing.
- (User preferences for plan location override this default.)

## Choose a path

This skill has two paths. Decide which applies, then follow exactly one path end-to-end.

**Path A — Standard plan.** The caller hands you a spec or requirements document directly and you can read the codebase to inform the plan. Continue with the sections below.

**Path B — Large-spec phased generation.** The caller provides a **handoff file** (e.g. `Handoff file: docs/<feature>/plans/…-plan-handoff.md`). The handoff file is produced by the brainstorming skill and partitions a large LLD into chapters for parallel subagent generation. Go to `references/large-spec-phased-generation.md` and follow it. **Do not execute Path A** — Path A would force the main session to read package.json, the spec, and codebase files, which is exactly what Path B avoids to preserve context.

**Output contract for both paths:** `references/plan-format.md` defines the plan header, task structure, no-placeholder rules, code completeness levels, skeleton format for complex handlers, and execution handoff. Read it before writing tasks.

---

The sections below are Path A only.

## Scope Check

If the spec covers multiple independent subsystems, it should have been broken into sub-project specs during brainstorming. If it wasn't, suggest breaking this into separate plans — one per subsystem. Each plan should produce working, testable software on its own.

## Project Context Discovery

Before defining tasks, identify the project's structure:
- Read `package.json` (root and relevant packages) to discover package names, test commands, and build scripts.
- Read `pnpm-workspace.yaml` or `package.json` workspaces field to identify monorepo packages.
- Use the discovered package names and commands in all task steps — do not hardcode assumptions.

For the ARC project specifically, the packages are `@arc/core`, `@arc/api`, and `@arc/persistence`, and the test runner is `pnpm --filter <package> run test:<package-short-name>`.

## File Structure

Before defining tasks, map out which files will be created or modified and what each one is responsible for. This is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces. Each file should have one clear responsibility.
- You reason best about code you can hold in context at once, and your edits are more reliable when files are focused. Prefer smaller, focused files over large ones that do too much.
- Files that change together should live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. If a file you're modifying has grown unwieldy, including a split in the plan is reasonable.

This structure informs the task decomposition. Each task should produce self-contained changes that make sense independently.

## Write the Tasks

Write each task using the format defined in `references/plan-format.md`. That file owns:
- The required plan document header
- Task Structure (Files / 5 numbered steps / commit)
- Bite-Sized Task Granularity (2-5 minutes per step)
- Code Completeness by Task Type (full code vs. skeleton)
- Skeleton Format for complex handlers and tests
- No Placeholders rules

Open `plan-format.md` and follow it directly when authoring tasks — do not paraphrase the rules from memory.

## Self-Review

After writing the complete plan, look at the spec with fresh eyes and check the plan against it. This is a checklist you run yourself — not a subagent dispatch.

**1. Spec coverage:** Skim each section/requirement in the spec. Can you point to a task that implements it? List any gaps.

**2. Placeholder scan:** Search your plan for red flags — any of the patterns from the "No Placeholders" section of `plan-format.md`. Fix them.

**3. Type consistency:** Do the types, method signatures, and property names you used in later tasks match what you defined in earlier tasks? A function called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

If you find issues, fix them inline. No need to re-review — just fix and move on. If you find a spec requirement with no task, add the task.

## Execution Handoff

After saving the plan, present the three-option execution handoff defined in `plan-format.md`. Use `ask_followup_question` and wait for the user's selection before taking any action.
