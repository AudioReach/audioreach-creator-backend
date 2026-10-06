# Review Checklist: Reducing Decoration in Routing Phase Classes

## Purpose and scope

This checklist is for reviewing and refactoring the routing-pipeline **phase
classes** under
`packages/core/src/application/usecase-designer/use-case-creator/phases/**`
and their supporting utility modules (e.g. files like
`path-combination-expander.ts` that a phase class delegates to), plus the
shared orchestrator at
`packages/core/src/application/usecase-designer/use-case-creator/engine/routing-engine.ts`.

The goal is **less code (including types), without sacrificing
readability**. This is not a bug hunt and not a style-guide pass — it is a
targeted search for *decoration*: ceremony that exists only because of a
historical constraint, a copy-pasted pattern, or an unnecessarily general
type, rather than because the problem actually requires it.

This checklist was produced by applying exactly this process to
`combination-expansion.phase.ts` (and its helper
`path-combination-expander.ts`), with a small follow-on change to
`routing-engine.ts`. Treat that pair of files as the worked example if you
need to see the "before/after" shape referenced below.

**Read first, for architectural context, before changing anything:**
`docs/use-case-creator/design/overall-design.md`. In particular:

- `RoutingEngine` is the **only public class** of the routing subfolder.
  Every phase class, `RoutingContext`, and the issue/factory types are
  internal implementation details reached only through `RoutingEngine`.
- There is **no generalized `RoutingPhase` interface**. `RoutingEngine`
  holds concrete, constructor-injected phase instances and builds an
  ordered list of zero-argument closures per run. This is a deliberate
  composition-root pattern repeated across all current phases.
- Background/parallel phase execution was deliberately rejected (it would
  change fail-fast error semantics). Nothing in this checklist should move
  the pipeline toward concurrent phase execution.

## Hard constraints (do not do these, even if they would "reduce code")

1. **Do not flatten a phase class into a bare function.** Every phase is a
   class today, constructor-injected into `RoutingEngine`, because that is
   the project's chosen composition-root convention across all phases
   (currently 12). Changing one phase's shape to a plain function would
   make it inconsistent with its siblings and with the design doc. If a
   class truly has no state and one public method, that is fine — leave it
   a class with that one method.
2. **Do not change phase execution order, fail-fast semantics, or make
   phases run concurrently/in the background.** This checklist is about
   internal shape of a single phase's code, not pipeline control flow.
3. **Do not widen the public surface of the subfolder.** `RoutingEngine`
   stays the only exported/public entry point. Phase classes, their helper
   modules, and internal types stay un-exported from the package's public
   API even if you reshape them internally.
4. **Do not read or change unrelated files "just in case."** Scope each
   review to one phase class and the in-folder support modules reached through
   that phase's execution path. Follow imports recursively among those local
   support modules rather than stopping after the phase's immediate imports;
   otherwise duplicate helpers in sibling or transitive collaborators are
   easy to miss. Read external contracts/shared modules only when a checklist
   item requires confirming a type, constant, or existing helper. Include
   `routing-engine.ts` only if you touch a phase's sync/async signature, and
   include the phase's relevant specs. If a change requires touching
   something outside that set, stop and flag it instead of guessing.
5. **Never change what a test is actually asserting/verifying without
   calling it out to the user first.** A test edit that keeps the same
   intent — e.g. switching `await expect(fn()).rejects.toThrow(...)` to
   `expect(() => fn()).toThrow(...)` because the method under test became
   synchronous, or renaming a variable, or updating an import path — is a
   "minor alignment fix" and is fine to make silently. Anything that
   changes *what behavior is being verified* (different expected value,
   removed assertion, loosened matcher, different code path exercised,
   deleted test, etc.) is not a minor alignment fix: stop and explicitly
   tell the user what changed and why before/when you make it, even if
   you're confident it's correct. When in doubt, treat it as a
   not-minor change and flag it.

## The checklist

For each phase class and each utility module it uses, check the following,
roughly in this order. Each item lists how to detect it, how to fix it, and
why it's safe.

### Mandatory two-pass review method

Do not rely on one semantic read of the algorithm. Perform two separate
passes before concluding that a phase has no decoration:

1. **Semantic pass:** Understand the phase's behavior, execution order,
   invariants, I/O, mutations, and failure semantics. This pass establishes
   which complexity is required by the problem.
2. **Mechanical consistency pass:** Re-read every in-scope file from imports
   through the final line and compare its syntax with its sibling files. This
   pass is deliberately independent of whether the code is functionally
   correct. Its purpose is to find duplicated helpers, redundant imports,
   raw discriminant literals, stale comments, misplaced docblocks, unused
   state, and inconsistent local conventions.

The semantic conclusion "this behavior is correct" must not end the review.
Correct behavior can still contain exactly the copy-pasted or historical
ceremony this checklist is intended to remove. Conversely, do not convert a
mechanical observation into a broader redesign: prefer deleting or reusing
existing code over introducing a new abstraction.

For the mechanical pass, make a quick inventory for each file:

- imported and exported values/types;
- top-level local helpers and constants;
- comparisons and `switch` cases using string discriminants;
- comments/docblocks and the symbol each one actually documents;
- lint suppressions;
- mutable fields or intermediate values written in one place and read in
  another.

Use symbol-aware navigation to understand dependencies, but also inspect the
complete source text around imports, adjacent symbol boundaries, comments,
and the end of each file. AST/chunk views can omit the context needed to spot
a comment attached to the wrong declaration or duplicated code between
symbols.

### 1. Unnecessary `async` / `Promise` ceremony

- **Detect:** The method body contains no `await`, calls no I/O (no
  repository/HTTP/filesystem/database call), and only reads/writes
  in-memory objects (e.g. mutating fields on a `RoutingContext`). Yet the
  method is declared `async` and/or returns `Promise<Result<...>>`. Often
  paired with an `eslint-disable` for `@typescript-eslint/require-await`.
- **Why it happens:** The orchestrator's closure array was historically
  typed as `readonly (() => Promise<Result<void>>)[]`, forcing every phase
  to pretend to be asynchronous even when it has nothing to await.
- **Fix:**
  - In `routing-engine.ts`, there is already a `PhaseResult` type:
    ```ts
    type PhaseResult = Result<void> | Promise<Result<void>>;
    ```
    (introduced for exactly this purpose). Confirm the closure arrays
    (`phases`, `prerequisitePhases`, or any other list of phase closures)
    are typed `readonly (() => PhaseResult)[]`, not
    `readonly (() => Promise<Result<void>>)[]`. If a list you need is still
    typed the old way, widen it the same way — this is additive and safe
    because `await` resolves a non-Promise value transparently, so
    existing `async` phases keep working unchanged.
  - Remove `async` from the phase's method signature and change its return
    type from `Promise<Result<void>>` to `Result<void>`.
  - Remove any now-unnecessary `await` inside the method body.
  - Remove the `eslint-disable` for `require-await` (or
    `cognitive-complexity`, if it was only there because of this) and
    re-run eslint to confirm it is no longer needed.
  - If the method used to `throw` inside an `async` function, that throw
    used to produce a *rejected Promise*. After removing `async`, the same
    `throw` is now a *synchronous* throw. Find and update the matching
    unit test (see item 11).
- **Do not do this** if the phase genuinely performs I/O (repository calls,
  external services, anything that returns a real `Promise` from a
  dependency). Only descope `async` for phases that are provably pure
  in-memory transforms of `RoutingContext`.

### 2. Discriminated unions built only to be immediately re-discriminated

- **Detect:** A function/method builds a return value typed as a union of
  2-3 shapes (often named `...Outcome` or `...Result` with a `kind`/`type`
  discriminant), purely so that a second piece of code can `switch`/`if`
  on that discriminant right after receiving it, with no other consumer of
  the union. This is "decoration": a type exists to unify branches that
  were never actually unified in behavior.
- **Fix:** Replace the union with a plain object type whose fields are
  **mutually exclusive by convention** (e.g. "exactly one of `conflict` /
  `assignments` is populated"), document that invariant in a one-line
  comment on the type, and have the caller check the cheap field
  (`if (outcome.conflict) { ... } else { ... }`) instead of matching on a
  discriminant. This is what `ExpansionOutcome` became in
  `combination-expansion.phase.ts`:
  ```ts
  /** Either the single conflict blocking this path/topology, or its usable assignments — never both. */
  interface ExpansionOutcome {
    readonly conflict: UsecaseCandidateConflictDetails | null;
    readonly assignments: readonly ExpandedAssignment[];
  }
  ```
  Only keep a real discriminated union if there are genuinely more than
  two shapes, or if multiple unrelated call sites each need to exhaustively
  handle every case (TypeScript's exhaustiveness checking is then earning
  its keep).
- Where a phase or helper branches 3 ways but two of the branches are
  really "the same shape, different mode" (e.g. auto vs. manual routing
  input), consider collapsing to two straight-line branches that each call
  one small shared helper function, rather than one unified function with
  internal mode-dispatch. Prefer straight-line code over cleverness here.

### 3. Redundant type/value dual-imports of the same module

- **Detect:** An import line like
  `import {Result, type Result as ResultType} from '.../result.js';`
  where the module is imported once for its value (`Result.ok()`,
  `Result.fail()`) and again, aliased, purely for its type
  (`ResultType<void>`).
- **Check before "fixing":** Open the imported module and see whether it
  exports the same name as *both* a type and a value, e.g.:
  ```ts
  export type Result<T> = ...;
  export const Result = {ok, partial, fail} as const;
  ```
  If so, a single `import {Result} from '...'` already brings in both the
  type and the value — TypeScript's type-space and value-space are
  separate namespaces, so one import name can serve both purposes
  simultaneously. The aliasing import is dead weight.
- **Fix:** Collapse to the single plain import and use `Result<void>` for
  the type position and `Result.ok()`/`Result.fail()`/`Result.partial()`
  for the value position. Confirm against how the module is imported
  elsewhere in the same package (e.g. `routing-engine.ts` already uses the
  simple single-import form — that is the convention to match).
- If the module does **not** export the same name as both a type and a
  value, the dual import is required — do not remove it.

### 4. Hand-declared types that duplicate an inferable/derivable type

- **Detect:** A local `type` or `interface` whose shape is just "the
  return type of some function I already imported" or "one element of an
  array field some other exported type already has," re-typed by hand.
- **Fix:** Derive it instead of restating it:
  - `ReturnType<typeof someFunction>` instead of copying that function's
    return shape into a new type.
  - `SomeExportedType['fieldName'][number]` instead of redeclaring the
    element type of an array field.
  Example from this session:
  ```ts
  type ExpandedAssignment = {
    readonly sgkvAssignment: PathExpansion['validAssignments'][number];
    readonly gkv: ReturnType<typeof aggregateGkv>;
  };
  ```
  This keeps the local type mechanically in sync with its source and
  removes a second place that would need updating if the source type ever
  changes.
- Only hand-declare a type when there is no existing exported type/function
  to derive it from, or when deriving it would be *less* readable than a
  short explicit declaration — readability still wins ties.

### 5. Speculative `eslint-disable` comments

- **Detect:** Any `// eslint-disable` / `// eslint-disable-next-line`
  comment inside a phase class or its helpers.
- **Fix:** After completing the other steps above (especially #1, which
  tends to resolve `require-await` and often reduces branching enough to
  resolve `cognitive-complexity`), delete the disable comment and re-run
  eslint on the file. If it is now clean, the disable was only masking
  decoration-driven complexity, not a real necessity. If eslint still
  fails without it, put it back — some disables are legitimate.

### 6. TypeScript narrowing pitfalls on nested property-access discriminants

- **Detect:** A discriminated-union check like
  `if (context.input.mode === ROUTING_MODE.Auto) { ... }` followed, inside
  that branch, by further accesses to `context.input.<field-only-on-that-mode>`
  — especially after a loop, a function call, or any code the compiler
  can't fully see through. TypeScript's narrowing can fail to persist on a
  property-access expression (`context.input`) once such intervening code
  runs, producing a real compiler error like:
  `Property 'manualTopology' does not exist on type 'AutoRoutingInput'.`
- **Fix:** Bind the discriminated value to a local `const` immediately
  before branching, and reference the local for the rest of the method:
  ```ts
  // Bind to a local so the mode narrowing below survives the loops and calls that
  // follow it — narrowing a property access directly (`context.input.mode`) does not.
  const {input} = context;
  if (input.mode === ROUTING_MODE.Auto) { ... }
  ```
  This is a correctness fix as much as a style one — don't skip it if
  `tsc` is clean today "by luck"; apply it proactively wherever a phase
  branches on a nested discriminant and then does nontrivial work in each
  branch.

### 7. General decoration smells to scan for

- Imports that are no longer used after any of the above changes (prune
  them; let `tsc`/eslint confirm nothing is missed).
- Comments that restate *what* the code does (delete) vs. comments that
  explain *why* a non-obvious choice was made, such as the sync-vs-async
  rationale or the narrowing fix above (keep, and add more of these where
  a future reader would otherwise have to rediscover the reasoning).
- Multiple small helper types/functions that only exist to be used once,
  immediately, in one place — consider inlining if that's actually more
  readable, but don't inline something that is already named well and
  separates a distinct concern (e.g. a `resolveExpansion`-style helper that
  turns a raw utility result into a phase-ready shape is worth keeping as
  a named function even though it has one caller).

### 8. Duplicated utilities and missed reuse of existing exports

- **Detect in both directions:**
  - For every helper exported by an in-scope utility module, search all other
    files used by the phase for local helpers or inline expressions with the
    same behavior.
  - For every local helper, search the in-scope modules for an existing
    exported helper that already implements it.
- Compare behavior, not only names. Duplicate helpers often use different
  names while sharing the same body, such as canonical pair keys, numeric
  sorting, identifier normalization, or comparators for a shared type.
- Check for duplication within a single file as well. Importing one shared
  helper does not guarantee that another local helper in that file is not an
  equivalent implementation under a different name.
- Repeated inline comparators and key expressions count too. If the type's
  owning utility module already exports related operations, prefer placing
  one canonical implementation there and reusing it.
- **Fix:** Import and reuse the existing canonical helper, deleting the local
  duplicate. Export a helper only when at least two in-scope files genuinely
  use the same semantics and the owning module is clear.
- **Do not dismiss a duplicate because it is only three lines.** When a
  canonical exported helper already exists, reuse removes code and prevents
  semantic drift with no new abstraction. Do not create a generic shared
  utility merely to deduplicate superficially similar operations with
  different domain meaning.

### 9. Raw literals that shadow existing enum-like constants

- **Detect:** Search comparisons, filters, and `switch` cases for raw string
  literals representing result kinds, routing modes, decision kinds,
  operations, terminations, or other closed vocabularies.
- Check the defining contract and current imports before deciding. If an
  enum-like constant already exposes that value, use its named member rather
  than repeating the literal.
- **Fix:** Import the existing constant if needed and replace the literal,
  for example `RESULT_KIND.Fail` rather than `'FAIL'`.
- This is decoration even when TypeScript currently narrows the literal
  correctly: the raw value duplicates vocabulary already owned elsewhere
  and is easier to mistype or leave stale after a rename.
- Leave ordinary user-facing text, map keys, and genuinely local protocol
  strings alone; this check applies only to an existing closed vocabulary.

### 10. Comment and docblock attachment

- Read the lines before and after every class-level or multi-line docblock,
  not just the comment text returned with an AST symbol.
- Confirm that the comment describes the declaration immediately following
  it. A phase-level description attached to a small ranking/helper function
  is usually a copy/paste, move, or merge artifact.
- **Fix:** Move the explanation to the class or function it actually
  documents. Delete it if that target is already self-explanatory. Add a
  replacement comment to the old location only when the local algorithm
  needs rationale that its name and types do not provide.
- Also flag comments whose claims include responsibilities performed by
  another file or layer. Comments should describe the documented symbol's
  actual boundary, not the workflow around it.

### 11. Keep the test suite honest

- If a method's sync/async-ness changes, grep that phase's spec file for
  `.rejects.` assertions. A `.rejects.toThrow(...)` assertion only matches
  a *rejected Promise*; once the method throws synchronously, rewrite the
  assertion as:
  ```ts
  expect(() => service.run(context)).toThrow('...');
  ```
  removing the surrounding `async`/`await` if the test no longer needs it.
- Do not assume this is the only test affected — grep the whole spec file
  for the phase, not just the one test you expect to break.
- **Fixing a test to align with a mechanical change (sync vs. async
  assertion form, updated import path, renamed variable, etc.) is fine to
  do without asking.** Changing what the test actually verifies — a
  different expected value, a loosened or removed assertion, a different
  code path, a deleted test case — is **not** a minor alignment fix. Call
  that out to the user explicitly (what changed and why) rather than
  silently "fixing" the test. See Hard Constraint #5 above.

## Required verification before calling a phase "done"

Run all of the following from the package root
(`packages/core/`) and confirm each is clean. Do not skip any of them, and
do not weaken a check (e.g. by adding a new disable/suppression) to make it
pass — if something fails, fix the underlying code.

1. **Type-check the real build config:**
   `npx tsc --noEmit -p tsconfig.json`
   This must report zero errors. (Note: `tsconfig.test.json` may show
   pre-existing, unrelated `dist`-vs-`src` declaration-mismatch errors in
   other files and `Cannot find module '@jest/globals'` — these are known
   pre-existing environment issues, not something this checklist asks you
   to fix. Confirm any error you see is pre-existing by checking whether it
   mentions a file you touched; if it does, it's your problem to fix.)
2. **Lint:** `npx eslint <changed files>` — must exit 0 with no warnings
   you introduced. Confirm any disable comment you removed is genuinely no
   longer needed (see item 5 above).
3. **Format:** `npx prettier --check <changed files>` — if it fails, run
   `npx prettier --write <changed files>` once and re-check; don't hand-format.
4. **Tests:** run the full relevant Jest suite, not just the one spec file
   you touched, e.g.:
   `npx cross-env NODE_OPTIONS=--experimental-vm-modules jest <relevant path or whole package>`
   All suites must pass. If you changed `routing-engine.ts`'s shared
   `PhaseResult`/closure typing, re-run the whole `use-case-creator` test
   tree, not just the one phase's spec, since that type is shared across
   all phases.

Only report a phase as reviewed/refactored once all four checks above are
clean.

## Suggested order of operations per phase

1. Build the in-scope file manifest first: the phase class, every local
   support module reached through its execution path, and their relevant
   specs. Read each source file completely at least once; do not review only
   selected function chunks.
2. Complete the semantic pass, then perform the mechanical consistency pass
   as a separate activity. Do not merge the two into one general impression
   of code quality.
3. Walk the checklist items 1-10 in order and record whether each one applied;
   most phases will trigger only a subset. For item 8, compare the helper
   inventory across the entire file manifest before dismissing any duplicate.
4. Apply fixes, adding "why" comments as you go (comments are welcome in
   this codebase as long as they explain reasoning, not restate code).
5. Update the phase's spec file per item 11 if needed.
6. Run all four verification steps.
7. Summarize, per phase, exactly which checklist items applied and which
   did not, plus the before/after line count if it's meaningfully smaller
   — the point of this exercise is measurable ceremony reduction, not
   churn.
