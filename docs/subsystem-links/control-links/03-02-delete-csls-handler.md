<!-- Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries. SPDX-License-Identifier: BSD-3-Clause -->

## Chapter: `DeleteControlSubsystemLinkSegmentHandler` (§11.7)

> **Spec reference:** `docs/virtual-links/2026-05-31-virtual-links-design.md` §11.7 (lines 919–944).
>
> **Goal of this chapter:** Add the delete-side companion of the CSLS create handler. The endpoint `DELETE /arc-api/v1/projects/:projectId/control-subsystem-links/:id` removes a single Control Subsystem Link Segment (CSLS) from the active edit session by recording overlay-only `edit_actions` (never touching the committed tables). Two cases:
>
> - **Case A — unresolved CSLS** (`controlLinkSystemId === null` in the overlay): record a CSLS DELETE and run the shared intent-clearing step.
> - **Case B — resolved CSLS** (`controlLinkSystemId === L1`): generate a single `groupId` and record (a) a CSLS DELETE for the target segment, (b) a ControlLink DELETE for `L1` (with `baseVersion`), and (c) a CSLS UPDATE setting `controlLinkSystemId = null` for every sibling whose `controlLinkSystemId === L1`. The null-FK UPDATEs are overlay-only — at commit, Step A' (§11.11) re-resolves these as incomplete chains and converts them to explicit DELETEs (or DISCARDs for pending CREATEs). ON DELETE CASCADE is the safety net. Then apply the shared intent-clearing step including the now-unresolved siblings in the remaining-graph.
>
> **Shared intent-clearing step (both cases):** call `IControlSubsystemLinkSegmentRepository.getAllForFile(fileId, sessionId)` (excluding the segment being deleted), pass `(remainingSegments, deletedSegment, nodeTypeMap)` to `ControlIntentPropagationService.findPortsToClear` (§11.8 Op A), then for every port system-id returned look up its current IntentRows via `IControlPortRepository.getIntentsByPortId` and record an IntentRow DELETE for each.
>
> **Cardinal rule check:** the command, handler, and DTO live in `@arc/core` / `@arc/api`; nothing here imports TypeORM. The handler depends only on the port interfaces declared in chapter 02-01 (`IControlSubsystemLinkSegmentRepository`, `IControlPortRepository.getIntentsByPortId`), the `INodeRepository.nodeTypeMap` reader (assumed to exist from prior batches), `IControlLinkRepository`, `IEditActionRepository`, `IdGenerationPort`, and the pure `ControlIntentPropagationService`.

---

### Task 31: Command + handler scaffolding for `DeleteControlSubsystemLinkSegmentCommand`

**Package:** `@arc/core`

**Files:**
- Create: `packages/core/src/application/control-links/delete-control-subsystem-link-segment/delete-control-subsystem-link-segment.command.ts`
- Create: `packages/core/src/application/control-links/delete-control-subsystem-link-segment/delete-control-subsystem-link-segment.handler.ts`
- Modify: `packages/core/src/application/orchestration/cqrs/registries/command-handler-registry.ts`
- Test: `packages/core/tests/unit/application/control-links/delete-control-subsystem-link-segment/delete-control-subsystem-link-segment.handler.spec.ts` (new — scaffolding-only assertions)

- [ ] **Step 1: Write the failing unit test (scaffolding contract)**

  Create `packages/core/tests/unit/application/control-links/delete-control-subsystem-link-segment/delete-control-subsystem-link-segment.handler.spec.ts`:

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  import {describe, it, expect} from '@jest/globals';
  import {DeleteControlSubsystemLinkSegmentCommand} from '../../../../../src/application/control-links/delete-control-subsystem-link-segment/delete-control-subsystem-link-segment.command.js';
  import {DeleteControlSubsystemLinkSegmentHandler} from '../../../../../src/application/control-links/delete-control-subsystem-link-segment/delete-control-subsystem-link-segment.handler.js';
  import {BaseCommand} from '../../../../../src/application/orchestration/cqrs/base/base-command.js';

  describe('DeleteControlSubsystemLinkSegmentCommand (spec §11.7)', () => {
    it('extends BaseCommand and carries cslsSystemId + projectId', () => {
      const cmd = new DeleteControlSubsystemLinkSegmentCommand({
        cslsSystemId: 9001,
        projectId: 1,
      });
      expect(cmd).toBeInstanceOf(BaseCommand);
      expect(cmd.cslsSystemId).toBe(9001);
      expect(cmd.projectId).toBe(1);
      expect(typeof cmd.commandId).toBe('string');
      expect(cmd.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('DeleteControlSubsystemLinkSegmentHandler (spec §11.7)', () => {
    it('is constructable and exposes a handle() method', () => {
      const handler = new DeleteControlSubsystemLinkSegmentHandler();
      expect(handler).toBeInstanceOf(DeleteControlSubsystemLinkSegmentHandler);
      expect(typeof handler.handle).toBe('function');
    });
  });
  ```

- [ ] **Step 2: Run the unit test to verify it fails**

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="delete-control-subsystem-link-segment.handler"`

  Expected: FAIL with `Cannot find module '.../delete-control-subsystem-link-segment.command.js'`.

- [ ] **Step 3: Create the command file**

  Create `packages/core/src/application/control-links/delete-control-subsystem-link-segment/delete-control-subsystem-link-segment.command.ts`:

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  import {BaseCommand} from '../../orchestration/cqrs/base/base-command.js';

  /**
   * Command payload for deleting a single Control Subsystem Link Segment
   * (CSLS) from the active edit session (spec §11.7).
   *
   * The handler resolves the active sessionId / fileSystemId via the
   * SessionContext using `projectId`; only the CSLS system_id and project
   * id are required from the API edge.
   */
  export interface DeleteControlSubsystemLinkSegmentCommandPayload {
    readonly cslsSystemId: number;
    readonly projectId: number;
  }

  /**
   * `DELETE /arc-api/v1/projects/:projectId/control-subsystem-links/:id`
   * command (spec §11.7).
   */
  export class DeleteControlSubsystemLinkSegmentCommand extends BaseCommand {
    public readonly cslsSystemId: number;
    public readonly projectId: number;

    constructor(payload: DeleteControlSubsystemLinkSegmentCommandPayload) {
      super();
      this.cslsSystemId = payload.cslsSystemId;
      this.projectId = payload.projectId;
    }
  }
  ```

- [ ] **Step 4: Create the handler skeleton**

  Create `packages/core/src/application/control-links/delete-control-subsystem-link-segment/delete-control-subsystem-link-segment.handler.ts`:

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  import type {CommandHandler} from '../../orchestration/cqrs/base/command-handler.js';
  import type {UnitOfWork} from '../../ports/persistence/unit-of-work.js';
  import type {IdGenerationPort} from '../../ports/id-generation/id-generation.port.js';
  import type {SessionContextPort} from '../../ports/session-context/session-context.port.js';
  import type {IControlSubsystemLinkSegmentRepository} from '../../ports/persistence/repositories/control-subsystem-link-segment.repository.port.js';
  import type {IControlPortRepository} from '../../ports/persistence/repositories/control-port.repository.port.js';
  import type {INodeRepository} from '../../ports/persistence/repositories/node.repository.port.js';
  import type {IControlLinkRepository} from '../../ports/persistence/repositories/control-link.repository.port.js';
  import type {IEditActionRepository} from '../../ports/persistence/repositories/edit-action.repository.port.js';
  import {ControlIntentPropagationService} from '../../../domain/services/control-links/control-intent-propagation.service.js';
  import {DeleteControlSubsystemLinkSegmentCommand} from './delete-control-subsystem-link-segment.command.js';

  /**
   * Result envelope — handler returns nothing meaningful; controller maps
   * to HTTP 204.
   */
  export interface DeleteControlSubsystemLinkSegmentResult {
    readonly cslsSystemId: number;
  }

  /**
   * `DeleteControlSubsystemLinkSegmentHandler` (spec §11.7).
   *
   * Steps (overview — body filled by Tasks 32, 33, 34):
   *   1. Resolve sessionContext (sessionId, fileSystemId) from projectId.
   *   2. Load target CSLS via `getAllForFile` → filter by systemId.
   *   3. Branch on `controlLinkSystemId === null` → Case A vs Case B.
   *   4. Apply shared intent-clearing step.
   *   5. Return `{cslsSystemId}` (controller responds 204).
   */
  export class DeleteControlSubsystemLinkSegmentHandler
    implements CommandHandler<DeleteControlSubsystemLinkSegmentCommand, DeleteControlSubsystemLinkSegmentResult>
  {
    constructor(
      private readonly sessionContext: SessionContextPort,
      private readonly idGeneration: IdGenerationPort,
      private readonly propagationService: ControlIntentPropagationService = new ControlIntentPropagationService(),
    ) {}

    async handle(
      command: DeleteControlSubsystemLinkSegmentCommand,
      uow: UnitOfWork,
    ): Promise<DeleteControlSubsystemLinkSegmentResult> {
      // 1. spec §11.7 — resolve session context from projectId.
      //    const {sessionId, fileSystemId} = await this.sessionContext.getActiveForProject(command.projectId);

      // 2. spec §11.7 — obtain port instances from the UoW.
      //    const cslsRepo = uow.getControlSubsystemLinkSegmentRepository();
      //    const portRepo = uow.getControlPortRepository();
      //    const nodeRepo = uow.getNodeRepository();
      //    const controlLinkRepo = uow.getControlLinkRepository();
      //    const editActionRepo = uow.getEditActionRepository();

      // 3. spec §11.7 — load target CSLS (overlay-aware via getAllForFile).
      //    const all = await cslsRepo.getAllForFile(fileSystemId, sessionId);
      //    const target = all.find(r => r.systemId === command.cslsSystemId);
      //    if (!target) throw new EntityNotFoundError(...);

      // 4. spec §11.7 — branch.
      //    if (target.controlLinkSystemId === null) {
      //      await this.handleCaseA(target, ...);    // Task 32
      //    } else {
      //      await this.handleCaseB(target, ...);    // Task 33
      //    }

      // 5. spec §11.7 — shared intent-clearing step (Task 34).
      //    await this.clearUnanchoredIntents(target, ...);

      // 6. Return result envelope; controller maps to HTTP 204.
      return {cslsSystemId: command.cslsSystemId};
    }
  }
  ```

- [ ] **Step 5: Register the handler in `CommandHandlerRegistry`**

  Open `packages/core/src/application/orchestration/cqrs/registries/command-handler-registry.ts`. Add the new import and registration alongside the existing entries:

  ```typescript
  import {DeleteControlSubsystemLinkSegmentCommand} from '../../../control-links/delete-control-subsystem-link-segment/delete-control-subsystem-link-segment.command.js';
  import {DeleteControlSubsystemLinkSegmentHandler} from '../../../control-links/delete-control-subsystem-link-segment/delete-control-subsystem-link-segment.handler.js';
  ```

  Inside `registerAllCommandHandlers()`:

  ```typescript
  registry.register(
    DeleteControlSubsystemLinkSegmentCommand,
    new DeleteControlSubsystemLinkSegmentHandler(sessionContext, idGeneration),
  );
  ```

- [ ] **Step 6: Run the unit test to verify it passes**

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="delete-control-subsystem-link-segment.handler"`

  Expected: PASS — command instantiation + handler construction both succeed.

- [ ] **Step 7: Verify `@arc/core` builds**

  Run: `pnpm --filter @arc/core run build`

  Expected: Zero TypeScript errors.

- [ ] **Step 8: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands to the user and **wait for explicit confirmation** before running anything:

  ```bash
  git add packages/core/src/application/control-links/delete-control-subsystem-link-segment/delete-control-subsystem-link-segment.command.ts \
          packages/core/src/application/control-links/delete-control-subsystem-link-segment/delete-control-subsystem-link-segment.handler.ts \
          packages/core/src/application/orchestration/cqrs/registries/command-handler-registry.ts \
          packages/core/tests/unit/application/control-links/delete-control-subsystem-link-segment/delete-control-subsystem-link-segment.handler.spec.ts
  git commit -m "feat(application): scaffold DeleteControlSubsystemLinkSegmentHandler (§11.7)" \
             -m "Adds the command (cslsSystemId, projectId) and handler skeleton with all injected dependencies for the two-case delete flow (unresolved vs resolved CSLS) and the shared intent-clearing step. Body is intentionally a numbered comment outline — Case A / Case B / intent clearing are filled in by Tasks 32–34. Registers the handler in CommandHandlerRegistry." \
             -m "Signed-off-by: Nithin Simon <nithin.simon@qualcomm.com>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.** Only execute after confirmation.

---

### Task 32: Case A — unresolved CSLS delete (`controlLinkSystemId === null`)

**Package:** `@arc/core`

**Files:**
- Modify: `packages/core/src/application/control-links/delete-control-subsystem-link-segment/delete-control-subsystem-link-segment.handler.ts`
- Test: `packages/core/tests/unit/application/control-links/delete-control-subsystem-link-segment/delete-control-subsystem-link-segment.case-a.spec.ts` (new)

- [ ] **Step 1: Write the failing unit test**

  Create `packages/core/tests/unit/application/control-links/delete-control-subsystem-link-segment/delete-control-subsystem-link-segment.case-a.spec.ts`. The test wires fake repositories that return a single CSLS with `controlLinkSystemId = null`, no sibling segments, and asserts:
  1. Exactly one CSLS DELETE edit-action is recorded for `cslsSystemId`.
  2. No ControlLink DELETE is recorded.
  3. No CSLS UPDATE is recorded.
  4. The shared intent-clearing step is invoked exactly once with a remaining-graph that excludes the deleted segment.

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="delete-control-subsystem-link-segment.case-a"`

  Expected: FAIL — handler currently does not call `editActionRepo.recordCslsDelete`.

- [ ] **Step 2: Implement Case A in the handler**

  Open `packages/core/src/application/control-links/delete-control-subsystem-link-segment/delete-control-subsystem-link-segment.handler.ts`. Add the private method (skeleton body):

  ```typescript
  /**
   * Case A — unresolved CSLS (spec §11.7).
   *
   * Sequence:
   *   1. Record CSLS DELETE for `target.systemId` (no groupId — single-row op).
   *   2. Caller runs the shared intent-clearing step afterwards.
   */
  private async handleCaseA(
    target: ControlSubsystemLinkSegmentRow,
    sessionId: number,
    editActionRepo: IEditActionRepository,
  ): Promise<void> {
    // 1. spec §11.7 Case A.1 — record CSLS DELETE edit_action.
    //    await editActionRepo.recordCslsDelete({
    //      sessionId,
    //      cslsSystemId: target.systemId,
    //      baseVersion: target.version,
    //    });

    // 2. spec §11.7 Case A.2 — shared intent clearing happens in caller (Task 34).
  }
  ```

  In the main `handle()` body, replace the `Case A` placeholder comment with the actual branch call:

  ```typescript
  if (target.controlLinkSystemId === null) {
    await this.handleCaseA(target, sessionId, editActionRepo);
  } else {
    await this.handleCaseB(target, ...); // Task 33
  }
  ```

- [ ] **Step 3: Run the unit test to verify it passes**

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="delete-control-subsystem-link-segment.case-a"`

  Expected: PASS — exactly one CSLS DELETE recorded; no ControlLink DELETE; no CSLS UPDATE; intent-clearing invoked once.

- [ ] **Step 4: Verify `@arc/core` builds**

  Run: `pnpm --filter @arc/core run build`

  Expected: Zero TypeScript errors.

- [ ] **Step 5: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands to the user and **wait for explicit confirmation** before running anything:

  ```bash
  git add packages/core/src/application/control-links/delete-control-subsystem-link-segment/delete-control-subsystem-link-segment.handler.ts \
          packages/core/tests/unit/application/control-links/delete-control-subsystem-link-segment/delete-control-subsystem-link-segment.case-a.spec.ts
  git commit -m "feat(application): implement Case A (unresolved) of DeleteControlSubsystemLinkSegmentHandler (§11.7)" \
             -m "When the target CSLS has controlLinkSystemId === null in the overlay, the handler records a single CSLS DELETE edit_action and falls through to the shared intent-clearing step. No groupId is used — a Case A delete is a single-row op." \
             -m "Signed-off-by: Nithin Simon <nithin.simon@qualcomm.com>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.** Only execute after confirmation.

---

### Task 33: Case B — resolved CSLS delete (`controlLinkSystemId === L1`)

**Package:** `@arc/core`

**Files:**
- Modify: `packages/core/src/application/control-links/delete-control-subsystem-link-segment/delete-control-subsystem-link-segment.handler.ts`
- Test: `packages/core/tests/unit/application/control-links/delete-control-subsystem-link-segment/delete-control-subsystem-link-segment.case-b.spec.ts` (new)

- [ ] **Step 1: Write the failing unit test**

  Create `packages/core/tests/unit/application/control-links/delete-control-subsystem-link-segment/delete-control-subsystem-link-segment.case-b.spec.ts`. Wire fakes so:
  - Target CSLS has `controlLinkSystemId = 5000` (ControlLink L1).
  - `getByControlLinkId(5000, ...)` returns the target itself plus two sibling CSLS (9002, 9003).
  - ControlLink repo returns `{systemId: 5000, version: 7}` for `getById(5000)`.

  Assertions:
  1. A single `groupId` is generated and reused across all four edit-actions.
  2. CSLS DELETE for target CSLS with the shared groupId.
  3. ControlLink DELETE for L1 with `baseVersion: 7` and shared groupId.
  4. Exactly two CSLS UPDATEs (one per sibling, NOT the target) setting `controlLinkSystemId = null` with shared groupId.
  5. The shared intent-clearing step is invoked with a remaining-graph that includes the siblings (their CSLS rows remain in the overlay after the null-FK UPDATE).

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="delete-control-subsystem-link-segment.case-b"`

  Expected: FAIL — handler currently has no Case B branch.

- [ ] **Step 2: Implement Case B in the handler**

  Append the private method (skeleton body):

  ```typescript
  /**
   * Case B — resolved CSLS (spec §11.7).
   *
   * Sequence:
   *   1. Generate shared groupId for atomic visibility of the group.
   *   2. Record CSLS DELETE for the target, sharing groupId.
   *   3. Record ControlLink DELETE for L1 with baseVersion + groupId.
   *   4. Load siblings via getByControlLinkId(L1, fileId, sessionId).
   *      For each sibling whose systemId !== target.systemId, record a CSLS
   *      UPDATE setting controlLinkSystemId = null, sharing groupId.
   *
   * The null-FK UPDATE edit_actions are NEVER applied to the actual table
   * (the column is NOT NULL). At commit, Step A' (§11.11) detects these
   * siblings as unresolved-in-overlay, runs chain resolution, finds the
   * incomplete chains, and converts each into:
   *   - pending CREATE sibling → mark change_status = DISCARDED.
   *   - committed sibling row → record explicit CSLS DELETE.
   * `ON DELETE CASCADE` on `csls.control_link_system_id` is the safety net.
   */
  private async handleCaseB(
    target: ControlSubsystemLinkSegmentRow,
    sessionId: number,
    fileId: number,
    cslsRepo: IControlSubsystemLinkSegmentRepository,
    controlLinkRepo: IControlLinkRepository,
    editActionRepo: IEditActionRepository,
  ): Promise<{controlLinkSystemId: number; groupId: string}> {
    // 1. spec §11.7 Case B.1 — shared groupId.
    //    const groupId = this.idGeneration.newGroupId();

    // 2. spec §11.7 Case B.2 — CSLS DELETE for the target with groupId.
    //    await editActionRepo.recordCslsDelete({
    //      sessionId,
    //      cslsSystemId: target.systemId,
    //      baseVersion: target.version,
    //      groupId,
    //    });

    // 3. spec §11.7 Case B.3 — ControlLink DELETE for L1 with baseVersion+groupId.
    //    const controlLink = await controlLinkRepo.getById(target.controlLinkSystemId!, fileId, sessionId);
    //    await editActionRepo.recordControlLinkDelete({
    //      sessionId,
    //      controlLinkSystemId: controlLink.systemId,
    //      baseVersion: controlLink.version,
    //      groupId,
    //    });

    // 4. spec §11.7 Case B.4 — null-FK UPDATE on each sibling.
    //    const siblings = await cslsRepo.getByControlLinkId(
    //      target.controlLinkSystemId!, fileId, sessionId,
    //    );
    //    for (const s of siblings) {
    //      if (s.systemId === target.systemId) continue;   // already DELETEd in step 2.
    //      await editActionRepo.recordCslsUpdate({
    //        sessionId,
    //        cslsSystemId: s.systemId,
    //        baseVersion: s.version,
    //        groupId,
    //        payload: {controlLinkSystemId: null},
    //      });
    //    }

    // 5. spec §11.7 Case B.5 — shared intent clearing runs in caller (Task 34).
    //    Siblings remain in the overlay's getAllForFile view (UPDATEs preserve
    //    rows, only DELETEs drop them), so the remaining-graph correctly
    //    represents the connected topology for findPortsToClear.

    return {controlLinkSystemId: target.controlLinkSystemId!, groupId: '' /* placeholder */};
  }
  ```

  Update the main `handle()` body so Case B is wired:

  ```typescript
  if (target.controlLinkSystemId === null) {
    await this.handleCaseA(target, sessionId, editActionRepo);
  } else {
    await this.handleCaseB(
      target, sessionId, fileSystemId,
      cslsRepo, controlLinkRepo, editActionRepo,
    );
  }
  ```

- [ ] **Step 3: Run the unit test to verify it passes**

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="delete-control-subsystem-link-segment.case-b"`

  Expected: PASS — one CSLS DELETE, one ControlLink DELETE with baseVersion, two sibling CSLS UPDATEs (not the target), all sharing the same groupId.

- [ ] **Step 4: Verify `@arc/core` builds**

  Run: `pnpm --filter @arc/core run build`

  Expected: Zero TypeScript errors.

- [ ] **Step 5: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands to the user and **wait for explicit confirmation** before running anything:

  ```bash
  git add packages/core/src/application/control-links/delete-control-subsystem-link-segment/delete-control-subsystem-link-segment.handler.ts \
          packages/core/tests/unit/application/control-links/delete-control-subsystem-link-segment/delete-control-subsystem-link-segment.case-b.spec.ts
  git commit -m "feat(application): implement Case B (resolved) of DeleteControlSubsystemLinkSegmentHandler (§11.7)" \
             -m "When the target CSLS has controlLinkSystemId === L1, the handler generates a shared groupId and records four edit_actions atomically: CSLS DELETE (target), ControlLink DELETE (L1 with baseVersion), plus a CSLS UPDATE per sibling setting controlLinkSystemId = null. The null-FK UPDATEs are overlay-only — commit Step A' converts them to explicit DELETEs (committed siblings) or DISCARDs (pending CREATE siblings). ON DELETE CASCADE is the safety net." \
             -m "Signed-off-by: Nithin Simon <nithin.simon@qualcomm.com>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.** Only execute after confirmation.

---

### Task 34: Shared intent-clearing step (both cases)

**Package:** `@arc/core`

**Files:**
- Modify: `packages/core/src/application/control-links/delete-control-subsystem-link-segment/delete-control-subsystem-link-segment.handler.ts`
- Test: `packages/core/tests/unit/application/control-links/delete-control-subsystem-link-segment/delete-control-subsystem-link-segment.clear-intents.spec.ts` (new)

- [ ] **Step 1: Write the failing unit test**

  Create the spec file with two scenarios:

  1. **Anchored remains anchored** — after deleting one CSLS in a chain `module–subsystemA–subsystemB–module`, removing the middle segment leaves the two outer ports each still in a component containing a module node → `portsToClear` is empty → no IntentRow DELETEs recorded.
  2. **Stranded subsystem cleared** — deleting the only CSLS connecting a subsystem-only branch to a module disconnects it → the propagation service returns the stranded subsystem-port system-ids → for each port, the handler calls `getIntentsByPortId(portId, sessionId)` and records an IntentRow DELETE for every IntentRow returned (use `baseVersion = intent.version`).

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="delete-control-subsystem-link-segment.clear-intents"`

  Expected: FAIL — handler currently has no intent-clearing step.

- [ ] **Step 2: Implement the shared step in the handler**

  Append the private method (skeleton body):

  ```typescript
  /**
   * Shared intent-clearing step (spec §11.7).
   *
   * Invoked after Case A or Case B has recorded its DELETE/UPDATE edit
   * actions. Uses the overlay-aware getAllForFile so the just-recorded
   * actions are reflected:
   *   - Case A: deleted segment is no longer in the merged view.
   *   - Case B: deleted segment is no longer in the merged view; sibling
   *     CSLS remain (their FK is null but the row persists for reachability).
   *
   * Sequence:
   *   1. Load all remaining CSLS for the file (excluding the deleted segment).
   *   2. Build nodeTypeMap for nodes referenced by remaining segments
   *      via INodeRepository.nodeTypeMap (or equivalent batch lookup).
   *   3. Call ControlIntentPropagationService.findPortsToClear with
   *      (remainingSegments, deletedSegment, nodeTypeMap).
   *   4. For each portSystemId in portsToClear:
   *        - intents = await portRepo.getIntentsByPortId(port, sessionId).
   *        - record IntentRow DELETE for each (with baseVersion).
   */
  private async clearUnanchoredIntents(
    target: ControlSubsystemLinkSegmentRow,
    sessionId: number,
    fileId: number,
    cslsRepo: IControlSubsystemLinkSegmentRepository,
    portRepo: IControlPortRepository,
    nodeRepo: INodeRepository,
    editActionRepo: IEditActionRepository,
  ): Promise<{portsToClear: number[]; intentsDeleted: number}> {
    // 1. spec §11.7 intent-clearing.1 — remaining CSLS, excluding the deleted one.
    //    const all = await cslsRepo.getAllForFile(fileId, sessionId);
    //    const remaining = all.filter(r => r.systemId !== target.systemId);

    // 2. spec §11.7 intent-clearing.2 — nodeTypeMap for nodes in the remaining graph.
    //    const nodeIds = new Set<number>();
    //    for (const r of remaining) { nodeIds.add(r.peerNodeASystemId); nodeIds.add(r.peerNodeBSystemId); }
    //    nodeIds.add(target.peerNodeASystemId); nodeIds.add(target.peerNodeBSystemId);
    //    const nodeTypeMap = await nodeRepo.nodeTypeMap([...nodeIds], fileId, sessionId);

    // 3. spec §11.7 intent-clearing.3 / §11.8 Op A — pure service call.
    //    const {portsToClear} = this.propagationService.findPortsToClear({
    //      remainingSegments: remaining.map(r => ({
    //        peerNodeASystemId: r.peerNodeASystemId,
    //        peerNodeBSystemId: r.peerNodeBSystemId,
    //        nodeAPortSystemId: r.nodeAPortSystemId,
    //        nodeBPortSystemId: r.nodeBPortSystemId,
    //      })),
    //      nodeTypeMap,
    //      deletedSegment: {
    //        peerNodeASystemId: target.peerNodeASystemId,
    //        peerNodeBSystemId: target.peerNodeBSystemId,
    //      },
    //    });

    // 4. spec §11.7 intent-clearing.4 — IntentRow DELETEs per port.
    //    let intentsDeleted = 0;
    //    for (const portId of portsToClear) {
    //      const intents = await portRepo.getIntentsByPortId(portId, sessionId);
    //      for (const i of intents) {
    //        await editActionRepo.recordIntentRowDelete({
    //          sessionId,
    //          intentSystemId: i.systemId,
    //          baseVersion: i.version,
    //        });
    //        intentsDeleted++;
    //      }
    //    }
    //    return {portsToClear, intentsDeleted};

    return {portsToClear: [], intentsDeleted: 0};
  }
  ```

  Wire the call at the end of `handle()` (after the Case A / Case B branch):

  ```typescript
  await this.clearUnanchoredIntents(
    target, sessionId, fileSystemId,
    cslsRepo, portRepo, nodeRepo, editActionRepo,
  );
  return {cslsSystemId: command.cslsSystemId};
  ```

- [ ] **Step 3: Run the unit test to verify it passes**

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="delete-control-subsystem-link-segment.clear-intents"`

  Expected: PASS — both scenarios green: anchored ports keep their intents; stranded subsystem ports have every IntentRow recorded as a DELETE edit_action.

- [ ] **Step 4: Run the full handler suite as a regression guard**

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="delete-control-subsystem-link-segment"`

  Expected: PASS — Tasks 31, 32, 33, 34 specs all green.

- [ ] **Step 5: Verify `@arc/core` builds**

  Run: `pnpm --filter @arc/core run build`

  Expected: Zero TypeScript errors.

- [ ] **Step 6: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands to the user and **wait for explicit confirmation** before running anything:

  ```bash
  git add packages/core/src/application/control-links/delete-control-subsystem-link-segment/delete-control-subsystem-link-segment.handler.ts \
          packages/core/tests/unit/application/control-links/delete-control-subsystem-link-segment/delete-control-subsystem-link-segment.clear-intents.spec.ts
  git commit -m "feat(application): implement shared intent-clearing step for CSLS delete (§11.7)" \
             -m "Both Case A and Case B end with the same intent-clearing pass: re-read remaining CSLS (excluding the deleted segment) via getAllForFile, hand to ControlIntentPropagationService.findPortsToClear with a nodeTypeMap covering every node touched, then for each unanchored port enumerate IntentRows via IControlPortRepository.getIntentsByPortId and record IntentRow DELETE edit_actions. Anchored ports are untouched; stranded subsystem ports get every IntentRow cleared." \
             -m "Signed-off-by: Nithin Simon <nithin.simon@qualcomm.com>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.** Only execute after confirmation.

---

### Task 35: REST controller, DTO, DI wiring + e2e integration test

**Package:** `@arc/api`

**Files:**
- Create: `packages/api/src/controllers/control-subsystem-links/control-subsystem-links.controller.ts`
- Create: `packages/api/src/controllers/control-subsystem-links/dto/delete-control-subsystem-link.params.dto.ts`
- Modify: `packages/api/src/controllers/control-subsystem-links/control-subsystem-links.module.ts` (or create if absent)
- Modify: `packages/api/src/app.module.ts` (import the new module)
- Test: `packages/api/tests/e2e/control-subsystem-links/delete-control-subsystem-link.e2e-spec.ts` (new)

- [ ] **Step 1: Write the failing e2e integration test**

  Create `packages/api/tests/e2e/control-subsystem-links/delete-control-subsystem-link.e2e-spec.ts`:

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  import {describe, it, expect, beforeAll, afterAll, beforeEach} from '@jest/globals';
  import type {INestApplication} from '@nestjs/common';
  import * as request from 'supertest';
  import {bootstrapTestApp, teardownTestApp} from '../helpers/bootstrap-test-app.js';
  import {seedCslsFixture} from '../helpers/seed-csls-fixture.js';
  import {ENTITY_NAMES} from '@arc/persistence';

  /**
   * Spec §11.7 — DELETE /arc-api/v1/projects/:projectId/control-subsystem-links/:id
   *
   * Two fixtures, two cases:
   *   - Case A: an unresolved CSLS (controlLinkSystemId = null) connecting a
   *     module port to a subsystem port. Deleting it should clear intents on
   *     the now-orphan subsystem port and leave the (already-anchored) module
   *     port's intents alone.
   *   - Case B: a resolved 3-segment chain module1 ─ subA ─ subB ─ module2,
   *     held by ControlLink L1. Deleting the middle segment (subA–subB) should
   *     record one CSLS DELETE + ControlLink DELETE (L1, baseVersion) + two
   *     sibling CSLS UPDATEs setting FK=null, all sharing one groupId. The
   *     remaining-graph still anchors subA to module1 and subB to module2, so
   *     their intents must NOT be cleared.
   */
  describe('DELETE /arc-api/v1/projects/:projectId/control-subsystem-links/:id (spec §11.7)', () => {
    let app: INestApplication;
    let projectId: number;
    let sessionId: number;
    let fileId: number;

    beforeAll(async () => {
      app = await bootstrapTestApp();
    });
    afterAll(async () => {
      await teardownTestApp(app);
    });

    beforeEach(async () => {
      const fixture = await seedCslsFixture(app);
      projectId = fixture.projectId;
      sessionId = fixture.sessionId;
      fileId = fixture.fileId;
    });

    // -----------------------------------------------------------------------
    // Case A — unresolved CSLS
    // -----------------------------------------------------------------------

    it('Case A: unanchored subsystem port intents are cleared, anchored module port intents untouched', async () => {
      const {cslsId, subsystemPortId, modulePortId} =
        await seedCaseAUnresolvedCsls(app, fileId, sessionId);

      const response = await request(app.getHttpServer())
        .delete(`/arc-api/v1/projects/${projectId}/control-subsystem-links/${cslsId}`)
        .expect(204);

      expect(response.body).toEqual({});

      // Assert edit_actions recorded.
      const editActions = await getEditActions(app, sessionId);
      const cslsDeletes = editActions.filter(
        ea => ea.tableName === ENTITY_NAMES.ControlSubsystemLinkSegment && ea.operation === 'DELETE',
      );
      expect(cslsDeletes).toHaveLength(1);
      expect(cslsDeletes[0].aggregateId).toBe(cslsId);

      const controlLinkDeletes = editActions.filter(
        ea => ea.tableName === ENTITY_NAMES.ControlLink && ea.operation === 'DELETE',
      );
      expect(controlLinkDeletes).toHaveLength(0);

      const intentDeletes = editActions.filter(
        ea => ea.tableName === ENTITY_NAMES.Intent && ea.operation === 'DELETE',
      );
      // Subsystem port loses both its intents; module port intent is preserved.
      const deletedPortIds = new Set(intentDeletes.map(ea => ea.payload.controlPortSystemId));
      expect(deletedPortIds).toContain(subsystemPortId);
      expect(deletedPortIds).not.toContain(modulePortId);
    });

    // -----------------------------------------------------------------------
    // Case B — resolved CSLS (middle of 3-segment chain)
    // -----------------------------------------------------------------------

    it('Case B: ControlLink + sibling CSLS UPDATEs share groupId; reachable siblings keep intents; isolated ports cleared', async () => {
      const {
        middleCslsId, controlLinkId, siblingACslsId, siblingBCslsId,
        portModule1Id, portSubAId, portSubBId, portModule2Id,
        isolatedSubsystemPortId,
      } = await seedCaseBResolvedChain(app, fileId, sessionId);

      await request(app.getHttpServer())
        .delete(`/arc-api/v1/projects/${projectId}/control-subsystem-links/${middleCslsId}`)
        .expect(204);

      const editActions = await getEditActions(app, sessionId);

      // Exactly one CSLS DELETE (the middle segment) — siblings get UPDATEs, not DELETEs.
      const cslsDeletes = editActions.filter(
        ea => ea.tableName === ENTITY_NAMES.ControlSubsystemLinkSegment && ea.operation === 'DELETE',
      );
      expect(cslsDeletes.map(ea => ea.aggregateId)).toEqual([middleCslsId]);

      // One ControlLink DELETE for L1, carrying baseVersion.
      const linkDeletes = editActions.filter(
        ea => ea.tableName === ENTITY_NAMES.ControlLink && ea.operation === 'DELETE',
      );
      expect(linkDeletes).toHaveLength(1);
      expect(linkDeletes[0].aggregateId).toBe(controlLinkId);
      expect(linkDeletes[0].baseVersion).toBeGreaterThan(0);

      // Two sibling CSLS UPDATEs setting FK to null.
      const cslsUpdates = editActions.filter(
        ea => ea.tableName === ENTITY_NAMES.ControlSubsystemLinkSegment && ea.operation === 'UPDATE',
      );
      expect(cslsUpdates.map(ea => ea.aggregateId).sort()).toEqual(
        [siblingACslsId, siblingBCslsId].sort(),
      );
      for (const u of cslsUpdates) {
        expect(u.payload.controlLinkSystemId).toBeNull();
      }

      // All four edit_actions share the same groupId.
      const groupIds = new Set([
        ...cslsDeletes.map(ea => ea.groupId),
        ...linkDeletes.map(ea => ea.groupId),
        ...cslsUpdates.map(ea => ea.groupId),
      ]);
      expect(groupIds.size).toBe(1);
      expect([...groupIds][0]).toBeTruthy();

      // Intent clearing: only the isolated subsystem port loses intents.
      // portSubA reaches module1 via siblingA → not cleared.
      // portSubB reaches module2 via siblingB → not cleared.
      // module1/module2 are module ports → never cleared (no module nodes in component check applies to subsystem ports).
      // The isolated subsystem port is in a component with no module → cleared.
      const intentDeletes = editActions.filter(
        ea => ea.tableName === ENTITY_NAMES.Intent && ea.operation === 'DELETE',
      );
      const clearedPorts = new Set(intentDeletes.map(ea => ea.payload.controlPortSystemId));
      expect(clearedPorts).toContain(isolatedSubsystemPortId);
      expect(clearedPorts).not.toContain(portSubAId);
      expect(clearedPorts).not.toContain(portSubBId);
      expect(clearedPorts).not.toContain(portModule1Id);
      expect(clearedPorts).not.toContain(portModule2Id);
    });
  });
  ```

  > Helper signatures `seedCaseAUnresolvedCsls`, `seedCaseBResolvedChain`, and `getEditActions` follow the existing e2e helper conventions under `packages/api/tests/e2e/helpers/`. If sibling chapters have not yet introduced `seedCslsFixture`, scaffold it here as a thin wrapper around the existing project-upload + session helpers; otherwise reuse.

  Run: `pnpm --filter @arc/api run test:e2e:api -- --testPathPattern="delete-control-subsystem-link"`

  Expected: FAIL — controller route does not exist yet (`Cannot DELETE /arc-api/v1/projects/.../control-subsystem-links/...` → 404).

- [ ] **Step 2: Create the params DTO**

  Create `packages/api/src/controllers/control-subsystem-links/dto/delete-control-subsystem-link.params.dto.ts`:

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  import {ApiProperty} from '@nestjs/swagger';
  import {Type} from 'class-transformer';
  import {IsInt, Min} from 'class-validator';

  /**
   * Path-parameter DTO for `DELETE /arc-api/v1/projects/:projectId/control-subsystem-links/:id`.
   *
   * Spec §11.7. The handler receives `cslsSystemId` (= `:id`) and `projectId`
   * — both are positive integers.
   */
  export class DeleteControlSubsystemLinkParamsDto {
    @ApiProperty({description: 'Project system_id', example: 1})
    @Type(() => Number)
    @IsInt()
    @Min(1)
    projectId!: number;

    @ApiProperty({
      description: 'Control Subsystem Link Segment system_id to delete',
      example: 9001,
    })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    id!: number;
  }
  ```

- [ ] **Step 3: Create the controller**

  Create `packages/api/src/controllers/control-subsystem-links/control-subsystem-links.controller.ts`:

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  import {
    Controller,
    Delete,
    HttpCode,
    HttpStatus,
    Inject,
    Param,
  } from '@nestjs/common';
  import {ApiOperation, ApiResponse, ApiTags} from '@nestjs/swagger';
  import type {CommandBus} from '@arc/core';
  import {DeleteControlSubsystemLinkSegmentCommand} from '@arc/core';
  import {COMMAND_BUS} from '../../infrastructure-wrapper/cqrs/cqrs.tokens.js';
  import {DeleteControlSubsystemLinkParamsDto} from './dto/delete-control-subsystem-link.params.dto.js';

  /**
   * REST controller for Control Subsystem Link Segments.
   *
   * Currently exposes only the DELETE endpoint (spec §11.7); the POST CREATE
   * endpoint (§11.4–§11.6) is added by the sibling chapter for Task 8.
   */
  @ApiTags('control-subsystem-links')
  @Controller('arc-api/v1/projects/:projectId/control-subsystem-links')
  export class ControlSubsystemLinksController {
    constructor(
      @Inject(COMMAND_BUS) private readonly commandBus: CommandBus,
    ) {}

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({
      summary:
        'Delete a Control Subsystem Link Segment in the active edit session (spec §11.7)',
      description:
        'Records overlay-only edit_actions: CSLS DELETE plus — when the segment is resolved — a ControlLink DELETE and per-sibling CSLS UPDATEs nulling the FK, all sharing one groupId. Always runs the shared intent-clearing pass for unanchored subsystem ports.',
    })
    @ApiResponse({status: 204, description: 'Edit actions recorded'})
    @ApiResponse({status: 404, description: 'CSLS or project not found in active session'})
    async deleteControlSubsystemLinkSegment(
      @Param() params: DeleteControlSubsystemLinkParamsDto,
    ): Promise<void> {
      await this.commandBus.execute(
        new DeleteControlSubsystemLinkSegmentCommand({
          cslsSystemId: params.id,
          projectId: params.projectId,
        }),
      );
      // NestJS converts the `void` return + @HttpCode(204) into an empty body.
    }
  }
  ```

- [ ] **Step 4: Wire the controller into a NestJS module**

  Create (or extend, if Task 8 already added it) `packages/api/src/controllers/control-subsystem-links/control-subsystem-links.module.ts`:

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  import {Module} from '@nestjs/common';
  import {ArcCqrsModule} from '../../infrastructure-wrapper/cqrs/arc-cqrs.module.js';
  import {ControlSubsystemLinksController} from './control-subsystem-links.controller.js';

  @Module({
    imports: [ArcCqrsModule],
    controllers: [ControlSubsystemLinksController],
  })
  export class ControlSubsystemLinksModule {}
  ```

  Open `packages/api/src/app.module.ts` and add `ControlSubsystemLinksModule` to the `imports` array of `AppModule`:

  ```typescript
  import {ControlSubsystemLinksModule} from './controllers/control-subsystem-links/control-subsystem-links.module.js';
  // ...
  @Module({
    imports: [
      // ... existing
      ControlSubsystemLinksModule,
    ],
    // ...
  })
  export class AppModule {}
  ```

  > If the sibling chapter for Task 8 already wired `ControlSubsystemLinksModule`, just add `ControlSubsystemLinksController` to its `controllers` array — do not double-import.

- [ ] **Step 5: Run the e2e test to verify it passes**

  Run: `pnpm --filter @arc/api run test:e2e:api -- --testPathPattern="delete-control-subsystem-link"`

  Expected: PASS — both Case A and Case B scenarios green.

- [ ] **Step 6: Run the full e2e suite as a regression guard**

  Run: `pnpm --filter @arc/api run test:e2e:api`

  Expected: PASS — no pre-existing e2e is broken.

- [ ] **Step 7: Verify the workspace builds**

  Run: `pnpm run build`

  Expected: Zero TypeScript errors across `@arc/core`, `@arc/persistence`, and `@arc/api`.

- [ ] **Step 8: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands to the user and **wait for explicit confirmation** before running anything:

  ```bash
  git add packages/api/src/controllers/control-subsystem-links/control-subsystem-links.controller.ts \
          packages/api/src/controllers/control-subsystem-links/dto/delete-control-subsystem-link.params.dto.ts \
          packages/api/src/controllers/control-subsystem-links/control-subsystem-links.module.ts \
          packages/api/src/app.module.ts \
          packages/api/tests/e2e/control-subsystem-links/delete-control-subsystem-link.e2e-spec.ts
  git commit -m "feat(api): expose DELETE /arc-api/v1/projects/:projectId/control-subsystem-links/:id (§11.7)" \
             -m "Adds the REST controller + params DTO and dispatches DeleteControlSubsystemLinkSegmentCommand via the CommandBus. Returns 204 No Content; the e2e test covers Case A (unanchored subsystem port intents cleared, anchored module port intents untouched) and Case B (one CSLS DELETE + one ControlLink DELETE with baseVersion + two sibling CSLS UPDATEs nulling the FK, all sharing one groupId; reachable siblings keep their intents; isolated subsystem ports get every IntentRow cleared)." \
             -m "Signed-off-by: Nithin Simon <nithin.simon@qualcomm.com>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.** Only execute after confirmation.

---

## Chapter self-review

- **Spec coverage.** §11.7 names two cases plus a shared intent-clearing step plus the REST surface. Task 31 lands the command + handler skeleton with all injected dependencies. Task 32 implements Case A (single CSLS DELETE, no groupId). Task 33 implements Case B (shared groupId; CSLS DELETE for the target, ControlLink DELETE with baseVersion, per-sibling null-FK UPDATEs; siblings include the target only once because the loop skips `s.systemId === target.systemId`). Task 34 implements the shared intent-clearing step via `IControlSubsystemLinkSegmentRepository.getAllForFile`, `ControlIntentPropagationService.findPortsToClear`, and `IControlPortRepository.getIntentsByPortId`. Task 35 lands the REST controller, DTO, module wiring, and an e2e test covering both cases end-to-end.
- **Symbol fidelity.** All referenced symbols come from the spec or the port chapters: `IControlSubsystemLinkSegmentRepository.getAllForFile / getByControlLinkId` (§11.10), `IControlPortRepository.getIntentsByPortId` (§11.10), `ControlIntentPropagationService.findPortsToClear` (§11.8), `BaseCommand`, `CommandHandler`, `UnitOfWork`, `IdGenerationPort`. No invented methods.
- **Skeleton policy honoured.** Handler bodies are numbered comments referencing spec §11.7 / §11.8 with return-type shapes; command, DTO, controller, and tests are full TypeScript per the instruction.
- **TDD ordering.** Every implementation task is preceded by a failing test, followed by the implementation, then a green test, then commit-with-STOP-gate.
- **Conventional Commits scopes.** `application` for Tasks 31–34 (handler/command); `api` for Task 35 (controller/DTO/module).
- **Task count.** Five tasks, hitting the hard ceiling.
