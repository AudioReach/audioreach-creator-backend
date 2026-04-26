---
name: executing-plans
description: "Executes written implementation plans by loading the plan, reviewing it critically, running each task in sequence with CI verification, and enforcing a commit gate at every git write operation. Use when the user has a written implementation plan ready to execute in a dedicated session with human review checkpoints."
---


# Executing Plans

## Overview

Load plan, review critically, execute all tasks, report when complete.

**Announce at start:** "I'm using the executing-plans skill to implement this plan."

## The Process

### Step 1: Load and Review Plan

1. **Find the plan file.** Look in `docs/plans/` for the most recent `.md` file (files are date-prefixed, e.g., `2026-04-17-feature-name.md`). If no plan file is found, or if multiple candidates exist, ask: *"Please provide the path to the implementation plan file."* Do not proceed without a confirmed plan file.
2. Read the plan file in full.
3. Review critically - identify any questions or concerns about the plan before starting.
4. If concerns: Raise them with your human partner before starting.
5. If no concerns: Create a task checklist (use `TodoWrite` if available; otherwise maintain a checklist in your response) and proceed.

### Step 2: Execute Tasks

For each task:
1. Mark as in_progress
2. Follow each step exactly (plan has bite-sized steps)
3. When a plan step references a skill by name (e.g., "use the commit skill"), invoke that skill rather than implementing the step manually
4. Run verifications as specified
5. Mark as completed

### Step 3: Complete Development

After all tasks complete and verified, run the full CI verification sequence.

**Identify the project's CI commands** by checking `package.json` scripts. Run the equivalent of:

```bash
# 1. Format check (e.g., pnpm format:check or npm run format:check)
# 2. Lint (e.g., pnpm lint or npm run lint)
# 3. Build all packages (e.g., pnpm build or npm run build)
# 4. Run all tests with coverage (e.g., pnpm turbo run coverage:workspace or npm run test:coverage)
```

If any step fails, fix the issue before proceeding. Report the results to the
user and summarize: which tasks were completed, which files were changed, and
whether all checks passed.

## Commit Gate (Non-Negotiable)

**Every time a plan step involves `git commit`:**

1. **STOP before running any git write command.**
2. Use `ask_followup_question` to show the user the full proposed commit message
   and the exact `git add` + `git commit` commands that will be run.
3. Offer **Accept** as an option (plus alternatives if relevant).
4. **Only execute the commit after the user explicitly selects "Accept".**

Never run `git commit` speculatively or as part of silent step execution.
This gate applies even when auto-approve is enabled for other tool uses.

## When to Stop and Ask for Help

**STOP executing immediately when:**
- Hit a blocker (missing dependency, test fails, instruction unclear)
- Plan has critical gaps preventing starting
- You don't understand an instruction
- Verification fails repeatedly

**Ask for clarification rather than guessing.**

## When to Revisit Earlier Steps

**Return to Review (Step 1) when:**
- Partner updates the plan based on your feedback
- Fundamental approach needs rethinking

**Don't force through blockers** - stop and ask.

## Remember
- Review plan critically first
- Follow plan steps exactly
- Don't skip verifications
- Reference skills when plan says to
- Stop when blocked, don't guess
- Never start implementation on main/master branch without explicit user consent

## Integration

This skill is the third step in the ARC development workflow:

1. **brainstorming** → Explores requirements and produces a design spec
2. **writing-plans** → Converts the spec into a step-by-step implementation plan
3. **executing-plans** (this skill) → Executes the plan task by task
4. **commit** → Used within each task to draft and confirm commit messages

The plan file is produced by the writing-plans skill and saved to `docs/plans/`.
When a plan step says "use the commit skill", invoke the `commit` skill to draft the message and wait for user confirmation before executing.