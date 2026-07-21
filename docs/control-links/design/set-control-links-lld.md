<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Set Control Links — LLD

**Status:** Draft
**Date:** 2026-08-19

**Requirements:** [`../requirements/control-links-api-requirements.md`](../requirements/control-links-api-requirements.md)

---

## 1. Scope

This document specifies the implementation design for:

- `POST /arc-api/v1/projects/:projectId/control-links` — flat module-only view
- `POST /arc-api/v1/projects/:projectId/control-links/with-subsystems` — accepts module or subsystem endpoints

Both endpoints execute the same write path via `CreateControlLinkHandler`. The only difference is the
response DTO shape and which validation branch is applied to endpoint node types.

**Out of scope for this design:** `DELETE`, `PATCH`, `GET`, and `POST /query` endpoints; FR-CL-08 intent
propagation cascade (deferred follow-on); FR-CL-06 soft-delete re-activation is designed but marked
as a follow-on implementation.

---

## 2. Architecture Overview

No new layers. The design adds:

- One domain service moved to a shared location (`SubsystemBoundaryPathService`)
- One new domain factory (`ControlLinkSclFactory`)
- Five new methods on the `ControlLinkRepository` port
- Two new methods on the `NodeQueryService` port + one additional method
- `CreateControlLinkCommand` updated (add `isInterUsecase`, `parentSystemId`; remove `isDangling`)
- `CreateControlLinkHandler` implemented (was a stub)
- Request DTO updated

```
@arc/api
  ControlLinkController
    POST /control-links              → CreateControlLinkCommand (allowModulesOnly = true)
    POST /control-links/with-subsystems → CreateControlLinkCommand (allowModulesOnly = false)
          │ commandBus.execute(...)
          ▼
@arc/core (application)
  CreateControlLinkHandler
    ├── NodeQueryService.findNodeById            (node type + parentId lookup)
    ├── NodeQueryService.getAllNodeParentMap      (for SubsystemBoundaryPathService)
    ├── NodeQueryService.getIntentsByPortSystemIds (intent resolution from existing links)
    ├── SpfModuleQueryService.findOne            (controlPorts + subgraphId)
    ├── ControlLinkRepository.getLinksByPortSystemIds  (existing)
    ├── ControlLinkRepository.findNonDeletedByPortPair (new)
    ├── ControlLinkRepository.createControlLink  (new)
    ├── ControlLinkRepository.createSubsystemControlLink (new)
    ├── ControlLinkRepository.patchControlLink   (new — for re-activation)
    ├── IdGenerationPort
    └── UnitOfWork
@arc/core (domain)
  SubsystemBoundaryPathService (moved from subsystem-data-links/ to shared/)
  ControlLinkSclFactory (new)
@arc/persistence
  TypeOrmControlLinkRepository (implement new methods)
  DbNodeQueryService (implement new methods)
```

---

## 3. Domain Layer Changes

### 3.1 Move SubsystemBoundaryPathService

**Current:** `packages/core/src/domain/services/subsystem-data-links/subsystem-boundary-path.service.ts`
**New:** `packages/core/src/domain/services/shared/subsystem-boundary-path.service.ts`

The service is a stateless pure-function object (`as const`). No logic changes.

Update all existing import sites:
- `packages/core/src/application/file-operations/upload-file/services/entity-builders/subsystem-builder.ts`
- Any barrel re-exports from `subsystem-data-links/`

The `subsystem-data-links/` folder retains `datalink-chain-resolution.service.ts`.

### 3.2 New: ControlLinkSclFactory

**File (new):** `packages/core/src/domain/services/subsystem-control-links/control-link-scl-factory.ts`

A stateless pure-function object that, given a canonicalized control link and a full
`nodeParentMap`, computes the ordered intermediate-node sequence for SCL segment creation.

```typescript
export interface SclFactoryInput {
  nodeASystemId: number;
  nodeBSystemId: number;
  nodeParentMap: Map<number, number | null>;
}

export interface SclSegmentSpec {
  peerNodeASystemId: number;
  peerNodeBSystemId: number;
  isFirstSegment: boolean;  // uses the link's actual nodeAPortSystemId for port A
  isLastSegment: boolean;   // uses the link's actual nodeBPortSystemId for port B
  intermediateSubsystemNodeId?: number; // set when neither endpoint is the module
}

export interface SclFactoryOutput {
  /** Ordered nodeSequence from SubsystemBoundaryPathService output.
   *  Length <= 2 means no SCL needed (same-parent context). */
  nodeSequence: number[];
}

export const ControlLinkSclFactory = {
  compute(input: SclFactoryInput): SclFactoryOutput {
    const path = SubsystemBoundaryPathService.compute({
      sourceNodeId: input.nodeASystemId,
      destNodeId: input.nodeBSystemId,
      nodeParentMap: input.nodeParentMap,
    });
    return { nodeSequence: path.nodeSequence };
  },
} as const;
```

The factory only computes the node sequence. The handler walks this sequence to allocate IDs and
stage boundary `ControlPort` + `Intent` + `SubsystemControlLink` CREATE rows.

---

## 4. Port Interface Changes (`@arc/core`)

### 4.1 ControlLinkRepository — five new methods

**File:** `packages/core/src/application/ports/persistence/repositories/control-link/control-link.repository.ts`

```typescript
export interface ControlLinkRepository {
  // existing
  getLinksByPortSystemIds(portSystemIds: number[], fileSystemId: number): Promise<{linkSystemId: number; portSystemId: number}[]>;

  // new
  /** Overlay-aware lookup. Returns null if not found or soft-deleted. */
  findNonDeletedByPortPair(
    nodeAPortSystemId: number,
    nodeBPortSystemId: number,
    fileSystemId: number,
  ): Promise<ControlLink | null>;

  /** Overlay-aware lookup. Returns null if the row is not present or not soft-deleted. */
  findSoftDeletedByPortPair(
    nodeAPortSystemId: number,
    nodeBPortSystemId: number,
    fileSystemId: number,
  ): Promise<ControlLink | null>;

  /** Stage a CREATE edit-action for a ControlLink row. */
  createControlLink(link: ControlLink, options?: EditOptions): Promise<void>;

  /** Stage a CREATE edit-action for a SubsystemControlLink row. */
  createSubsystemControlLink(
    scl: SubsystemControlLinkSpec,
    options?: EditOptions,
  ): Promise<void>;

  /** Stage an accumulator-mode UPDATE on a ControlLink row (for re-activation). */
  patchControlLink(
    systemId: number,
    delta: ControlLinkDelta,
    options?: EditOptions,
  ): Promise<void>;
}

export interface SubsystemControlLinkSpec {
  systemId: number;
  peerNodeASystemId: number;
  peerNodeBSystemId: number;
  nodeAPortSystemId: number;
  nodeBPortSystemId: number;
  controlLinkSystemId: number;
  fileSystemId: number;
}

export type ControlLinkDelta = Partial<Pick<ControlLink, 'heapId' | 'linkType'>>;
```

### 4.2 NodeQueryService — three new methods

**File:** `packages/core/src/application/ports/persistence/query-services/node/node-query-service.ts`

```typescript
export interface NodeQueryService {
  // existing
  getDataPorts(nodeSystemId: number, fileSystemId: number): Promise<Result<DataPortReadModel[]>>;
  getControlPorts(nodeSystemId: number, fileSystemId: number): Promise<Result<ControlPortReadModel[]>>;

  // new
  /** Overlay-aware single-node lookup. Returns null if not found. */
  findNodeById(
    nodeSystemId: number,
    fileSystemId: number,
  ): Promise<Result<{systemId: number; type: NodeType; parentId: number | null} | null>>;

  /** Returns the full nodeSystemId → parentSystemId map for all nodes in the file.
   *  Used to build the input for SubsystemBoundaryPathService. */
  getAllNodeParentMap(
    fileSystemId: number,
  ): Promise<Result<Map<number, number | null>>>;

  /** Returns allocated intent IDs (after overlay) keyed by portSystemId.
   *  Ports with no intents are absent from the returned map. */
  getIntentsByPortSystemIds(
    portSystemIds: number[],
    fileSystemId: number,
  ): Promise<Result<Map<number, IntentReadModel[]>>>;
}
```

---

## 5. Command Update

**File:** `packages/core/src/application/usecase-designer/control-links/create/create-control-link.command.ts`

```typescript
export class CreateControlLinkCommand extends BaseCommand {
  constructor(
    public readonly peerNodeASystemId: number,
    public readonly nodeAPortSystemId: number,
    public readonly peerNodeBSystemId: number,
    public readonly nodeBPortSystemId: number,
    public readonly heapId: number,
    public readonly isInterUsecase: boolean,         // replaces isDangling
    public readonly parentSystemId?: number,         // optional subsystem scope
    public readonly allowModulesOnly: boolean = false, // true for POST /control-links
  ) {
    super();
  }
}
```

Remove `isDangling` from the command and all references.

---

## 6. CreateControlLinkHandler

**File:** `packages/core/src/application/usecase-designer/control-links/create/create-control-link.handler.ts`

Returns `ComponentsReadModel`. All failures throw domain exceptions; the `CommandBus` exception filter
maps them to HTTP status codes.

### 6.1 Execution Sequence

```
handle(command):
  1. uow.startTransaction()
  try:
    { session, groupId } = uow.getWriteContext()
    fileSystemId = session.fileSystemId

    ── VALIDATION ──────────────────────────────────────────────────────────────

    2. [FR-CL-02] Self-loop check:
       if command.peerNodeASystemId === command.peerNodeBSystemId
         → throw DomainRuleViolationException

    3. [FR-CL-03 / FR-CLS-06] Node existence:
       nodeA = nodeQueryService.findNodeById(command.peerNodeASystemId, fileSystemId)
       nodeB = nodeQueryService.findNodeById(command.peerNodeBSystemId, fileSystemId)
       if null → throw ResourceNotFoundException

    4. [FR-CL-03] Flat-view subsystem rejection:
       if command.allowModulesOnly && (nodeA.type === 'subsystem' || nodeB.type === 'subsystem')
         → throw DomainRuleViolationException

    5. [FR-CL-04] Port existence and ownership:
       [For module nodes] spfModuleA = spfModuleQueryService.findOne(peerNodeASystemId, fileSystemId)
       portA = spfModuleA.controlPorts.find(p => p.systemId === command.nodeAPortSystemId)
       if !portA → throw ResourceNotFoundException
       [For subsystem nodes] use nodeQueryService.getControlPorts to verify port existence

    6. Same for portB / peerNodeBSystemId.

    ── CANONICAL ORDERING ──────────────────────────────────────────────────────

    7. [FR-CL-11] Canonical port pair (invariant I1):
       if command.nodeAPortSystemId < command.nodeBPortSystemId:
         nodeAPort = command.nodeAPortSystemId, nodeBPort = command.nodeBPortSystemId
         canonicalNodeA = command.peerNodeASystemId, canonicalNodeB = command.peerNodeBSystemId
       else:
         nodeAPort = command.nodeBPortSystemId, nodeBPort = command.nodeAPortSystemId
         canonicalNodeA = command.peerNodeBSystemId, canonicalNodeB = command.peerNodeASystemId

    ── DUPLICATE / RE-ACTIVATION CHECK ─────────────────────────────────────────

    8. [FR-CL-05] Duplicate check:
       existingLink = controlLinkRepo.findNonDeletedByPortPair(nodeAPort, nodeBPort, fileSystemId)
       if existingLink → throw ConflictException (HTTP 409)

    9. [FR-CL-06] Soft-delete re-activation (deferred implementation; design included):
       softDeletedLink = controlLinkRepo.findSoftDeletedByPortPair(nodeAPort, nodeBPort, fileSystemId)
       if softDeletedLink:
         await controlLinkRepo.patchControlLink(softDeletedLink.systemId, {}, { source: SOURCE.Manual })
         createdLinkSystemId = softDeletedLink.systemId
         goto step 14 (intent re-propagation)

    ── INTENT RESOLUTION ───────────────────────────────────────────────────────

    10. [FR-CL-07 / FR-CLS-04] Intent resolution:
        linksAtPortA = controlLinkRepo.getLinksByPortSystemIds([nodeAPort], fileSystemId)
        linksAtPortB = controlLinkRepo.getLinksByPortSystemIds([nodeBPort], fileSystemId)

        if linksAtPortA.length > 0:
          portAIntentMap = nodeQueryService.getIntentsByPortSystemIds([nodeAPort], fileSystemId)
          intentsA = portAIntentMap.get(nodeAPort) ?? []
        else if nodeA.type === 'module':
          intentsA = portA.allocatedIntents.map(i => i.intentId)  // from SpfModuleReadModel
        else:
          intentsA = []  // subsystem port, no existing link → no inherent intents (FR-CLS-04)

        Same for intentsB.

        [FR-CLS-04 subsystem-only empty case]:
        if intentsA.length === 0 && intentsB.length === 0:
          resolvedIntentIds = []  // allowed — will be wired in later

        else if intentsA.length === 0 || intentsB.length === 0:
          resolvedIntentIds = intentsA.length > 0 ? intentsA : intentsB
          // subsystem inherits from the side that has intents

        else:
          resolvedIntentIds = intersection(intentsA, intentsB)
          if resolvedIntentIds.length === 0 → throw DomainRuleViolationException (FR-CL-07 step 3)

        if nodeA.type === 'module' && resolvedIntentIds.length === 0 → throw DomainRuleViolationException

    ── LINK TYPE DERIVATION ─────────────────────────────────────────────────────

    11. [FR-CL-10] LinkType:
        subgraphA = spfModuleA.subgraphId  (or 0 for subsystem nodes)
        subgraphB = spfModuleB.subgraphId

        if command.isInterUsecase:
          Verify nodeA and nodeB do NOT share a common usecase → if they do → throw DomainRuleViolationException
          linkType = LINK_TYPE.InterUsecase
        else:
          Verify nodeA and nodeB are NOT in different usecases → if they are → throw DomainRuleViolationException
          linkType = subgraphA === subgraphB ? LINK_TYPE.IntraSubgraph : LINK_TYPE.IntraUsecase

    ── CONNECTION TYPE DERIVATION ────────────────────────────────────────────────

    12. [FR-CLS-05] ConnectionType (for with-subsystems endpoint; stored on no table — derived at read time):
        Computed in the controller response mapper from node types, not stored.

    ── PERSIST CONTROL LINK ─────────────────────────────────────────────────────

    13. [FR-CL-14] Create ControlLink row:
        newSystemId = idGeneration.getNextId(fileSystemId)
        controlLink = new ControlLink(
          newSystemId, fileSystemId,
          canonicalNodeA, canonicalNodeB,
          nodeAPort, nodeBPort,
          command.heapId,
          linkType,
          subgraphA, subgraphB,
        )
        await controlLinkRepo.createControlLink(controlLink, { source: SOURCE.Manual })
        createdLinkSystemId = newSystemId

    ── STAGE INTENT ROWS ────────────────────────────────────────────────────────

    14. [FR-CL-07] Stage Intent CREATE rows:
        For each intentId in resolvedIntentIds:
          intentSysIdA = idGeneration.getNextId(fileSystemId)
          Stage CREATE for Intent: { systemId: intentSysIdA, intentId, controlPortSystemId: nodeAPort }
          intentSysIdB = idGeneration.getNextId(fileSystemId)
          Stage CREATE for Intent: { systemId: intentSysIdB, intentId, controlPortSystemId: nodeBPort }

    ── SCL CREATION (cross-boundary links) ──────────────────────────────────────

    15. [FR-CL-12] SubsystemControlLink segments:
        nodeParentMap = nodeQueryService.getAllNodeParentMap(fileSystemId)
        sclOutput = ControlLinkSclFactory.compute({ nodeASystemId: canonicalNodeA, nodeBSystemId: canonicalNodeB, nodeParentMap })

        if sclOutput.nodeSequence.length > 2:
          // Walk the sequence pairwise to create boundary ports + SCL segments
          // (see §6.2 below)

    ── COMMIT + READ BACK ───────────────────────────────────────────────────────

    16. await uow.commit()

    17. Return ComponentsReadModel:
        controlLinks: [{ systemId: createdLinkSystemId, peerNodeASystemId: canonicalNodeA,
                          peerNodeBSystemId: canonicalNodeB, nodeAPortSystemId: nodeAPort,
                          nodeBPortSystemId: nodeBPort, heapId: command.heapId, linkType }]
        modules: []
        dataLinks: []

  catch (e):
    if uow.isInTransaction(): await uow.rollback()
    throw e
```

### 6.2 SCL + Boundary Port Staging

For a cross-boundary link, `nodeSequence = [moduleA, ss1, ss2, ..., moduleB]`.

Walk `nodeSequence` pairwise (`nodeSequence[i]` → `nodeSequence[i+1]`), tracking a running
`allPortIds` array that starts with `[nodeAPort]` and ends with `[nodeBPort]`:

```
allPortIds = [nodeAPort]

for i in 0..nodeSequence.length-2:
  currentNode = nodeSequence[i]
  nextNode    = nodeSequence[i+1]

  // Determine port on nextNode for this segment:
  if i === nodeSequence.length - 2:
    // Last segment — the final node is the destination module; use its actual port
    portOnNextNode = nodeBPort
  else:
    // nextNode is an intermediate subsystem — create a new boundary ControlPort
    existingPorts = nodeQueryService.getControlPorts(nextNode, fileSystemId)
    nextPortId = existingPorts.length + 1  // sequential 1-based portId
    newPortSystemId = idGeneration.getNextId(fileSystemId)
    Stage CREATE for ControlPort: { systemId: newPortSystemId, nodeSystemId: nextNode,
                                    portId: nextPortId, isStatic: false }
    // Propagate resolved intents to this boundary port
    for each intentId in resolvedIntentIds:
      Stage CREATE for Intent: { systemId: ..., intentId, controlPortSystemId: newPortSystemId }
    portOnNextNode = newPortSystemId

  allPortIds.push(portOnNextNode)

  // Create the SCL segment for this pair
  sclSystemId = idGeneration.getNextId(fileSystemId)
  await controlLinkRepo.createSubsystemControlLink({
    systemId: sclSystemId,
    peerNodeASystemId: currentNode,
    peerNodeBSystemId: nextNode,
    nodeAPortSystemId: allPortIds[i],
    nodeBPortSystemId: portOnNextNode,
    controlLinkSystemId: createdLinkSystemId,
    fileSystemId,
  }, { source: SOURCE.Manual })
```

All staged rows share the same `groupId` via the established `WriteContext` — no explicit groupId
threading is needed because `PendingChangeWriter` always reads `groupId` from `uow.getWriteContext()`.

---

## 7. DTO and Controller Changes

### 7.1 Request DTO

**File:** `packages/api/src/presentation/rest/modules/control-link/dto/control-link-request.dto.ts`

Replace `isDangling: boolean` → `isInterUsecase: boolean` (default `false`).
Replace `parentId: number` → `parentSystemId: string` (Swagger-friendly; parsed to number in handler).

```typescript
export class CreateControlLinkRequest {
  @ApiProperty() startComponentId: number;
  @ApiProperty() startPortId: number;
  @ApiProperty() endComponentId: number;
  @ApiProperty() endPortId: number;
  @ApiProperty({ required: false }) parentSystemId?: string;
  @ApiProperty({ required: false, default: false }) isInterUsecase?: boolean;
}
```

Remove all references to `isDangling` from the controller and any other files.

### 7.2 Controller Command Construction

Both endpoints call the same `CreateControlLinkCommand`. The `allowModulesOnly` flag distinguishes them:

```typescript
// POST /control-links
new CreateControlLinkCommand(
  body.startComponentId, body.startPortId,
  body.endComponentId, body.endPortId,
  1,                                           // heapId always 1 (FR-CL-13)
  body.isInterUsecase ?? false,
  body.parentSystemId ? Number(body.parentSystemId) : undefined,
  true,                                        // allowModulesOnly
)

// POST /control-links/with-subsystems
new CreateControlLinkCommand(
  body.startComponentId, body.startPortId,
  body.endComponentId, body.endPortId,
  1,
  body.isInterUsecase ?? false,
  body.parentSystemId ? Number(body.parentSystemId) : undefined,
  false,                                       // allowModulesOnly
)
```

### 7.3 Response Mapping

Both endpoints share `ComponentsReadModel` from the handler.

- `POST /control-links` → `ComponentCollectionDto` (existing `toComponentCollectionDto()` in controller)
- `POST /control-links/with-subsystems` → `ComponentCollectionWithSubsystemsDto` (existing
  `toComponentCollectionWithSubsystemsDto()` in controller; `subsystems` populated from the
  already-implemented `subsystemQueryService.findAll()`)

The controller response mapper derives `connectionType` from node types (`nodeA.type`, `nodeB.type`)
since `FR-CLS-05` defines it as a read-time derivation, not a stored column.

---

## 8. Persistence Adapters (`@arc/persistence`)

### 8.1 TypeOrmControlLinkRepository — new methods

**File:** `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/control-link/control-link.repository.ts`

All methods follow the pattern from `TypeOrmModuleRepository`:

**`findNonDeletedByPortPair`**
Query `control_links WHERE nodeAPortSystemId = ? AND nodeBPortSystemId = ? AND fileSystemId = ?`.
Apply `LinkOverlayFetcher` (same pattern as `getLinksByPortSystemIds`) to pick up staged CREATEs and
filter staged DELETEs. Return null if the overlay says the row is deleted or absent.

**`findSoftDeletedByPortPair`**
Same raw query. Apply overlay: return the row only when the committed row exists AND the overlay
shows a pending DELETE (i.e., a soft-delete that hasn't been committed). Return null otherwise.

**`createControlLink`**
```typescript
const { session, groupId } = this.uow.getWriteContext();
await this.writer.writeCreate(
  {
    entityName: ENTITY_NAMES.ControlLink,
    systemId: link.systemId,
    aggregateId: link.systemId,
    payload: {
      fileSystemId: link.fileSystemId,
      peerNodeASystemId: link.peerNodeASystemId,
      peerNodeBSystemId: link.peerNodeBSystemId,
      nodeAPortSystemId: link.nodeAPortSystemId,
      nodeBPortSystemId: link.nodeBPortSystemId,
      heapId: link.heapId,
      linkType: link.linkType,
      sourceSubgraphSystemId: link.sourceSubgraphSystemId,
      destSubgraphSystemId: link.destSubgraphSystemId,
    },
  },
  session.sessionId,
  groupId,
  this.manager,
);
```

**`createSubsystemControlLink`**
Same pattern using `ENTITY_NAMES.SubsystemControlLink`, payload fields from `SubsystemControlLinkSpec`.

**`patchControlLink`**
```typescript
await this.writer.writeDelta(
  {
    entityName: ENTITY_NAMES.ControlLink,
    systemId,
    aggregateId: systemId,
    delta,
  },
  session.sessionId,
  groupId,
  this.manager,
);
```

### 8.2 DbNodeQueryService — new methods

**File:** `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/node/db-node-query-service.ts`

**`findNodeById`**
```sql
SELECT system_id, type, parent_id FROM nodes WHERE system_id = ? AND file_system_id = ?
```
Apply session overlay to pick up staged CREATE/DELETE. Return null if absent or deleted.

**`getAllNodeParentMap`**
```sql
SELECT system_id, parent_id FROM nodes WHERE file_system_id = ?
```
Apply overlay to include staged node CREATEs and exclude staged DELETEs.
Return `Map<number, number | null>`.

**`getIntentsByPortSystemIds`**
```sql
SELECT i.control_port_system_id, i.system_id, i.intent_id, i.name
FROM intents i
WHERE i.control_port_system_id IN (?) AND file_system_id = ?  -- join via control_ports
```
Apply intent overlay (check `edit_actions` for staged Intent CREATEs and DELETEs for these ports).
Return `Map<portSystemId, IntentReadModel[]>`.

---

## 9. Invariant Enforcement

| Invariant | Where enforced |
|---|---|
| I1: `nodeAPortSystemId < nodeBPortSystemId` | Step 7 of handler (canonical ordering) |
| I2: No duplicate non-deleted link for same port pair | Step 8 (findNonDeletedByPortPair → 409) |
| I3: `heapId` positive integer, default 1 | Command construction in controller (always passes 1) |
| I4: Allocated intents ⊆ supported intents for all module endpoints | Step 10 (intent intersection) |
| I5: Intent propagation touches all ports in connected component | Deferred to FR-CL-08 follow-on |

---

## 10. Error Responses

| Scenario | Exception | HTTP |
|---|---|---|
| Self-loop | `DomainRuleViolationException` | 422 |
| Node not found | `ResourceNotFoundException` | 404 |
| Subsystem ID on flat view | `DomainRuleViolationException` | 422 |
| Port not found | `ResourceNotFoundException` | 404 |
| Port not owned by node | `DomainRuleViolationException` | 422 |
| Intent intersection empty | `DomainRuleViolationException` | 422 |
| `isInterUsecase=false` but nodes in different usecases | `DomainRuleViolationException` | 422 |
| `isInterUsecase=true` but nodes share a usecase | `DomainRuleViolationException` | 422 |
| No edit session | Handled by `CommandBus` session guard | 422 |
| Duplicate link (same port pair, non-deleted) | `ConflictException` | 409 |

---

## 11. File Layout

**Modified files:**

| File | Change |
|---|---|
| `packages/core/src/domain/services/subsystem-data-links/subsystem-boundary-path.service.ts` | Move to `shared/` |
| `packages/core/src/application/file-operations/upload-file/services/entity-builders/subsystem-builder.ts` | Update import path |
| `packages/core/src/application/ports/persistence/repositories/control-link/control-link.repository.ts` | Add 5 new methods |
| `packages/core/src/application/ports/persistence/query-services/node/node-query-service.ts` | Add 3 new methods |
| `packages/core/src/application/usecase-designer/control-links/create/create-control-link.command.ts` | Add `isInterUsecase`, `parentSystemId`, `allowModulesOnly`; remove `isDangling` |
| `packages/core/src/application/usecase-designer/control-links/create/create-control-link.handler.ts` | Full implementation |
| `packages/infrastructure/persistence/src/.../repositories/control-link/control-link.repository.ts` | Implement 5 new methods |
| `packages/infrastructure/persistence/src/.../queries/node/db-node-query-service.ts` | Implement 3 new methods |
| `packages/api/src/presentation/rest/modules/control-link/dto/control-link-request.dto.ts` | Replace `isDangling` → `isInterUsecase`; rename `parentId` → `parentSystemId` |
| `packages/api/src/presentation/rest/modules/control-link/control-link.controller.ts` | Pass `allowModulesOnly`; derive `connectionType` in response mapper |

**New files:**

| File | Role |
|---|---|
| `packages/core/src/domain/services/shared/subsystem-boundary-path.service.ts` | Moved service |
| `packages/core/src/domain/services/subsystem-control-links/control-link-scl-factory.ts` | SCL node-sequence factory |

---

## 12. Testing Strategy

### 12.1 Unit Tests (`@arc/core`)

**`ControlLinkSclFactory`:**
- Same-parent nodes (no subsystem crossing) → `nodeSequence.length === 2` → no SCL
- One intermediate subsystem (`moduleA → ss1 → moduleB`) → `nodeSequence = [mA, ss1, mB]`
- Two intermediate subsystems → correct 4-element sequence

**`CreateControlLinkHandler` (mocked dependencies):**
- Self-loop → `DomainRuleViolationException`
- Node not found → `ResourceNotFoundException`
- Subsystem on flat view → `DomainRuleViolationException`
- Port not found → `ResourceNotFoundException`
- Duplicate link → `ConflictException`
- Intent intersection empty → `DomainRuleViolationException`
- `isInterUsecase=false`, same subgraph → `LINK_TYPE.IntraSubgraph`
- `isInterUsecase=false`, different subgraphs, same usecase → `LINK_TYPE.IntraUsecase`
- `isInterUsecase=true`, valid → `LINK_TYPE.InterUsecase`
- Cross-boundary link → SCL segments staged; boundary ControlPort CREATEs staged
- All staged rows share the same `groupId`

### 12.2 Integration Tests (`@arc/persistence`)

- `TypeOrmControlLinkRepository.createControlLink` → edit_actions row with `operation = CREATE`
- `TypeOrmControlLinkRepository.findNonDeletedByPortPair` → overlay-aware (staged CREATE visible, staged DELETE hides row)
- `TypeOrmControlLinkRepository.createSubsystemControlLink` → SCL edit_action staged correctly
- `DbNodeQueryService.getAllNodeParentMap` → includes overlay nodes
- `DbNodeQueryService.getIntentsByPortSystemIds` → overlay-aware intent lookup

### 12.3 E2E Tests (`@arc/api`)

- `POST /control-links` — happy path: two modules, same subgraph → `ComponentCollectionDto` with one `controlLink`
- `POST /control-links` — 409 on duplicate
- `POST /control-links` — 422 on self-loop, 404 on unknown node, 422 on subsystem node
- `POST /control-links/with-subsystems` — module + subsystem endpoint → `ComponentCollectionWithSubsystemsDto` with `subsystems`
- `POST /control-links/with-subsystems` — cross-boundary two modules → SCL segments committed

Run with:
```bash
pnpm --filter @arc/core run test:unit:core
pnpm --filter @arc/persistence run test:integration
pnpm --filter @arc/api run test:e2e:api
```
