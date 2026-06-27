# Plan Output Format

This document defines the output contract for plans. Both writing-plans paths — Path A (standard) and Path B (large-spec phased generation) — produce plans that conform to this format.

Read this whenever you are about to write task content, regardless of which path called you.

## Plan Document Header

Every plan MUST start with this header:

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

## Bite-Sized Task Granularity

Each step is one action (2-5 minutes):
- "Write the failing test" — step
- "Run it to make sure it fails" — step
- "Implement the minimal code to make the test pass" — step
- "Run the tests and make sure they pass" — step
- "Commit" — step

## Code Completeness by Task Type

Not all tasks require the same level of code detail. Use the right level — writing more than needed inflates plans, and on Path B it also causes API timeouts in subagents.

| Task type | Required level |
|---|---|
| Domain entity, enum, utility function | Full complete TypeScript — these are small and self-contained |
| Persistence schema, migration steps | Full complete TypeScript — schemas are declarative and short |
| Port interface | Full complete TypeScript — interfaces have no implementation |
| Simple command handler (single path, no branching) | Full complete TypeScript |
| **Complex handler** (2+ branches, 80+ lines, integration test fixtures) | **Skeleton only** — see below |
| Test file with complex fixture setup | **Skeleton only** — see below |

## Skeleton Format for Complex Handlers and Tests

When a handler has multiple branches (80+ lines of implementation) or a test requires complex fixture setup, a detailed skeleton is acceptable instead of full code. A good skeleton tells an engineer exactly what to implement; it is not a placeholder.

The skeleton must include:
- Constructor with all injected dependencies
- Method signature
- Numbered steps with spec section references
- Return type shapes

**Example:**

```typescript
// packages/core/src/application/.../create-subsystem-link-segment.handler.ts

export class CreateSubsystemLinkSegmentHandler implements ICommandHandler<...> {
  constructor(
    private readonly nodeRepo: INodeRepository,
    private readonly slsRepo: ISubsystemLinkSegmentRepository,
    // ... other injected repos per spec §6.2
  ) {}

  async handle(command: CreateSubsystemLinkSegmentCommand, uow: IUnitOfWork): Promise<...> {
    // 1. Session resolution per §6.0: getActiveFileId + getActiveSession + mode check
    // 2. Fetch source and dest node types
    // 3. Branch A (both module nodes, same parentId): duplicate check → compute linkType →
    //    pre-assign systemId → record DataLink CREATE edit action → return { systemId, type: 'DataLink' }
    // 4. Branch B (both module nodes, different parentId): call SubsystemBoundaryPathService →
    //    create boundary ports → record DataLink CREATE + SLS CREATEs sharing groupId →
    //    return { subsystemLinkSegments: [...] }
    // 5. Branch C (subsystem endpoint): port direction check → one-connection check →
    //    optional inline port creation → record SLS CREATE with dataLinkSystemId=null →
    //    return { systemId, createdPortSystemId? }
  }
}
```

The `executing-plans` skill fills in the TypeScript when running the task. An engineer reading the skeleton knows what to implement without guessing.

## No Placeholders

Every step must contain the actual content an engineer needs. These are **plan failures** — never write them:
- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases"
- "Write tests for the above" (without actual test code)
- "Similar to Task N" (repeat the code — the engineer may be reading tasks out of order)
- Steps that describe what to do without showing how (code blocks required for code steps)
- References to types, functions, or methods not defined in any task

The skeleton format above is *not* a placeholder — it is a detailed contract for complex cases that lists every dependency, branch, and return shape.

## Execution Handoff

After saving the plan, offer the user an execution choice:

> **"Plan complete and saved to `docs/<feature>/plans/<filename>.md`.**
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

## Remember

- Exact file paths always
- Complete code in every step — if a step changes code, show the code (with the skeleton exception above)
- Exact commands with expected output
- DRY, YAGNI, TDD, frequent commits
