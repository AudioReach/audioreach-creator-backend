---
name: executing-plans
description: "Executes written implementation plans by loading the plan, reviewing it critically, and running each task in sequence with CI verification. Use when the user has a written implementation plan ready to execute in a dedicated session with human review checkpoints."
---


# Executing Plans

## Overview

Load plan, review critically, execute all tasks, report when complete.

**Announce at start:** "I'm using the executing-plans skill to implement this plan."

## The Process

### Step 1: Load and Review Plan

1. **Find the plan file.** Plans live at `docs/<feature>/plans/<feature-name>.md`. Glob `docs/*/plans/*.md`, exclude any file whose name ends in `-handoff.md` (those are inputs to writing-plans, not plans), and pick the most recent by modification time. If no plan file is found, or if multiple candidates exist and you cannot determine which the user intends, ask: *"Please provide the path to the implementation plan file."* Do not proceed without a confirmed plan file.
2. Read the plan file in full.
3. Review critically - identify any questions or concerns about the plan before starting.
4. If concerns: Raise them with your human partner before starting.
5. If no concerns: Create a task checklist (use `TodoWrite` if available; otherwise maintain a checklist in your response) and proceed.

### Step 2: Execute Tasks

For each task:
1. Mark as in_progress
2. Follow each step exactly (plan has bite-sized steps)
3. When a plan step references a skill by name, invoke that skill rather than implementing the step manually
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

The author decides when (and whether) to commit — do not initiate `git commit`, `git add`, or any git write operation on your own.

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

## Code Conventions

Apply these conventions in all code you write or modify during plan execution. They reflect the project's established patterns and keep the codebase consistent.

### 1. Use the Issue Factory for Error/Issue Objects

Never construct issue or validation-result objects inline. The project has a dedicated factory (look for `IssueFactory`, `createIssue`, or a similar factory pattern in the codebase) so that all issues are defined in one place, are easy to audit, and have consistent shape.

**Wrong:**
```ts
throw new Error('...');
// or
return {
  code: 'ARC-SESSION-ALREADY-ACTIVE',
  message: `An active session already exists...`,
  severity: IssueSeverity.Error,
};
```

**Right:**
```ts
return IssueFactory.sessionAlreadyActive(cmd.projectId, existing.sessionId, existing.mode);
```

If the factory doesn't yet have a method for the issue you need, add one to the factory rather than creating the object inline at the call site.

### 2. Derive Types from Existing Object Literals — Don't Repeat String Unions

When a set of valid string values is already captured in a `const` object, enum, or similar structure, derive the type from it. Repeating the values as a string literal union (e.g., `'STAGED' | 'UNSTAGED' | 'PARTIAL'`) creates two sources of truth that can drift.

**Wrong:**
```ts
private computeStatus(rows: Row[]): 'STAGED' | 'UNSTAGED' | 'PARTIAL' { ... }
```

**Right (if a const/enum exists or should exist):**
```ts
const PendingChangeStatus = { STAGED: 'STAGED', UNSTAGED: 'UNSTAGED', PARTIAL: 'PARTIAL' } as const;
type PendingChangeStatus = typeof PendingChangeStatus[keyof typeof PendingChangeStatus];

private computeStatus(rows: Row[]): PendingChangeStatus { ... }
```

If no such object exists yet and more than two callers would benefit, introduce one.

### 3. Prefer TypeORM Query Builder Over Raw SQL

For all database queries and writes, use TypeORM's `QueryBuilder`, repository methods, or entity manager APIs rather than raw SQL strings — unless profiling shows a measurable performance difference that justifies the trade-off.

**Wrong:**
```ts
await dataSource.query(`SELECT * FROM edit_action WHERE workspace_id = $1`, [id]);
```

**Right:**
```ts
await dataSource
  .getRepository(EditAction)
  .createQueryBuilder('ea')
  .where('ea.workspaceId = :id', { id })
  .getMany();
```

Raw SQL is acceptable for complex aggregations or queries where the TypeORM abstraction would be significantly harder to read, but note the reason in a comment.

### 4. No Underscore Prefix for Private Members

TypeScript's `private` keyword (or `#` for truly hard-private fields) makes the intent clear. The `_` naming convention adds noise without benefit.

**Wrong:**
```ts
private _sessionId: string;
```

**Right:**
```ts
private sessionId: string;
```

This applies to all new code and to any existing `_`-prefixed members you touch while implementing a plan step.

---

## Remember
- Review plan critically first
- Follow plan steps exactly
- Apply code conventions above to all code written or modified
- Don't skip verifications
- Reference skills when plan says to
- Stop when blocked, don't guess
- Never start implementation on main/master branch without explicit user consent

## Integration

This skill is the third step in the ARC development workflow:

1. **brainstorming** → Explores requirements and produces a design spec
2. **writing-plans** → Converts the spec into a step-by-step implementation plan
3. **executing-plans** (this skill) → Executes the plan task by task

The plan file is produced by the writing-plans skill and saved to `docs/<feature>/plans/`.