---
name: writing-plans
description: "Produces comprehensive, TDD-driven implementation plans from specs or requirements, with exact file paths, complete code in every step, and commit checkpoints. Use when the user has a spec or requirements document for a multi-step task and needs a structured plan before touching code."
---

# Writing Plans

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for the codebase and questionable taste. Document everything they need to know: which files to touch for each task, code, testing, docs they might need to check, how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

Assume they are a skilled developer, but know almost nothing about the toolset or problem domain. Assume they don't know good test design very well.

**Save plans to:** `docs/plans/<YYYY-MM-DD>-<feature-name>.md`
- (User preferences for plan location override this default)

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

## Bite-Sized Task Granularity

**Each step is one action (2-5 minutes):**
- "Write the failing test" — step
- "Run it to make sure it fails" — step
- "Implement the minimal code to make the test pass" — step
- "Run the tests and make sure they pass" — step
- "Commit" — step

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** Use the executing-plans skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

---
```

## Task Structure

````markdown
### Task N: [Component Name]

**Package:** `[package name — identified from project structure]`

**Files:**
- Create: `[exact path to new file]`
- Modify: `[exact path to existing file]:[line range if relevant]`
- Test: `[exact path to test file]`

- [ ] **Step 1: Write the failing test**

```typescript
describe('MyClass', () => {
  it('should return the expected value given valid input', () => {
    const result = myFunction(input);
    expect(result).toBe(expected);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `[project test command] -- --testPathPattern="[test file path]"`
Expected: FAIL with "[specific error message]"

- [ ] **Step 3: Write minimal implementation**

```typescript
export function myFunction(input: InputType): OutputType {
  return expected;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `[project test command] -- --testPathPattern="[test file path]"`
Expected: PASS

- [ ] **Step 5: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message
  and the exact commands to the user and **wait for explicit confirmation** before
  running anything:

  ```bash
  git add [files changed]
  git commit -m "feat([scope]): [summary]" \
             -m "[Body explaining the motivation.]" \
             -m "Signed-off-by: [Name] <[email]>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.**
  Only execute after confirmation.
````

## No Placeholders

Every step must contain the actual content an engineer needs. These are **plan failures** — never write them:
- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases"
- "Write tests for the above" (without actual test code)
- "Similar to Task N" (repeat the code — the engineer may be reading tasks out of order)
- Steps that describe what to do without showing how (code blocks required for code steps)
- References to types, functions, or methods not defined in any task

## Self-Review

After writing the complete plan, look at the spec with fresh eyes and check the plan against it. This is a checklist you run yourself — not a subagent dispatch.

**1. Spec coverage:** Skim each section/requirement in the spec. Can you point to a task that implements it? List any gaps.

**2. Placeholder scan:** Search your plan for red flags — any of the patterns from the "No Placeholders" section above. Fix them.

**3. Type consistency:** Do the types, method signatures, and property names you used in later tasks match what you defined in earlier tasks? A function called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

If you find issues, fix them inline. No need to re-review — just fix and move on. If you find a spec requirement with no task, add the task.

## Remember
- Exact file paths always
- Complete code in every step — if a step changes code, show the code
- Exact commands with expected output
- DRY, YAGNI, TDD, frequent commits

## Execution Handoff

After saving the plan, offer the user an execution choice:

> **"Plan complete and saved to `docs/plans/<filename>.md`.**
>
> **How would you like to proceed?**
>
> **1. Inline Execution** — Execute tasks in this session using the executing-plans skill, with checkpoints for review at each commit.
>
> **2. Separate Session** — Start a fresh session and load the executing-plans skill to implement the plan. Recommended for large plans or when you want a clean context window.
>
> **3. Manual Execution** — Review the plan yourself and implement manually without agent assistance."

Use `ask_followup_question` to present these options. Wait for the user's selection before taking any action.

- If **1**: invoke the executing-plans skill immediately in this session.
- If **2**: confirm the plan is saved and close out this session cleanly.
- If **3**: confirm the plan is saved and offer to answer any questions about it.