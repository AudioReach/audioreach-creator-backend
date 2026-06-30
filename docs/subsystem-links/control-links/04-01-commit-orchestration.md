<!-- Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries. SPDX-License-Identifier: BSD-3-Clause -->

## Chapter: Commit orchestration additions for control links (§11.11)

> **Spec reference:** `docs/virtual-links/2026-05-31-virtual-links-design.md` §11.11 (lines 1099–1134).
>
> **Goal of this chapter:** Extend `CommitChangesHandler` with the control-link counterparts of the §8 data-link pre-commit steps. Concretely:
>
> - **Step A'** — resolve every unresolved CSLS (pending CREATEs with `controlLinkSystemId === null` and committed siblings whose FK was nulled by a Case-B sibling-nulling overlay UPDATE from §11.7). Complete chains are converted into `ControlLink` CREATE + per-segment CSLS UPDATE records sharing a `groupId`. Incomplete chains are torn down: pending CREATEs are DISCARDED, committed rows get explicit CSLS DELETEs in the STAGED set.
> - **Strict invariant** — after Step A', no CSLS CREATE or UPDATE may still hold `controlLinkSystemId === null`. Any violation aborts the commit with an internal-error exception (same shape as the data-link `_assertNoUnresolvedSLSInStagedSet` helper).
> - **Step B'** — orphaned boundary control-port cleanup. Pending `ControlPort` CREATEs are DISCARDED; committed orphans get explicit `ControlPort` DELETEs. The associated unanchored-port `IntentRow` DELETEs (which `DeleteControlSubsystemLinkSegmentHandler` already records) must be ordered first in the topological apply so the `intents.control_port_system_id → control_ports` FK is cleared before the port row is removed.
> - **Topological order extensions** — entries 1a–9a are inserted into the existing §8.3 ordered list inside `_applyInTopologicalOrder`, mirroring the data-link ordering but for control-link tables.
>
> **Cardinal rule check:** all of this work lives inside `@arc/core` (`application/usecase-designer/session/commit-changes/commit-changes.handler.ts`). The new logic depends only on the port interfaces already declared in earlier chapters: `IControlSubsystemLinkSegmentRepository` (chapter 02-01), the pure `ControlChainResolutionService` (chapter 01-03), `IControlLinkRepository`, `IControlPortRepository`, `IEditActionRepository`, and the `UnitOfWork` accessors. Nothing here imports TypeORM, NestJS, or any Node API.
>
> **Note on dependency on the §1–§10 data-link plan:** the existing `CommitChangesHandler`, its `_runStepA` / `_runStepB` private methods, the strict invariant helper, and the `_applyInTopologicalOrder` partition-and-concatenate ordering are introduced by Tasks 26–28 of the data-link plan (`docs/plans/2026-06-17-virtual-links-data-links.md`). They are **not** yet present on disk — a repository-wide grep for `CommitChangesHandler` returns zero source matches at the time of writing. The tasks in this chapter assume the data-link skeleton has landed first and extend it. If the data-link skeleton is not yet committed when this chapter is executed, add the §8 commit-orchestration tasks from the data-link plan as a prerequisite to Task 36 below.

---

### Task 36: Step A' — incomplete control chain discard + committed sibling cleanup

**Package:** `@arc/core`

**Files:**
- Modify: `packages/core/src/application/usecase-designer/session/commit-changes/commit-changes.handler.ts`
- Test: `packages/core/tests/unit/application/usecase-designer/session/commit-changes/commit-changes.handler.step-a-prime.spec.ts` (new)

- [ ] **Step 1: Write the failing unit test for Step A'**

  Create `packages/core/tests/unit/application/usecase-designer/session/commit-changes/commit-changes.handler.step-a-prime.spec.ts`. Stand up fake repositories that return:
  - One pending CREATE CSLS with `controlLinkSystemId === null` joining module `M1` ↔ subsystem `S` (segment `seg1`).
  - One committed CSLS (`seg2`) whose overlay UPDATE set `controlLinkSystemId = null`, joining subsystem `S` ↔ module `M2`.

  Wire a fake `ControlChainResolutionService.resolve()` (injected via the handler constructor, or stubbed by spying on the static method) that returns one `completeChains` entry containing `[seg1, seg2]` with canonical endpoints `(peerAPortSystemId = 100, peerANodeSystemId = M1)` and `(peerBPortSystemId = 300, peerBNodeSystemId = M2)`.

  Assert that after `handle()` runs:
  - The STAGED edit set contains exactly one `ControlLink` CREATE with a pre-assigned `systemId` and a non-null `groupId`.
  - The STAGED edit set contains two `ControlSubsystemLinkSegment` UPDATEs (one per segment) whose `payload.controlLinkSystemId` equals the new ControlLink's `systemId`, sharing the same `groupId` as the CREATE.
  - The CREATE's payload carries the canonical (lower-`portSystemId` first) endpoint pair.

  Then write a second `describe` for the incomplete-chain path:
  - Two segments form an open chain (`reachableNodeIds` includes no second module-node terminus).
  - `seg1` is a pending CREATE → its existing CREATE edit_action must have `changeStatus === DISCARDED`.
  - `seg2` is a committed row → a new explicit `ControlSubsystemLinkSegment` DELETE edit_action must be recorded in the STAGED set with `payload === {systemId: seg2}` and a non-null `baseVersion`.
  - The response `warnings` array must contain the exact string `"2 control subsystem link segment(s) were discarded because they did not form complete connections."`.

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern commit-changes.handler.step-a-prime`

  Expected: FAIL — `_runStepAPrime is not a function` (or similar — the new private method does not yet exist).

- [ ] **Step 2: Add the `_runStepAPrime` private method skeleton**

  Inside `CommitChangesHandler`, add a new private method paralleling `_runStepA`. Use skeleton form — numbered comments tied to spec §11.11 sub-steps, return-type shape, and the dependency list spelled out at the top. The exact body of each numbered bullet is implementation-detail; only the contract needs to be locked in.

  ```typescript
  // ── Step A' implementation (§11.11) ───────────────────────────────────────

  /**
   * Step A' — incomplete control chain discard + committed sibling cleanup.
   * Parallel to _runStepA but for control-link tables.
   *
   * Dependencies (already injected on the handler):
   *   - uow.getControlSubsystemLinkSegmentRepository()   // IControlSubsystemLinkSegmentRepository (chapter 02-01)
   *   - uow.getControlLinkRepository()                   // IControlLinkRepository
   *   - uow.getEditActionRepository()                    // IEditActionRepository
   *   - uow.getNodeRepository().nodeTypeMap(fileSystemId, sessionId)
   *   - idGeneration                                     // IdGenerationPort for new ControlLink systemIds
   *
   * Returns warning strings to append to the commit response.
   */
  private async _runStepAPrime(
    fileSystemId: number,
    sessionId:    number,
  ): Promise<string[]> {
    // 1. Fetch every unresolved CSLS in this file's active overlay:
    //    - pending CHANGE_OPERATION.Create rows with payload.controlLinkSystemId === null
    //    - committed rows whose latest overlay UPDATE set controlLinkSystemId = null
    //      (the Case-B sibling-nulling from DeleteControlSubsystemLinkSegmentHandler).
    //    Both are returned together by getUnresolvedForFile.
    //
    //    const cslsRepo = this.uow.getControlSubsystemLinkSegmentRepository();
    //    const unresolved = await cslsRepo.getUnresolvedForFile(fileSystemId, sessionId);

    // 2. Build the ControlChainResolutionService input shape and run it.
    //    The service is pure (chapter 01-03) — give it the segment list plus a
    //    nodeTypeMap (module / subsystem / container) from the node repository.
    //
    //    const nodeTypeMap = await this.uow.getNodeRepository()
    //      .nodeTypeMap(fileSystemId, sessionId);
    //    const result = ControlChainResolutionService.resolve({
    //      unresolvedSegments: unresolved.map(toResolutionShape),
    //      nodeTypeMap,
    //    });

    // 3. For each entry in result.completeChains:
    //    a. Canonicalise the endpoint pair (lower portSystemId first); swap
    //       (peerA, peerB) together if needed.
    //    b. Pre-assign a new ControlLink systemId via this.idGeneration.
    //    c. Compute linkType from the (peerANode, peerBNode) types — same
    //       rule as DataLink linkType derivation in §8.1.
    //    d. Allocate one fresh groupId (uuid via idGeneration).
    //    e. Record into the STAGED edit set:
    //       - One ControlLink CREATE: payload carries the canonical port pair,
    //         linkType, version 0, groupId.
    //       - One CSLS UPDATE per segment in chain.segmentIds: payload
    //         { systemId, controlLinkSystemId: <new id> }, baseVersion fetched
    //         from the committed row when present, groupId set to the
    //         CREATE's groupId.

    // 4. For each entry in result.incompleteChains, walk chain.segmentIds:
    //    - If the segment has a pending CREATE edit_action in the STAGED set
    //      → mark that action's change_status = CHANGE_STATUS.Discarded.
    //    - Else (the overlay UPDATE-to-null is the only mutation) → record an
    //      explicit CSLS DELETE edit_action in the STAGED set:
    //        { tableName: 'ControlSubsystemLinkSegment',
    //          operation: CHANGE_OPERATION.Delete,
    //          systemId, aggregateId: systemId,
    //          payload: { systemId },
    //          baseVersion: <committed row.version>,
    //          groupId: null }.
    //    Count discards + deletes into discardedOrDeletedCount.

    // 5. If discardedOrDeletedCount > 0, append exactly the spec string
    //    (§11.11 step 5) to the warnings list:
    //      `${discardedOrDeletedCount} control subsystem link segment(s) ` +
    //      'were discarded because they did not form complete connections.'

    return /* warnings */ [];
  }
  ```

  Then wire the new method into `handle()` immediately after the existing `_runStepA` call:

  ```typescript
      const stepAPrimeWarnings = await this._runStepAPrime(fileSystemId, sessionId);
      warnings.push(...stepAPrimeWarnings);
  ```

- [ ] **Step 3: Flesh out the skeleton just enough to pass the test**

  Implement the five numbered bullets above. Mirror the data-link `_runStepA` in shape: the same `pendingCreateIds` set construction, the same `eaRepo.markDiscarded(sessionId, slsId)` call for pending CREATEs, the same `eaRepo.insert({...})` shape for committed-row DELETEs. The only structural delta is the ControlLink CREATE + per-segment UPDATE recording in the complete-chain branch — that block is new.

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern commit-changes.handler.step-a-prime`

  Expected: PASS — both `describe` blocks green.

- [ ] **Step 4: Verify type-check**

  Run: `pnpm run build:core`

  Expected: zero TypeScript errors.

- [ ] **Step 5: Commit**

  Use the `commit` skill to draft the commit message under scope `feat(application)`. Show the proposed message and exact commands and **wait for explicit confirmation** before running anything.

  **STOP — do not run `git commit` until the user explicitly approves the message.**

---

### Task 37: Strict invariant assertion after Step A'

**Package:** `@arc/core`

**Files:**
- Modify: `packages/core/src/application/usecase-designer/session/commit-changes/commit-changes.handler.ts`
- Test: `packages/core/tests/unit/application/usecase-designer/session/commit-changes/commit-changes.handler.strict-invariant.spec.ts` (new)

- [ ] **Step 1: Write the failing unit test**

  Create `packages/core/tests/unit/application/usecase-designer/session/commit-changes/commit-changes.handler.strict-invariant.spec.ts`:

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  import {describe, it, expect} from '@jest/globals';
  import {CommitChangesHandler} from '../../../../../../src/application/usecase-designer/session/commit-changes/commit-changes.handler.js';
  import {CommitChangesCommand} from '../../../../../../src/application/usecase-designer/session/commit-changes/commit-changes.command.js';
  import {CHANGE_OPERATION, CHANGE_STATUS} from '../../../../../../src/application/shared/change-vocabulary.js';
  import {buildFakeUow, buildFakeIdGeneration} from '../../../../helpers/fake-uow.js';

  describe('CommitChangesHandler — strict invariant after Step A\' (spec §11.11)', () => {
    it('aborts commit with internal-error when a STAGED CSLS UPDATE still carries null controlLinkSystemId', async () => {
      const uow = buildFakeUow();
      // Hand-craft a STAGED set with one offending CSLS UPDATE.
      uow.editActions.push({
        systemId:     9001,
        aggregateId:  9001,
        sessionId:    42,
        tableName:    'ControlSubsystemLinkSegment',
        operation:    CHANGE_OPERATION.Update,
        changeStatus: CHANGE_STATUS.Staged,
        payload:      {systemId: 9001, controlLinkSystemId: null},
        baseVersion:  1,
        groupId:      null,
      });

      // Stub _runStepAPrime to be a no-op so the offending row survives.
      const handler = new CommitChangesHandler(uow, buildFakeIdGeneration());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (handler as any)._runStepAPrime = async () => [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (handler as any)._runStepA      = async () => [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (handler as any)._runStepB      = async () => [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (handler as any)._runStepBPrime = async () => [];

      await expect(handler.handle(new CommitChangesCommand(1)))
        .rejects.toThrow(
          /\[CommitChangesHandler\] Invariant violation: 1 CSLS CREATE\/UPDATE action\(s\) still have null controlLinkSystemId/,
        );

      // Commit must have been aborted — no transaction commit should have happened.
      expect(uow.commitCallCount).toBe(0);
      expect(uow.rollbackCallCount).toBeGreaterThanOrEqual(0);
    });
  });
  ```

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern commit-changes.handler.strict-invariant`

  Expected: FAIL — the invariant for CSLS specifically does not yet exist (the data-link version only checks `dataLinkSystemId`).

- [ ] **Step 2: Add the strict-invariant assertion for control links**

  Add a new private method on `CommitChangesHandler` paralleling `_assertNoUnresolvedSLSInStagedSet`:

  ```typescript
  /**
   * After Step A', asserts that no STAGED edit action contains a CSLS CREATE
   * or UPDATE with controlLinkSystemId = null (or undefined).
   *
   * If any are found, throws an internal error — this indicates a logic bug
   * in Step A' that would cause a NOT NULL FK constraint violation when the
   * row hits control_subsystem_link_segments.
   */
  private async _assertNoUnresolvedCSLSInStagedSet(
    sessionId: number,
  ): Promise<void> {
    const eaRepo = this.uow.getEditActionRepository();
    const staged = await eaRepo.getStagedForSession(sessionId, {
      changeStatus: CHANGE_STATUS.Staged,
    });

    const violations = staged.filter(a => {
      if (a.tableName !== 'ControlSubsystemLinkSegment') return false;
      if (
        a.operation !== CHANGE_OPERATION.Create &&
        a.operation !== CHANGE_OPERATION.Update
      ) {
        return false;
      }
      const payload = a.payload as {controlLinkSystemId?: number | null};
      return payload.controlLinkSystemId === null || payload.controlLinkSystemId === undefined;
    });

    if (violations.length > 0) {
      const ids = violations.map(v => v.systemId).join(', ');
      throw new Error(
        `[CommitChangesHandler] Invariant violation: ${violations.length} CSLS ` +
          `CREATE/UPDATE action(s) still have null controlLinkSystemId after pre-commit ` +
          `Step A'. Affected systemIds: ${ids}. This is a server bug — commit aborted.`,
      );
    }
  }
  ```

  Wire it into `handle()` immediately after the existing data-link invariant call:

  ```typescript
      await this._assertNoUnresolvedSLSInStagedSet(sessionId);
      await this._assertNoUnresolvedCSLSInStagedSet(sessionId);
  ```

  Note the error shape (`new Error(...)` with a `[CommitChangesHandler] Invariant violation:` prefix) mirrors the project's existing internal-error type as used by `_assertNoUnresolvedSLSInStagedSet`. If a dedicated `InternalServerError` class is introduced in `@arc/core` later, switch both call sites together.

- [ ] **Step 3: Re-run the test**

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern commit-changes.handler.strict-invariant`

  Expected: PASS.

- [ ] **Step 4: Verify type-check**

  Run: `pnpm run build:core`

  Expected: zero TypeScript errors.

- [ ] **Step 5: Commit**

  Use the `commit` skill to draft the commit message under scope `feat(core)`. Show the proposed message and exact commands and **wait for explicit confirmation** before running anything.

  **STOP — do not run `git commit` until the user explicitly approves the message.**

---

### Task 38: Step B' — orphaned boundary control-port cleanup

**Package:** `@arc/core`

**Files:**
- Modify: `packages/core/src/application/usecase-designer/session/commit-changes/commit-changes.handler.ts`
- Test: `packages/core/tests/unit/application/usecase-designer/session/commit-changes/commit-changes.handler.step-b-prime.spec.ts` (new)

- [ ] **Step 1: Write the failing unit test for Step B'**

  Create the test file with two scenarios:

  1. **Pending boundary control-port CREATE becomes orphaned.** Seed: a pending `ControlPort` CREATE on a subsystem boundary (`portIoType` of `InputOutput` or `OutputInput`) plus a pending CSLS CREATE that references that port; then a DELETE/DISCARD of the CSLS in Step A'. Assert that the `ControlPort` CREATE edit_action ends with `changeStatus === DISCARDED` and that **no** new `ControlPort` DELETE row was inserted.
  2. **Committed boundary control-port becomes orphaned.** Seed a committed `ControlPort` plus a committed CSLS that referenced it; Step A' records an explicit CSLS DELETE. Assert that Step B' records exactly one new `ControlPort` DELETE edit_action with `payload === {systemId: <portId>}` and a non-null `baseVersion`.

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern commit-changes.handler.step-b-prime`

  Expected: FAIL — `_runStepBPrime is not a function`.

- [ ] **Step 2: Add the `_runStepBPrime` skeleton**

  Add the private method paralleling `_runStepB`. Skeleton form — numbered comments, return shape, and the dependency list at the top:

  ```typescript
  // ── Step B' implementation (§11.11) ───────────────────────────────────────

  /**
   * Step B' — orphaned boundary control-port cleanup. Parallel to _runStepB
   * but for ControlPort rows on subsystem boundaries.
   *
   * Dependencies:
   *   - uow.getEditActionRepository()
   *   - uow.getControlPortRepository()                   // IControlPortRepository
   *   - uow.getControlSubsystemLinkSegmentRepository()
   *
   * Step B' is silent — it returns an empty warnings array per spec §11.11.
   * (The user-visible discard message comes from Step A'.)
   */
  private async _runStepBPrime(
    fileSystemId: number,
    sessionId:    number,
  ): Promise<string[]> {
    // 1. Collect every CSLS that was DELETEd or DISCARDed in Step A' or
    //    explicitly by the user. Mirror the data-link logic from _runStepB.

    // 2. From those CSLS, derive candidate boundary ControlPort systemIds:
    //    - For staged CREATE CSLS payloads → read peer port system-ids directly.
    //    - For staged DELETE CSLS targeting committed rows → fetch the
    //      committed CSLS via the repository to get its port system-ids.

    // 3. Filter candidates down to ControlPorts whose owning node is a
    //    subsystem boundary (portIoType InputOutput or OutputInput).
    //    Non-boundary control ports (e.g. on modules) are out of scope —
    //    they are managed by module lifecycle, not by CSLS deletion.

    // 4. Drop any candidate still referenced by a remaining staged CSLS
    //    CREATE or by a committed CSLS not being deleted. Use
    //    IControlSubsystemLinkSegmentRepository.getByPortId() for the
    //    committed-side check.

    // 5. For each surviving orphan port:
    //    - If a pending ControlPort CREATE exists in the STAGED set
    //      → eaRepo.markDiscarded(sessionId, portId).
    //    - Else → eaRepo.insert({
    //        tableName: 'ControlPort',
    //        operation: CHANGE_OPERATION.Delete,
    //        systemId: portId, aggregateId: portId,
    //        payload: { systemId: portId },
    //        baseVersion: <committed row.version>,
    //        groupId: null,
    //      }).

    // 6. IntentRow DELETEs for these orphan ports were already recorded by
    //    DeleteControlSubsystemLinkSegmentHandler's shared intent-clearing
    //    step (§11.7). Step B' does NOT re-record them — it only adds the
    //    port DELETE/DISCARD entries. The topological ordering in
    //    _applyInTopologicalOrder (Task 39) guarantees the intent DELETEs
    //    are applied first (bucket 1a), so the FK from
    //    intents.control_port_system_id is clear before the port row
    //    (bucket 4a) is removed.

    return [];
  }
  ```

  Wire it into `handle()` immediately after the existing `_runStepB` call and before the invariant assertions:

  ```typescript
      const stepBPrimeWarnings = await this._runStepBPrime(fileSystemId, sessionId);
      warnings.push(...stepBPrimeWarnings);
  ```

- [ ] **Step 3: Implement the six numbered bullets**

  Mirror `_runStepB` in shape and structure. The only deltas are:
  - The table name is `'ControlPort'` instead of `'DataPort'`.
  - The candidate-port lookup uses `IControlSubsystemLinkSegmentRepository.getByPortId(...)` (chapter 02-01) instead of the data-link equivalent.
  - The `portIoType` boundary filter checks for the control-link boundary I/O types declared on the `ControlPort` entity.

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern commit-changes.handler.step-b-prime`

  Expected: PASS.

- [ ] **Step 4: Verify type-check**

  Run: `pnpm run build:core`

  Expected: zero TypeScript errors.

- [ ] **Step 5: Commit**

  Use the `commit` skill to draft the commit message under scope `feat(application)`. Show the proposed message and exact commands and **wait for explicit confirmation** before running anything.

  **STOP — do not run `git commit` until the user explicitly approves the message.**

---

### Task 39: Topological commit order additions (entries 1a–9a)

**Package:** `@arc/core`

**Files:**
- Modify: `packages/core/src/application/usecase-designer/session/commit-changes/commit-changes.handler.ts`
- Test: `packages/core/tests/unit/application/usecase-designer/session/commit-changes/commit-changes.handler.topological-order.spec.ts` (new)

- [ ] **Step 1: Write the failing unit test for the topological order**

  Create the test file. Construct a hand-crafted STAGED edit set carrying **one row per bucket** with distinct, predictable `systemId`s so order can be asserted by index:

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  import {describe, it, expect} from '@jest/globals';
  import {CHANGE_OPERATION} from '../../../../../../src/application/shared/change-vocabulary.js';
  import {orderStagedActionsForCommit}
    from '../../../../../../src/application/usecase-designer/session/commit-changes/commit-changes.handler.js';
  // Note: orderStagedActionsForCommit must be exported from the handler module
  // (a thin, pure wrapper around the body of _applyInTopologicalOrder's
  // partition-and-concatenate logic) so it can be unit-tested in isolation.

  describe('CommitChangesHandler topological commit order (spec §8.3 + §11.11)', () => {
    it('orders control-link operations 1a → 9a after the data-link buckets', () => {
      const staged = [
        // Out-of-order on purpose so we know the function does the work.
        {systemId: 95, tableName: 'ControlSubsystemLinkSegment', operation: CHANGE_OPERATION.Update,
         payload: {controlLinkSystemId: 7000}},                              // 9a
        {systemId: 92, tableName: 'ControlPort',                 operation: CHANGE_OPERATION.Delete},       // 4a
        {systemId: 91, tableName: 'ControlLink',                 operation: CHANGE_OPERATION.Delete},       // 3a
        {systemId: 96, tableName: 'IntentRow',                   operation: CHANGE_OPERATION.Create},       // 6a
        {systemId: 94, tableName: 'ControlPort',                 operation: CHANGE_OPERATION.Create},       // 5a
        {systemId: 97, tableName: 'ControlLink',                 operation: CHANGE_OPERATION.Create},       // 7a
        {systemId: 93, tableName: 'ControlSubsystemLinkSegment', operation: CHANGE_OPERATION.Delete},       // 2a
        {systemId: 98, tableName: 'ControlSubsystemLinkSegment', operation: CHANGE_OPERATION.Create},       // 8a
        {systemId: 90, tableName: 'IntentRow',                   operation: CHANGE_OPERATION.Delete},       // 1a
      ];

      const ordered = orderStagedActionsForCommit(staged);
      const ids = ordered.map(a => a.systemId);

      // Control-link section runs after the data-link section (1–8 from §8.3).
      // Within the control-link section the spec mandates: 1a, 2a, 3a, 4a,
      // 5a, 6a, 7a, 8a, 9a.
      const controlIdxStart = ids.findIndex(id => id === 90);
      expect(ids.slice(controlIdxStart)).toEqual([90, 93, 91, 92, 94, 96, 97, 98, 95]);
    });
  });
  ```

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern commit-changes.handler.topological-order`

  Expected: FAIL — either `orderStagedActionsForCommit is not exported` or the function exists but does not yet split out the control-link buckets.

- [ ] **Step 2: Extend `_applyInTopologicalOrder` with buckets 1a–9a**

  Open `commit-changes.handler.ts`. Extract the partition-and-concatenate logic from `_applyInTopologicalOrder` into a top-level pure function `orderStagedActionsForCommit(stagedActions)` exported from the same module (so it is unit-testable). `_applyInTopologicalOrder` becomes a thin wrapper that calls the pure function and then drives the row-level writer.

  Then extend the partitioning to add the nine control-link buckets in the exact order from spec lines 1122–1134:

  ```typescript
  export function orderStagedActionsForCommit(
    stagedActions: ReadonlyArray<EditActionRow>,
  ): EditActionRow[] {
    // ── §8.3 data-link buckets (1–8) — unchanged ─────────────────────────
    const slsDeletes     = stagedActions.filter(a => a.tableName === 'SubsystemLinkSegment' && a.operation === CHANGE_OPERATION.Delete);
    const dlDeletes      = stagedActions.filter(a => a.tableName === 'DataLink'             && a.operation === CHANGE_OPERATION.Delete);
    const dpDeletes      = stagedActions.filter(a => a.tableName === 'DataPort'             && a.operation === CHANGE_OPERATION.Delete);
    const dpCreates      = stagedActions.filter(a => a.tableName === 'DataPort'             && a.operation === CHANGE_OPERATION.Create);
    const dlCreates      = stagedActions.filter(a => a.tableName === 'DataLink'             && a.operation === CHANGE_OPERATION.Create);
    const slsCreates     = stagedActions.filter(a => a.tableName === 'SubsystemLinkSegment' && a.operation === CHANGE_OPERATION.Create);
    const slsUpdatesLink = stagedActions.filter(
      a =>
        a.tableName === 'SubsystemLinkSegment' &&
        a.operation === CHANGE_OPERATION.Update &&
        (a.payload as {dataLinkSystemId?: unknown}).dataLinkSystemId != null,
    );

    // ── §11.11 control-link buckets (1a–9a) ──────────────────────────────
    // 1a: IntentRow DELETEs (unanchored-port clearing from §11.7).
    const intentDeletes = stagedActions.filter(
      a => a.tableName === 'IntentRow' && a.operation === CHANGE_OPERATION.Delete,
    );
    // 2a: CSLS DELETEs.
    const cslsDeletes = stagedActions.filter(
      a => a.tableName === 'ControlSubsystemLinkSegment' && a.operation === CHANGE_OPERATION.Delete,
    );
    // 3a: ControlLink DELETEs.
    const clDeletes = stagedActions.filter(
      a => a.tableName === 'ControlLink' && a.operation === CHANGE_OPERATION.Delete,
    );
    // 4a: Boundary ControlPort DELETEs.
    const cpDeletes = stagedActions.filter(
      a => a.tableName === 'ControlPort' && a.operation === CHANGE_OPERATION.Delete,
    );
    // 5a: Boundary ControlPort CREATEs.
    const cpCreates = stagedActions.filter(
      a => a.tableName === 'ControlPort' && a.operation === CHANGE_OPERATION.Create,
    );
    // 6a: IntentRow CREATEs (propagated intents from §11.6 Branch B / Branch C cascade).
    const intentCreates = stagedActions.filter(
      a => a.tableName === 'IntentRow' && a.operation === CHANGE_OPERATION.Create,
    );
    // 7a: ControlLink CREATEs.
    const clCreates = stagedActions.filter(
      a => a.tableName === 'ControlLink' && a.operation === CHANGE_OPERATION.Create,
    );
    // 8a: CSLS CREATEs.
    const cslsCreates = stagedActions.filter(
      a => a.tableName === 'ControlSubsystemLinkSegment' && a.operation === CHANGE_OPERATION.Create,
    );
    // 9a: CSLS UPDATEs that SET controlLinkSystemId (resolution results).
    const cslsUpdatesLink = stagedActions.filter(
      a =>
        a.tableName === 'ControlSubsystemLinkSegment' &&
        a.operation === CHANGE_OPERATION.Update &&
        (a.payload as {controlLinkSystemId?: unknown}).controlLinkSystemId != null,
    );

    const orderedControlLink = [
      ...intentDeletes,    // 1a — must precede 4a (FK from intents.control_port_system_id)
      ...cslsDeletes,      // 2a
      ...clDeletes,        // 3a
      ...cpDeletes,        // 4a
      ...cpCreates,        // 5a — must precede 6a (FK from intents to control_ports)
      ...intentCreates,    // 6a
      ...clCreates,        // 7a — must precede 8a/9a (FK from CSLS to control_links)
      ...cslsCreates,      // 8a
      ...cslsUpdatesLink,  // 9a
    ];

    // ── "All other operations" — everything not in the data-link or
    //    control-link buckets above (e.g. DataLink UPDATEs, ControlLink
    //    UPDATEs, other entities). Preserve insertion order. ──────────────
    const handledKeys = new Set([
      ...slsDeletes, ...dlDeletes, ...dpDeletes, ...dpCreates,
      ...dlCreates, ...slsCreates, ...slsUpdatesLink,
      ...orderedControlLink,
    ].map(a => `${a.systemId}|${a.operation}|${a.tableName}`));

    const others = stagedActions.filter(
      a => !handledKeys.has(`${a.systemId}|${a.operation}|${a.tableName}`),
    );

    return [
      ...slsDeletes,        // 1
      ...dlDeletes,         // 2
      ...dpDeletes,         // 3
      ...dpCreates,         // 4
      ...dlCreates,         // 5
      ...slsCreates,        // 6
      ...slsUpdatesLink,    // 7
      ...orderedControlLink, // 1a–9a
      ...others,            // 8
    ];
  }
  ```

  Update `_applyInTopologicalOrder` to:

  ```typescript
  private async _applyInTopologicalOrder(
    stagedActions: ReadonlyArray<EditActionRow>,
    _sessionId:    number,
  ): Promise<number> {
    const ordered = orderStagedActionsForCommit(stagedActions);
    // TODO (Batch 3 of the data-link plan): drive the row-level writer here.
    return ordered.length;
  }
  ```

- [ ] **Step 3: Re-run the test**

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern commit-changes.handler.topological-order`

  Expected: PASS.

- [ ] **Step 4: Verify type-check**

  Run: `pnpm run build:core`

  Expected: zero TypeScript errors.

- [ ] **Step 5: Commit**

  Use the `commit` skill to draft the commit message under scope `feat(core)`. Show the proposed message and exact commands and **wait for explicit confirmation** before running anything.

  **STOP — do not run `git commit` until the user explicitly approves the message.**

---

### Task 40: Integration test for the full Step A' + Step B' flow

**Package:** `@arc/core`

**Files:**
- Test: `packages/core/tests/integration/application/usecase-designer/session/commit-changes/commit-changes-control-links.integration.spec.ts` (new)

- [ ] **Step 1: Write the failing integration test**

  Create the integration test file. Drive `CommitChangesHandler.handle` end-to-end against the in-memory edit-session fixtures already used by the data-link integration test (assumed to be co-located under `tests/integration/helpers/`). Use four scenarios:

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  import {describe, it, expect, beforeEach} from '@jest/globals';
  import {CommitChangesHandler} from '../../../../../../src/application/usecase-designer/session/commit-changes/commit-changes.handler.js';
  import {CommitChangesCommand} from '../../../../../../src/application/usecase-designer/session/commit-changes/commit-changes.command.js';
  import {CHANGE_OPERATION, CHANGE_STATUS} from '../../../../../../src/application/shared/change-vocabulary.js';
  import {
    seedEmptySession,
    seedIncompleteControlChain,
    seedCompleteControlChain,
    seedOrphanedBoundaryControlPort,
    seedHandCraftedNullFkLeak,
  } from '../../../helpers/commit-changes-fixtures.js';
  // Fixture helpers below seed the in-memory UnitOfWork with the rows + edit
  // actions described in each comment block. Their internals are mechanical;
  // their interface is the contract this test relies on.

  describe('CommitChangesHandler — Step A' + Step B' integration (spec §11.11)', () => {
    let handler: CommitChangesHandler;
    let ctx:     Awaited<ReturnType<typeof seedEmptySession>>;

    beforeEach(async () => {
      ctx = await seedEmptySession();
      handler = new CommitChangesHandler(ctx.uow, ctx.idGeneration);
    });

    // ----- Scenario 1: incomplete chain — all segments discarded/deleted -----

    it('discards pending CSLS CREATEs and deletes committed CSLS rows when chain is incomplete', async () => {
      const {cslsPendingId, cslsCommittedId} =
        await seedIncompleteControlChain(ctx);

      const result = await handler.handle(new CommitChangesCommand(ctx.projectId));

      const staged = await ctx.uow.getEditActionRepository()
        .getStagedForSession(ctx.sessionId);

      // Pending CSLS CREATE → DISCARDED.
      const pendingCreate = staged.find(a =>
        a.systemId === cslsPendingId &&
        a.tableName === 'ControlSubsystemLinkSegment' &&
        a.operation === CHANGE_OPERATION.Create,
      );
      expect(pendingCreate?.changeStatus).toBe(CHANGE_STATUS.Discarded);

      // Committed CSLS → explicit DELETE recorded.
      const committedDelete = staged.find(a =>
        a.systemId === cslsCommittedId &&
        a.tableName === 'ControlSubsystemLinkSegment' &&
        a.operation === CHANGE_OPERATION.Delete,
      );
      expect(committedDelete).toBeDefined();

      // Response message includes the discard count.
      expect(result.warnings).toContain(
        '2 control subsystem link segment(s) were discarded because they did not form complete connections.',
      );
    });

    // ----- Scenario 2: complete chain M ↔ S ↔ M ------------------------------

    it('records ControlLink CREATE + per-segment CSLS UPDATE with shared groupId for a complete chain', async () => {
      const {seg1, seg2, lowerPortId, higherPortId} =
        await seedCompleteControlChain(ctx);

      await handler.handle(new CommitChangesCommand(ctx.projectId));

      const staged = await ctx.uow.getEditActionRepository()
        .getStagedForSession(ctx.sessionId);

      const controlLinkCreate = staged.find(a =>
        a.tableName === 'ControlLink' && a.operation === CHANGE_OPERATION.Create,
      );
      expect(controlLinkCreate).toBeDefined();

      const payload = controlLinkCreate!.payload as {
        peerAPortSystemId: number;
        peerBPortSystemId: number;
      };
      // Canonical ordering: lower port first.
      expect(payload.peerAPortSystemId).toBe(lowerPortId);
      expect(payload.peerBPortSystemId).toBe(higherPortId);

      const cslsUpdates = staged.filter(a =>
        a.tableName === 'ControlSubsystemLinkSegment' &&
        a.operation === CHANGE_OPERATION.Update &&
        (a.payload as {controlLinkSystemId?: unknown}).controlLinkSystemId != null,
      );
      const updatedIds = cslsUpdates.map(a => a.systemId).sort();
      expect(updatedIds).toEqual([seg1, seg2].sort());

      // Group cohesion: all four edit_actions share the same groupId.
      const groupIds = new Set([controlLinkCreate, ...cslsUpdates].map(a => a!.groupId));
      expect(groupIds.size).toBe(1);
      expect([...groupIds][0]).not.toBeNull();

      for (const u of cslsUpdates) {
        expect((u.payload as {controlLinkSystemId: number}).controlLinkSystemId)
          .toBe(controlLinkCreate!.systemId);
      }
    });

    // ----- Scenario 3: orphaned boundary ControlPort -------------------------

    it('discards a pending boundary ControlPort and records DELETE for a committed one; IntentRow DELETEs precede in topo order', async () => {
      const {pendingPortId, committedPortId} =
        await seedOrphanedBoundaryControlPort(ctx);

      await handler.handle(new CommitChangesCommand(ctx.projectId));

      const staged = await ctx.uow.getEditActionRepository()
        .getStagedForSession(ctx.sessionId);

      // Pending CREATE → DISCARDED.
      const pendingCreate = staged.find(a =>
        a.systemId === pendingPortId &&
        a.tableName === 'ControlPort' &&
        a.operation === CHANGE_OPERATION.Create,
      );
      expect(pendingCreate?.changeStatus).toBe(CHANGE_STATUS.Discarded);

      // Committed → explicit DELETE recorded.
      const committedDelete = staged.find(a =>
        a.systemId === committedPortId &&
        a.tableName === 'ControlPort' &&
        a.operation === CHANGE_OPERATION.Delete,
      );
      expect(committedDelete).toBeDefined();

      // Topological order: IntentRow DELETEs (1a) precede ControlPort DELETEs (4a).
      const orderedKeys = staged
        .filter(a => a.tableName === 'IntentRow' || a.tableName === 'ControlPort')
        .map(a => `${a.tableName}/${a.operation}`);
      // The handler's pure orderStagedActionsForCommit is exercised inside
      // _applyInTopologicalOrder; this test asserts the contract by checking
      // that no ControlPort DELETE appears before any IntentRow DELETE in the
      // result of orderStagedActionsForCommit(staged).
      const {orderStagedActionsForCommit} =
        await import('../../../../../../src/application/usecase-designer/session/commit-changes/commit-changes.handler.js');
      const ordered = orderStagedActionsForCommit(staged);
      const firstCpDelete = ordered.findIndex(a =>
        a.tableName === 'ControlPort' && a.operation === CHANGE_OPERATION.Delete,
      );
      const lastIntentDelete = ordered.map((a, i) =>
        a.tableName === 'IntentRow' && a.operation === CHANGE_OPERATION.Delete ? i : -1,
      ).reduce((m, i) => Math.max(m, i), -1);
      expect(lastIntentDelete).toBeLessThan(firstCpDelete);
    });

    // ----- Scenario 4: strict invariant trips on hand-crafted null-FK leak ---

    it('aborts commit when a CSLS overlay UPDATE somehow leaves controlLinkSystemId === null', async () => {
      await seedHandCraftedNullFkLeak(ctx);

      await expect(handler.handle(new CommitChangesCommand(ctx.projectId)))
        .rejects.toThrow(
          /\[CommitChangesHandler\] Invariant violation: \d+ CSLS CREATE\/UPDATE action\(s\) still have null controlLinkSystemId/,
        );
    });
  });
  ```

  Note on fixtures: `seedIncompleteControlChain`, `seedCompleteControlChain`, `seedOrphanedBoundaryControlPort`, and `seedHandCraftedNullFkLeak` are new helpers added alongside the existing data-link integration fixtures. Each one inserts a fully-formed scenario into the in-memory `UnitOfWork`: committed rows (via direct repository writes inside a non-transaction setup phase) and overlay edit actions (via `IEditActionRepository.insert`). Their concrete bodies follow the same recipe used by the data-link integration test in `docs/plans/2026-06-17-virtual-links-data-links.md` Task 28's integration suite — copy the helper file's structure and translate `DataLink/SLS/DataPort` to `ControlLink/CSLS/ControlPort`.

  Run: `pnpm --filter @arc/core run test:integration:core -- --testPathPattern commit-changes-control-links.integration`

  Expected: FAIL — fixtures and any remaining wiring gaps surface here.

- [ ] **Step 2: Build out the four fixture helpers and re-run**

  Add the four `seed*` helpers in `packages/core/tests/integration/helpers/commit-changes-fixtures.ts` (extending the file if it exists, creating it if not). Each helper:
  1. Inserts the committed rows it needs through the fake repositories.
  2. Inserts the overlay edit-action rows that drive the scenario.
  3. Returns the `systemId`s the test asserts against.

  Run: `pnpm --filter @arc/core run test:integration:core -- --testPathPattern commit-changes-control-links.integration`

  Expected: PASS — all four scenarios green.

- [ ] **Step 3: Verify type-check and full unit suite**

  Run: `pnpm run build:core && pnpm --filter @arc/core run test:unit:core`

  Expected: zero TypeScript errors; all unit tests still pass.

- [ ] **Step 4: Commit**

  Use the `commit` skill to draft the commit message under scope `test(core)`. Show the proposed message and exact commands and **wait for explicit confirmation** before running anything.

  **STOP — do not run `git commit` until the user explicitly approves the message.**
