<!-- Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries. SPDX-License-Identifier: BSD-3-Clause -->

## Chapter: `CreateControlSubsystemLinkSegmentHandler` (§11.4 – §11.6)

> **Spec reference:** `docs/virtual-links/2026-05-31-virtual-links-design.md` §11.4 (lines 811–818), §11.5 (lines 820–834), §11.6 (lines 838–916).
>
> **Goal of this chapter:** Add the create-side handler for control subsystem link segments (CSLS). The endpoint `POST /arc-api/v1/projects/:projectId/control-subsystem-links` dispatches on endpoint node types into three branches:
>
> - **Branch A** — both endpoints are module nodes with the same `parentId` (or both `null`). Skips CSLS entirely and creates a single `ControlLink` after canonical ordering. Returns `{ systemId, type: 'ControlLink' }`.
> - **Branch B** — both endpoints are module nodes with different `parentId` values. Uses `SubsystemBoundaryPathService` to compute the boundary chain, auto-creates a control port (and matching IntentRow CREATEs) on every intermediate subsystem node, records the `ControlLink` CREATE + a fully-resolved CSLS for every adjacent pair, all sharing a `groupId`. Returns `{ controlSubsystemLinkSegments: [{ systemId }, …] }`.
> - **Branch C** — at least one endpoint is a subsystem node. Runs a topology-aware same-side check (inner vs outer ancestry walk), runs the intent validation table (§11.6 step 2 — direct propagation + `ControlIntentPropagationService.cascadePropagate`), optionally creates the boundary control port inline when the caller omits `portSystemId`, and records a single unresolved CSLS (`controlLinkSystemId = null`). Returns `{ systemId, createdPortSystemId? }`.
>
> **Cardinal rule check:** the command, handler, and DTO live in `@arc/core` / `@arc/api`; nothing here imports TypeORM. The handler depends only on the port interfaces declared in chapter 02-01 (`IControlSubsystemLinkSegmentRepository`, `IControlPortRepository` with the new `getIntentsByPortId`), `IControlLinkRepository`, `INodeRepository`, `IEditActionRepository`, `IdGenerationPort`, and the pure domain services `SubsystemBoundaryPathService`, `ControlIntentPropagationService` (§11.8).
>
> **Schema-fix dependency:** Branch A and Branch B both depend on the canonical-ordering fix from chapter 01-01 (§11.1). The handler always normalises peerA/peerB by lower `portSystemId` before the duplicate check.

---

### Task 23: Command + handler scaffolding for `CreateControlSubsystemLinkSegmentCommand`

**Package:** `@arc/core`

**Files:**
- Create: `packages/core/src/application/control-links/create-control-subsystem-link-segment/create-control-subsystem-link-segment.command.ts`
- Create: `packages/core/src/application/control-links/create-control-subsystem-link-segment/create-control-subsystem-link-segment.handler.ts`
- Modify: `packages/core/src/application/orchestration/cqrs/registries/command-handler-registry.ts`
- Test: `packages/core/tests/unit/application/control-links/create-control-subsystem-link-segment/create-control-subsystem-link-segment.handler.spec.ts` (new — scaffolding-only assertions)

- [ ] **Step 1: Write the failing scaffolding unit test**

  Create `packages/core/tests/unit/application/control-links/create-control-subsystem-link-segment/create-control-subsystem-link-segment.handler.spec.ts`:

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  import {describe, it, expect} from '@jest/globals';
  import {CreateControlSubsystemLinkSegmentCommand} from '../../../../../src/application/control-links/create-control-subsystem-link-segment/create-control-subsystem-link-segment.command.js';
  import {CreateControlSubsystemLinkSegmentHandler} from '../../../../../src/application/control-links/create-control-subsystem-link-segment/create-control-subsystem-link-segment.handler.js';
  import {BaseCommand} from '../../../../../src/application/orchestration/cqrs/base/base-command.js';

  describe('CreateControlSubsystemLinkSegmentCommand (spec §11.6)', () => {
    it('extends BaseCommand and carries endpoint identifiers + projectId', () => {
      const cmd = new CreateControlSubsystemLinkSegmentCommand({
        peerNodeASystemId: 100,
        peerNodeBSystemId: 200,
        nodeAPortSystemId: 1000,
        nodeBPortSystemId: 2000,
        projectId: 1,
      });
      expect(cmd).toBeInstanceOf(BaseCommand);
      expect(cmd.peerNodeASystemId).toBe(100);
      expect(cmd.peerNodeBSystemId).toBe(200);
      expect(cmd.nodeAPortSystemId).toBe(1000);
      expect(cmd.nodeBPortSystemId).toBe(2000);
      expect(cmd.projectId).toBe(1);
    });

    it('accepts an undefined nodeBPortSystemId for inline subsystem-port creation', () => {
      const cmd = new CreateControlSubsystemLinkSegmentCommand({
        peerNodeASystemId: 100,
        peerNodeBSystemId: 200,
        nodeAPortSystemId: 1000,
        nodeBPortSystemId: undefined,
        projectId: 1,
      });
      expect(cmd.nodeBPortSystemId).toBeUndefined();
    });
  });

  describe('CreateControlSubsystemLinkSegmentHandler (spec §11.6)', () => {
    it('is constructable and exposes a handle() method', () => {
      const handler = new CreateControlSubsystemLinkSegmentHandler();
      expect(handler).toBeInstanceOf(CreateControlSubsystemLinkSegmentHandler);
      expect(typeof handler.handle).toBe('function');
    });
  });
  ```

- [ ] **Step 2: Run the unit test to verify it fails**

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="create-control-subsystem-link-segment.handler"`

  Expected: FAIL with `Cannot find module '.../create-control-subsystem-link-segment.command.js'`.

- [ ] **Step 3: Create the command file**

  Create `packages/core/src/application/control-links/create-control-subsystem-link-segment/create-control-subsystem-link-segment.command.ts`:

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  import {BaseCommand} from '../../orchestration/cqrs/base/base-command.js';

  export interface CreateControlSubsystemLinkSegmentCommandPayload {
    readonly peerNodeASystemId: number;
    readonly peerNodeBSystemId: number;
    readonly nodeAPortSystemId: number | undefined;
    readonly nodeBPortSystemId: number | undefined;
    readonly projectId: number;
  }

  export class CreateControlSubsystemLinkSegmentCommand extends BaseCommand {
    public readonly peerNodeASystemId: number;
    public readonly peerNodeBSystemId: number;
    public readonly nodeAPortSystemId: number | undefined;
    public readonly nodeBPortSystemId: number | undefined;
    public readonly projectId: number;

    constructor(payload: CreateControlSubsystemLinkSegmentCommandPayload) {
      super();
      this.peerNodeASystemId = payload.peerNodeASystemId;
      this.peerNodeBSystemId = payload.peerNodeBSystemId;
      this.nodeAPortSystemId = payload.nodeAPortSystemId;
      this.nodeBPortSystemId = payload.nodeBPortSystemId;
      this.projectId = payload.projectId;
    }
  }
  ```

  Per §11.6: `portSystemId` is **optional only** on a subsystem-node endpoint. The handler enforces this distinction at runtime — the command type itself accepts `undefined` for either side.

- [ ] **Step 4: Create the handler skeleton**

  Create `packages/core/src/application/control-links/create-control-subsystem-link-segment/create-control-subsystem-link-segment.handler.ts`:

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  import type {CommandHandler} from '../../orchestration/cqrs/commands/command-handler.js';
  import type {UnitOfWork} from '../../ports/persistence/unit-of-work.js';
  import type {IControlSubsystemLinkSegmentRepository} from '../../ports/persistence/repositories/control-subsystem-link-segment.repository.port.js';
  import type {IControlPortRepository} from '../../ports/persistence/repositories/control-port.repository.port.js';
  import type {IControlLinkRepository} from '../../ports/persistence/repositories/control-link.repository.port.js';
  import type {INodeRepository} from '../../ports/persistence/repositories/node.repository.port.js';
  import type {IEditActionRepository} from '../../ports/persistence/repositories/edit-action.repository.port.js';
  import type {IdGenerationPort} from '../../ports/id-generation.port.js';
  import type {SubsystemBoundaryPathService} from '../../../domain/services/links/subsystem-boundary-path.service.js';
  import {ControlIntentPropagationService} from '../../../domain/services/control-links/control-intent-propagation.service.js';
  import {CreateControlSubsystemLinkSegmentCommand} from './create-control-subsystem-link-segment.command.js';

  /**
   * The three response shapes from §11.5.
   */
  export type CreateControlSubsystemLinkSegmentResult =
    | { systemId: number; type: 'ControlLink' }
    | { controlSubsystemLinkSegments: { systemId: number }[] }
    | { systemId: number; createdPortSystemId?: number };

  /**
   * Handler for `POST /arc-api/v1/projects/:projectId/control-subsystem-links`
   * (spec §11.4–§11.6).
   *
   * Branches on endpoint node types before any other validation:
   *   - Both module + same/null parent              → Branch A (ControlLink only)
   *   - Both module + different parents             → Branch B (ControlLink + chain CSLS)
   *   - At least one subsystem endpoint             → Branch C (single unresolved CSLS)
   *
   * Cross-cutting invariants:
   *   - peerA/peerB canonical ordering by lower `portSystemId` applied before
   *     every `ControlLink` write (§11.1 schema fix).
   *   - All writes inside one call share a single `groupId` so commit can
   *     correlate edits and roll back atomically.
   *   - Nothing here imports TypeORM; persistence comes through the injected
   *     ports declared in chapter 02-01.
   */
  export class CreateControlSubsystemLinkSegmentHandler implements CommandHandler<
    CreateControlSubsystemLinkSegmentCommand,
    CreateControlSubsystemLinkSegmentResult
  > {
    constructor(
      private readonly uow: UnitOfWork,
      private readonly nodeRepo: INodeRepository,
      private readonly controlPortRepo: IControlPortRepository,
      private readonly controlLinkRepo: IControlLinkRepository,
      private readonly cslsRepo: IControlSubsystemLinkSegmentRepository,
      private readonly editActionRepo: IEditActionRepository,
      private readonly idGen: IdGenerationPort,
      private readonly boundaryPath: SubsystemBoundaryPathService,
      private readonly intentPropagation: ControlIntentPropagationService,
    ) {}

    async handle(
      command: CreateControlSubsystemLinkSegmentCommand,
    ): Promise<CreateControlSubsystemLinkSegmentResult> {
      // 1. Session resolution per project: getActiveFileId + getActiveSessionId
      //    via SessionContext (same pattern as DeleteControlSubsystemLinkSegmentHandler).
      // 2. Load node-type map for both endpoints (and any boundary nodes).
      // 3. Branch dispatch (§11.6):
      //      Branch A — handleBothModuleSameParent(command, …)
      //      Branch B — handleBothModuleDifferentParents(command, …)
      //      Branch C — handleSubsystemEndpoint(command, …)
      // 4. Each branch produces its own response shape per §11.5.
      throw new Error('CreateControlSubsystemLinkSegmentHandler: branch implementations land in tasks 24–26.');
    }
  }
  ```

  The body is intentionally a `throw` — Tasks 24–26 replace it branch by branch. The constructor's full dependency list is locked in here so later tasks don't churn it.

- [ ] **Step 5: Register the handler**

  Modify `packages/core/src/application/orchestration/cqrs/registries/command-handler-registry.ts` to register `CreateControlSubsystemLinkSegmentCommand → CreateControlSubsystemLinkSegmentHandler` alongside the existing entries (follow the same factory pattern the sibling Delete chapter uses in Task 31). Wire all 9 constructor dependencies through `UnitOfWork`.

- [ ] **Step 6: Run the unit test to verify it passes**

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="create-control-subsystem-link-segment.handler"`

  Expected: PASS (the scaffolding test only exercises construction + command field assignment — it never calls `handle`).

- [ ] **Step 7: Commit**

  Use the `commit` skill to draft the commit message. Show the proposed message and the exact commands to the user and **wait for explicit confirmation** before running anything:

  ```bash
  git add packages/core/src/application/control-links/create-control-subsystem-link-segment/ \
          packages/core/src/application/orchestration/cqrs/registries/command-handler-registry.ts \
          packages/core/tests/unit/application/control-links/create-control-subsystem-link-segment/
  git commit -m "feat(application): scaffold CreateControlSubsystemLinkSegmentHandler" \
             -m "Adds the command + handler skeleton for POST /control-subsystem-links (spec §11.4–§11.6). Branch dispatch is stubbed; Branches A/B/C land in tasks 24–26." \
             -m "Signed-off-by: Nithin Simon <nsimon@qti.qualcomm.com>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.**

---

### Task 24: Branch A — both module endpoints, same/null `parentId`

**Package:** `@arc/core`

**Files:**
- Modify: `packages/core/src/application/control-links/create-control-subsystem-link-segment/create-control-subsystem-link-segment.handler.ts`
- Test: `packages/core/tests/unit/application/control-links/create-control-subsystem-link-segment/branch-a.spec.ts` (new)

- [ ] **Step 1: Write the failing Branch A unit test**

  Create `packages/core/tests/unit/application/control-links/create-control-subsystem-link-segment/branch-a.spec.ts`. Cover three concrete cases with full arrange/act/assert (skeleton fixture builders are acceptable — assertions must be concrete):

  - **Happy path:** both nodes are module nodes with `parentId === null`. After `handle()` the handler returns `{ systemId: <preassigned>, type: 'ControlLink' }`. Exactly one `ControlLink` CREATE edit action is recorded in `editActionRepo` with `change_status = STAGED`. The recorded payload uses canonical ordering: if the command had `nodeAPortSystemId = 5000`, `nodeBPortSystemId = 3000`, the recorded `ControlLink` row has `nodeAPortSystemId = 3000`, `nodeBPortSystemId = 5000`, and the peer node ids are swapped together.
  - **Reverse-direction duplicate:** a `ControlLink` row already exists (committed) with the canonical port pair. The handler throws an `ApplicationError` (or whichever 422 exception the project uses — match the data-link create handler if/when added; until then mirror the exception type used in chapter 03-02 Task 31). No edit action is recorded.
  - **Same-direction duplicate:** the existing `ControlLink` row is in the overlay (pending CREATE). Same 422; no edit action recorded.

- [ ] **Step 2: Run the test to verify it fails**

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="branch-a"`

  Expected: FAIL with `CreateControlSubsystemLinkSegmentHandler: branch implementations land in tasks 24–26.` (the stub from Task 23).

- [ ] **Step 3: Implement Branch A**

  Replace the `throw` in `handle()` with a dispatch that, when both endpoints are module nodes with the same `parentId` (or both `null`), runs Branch A:

  ```typescript
  // private — Branch A (§11.6 Branch A)
  private async handleBothModuleSameParent(
    command: CreateControlSubsystemLinkSegmentCommand,
    fileSystemId: number,
    sessionId: number,
    groupId: string,
  ): Promise<CreateControlSubsystemLinkSegmentResult> {
    // 1. Canonical ordering — swap peers as a pair if nodeAPortSystemId > nodeBPortSystemId.
    const {
      peerASystemId, peerBSystemId, peerAPortSystemId, peerBPortSystemId,
    } = canonicalizeControlLinkEndpoints({
      peerASystemId: command.peerNodeASystemId,
      peerBSystemId: command.peerNodeBSystemId,
      peerAPortSystemId: command.nodeAPortSystemId!,
      peerBPortSystemId: command.nodeBPortSystemId!,
    });

    // 2. Duplicate check on the canonical port pair — committed + overlay.
    const existing = await this.controlLinkRepo.findByCanonicalPortPair(
      peerAPortSystemId, peerBPortSystemId, fileSystemId, sessionId,
    );
    if (existing) {
      throw ApplicationError.unprocessableEntity(
        `Control link already exists between ports ${peerAPortSystemId} and ${peerBPortSystemId}.`,
      );
    }

    // 3. Compute linkType from subgraph membership (helper from existing data-link work).
    const linkType = await this.controlLinkRepo.computeLinkType(peerASystemId, peerBSystemId, fileSystemId, sessionId);

    // 4. Pre-assign a system_id and record the ControlLink CREATE.
    const newControlLinkSystemId = await this.idGen.next('control_links');
    await this.editActionRepo.recordCreate({
      groupId,
      entityName: 'ControlLink',
      systemId: newControlLinkSystemId,
      fileSystemId,
      sessionId,
      payload: {
        peerNodeASystemId: peerASystemId,
        peerNodeBSystemId: peerBSystemId,
        nodeAPortSystemId: peerAPortSystemId,
        nodeBPortSystemId: peerBPortSystemId,
        linkType,
        version: 1,
      },
    });

    return {systemId: newControlLinkSystemId, type: 'ControlLink'};
  }
  ```

  Also add the `canonicalizeControlLinkEndpoints` helper next to the handler (or import it from chapter 01-01 Task 2 if it's already been placed in a shared location — match whichever module the chapter 01-01 implementation chose).

- [ ] **Step 4: Run the test to verify it passes**

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="branch-a"`

  Expected: PASS — all three cases pass.

- [ ] **Step 5: Commit**

  Use the `commit` skill. Suggested message:

  ```bash
  git add packages/core/src/application/control-links/create-control-subsystem-link-segment/ \
          packages/core/tests/unit/application/control-links/create-control-subsystem-link-segment/branch-a.spec.ts
  git commit -m "feat(application): implement Branch A of CreateControlSubsystemLinkSegmentHandler" \
             -m "Both-module same-parent path: canonical port-pair ordering, overlay-aware duplicate check, ControlLink CREATE edit action (spec §11.6 Branch A)." \
             -m "Signed-off-by: Nithin Simon <nsimon@qti.qualcomm.com>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.**

---

### Task 25: Branch B — both module endpoints, different `parentId` values

**Package:** `@arc/core`

**Files:**
- Modify: `packages/core/src/application/control-links/create-control-subsystem-link-segment/create-control-subsystem-link-segment.handler.ts`
- Test: `packages/core/tests/unit/application/control-links/create-control-subsystem-link-segment/branch-b.spec.ts` (new)

- [ ] **Step 1: Write the failing Branch B unit test**

  Create `packages/core/tests/unit/application/control-links/create-control-subsystem-link-segment/branch-b.spec.ts`. Cover at minimum:

  - **Happy path — three-node chain (module → subsystem → module):** module endpoint intents `{1, 2}` match on both sides. After `handle()`:
    1. `controlSubsystemLinkSegments` array of two `{ systemId }` entries returned.
    2. One ControlPort CREATE edit action recorded for the intermediate subsystem node with `isStatic = false`, `portId = baseIndex + 1`.
    3. Two IntentRow CREATE edit actions recorded for that new port (one per intent in `{1, 2}`).
    4. One ControlLink CREATE edit action recorded, with canonical port pair (lower `portSystemId` first), `linkType` computed from subgraph membership.
    5. Two CSLS CREATE edit actions recorded, each with `controlLinkSystemId = <newControlLinkSystemId>`, the right port pair for each adjacent node pair, and `change_status = STAGED`.
    6. All seven edit actions share a single non-empty `groupId`.
  - **Module-intent mismatch:** module A has intents `{1, 2}`, module B has intents `{1}`. Handler throws 422 with message `"control port intents do not match"`. No edit actions recorded.
  - **Duplicate after canonicalisation:** an existing `ControlLink` matches the canonical port pair. 422; no edit actions recorded.

  Use the same `SubsystemBoundaryPathService` mock that the data-link create handler tests use (if it exists). If not, mock the `pathOutput.nodeSequence` directly with concrete node IDs.

- [ ] **Step 2: Run the test to verify it fails**

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="branch-b"`

  Expected: FAIL — Branch B not yet dispatched.

- [ ] **Step 3: Implement Branch B**

  Add a private method that handles the case "both endpoints are module nodes with different `parentId` values":

  ```typescript
  // private — Branch B (§11.6 Branch B)
  private async handleBothModuleDifferentParents(
    command: CreateControlSubsystemLinkSegmentCommand,
    fileSystemId: number,
    sessionId: number,
    groupId: string,
  ): Promise<CreateControlSubsystemLinkSegmentResult> {
    // 1. Canonicalise peerA/peerB (lower portSystemId first).
    const canon = canonicalizeControlLinkEndpoints({
      peerASystemId: command.peerNodeASystemId,
      peerBSystemId: command.peerNodeBSystemId,
      peerAPortSystemId: command.nodeAPortSystemId!,
      peerBPortSystemId: command.nodeBPortSystemId!,
    });

    // 2. Duplicate check on the canonicalised port pair.
    const existing = await this.controlLinkRepo.findByCanonicalPortPair(
      canon.peerAPortSystemId, canon.peerBPortSystemId, fileSystemId, sessionId,
    );
    if (existing) {
      throw ApplicationError.unprocessableEntity(
        `Control link already exists between ports ${canon.peerAPortSystemId} and ${canon.peerBPortSystemId}.`,
      );
    }

    // 3. Module-intent match — both module control ports must carry the same intent set.
    const aIntents = sortedIntentIds(await this.controlPortRepo.getIntentsByPortId(canon.peerAPortSystemId, sessionId));
    const bIntents = sortedIntentIds(await this.controlPortRepo.getIntentsByPortId(canon.peerBPortSystemId, sessionId));
    if (!intentSetsEqual(aIntents, bIntents)) {
      throw ApplicationError.unprocessableEntity('control port intents do not match');
    }

    // 4. Compute boundary node sequence.
    const parentMap = await this.nodeRepo.getNodeParentMap(fileSystemId);
    const pathOutput = this.boundaryPath.compute({
      sourceNodeId: canon.peerASystemId,
      destinationNodeId: canon.peerBSystemId,
      parentMap,
    });

    // 5. Create boundary control ports + propagate module intents to each.
    //    nodeSequence = [moduleA, subsystem1, subsystem2, …, moduleB]
    //    Intermediate nodes are at indices 1..length-2.
    const intermediate = pathOutput.nodeSequence.slice(1, -1);
    const intermediatePortIds: number[] = [];
    for (const subsystemNodeId of intermediate) {
      const baseIndex = await this.controlPortRepo.countByNode(subsystemNodeId, fileSystemId, sessionId);
      const portId = baseIndex + 1;
      const newPortSystemId = await this.idGen.next('control_ports');
      await this.editActionRepo.recordCreate({
        groupId,
        entityName: 'ControlPort',
        systemId: newPortSystemId,
        fileSystemId,
        sessionId,
        payload: {
          nodeSystemId: subsystemNodeId,
          portId,
          isStatic: false,
          version: 1,
        },
      });
      for (const intentId of aIntents) {
        const newIntentRowSystemId = await this.idGen.next('intents');
        await this.editActionRepo.recordCreate({
          groupId,
          entityName: 'IntentRow',
          systemId: newIntentRowSystemId,
          fileSystemId,
          sessionId,
          payload: {
            controlPortSystemId: newPortSystemId,
            intentId,
            version: 1,
          },
        });
      }
      intermediatePortIds.push(newPortSystemId);
    }

    // 6. Pre-assign ControlLink system_id + compute linkType.
    const newControlLinkSystemId = await this.idGen.next('control_links');
    const linkType = await this.controlLinkRepo.computeLinkType(
      canon.peerASystemId, canon.peerBSystemId, fileSystemId, sessionId,
    );

    // 7. Record the ControlLink CREATE (canonical ports).
    await this.editActionRepo.recordCreate({
      groupId,
      entityName: 'ControlLink',
      systemId: newControlLinkSystemId,
      fileSystemId,
      sessionId,
      payload: {
        peerNodeASystemId: canon.peerASystemId,
        peerNodeBSystemId: canon.peerBSystemId,
        nodeAPortSystemId: canon.peerAPortSystemId,
        nodeBPortSystemId: canon.peerBPortSystemId,
        linkType,
        version: 1,
      },
    });

    // 8. For each adjacent pair (nodeA, nodeB) in nodeSequence, record a CSLS CREATE.
    //    First pair: source module port + first boundary port.
    //    Intermediate pairs: boundary port (i) + boundary port (i+1).
    //    Last pair: last boundary port + destination module port.
    const allPortIds: number[] = [canon.peerAPortSystemId, ...intermediatePortIds, canon.peerBPortSystemId];
    const cslsSystemIds: number[] = [];
    for (let i = 0; i < pathOutput.nodeSequence.length - 1; i++) {
      const portOnA = allPortIds[i];
      const portOnB = allPortIds[i + 1];
      const newCslsSystemId = await this.idGen.next('control_subsystem_link_segments');
      await this.editActionRepo.recordCreate({
        groupId,
        entityName: 'ControlSubsystemLinkSegment',
        systemId: newCslsSystemId,
        fileSystemId,
        sessionId,
        payload: {
          peerNodeASystemId: pathOutput.nodeSequence[i],
          peerNodeBSystemId: pathOutput.nodeSequence[i + 1],
          nodeAPortSystemId: portOnA,
          nodeBPortSystemId: portOnB,
          controlLinkSystemId: newControlLinkSystemId,
          version: 1,
        },
      });
      cslsSystemIds.push(newCslsSystemId);
    }

    return {controlSubsystemLinkSegments: cslsSystemIds.map((systemId) => ({systemId}))};
  }
  ```

  Also add the small helpers `sortedIntentIds(rows)` and `intentSetsEqual(a, b)` next to the handler.

- [ ] **Step 4: Run the test to verify it passes**

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="branch-b"`

  Expected: PASS — all three cases pass.

- [ ] **Step 5: Commit**

  Use the `commit` skill. Suggested message:

  ```bash
  git add packages/core/src/application/control-links/create-control-subsystem-link-segment/ \
          packages/core/tests/unit/application/control-links/create-control-subsystem-link-segment/branch-b.spec.ts
  git commit -m "feat(application): implement Branch B of CreateControlSubsystemLinkSegmentHandler" \
             -m "Both-module different-parent path: SubsystemBoundaryPathService chain, boundary ControlPort + IntentRow CREATEs with module-intent propagation, ControlLink CREATE, per-pair CSLS CREATEs — all sharing groupId (spec §11.6 Branch B)." \
             -m "Signed-off-by: Nithin Simon <nsimon@qti.qualcomm.com>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.**

---

### Task 26: Branch C — at least one subsystem endpoint

**Package:** `@arc/core`

**Files:**
- Modify: `packages/core/src/application/control-links/create-control-subsystem-link-segment/create-control-subsystem-link-segment.handler.ts`
- Test: `packages/core/tests/unit/application/control-links/create-control-subsystem-link-segment/branch-c.spec.ts` (new)

- [ ] **Step 1: Write the failing Branch C unit test**

  Create `packages/core/tests/unit/application/control-links/create-control-subsystem-link-segment/branch-c.spec.ts`. Cover the §11.6 Branch C cases:

  - **Same-side violation (outer):** a boundary control port is already used by an existing CSLS on the outer side; adding a second outer-side CSLS through the same port → 422 `"control port already connected on the outer side."`. No edit actions recorded.
  - **Same-side violation (inner):** symmetric inner-side case.
  - **Mixed sides allowed:** existing CSLS on the inner side + new CSLS on the outer side through the same port → success.
  - **Both empty subsystem ports → 422 `"must start from a module control port — cannot connect two empty subsystem ports"`**.
  - **Mismatched non-empty intent sets → 422 `"control port intents do not match"`**.
  - **Propagation: module → empty subsystem port:** records IntentRow CREATEs on the subsystem endpoint with the module's intent set. Then `cascadePropagate` reaches additional empty subsystem ports through the existing CSLS graph; IntentRow CREATEs are also recorded for those ports, all sharing the same `groupId` as the new CSLS CREATE.
  - **Cascade stops at populated subsystem port:** if a downstream subsystem port already has intents, cascade does not overwrite or extend past it.
  - **Inline port creation:** the subsystem endpoint's `nodeBPortSystemId` is `undefined`; the handler creates a new control port (counts existing committed + overlay → `baseIndex`, `portId = baseIndex + 1`), records a `ControlPort CREATE` with `isStatic = false`, and returns `{ systemId, createdPortSystemId: <new> }`.

- [ ] **Step 2: Run the test to verify it fails**

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="branch-c"`

  Expected: FAIL — Branch C not yet dispatched.

- [ ] **Step 3: Implement Branch C**

  Add a private method that handles "at least one endpoint is a subsystem node":

  ```typescript
  // private — Branch C (§11.6 Branch C)
  private async handleSubsystemEndpoint(
    command: CreateControlSubsystemLinkSegmentCommand,
    fileSystemId: number,
    sessionId: number,
    groupId: string,
    nodeTypeMap: Map<number, NodeType>,
  ): Promise<CreateControlSubsystemLinkSegmentResult> {
    // 1. Identify which endpoint(s) are subsystem-side.
    // 2. Topology-aware same-side check (per subsystem-side port):
    //    - Get all existing CSLS through that port via cslsRepo.getByPortId.
    //    - For the proposed new CSLS: classify side relative to SubsystemX by
    //      walking the parentId chain of the OTHER endpoint upward. If SubsystemX
    //      appears in the chain, the new connection is on the inner side; else outer.
    //    - For each existing CSLS through the same port: classify its other
    //      endpoint the same way. If any existing CSLS shares the side, throw 422
    //      "control port already connected on the [inner|outer] side."
    //    - A port may have one inner + one outer simultaneously — only same-side
    //      collisions are rejected.
    // 3. Intent validation table (§11.6 Branch C step 2):
    //    Determine each endpoint's intent set (committed IntentRows + overlay for that port).
    //      - Both empty → 422 "must start from a module control port — cannot connect two empty subsystem ports".
    //      - Both non-empty + same set → ok, no propagation.
    //      - Both non-empty + different set → 422 "control port intents do not match".
    //      - One non-empty, one empty → record IntentRow CREATEs on the empty port
    //        (sharing groupId), then call intentPropagation.cascadePropagate to
    //        flood-fill all empty subsystem ports reachable through the existing
    //        + new CSLS graph, recording IntentRow CREATEs for each.
    // 4. Inline port creation (if the subsystem-side `portSystemId` was omitted):
    //    - baseIndex = controlPortRepo.countByNode(subsystemNodeId, fileSystemId, sessionId)
    //    - portId = baseIndex + 1
    //    - new portSystemId via idGen
    //    - record ControlPort CREATE (isStatic = false, no intents, change_status STAGED)
    //    - capture as `createdPortSystemId` for the response.
    // 5. Pre-assign CSLS systemId. Record CSLS CREATE with controlLinkSystemId = null,
    //    change_status STAGED, using the resolved (or just-created) portSystemIds.
    // 6. Return { systemId, createdPortSystemId? } per §11.5 — `createdPortSystemId`
    //    is present only when step 4 created a port.

    throw new Error('Branch C — implement the steps above. Use the same overlay-aware reads as Branch B; reuse `canonicalize…` only on resolved chains (Step A' at commit), not on per-segment writes — segments preserve user-supplied A/B order per §11.2.');
  }
  ```

  Helpers introduced for this branch:

  - `classifySide(subsystemNodeId, otherEndpointNodeId, parentMap): 'inner' | 'outer'` — walks `parentId` of the other endpoint upward; returns `'inner'` if `subsystemNodeId` appears in the chain, else `'outer'`.
  - `allPortIntentMap(...)`: builds the `Map<portSystemId, number[]>` needed by `ControlIntentPropagationService.cascadePropagate` from the committed IntentRows + overlay.

  All edit actions written here share the single `groupId` allocated at the top of `handle()`.

  Implement the full body per the numbered comments, then run the test to verify PASS.

- [ ] **Step 4: Run the test to verify it passes**

  Run: `pnpm --filter @arc/core run test:unit:core -- --testPathPattern="branch-c"`

  Expected: PASS — all listed Branch C cases pass.

- [ ] **Step 5: Commit**

  Use the `commit` skill. Suggested message:

  ```bash
  git add packages/core/src/application/control-links/create-control-subsystem-link-segment/ \
          packages/core/tests/unit/application/control-links/create-control-subsystem-link-segment/branch-c.spec.ts
  git commit -m "feat(application): implement Branch C of CreateControlSubsystemLinkSegmentHandler" \
             -m "Subsystem-endpoint path: topology-aware same-side check, intent validation table, cascade propagation via ControlIntentPropagationService, optional inline boundary ControlPort creation, single unresolved CSLS CREATE (spec §11.6 Branch C)." \
             -m "Signed-off-by: Nithin Simon <nsimon@qti.qualcomm.com>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.**

---

### Task 27: REST controller + DTOs for `POST /control-subsystem-links`

**Package:** `@arc/api`

**Files:**
- Create: `packages/api/src/usecase-designer/control-links/control-subsystem-links.controller.ts`
- Create: `packages/api/src/usecase-designer/control-links/dto/create-control-subsystem-link.dto.ts`
- Create: `packages/api/src/usecase-designer/control-links/dto/create-control-subsystem-link.response.ts`
- Modify: the NestJS module that owns control-link endpoints — register the new controller.
- Test: `packages/api/tests/integration/control-links/create-control-subsystem-link.controller.spec.ts` (new — controller-level integration test with mocked handler)

- [ ] **Step 1: Write the failing controller integration test**

  Create `packages/api/tests/integration/control-links/create-control-subsystem-link.controller.spec.ts`. Cover:

  - `POST /arc-api/v1/projects/1/control-subsystem-links` with both-module same-parent payload → handler returns `{ systemId: 9001, type: 'ControlLink' }`; response body is `{ systemId: 9001, type: 'ControlLink' }`; HTTP 201.
  - Both-module different-parent payload → handler returns `{ controlSubsystemLinkSegments: [{systemId: 8001}, {systemId: 8002}] }`; same shape in the response; HTTP 201.
  - Subsystem-endpoint payload (with `nodeBPortSystemId` omitted) → handler returns `{ systemId: 7001, createdPortSystemId: 7100 }`; same shape in the response; HTTP 201.
  - Body validation: missing `peerNodeASystemId` → HTTP 400 with a Nest validation error (DTO uses `class-validator`).

  Mock `CreateControlSubsystemLinkSegmentHandler` and assert it was called with the expected `CreateControlSubsystemLinkSegmentCommand` payload (including `projectId` from the route).

- [ ] **Step 2: Run the test to verify it fails**

  Run: `pnpm --filter @arc/api run test:integration -- --testPathPattern="create-control-subsystem-link.controller"`

  Expected: FAIL — controller module not found.

- [ ] **Step 3: Implement the DTO**

  Create `packages/api/src/usecase-designer/control-links/dto/create-control-subsystem-link.dto.ts`:

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  import {IsInt, IsOptional, Min} from 'class-validator';
  import {Type} from 'class-transformer';

  export class CreateControlSubsystemLinkDto {
    @IsInt() @Min(1) @Type(() => Number)
    peerNodeASystemId!: number;

    @IsInt() @Min(1) @Type(() => Number)
    peerNodeBSystemId!: number;

    @IsOptional() @IsInt() @Min(1) @Type(() => Number)
    nodeAPortSystemId?: number;

    @IsOptional() @IsInt() @Min(1) @Type(() => Number)
    nodeBPortSystemId?: number;
  }
  ```

- [ ] **Step 4: Implement the response type**

  Create `packages/api/src/usecase-designer/control-links/dto/create-control-subsystem-link.response.ts`:

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  export type CreateControlSubsystemLinkResponse =
    | {systemId: number; type: 'ControlLink'}
    | {controlSubsystemLinkSegments: {systemId: number}[]}
    | {systemId: number; createdPortSystemId?: number};
  ```

- [ ] **Step 5: Implement the controller**

  Create `packages/api/src/usecase-designer/control-links/control-subsystem-links.controller.ts`:

  ```typescript
  /*
   * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
   * SPDX-License-Identifier: BSD-3-Clause
   */

  import {Body, Controller, Param, ParseIntPipe, Post} from '@nestjs/common';
  import {CommandBus} from '@nestjs/cqrs';
  import {CreateControlSubsystemLinkSegmentCommand} from '@arc/core';
  import {CreateControlSubsystemLinkDto} from './dto/create-control-subsystem-link.dto.js';
  import type {CreateControlSubsystemLinkResponse} from './dto/create-control-subsystem-link.response.js';

  @Controller('arc-api/v1/projects/:projectId/control-subsystem-links')
  export class ControlSubsystemLinksController {
    constructor(private readonly commandBus: CommandBus) {}

    @Post()
    async create(
      @Param('projectId', ParseIntPipe) projectId: number,
      @Body() dto: CreateControlSubsystemLinkDto,
    ): Promise<CreateControlSubsystemLinkResponse> {
      return this.commandBus.execute(
        new CreateControlSubsystemLinkSegmentCommand({
          projectId,
          peerNodeASystemId: dto.peerNodeASystemId,
          peerNodeBSystemId: dto.peerNodeBSystemId,
          nodeAPortSystemId: dto.nodeAPortSystemId,
          nodeBPortSystemId: dto.nodeBPortSystemId,
        }),
      );
    }
  }
  ```

  Register the controller in whichever NestJS module the existing data-link controllers live in (follow the pattern from chapter 03-02 Task 35 — DI wiring is parallel).

- [ ] **Step 6: Run the test to verify it passes**

  Run: `pnpm --filter @arc/api run test:integration -- --testPathPattern="create-control-subsystem-link.controller"`

  Expected: PASS — all four cases pass.

- [ ] **Step 7: Commit**

  Use the `commit` skill. Suggested message:

  ```bash
  git add packages/api/src/usecase-designer/control-links/ \
          packages/api/tests/integration/control-links/create-control-subsystem-link.controller.spec.ts
  git commit -m "feat(api): add POST /control-subsystem-links endpoint" \
             -m "Wires the new CreateControlSubsystemLinkSegment command to a REST controller with the three response shapes from spec §11.5 and class-validator DTO." \
             -m "Signed-off-by: Nithin Simon <nsimon@qti.qualcomm.com>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.**

---

### Task 28: End-to-end integration test for the Create handler against an in-memory edit session

**Package:** `@arc/core` (or `@arc/persistence` — wherever the existing handler integration harness lives; match the location chapter 03-02 Task 35 used)

**Files:**
- Test: `packages/core/tests/integration/control-links/create-control-subsystem-link.handler.spec.ts` (new)

- [ ] **Step 1: Write the failing end-to-end handler integration test**

  Use the existing in-memory edit-session test harness. Cover the §11.12 integration matrix entries for `CreateControlSubsystemLinkSegmentHandler`:

  - **Branch A** — `{ systemId, type: 'ControlLink' }` with canonical ordering preserved across reverse-direction input; reverse-direction duplicate (P1→P2 then P2→P1) → 422.
  - **Branch B** — `controlSubsystemLinkSegments` array returned; intermediate boundary ports each carry one IntentRow CREATE per module-endpoint intent; matching module intents pass; mismatch → 422 `"control port intents do not match"`.
  - **Branch C — module → empty subsystem:** caller-provided `nodeBPortSystemId` is an empty subsystem port; IntentRow CREATEs propagate to it and the cascade fills all empty subsystem ports reachable through the existing CSLS graph; no module-boundary crossings.
  - **Branch C — subsystem-to-subsystem carrying intents:** both endpoint ports already carry the same intent set; CSLS CREATE recorded, no IntentRow CREATEs added.
  - **Branch C — both empty:** 422 with the spec's exact message.
  - **Branch C — same-side violation:** existing CSLS already occupies the outer side of the boundary port → 422 `"control port already connected on the outer side."`.

  Each assertion inspects the recorded edit-action set (not committed rows) — the create handler is overlay-only.

- [ ] **Step 2: Run the test to verify it fails**

  Run: `pnpm --filter @arc/core run test:integration -- --testPathPattern="create-control-subsystem-link.handler"`

  Expected: FAIL — at least one case fails until all of Tasks 24–26 are committed; if Tasks 24–26 are already merged, expect PASS immediately, in which case this task is purely a regression-guard checkpoint and you may skip directly to Step 4.

- [ ] **Step 3: Adjust any branch implementations the test surfaces**

  If a case fails, the most likely causes are: missing canonical ordering on a non-Branch-A path, a wrong `groupId` not being shared, or the `cascadePropagate` call being passed the pre-write CSLS graph instead of the graph that includes the new CSLS. Fix in the relevant branch method from Tasks 24–26, not in the test, and re-run.

- [ ] **Step 4: Run the test to verify it passes**

  Run: `pnpm --filter @arc/core run test:integration -- --testPathPattern="create-control-subsystem-link.handler"`

  Expected: PASS — every case in the §11.12 integration matrix passes.

- [ ] **Step 5: Commit**

  Use the `commit` skill. Suggested message:

  ```bash
  git add packages/core/tests/integration/control-links/create-control-subsystem-link.handler.spec.ts
  git commit -m "test(application): integration coverage for CreateControlSubsystemLinkSegmentHandler" \
             -m "Exercises all three branches end-to-end against the in-memory edit-session harness — canonical ordering, chain creation with intent propagation, same-side check, cascade propagation, and the four 422 paths from spec §11.6." \
             -m "Signed-off-by: Nithin Simon <nsimon@qti.qualcomm.com>"
  ```

  **STOP — do not run `git commit` until the user explicitly approves the message.**

---
