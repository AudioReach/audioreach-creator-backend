<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Control Link APIs — Design

**Status:** Implemented
**Date:** 2026-08-23
**Requirements:** [`../requirements/control-links-api-requirements.md`](../requirements/control-links-api-requirements.md)

---

## 1. Scope

This document specifies the implementation design for six control-link API endpoints:

| Endpoint | Handler |
|---|---|
| `POST /arc-api/v1/projects/:projectId/control-links` | `CreateControlLinkHandler` |
| `POST /arc-api/v1/projects/:projectId/control-links/with-subsystems` | `CreateControlLinkHandler` (same, `allowSubsystemNodes=true`) |
| `DELETE /arc-api/v1/projects/:projectId/control-links/:controlLinkSystemId` | `DeleteControlLinkHandler` |
| `PATCH /arc-api/v1/projects/:projectId/control-links/:controlLinkSystemId/properties` | `PatchControlLinkPropertiesHandler` |
| `GET /arc-api/v1/projects/:projectId/control-links/:controlLinkSystemId/properties` | `GetControlLinkPropertiesHandler` |
| `POST /arc-api/v1/projects/:projectId/control-links/query` | `QueryControlLinksHandler` |

All requirements referenced as `FR-CL-*`, `FR-CLS-*`, `FR-DCL-*`, `FR-PCL-*`, `FR-GCL-*`, `FR-QCL-*`, and `FR-CCL-*` point to the requirements document above.

**Scope boundary:** Controllers and HTTP DTOs are in scope for description only. The core handler logic and persistence layer are the primary concern.

**Out of scope:** Schema migrations (the `control_links` and `subsystem_control_links` tables already exist), `CreateMarkerControlLinks`, `SetControlPortCount`, and session lifecycle management.

---

## 2. Architecture Overview

No new layers. The design adds to existing layers:

```
@arc/api
  ControlLinkController
    POST /control-links          @UseGuards(SessionGuard) → commandBus.execute(CreateControlLinkCommand, session)
    POST /control-links/with-subsystems  @UseGuards(SessionGuard) → commandBus.execute(CreateControlLinkCommand, session)
    DELETE /control-links/:id    @UseGuards(SessionGuard) → commandBus.execute(DeleteControlLinkCommand, session)
    PATCH /control-links/:id/properties  @UseGuards(SessionGuard) → commandBus.execute(PatchControlLinkPropertiesCommand, session)
    GET /control-links/:id/properties    → queryBus.execute(GetControlLinkPropertiesQuery)
    POST /control-links/query            → queryBus.execute(QueryControlLinksQuery)

@arc/core (application / usecase-designer)
  CreateControlLinkHandler
    ├── QueryServices.spfModuleQueryService          (node lookup + control port reads)
    ├── QueryServices.spfModuleDefinitionQueryService (supported intent lookup)
    ├── QueryServices.useCaseQueryService.findUsecaseIdsBySubgraphIds  (link-type derivation)
    ├── UnitOfWork.getSubsystemRepository            (subsystem node existence)
    ├── UnitOfWork.getControlLinkRepository          (all write + SCL methods)
    └── ControlIntentPropagationService.cascadePropagate (BFS intent fill)

  DeleteControlLinkHandler
    ├── QueryServices.spfModuleQueryService          (node type check for intent cleanup)
    ├── QueryServices.spfModuleDefinitionQueryService (full definition for reset intents)
    ├── UnitOfWork.getControlLinkRepository          (soft delete + intent cleanup)
    └── ControlIntentPropagationService.findPortsToClear (subsystem port clearing)

  PatchControlLinkPropertiesHandler
    ├── UnitOfWork.getControlLinkRepository          (findBySystemId, updateHeapId, intent ops)
    └── (intent validation against definition — future enhancement)

  GetControlLinkPropertiesHandler (query)
    └── QueryServices.controlLinkQueryService.findBySystemIds
        QueryServices.spfModuleQueryService.nodeQueryService.getControlPorts
        QueryServices.spfModuleQueryService.findOne + getDefinition (supported intents)

  QueryControlLinksHandler (query)
    └── QueryServices.controlLinkQueryService.findBySystemIds

@arc/core (domain services — already existed)
  ControlIntentPropagationService   (cascadePropagate, findPortsToClear)
  ControlChainResolutionService     (SCL chain walking for cross-boundary detection)

@arc/persistence
  TypeOrmControlLinkRepository      (full implementation of all new port methods)
  DbControlLinkQueryService.findBySystemIds  (new method)
  DbUseCaseQueryService.findUsecaseIdsBySubgraphIds  (new method)
```

---

## 3. Domain Entities

### 3.1 `ControlLink` (existing, unchanged)

**File:** `packages/core/src/domain/entities/usecase-data/links/control-link.ts`

```typescript
export class ControlLink {
  systemId: number;
  fileSystemId: number;
  peerNodeASystemId: number;   // canonical: node owning port with lower portSystemId
  peerNodeBSystemId: number;
  nodeAPortSystemId: number;   // lower port system ID (canonical ordering enforced)
  nodeBPortSystemId: number;   // higher port system ID
  heapId: number;
  linkType: LinkType;          // INTRA_SUBGRAPH | INTRA_USECASE | INTER_USECASE
  sourceSubgraphSystemId: number;
  destSubgraphSystemId: number;
  subsystemControlLinks: SubsystemControlLink[];  // SCL segments (for in-memory assembly only)
}
```

**Invariant enforced in constructor:** `peerNodeASystemId !== peerNodeBSystemId` → throws `SameNodeException` (maps to 422).

### 3.2 `SubsystemControlLink` (existing, unchanged)

**File:** `packages/core/src/domain/entities/usecase-data/links/subsystem-control-link.ts`

One boundary-crossing segment. `controlLinkSystemId` is null in `edit_actions` payload during staging; committed rows are always non-null.

### 3.3 `DuplicateLinkException` (new)

**File:** `packages/core/src/shared/exceptions/duplicate-link.exception.ts`

Thrown when a non-deleted ControlLink already exists for the same canonical port pair. Maps to HTTP 409 via `AllExceptionsFilter`.

---

## 4. Port Interface Changes

### 4.1 `ControlLinkRepository` — extended

**File:** `packages/core/src/application/ports/persistence/repositories/control-link/control-link.repository.ts`

New methods added to the existing interface:

| Method | Purpose |
|---|---|
| `findBySystemId(systemId, fileSystemId)` | Load a single non-deleted ControlLink (overlay applied) |
| `findBySystemIds(systemIds, fileSystemId)` | Bulk lookup for query endpoint |
| `findActiveByPortPair(portA, portB, fileSystemId)` | FR-CL-05: duplicate check |
| `findSoftDeletedByPortPair(portA, portB, fileSystemId)` | FR-CL-06: reactivation check |
| `createControlLink(link)` | Stages a CREATE edit-action |
| `reactivateControlLink(systemId)` | Stages an UPDATE restoring a soft-deleted link |
| `softDeleteControlLink(systemId)` | Stages a DELETE edit-action |
| `updateHeapId(systemId, heapId)` | Stages an UPDATE delta for heapId |
| `createSubsystemControlLink(scl)` | Stages a CREATE for a SCL segment |
| `getAllSubsystemControlLinks(fileSystemId)` | Loads all SCL rows with overlay (for BFS/chain resolution) |
| `getAllocatedIntentIds(portSystemId, fileSystemId)` | Reads port's current intent rows with overlay |
| `createIntents(intents[])` | Stages CREATE edit-actions for intent rows |
| `deleteIntents(intentSystemIds[], portSystemId)` | Stages DELETE edit-actions for intent rows |

### 4.2 `ControlLinkQueryService` — extended

**File:** `packages/core/src/application/ports/persistence/query-services/link/control-link-query-service.ts`

New method:

```typescript
findBySystemIds(systemIds: number[], fileSystemId: number): Promise<Result<ControlLinkReadModel[]>>
```

Used by `QueryControlLinksHandler` and `GetControlLinkPropertiesHandler`.

### 4.3 `UseCaseQueryService` — extended

**File:** `packages/core/src/application/ports/persistence/query-services/usecase/usecase-query-service.ts`

New method:

```typescript
findUsecaseIdsBySubgraphIds(
  subgraphIds: number[],
  fileSystemId: number,
): Promise<Map<number, number[]>>
```

Returns `Map<subgraphId, usecaseSystemId[]>`. Used by `CreateControlLinkHandler` for FR-CL-10 link-type derivation.

---

## 5. Request/Response Contracts

### 5.1 POST /control-links (flat view)

**Request:** `CreateControlLinkFlatRequest`

```typescript
{
  startModuleSystemId: string   // module node ID (subsystem IDs rejected → 422)
  startPortId:         string   // control port on start module
  endModuleSystemId:   string   // module node ID
  endPortId:           string   // control port on end module
  parentId?:           string   // optional parent subsystem system ID
  isInterUsecase?:     boolean  // default false
  heapId?:             number   // default 1 (FR-CL-13)
}
```

**Response:** `ComponentsResponseDto` (200/201)

```typescript
{
  data: {
    spfModules:   SpfModuleDto[]   // empty — no modules created
    dataLinks:    DataLinkDto[]    // empty
    controlLinks: ControlLinkDto[] // the created/reactivated link
  }
}
```

### 5.2 POST /control-links/with-subsystems

**Request:** `CreateControlLinkWithSubsystemsRequest`

```typescript
{
  startComponentId: string   // module OR subsystem node ID
  startPortId:      string
  endComponentId:   string   // module OR subsystem node ID
  endPortId:        string
  parentId?:        string
  isInterUsecase?:  boolean
}
```

**Response:** `ComponentsWithSubsystemsResponseDto` — same as flat view plus `subsystems: SubsystemNodeDto[]` (currently empty, subsystem hierarchy expansion is a future enhancement).

### 5.3 DELETE /control-links/:controlLinkSystemId

**Response:** `DeleteControlLinkResponseDto`

```typescript
{ data: { systemId: string } }
```

### 5.4 PATCH /control-links/:controlLinkSystemId/properties

**Request:** `PatchControlLinkPropertiesRequest`

```typescript
{
  allocatedIntents?: { intents: { id: number; name: string }[] }  // camelCase
  heapId?:           { value: number }
}
// At least one field required → 422 if both absent
```

**Response:** `ControlLinkResponseDto[]` — all modified links.

### 5.5 GET /control-links/:controlLinkSystemId/properties

**Response:** `ControlLinkPropertiesResponseDto`

```typescript
{
  AllocatedIntents: {
    propId:   0x08001062
    propName: 'Intents Property'
    intents:  { id: number; name: string }[]
  }
  SupportedIntents?: {   // present only when module endpoint exists in path
    propId:   0x08001062
    propName: 'Intents Property'
    intents:  { id: number; name: string }[]
  }
  HeapId: {
    propId:   0x0800136f
    propName: 'Heap Property'
    heapId:   number
  }
}
```

### 5.6 POST /control-links/query

**Request:** `QueryControlLinksRequest`

```typescript
{ systemIds: string[] }
```

**Response:** `ControlLinkResponseDto[]` with partial-success model:
- 200 OK if all found
- 207 Multi-Status if any not found (error entries in `issues[]`)

---

## 6. Command Handler Design

### 6.1 `CreateControlLinkHandler`

**File:** `packages/core/src/application/usecase-designer/control-links/create/create-control-link.handler.ts`

**Command:** `CreateControlLinkCommand(startNodeSystemId, startPortSystemId, endNodeSystemId, endPortSystemId, heapId, isInterUsecase, parentId, allowSubsystemNodes)`

**Steps:**

1. **Self-loop check** (FR-CL-02):
   `startNodeSystemId === endNodeSystemId` → throw `DomainRuleViolationException` (422)

2. **Node existence** (FR-CL-03 / FR-CLS-06):
   - `allowSubsystemNodes = false` (flat view): load both nodes via `spfModuleQueryService.findOne`. If null → 404. Assign `nodeType = Module` for both.
   - `allowSubsystemNodes = true` (with-subsystems): try module lookup; if null, check `subsystemRepository.subsystemExists` → 404 if neither. Assign `nodeType` accordingly.

3. **Port existence and ownership** (FR-CL-04):
   Call `nodeQueryService.getControlPorts(nodeId, fileSystemId)` for both nodes. Find each port by `systemId`. → 404 if port absent; `DomainRuleViolationException` (422) if port not owned by the declared node.

4. **Canonical ordering** (FR-CL-11):
   ```typescript
   const [portA, portB, nodeA, nodeB] =
     startPortSystemId < endPortSystemId
       ? [startPortSystemId, endPortSystemId, startNodeSystemId, endNodeSystemId]
       : [endPortSystemId, startPortSystemId, endNodeSystemId, startNodeSystemId];
   ```

5. **Duplicate check** (FR-CL-05):
   `controlLinkRepo.findActiveByPortPair(portA, portB, fileSystemId)` → if found, throw `DuplicateLinkException` (409)

6. **Soft-deleted reactivation** (FR-CL-06):
   `controlLinkRepo.findSoftDeletedByPortPair(portA, portB, fileSystemId)` → if found, call `reactivateControlLink(systemId)` and optionally `updateHeapId` if changed. Return early with the reactivated link DTO.

7. **Link-type derivation** (FR-CL-10):
   - `isInterUsecase = true`: validate nodes are in **different** usecases (via `findUsecaseIdsBySubgraphIds`) → 422 if same usecase. Assign `INTER_USECASE`.
   - `isInterUsecase = false`, same `subgraphId`: assign `INTRA_SUBGRAPH`.
   - `isInterUsecase = false`, different `subgraphId`: validate shared usecase → 422 if different usecases. Assign `INTRA_USECASE`.
   - If either node is a subsystem: default to `INTRA_USECASE`.

8. **Intent resolution** (FR-CL-07 / FR-CLS-04):

   For flat view (both module nodes):
   - Both ports have existing links → compute intersection of allocated intents → empty intersection → 422.
   - One port has no links → load supported intents from module definition (`staticControlPorts` or `dynamicIntents`).
   - Resolved set is the intersection (or one side's set if the other has no links yet).
   - No intents resolved at all → 422.

   For with-subsystems view, additional cases:
   - **Subsystem port preflight** (FR-CLS-04 Step 1): For each existing link through the port, classify its other endpoint as inner/outer relative to the subsystem. If the same side is already occupied → 422.
   - **Subsystem port with no existing link**: inherits intents from the other side.
   - **Both subsystem ports, no links**: resolved intent set is empty (valid; link will be discarded at commit if never connected to a module path).

9. **ControlLink creation** (FR-CL-14):
   Allocate `systemId = idGeneration.getNextId(fileSystemId)`. Construct `ControlLink` domain entity. Call `controlLinkRepo.createControlLink(link)`.

10. **SCL creation** (FR-CL-12):
    When at least one endpoint is a subsystem node, allocate a new `systemId` and stage a `SubsystemControlLink` segment via `createSubsystemControlLink(scl)`.

11. **Intent propagation** (FR-CL-08):
    Call `ControlIntentPropagationService.cascadePropagate` for each port (portA, portB) with the resolved intent IDs and the full SCL list. For each port in `portsToFill`, delete existing intents and create new ones.

12. `applyCachedActions()` + `commit()`. Return `ComponentCollectionDto` with the new link.

**Error table:**

| Condition | Exception | HTTP |
|---|---|---|
| Self-loop | `DomainRuleViolationException` | 422 |
| Node not found | `ResourceNotFoundException` | 404 |
| Subsystem ID in flat view | `DomainRuleViolationException` | 422 |
| Port not found | `ResourceNotFoundException` | 404 |
| Port not owned by node | `DomainRuleViolationException` | 422 |
| Duplicate (non-deleted) port pair | `DuplicateLinkException` | 409 |
| Intent intersection empty | `DomainRuleViolationException` | 422 |
| isInterUsecase mismatch | `DomainRuleViolationException` | 422 |
| No edit session | `SessionRequiredError` (BaseCommand) | 422 |

### 6.2 `DeleteControlLinkHandler`

**File:** `packages/core/src/application/usecase-designer/control-links/delete/delete-control-link.handler.ts`

**Command:** `DeleteControlLinkCommand(controlLinkSystemId)`

**Steps:**

1. `controlLinkRepo.findBySystemId(controlLinkSystemId, fileSystemId)` → 404 if not found.
2. `controlLinkRepo.softDeleteControlLink(controlLinkSystemId)` (stages DELETE edit-action).
3. **Port intent cleanup** (FR-DCL-04): For each of the two ports (`nodeAPortSystemId`, `nodeBPortSystemId`):
   - Check `getLinksByPortSystemIds` for remaining non-deleted links on that port.
   - If no remaining links AND node is a **module**: load module definition, reset allocated intents to full supported set (delete existing + create all supported).
   - If no remaining links AND node is a **subsystem**: call `ControlIntentPropagationService.findPortsToClear` on remaining SCL graph; delete intents from all returned ports.
4. `applyCachedActions()` + `commit()`. Return `{ systemId: String(controlLinkSystemId) }`.

### 6.3 `PatchControlLinkPropertiesHandler`

**File:** `packages/core/src/application/usecase-designer/control-links/patch/patch-control-link-properties.handler.ts`

**Command:** `PatchControlLinkPropertiesCommand(controlLinkSystemId, allocatedIntents?, heapId?)`

**Validation (pre-transaction):** Both `allocatedIntents` and `heapId` absent → throw `DomainRuleViolationException` (422).

**Steps:**

1. `controlLinkRepo.findBySystemId` → 404 if not found.
2. **Update intents** (FR-PCL-03, when provided):
   - `allocatedIntents.length === 0` → 422.
   - Delete existing intents on both ports (`nodeAPortSystemId`, `nodeBPortSystemId`).
   - Create new intent rows for both ports with `idGeneration.getNextId`.
3. **Update heapId** (FR-PCL-04, when provided):
   - No-op if new `heapId === current heapId`.
   - `controlLinkRepo.updateHeapId(systemId, heapId)`.
4. `applyCachedActions()` + `commit()`. Return `ControlLinkDto[]` of modified links.

---

## 7. Query Handler Design

### 7.1 `GetControlLinkPropertiesHandler`

**File:** `packages/core/src/application/usecase-designer/control-links/queries/get-control-link-properties.handler.ts`

**Query:** `GetControlLinkPropertiesQuery(controlLinkSystemId, projectId, clientId)`

**Steps:**

1. Resolve `fileSystemId = projectQueryService.getFileIdByProjectId(projectId)`.
2. `controlLinkQueryService.findBySystemIds([controlLinkSystemId], fileSystemId)` → 404 if empty.
3. Read `nodeA` control ports via `nodeQueryService.getControlPorts(link.peerNodeASystemId, fileSystemId)`. Find port by `link.nodeAPortSystemId`. Build `allocatedIntents` from `port.allocatedIntents`.
4. Load module definition for `peerNodeASystemId` (if module node). Build `supportedIntents` from `staticControlPorts` (match by `portId`) or `dynamicIntents` fallback.
5. Return `ControlLinkPropertiesDto` with constant prop IDs (`0x08001062` for intents, `0x0800136f` for heap).

### 7.2 `QueryControlLinksHandler`

**File:** `packages/core/src/application/usecase-designer/control-links/queries/query-control-links.handler.ts`

**Query:** `QueryControlLinksQuery(systemIds, projectId, clientId)`

**Steps:**

1. Resolve `fileSystemId` from `projectQueryService`.
2. `controlLinkQueryService.findBySystemIds(systemIds, fileSystemId)`.
3. Compute `missingIssues` for any requested IDs not in results.
4. Return `Result.partial(dtos, missingIssues)` if any missing, `Result.ok(dtos)` otherwise.
5. `PartialSuccessInterceptor` upgrades 200 → 207 when `issues[]` contains ERROR severity entries.

---

## 8. Persistence Layer

### 8.1 `TypeOrmControlLinkRepository`

**File:** `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/control-link/control-link.repository.ts`

All writes use `PendingChangeWriter` (same pattern as `TypeOrmModuleRepository`):

| Method | Edit-action operation |
|---|---|
| `createControlLink` | `writeCreate` → `control_links` |
| `reactivateControlLink` | `writeDelta({ deleted: false })` → `control_links` |
| `softDeleteControlLink` | `writeDelete` → `control_links` |
| `updateHeapId` | `writeDelta({ heapId })` → `control_links` |
| `createSubsystemControlLink` | `writeCreate` → `subsystem_control_links` |
| `createIntents` | `writeCreate` (per intent) → `intents` |
| `deleteIntents` | `writeDelete` (per intent) → `intents` |

Read methods apply session overlay by calling `editActionsQuerySvc.getByTable(sessionId, ENTITY_NAMES.ControlLink)` and filtering CREATE/DELETE actions against the base DB rows.

### 8.2 `DbControlLinkQueryService.findBySystemIds`

**File:** `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/link/db-control-link-query-service.ts`

Query: `SELECT * FROM control_links WHERE systemId IN (:ids) AND fileSystemId = :fileSystemId`. Apply `applyLinkOverlayAndMap` (same helper used by `findByUsecaseIds`).

### 8.3 `DbUseCaseQueryService.findUsecaseIdsBySubgraphIds`

**File:** `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/usecase/db-usecase-query-service.ts`

Query against the `UseCaseSubgraph` join table:
```sql
SELECT ucs.usecaseSystemId, ucs.subgraphSystemId
FROM use_case_subgraphs ucs
WHERE ucs.subgraphSystemId IN (:ids)
```
Returns `Map<subgraphId, usecaseSystemId[]>`. Session overlay not applied (use_case_subgraphs membership is structural and not modified by manual edit sessions).

---

## 9. CQRS Registration

### 9.1 `CommandHandlerRegistry`

**File:** `packages/core/src/application/orchestration/cqrs/registries/command-handler-registry.ts`

Registrations added or updated:

| Command | Handler | Dependencies |
|---|---|---|
| `CreateControlLinkCommand` | `CreateControlLinkHandler` | `uow`, `queryServices`, `idGeneration` |
| `DeleteControlLinkCommand` | `DeleteControlLinkHandler` | `uow`, `queryServices`, `idGeneration` |
| `PatchControlLinkPropertiesCommand` | `PatchControlLinkPropertiesHandler` | `uow`, `idGeneration` |

### 9.2 `QueryHandlerRegistry`

| Query | Handler | Dependencies |
|---|---|---|
| `GetControlLinkPropertiesQuery` | `GetControlLinkPropertiesHandler` | `queryServices` |
| `QueryControlLinksQuery` | `QueryControlLinksHandler` | `queryServices` |

---

## 10. Invariant Enforcement

| # | Invariant | Enforced by |
|---|---|---|
| I1 | `nodeAPortSystemId < nodeBPortSystemId` (canonical ordering) | `CreateControlLinkHandler` step 4 |
| I2 | No two non-deleted ControlLinks share the same `(portA, portB)` pair | `CreateControlLinkHandler` step 5 + DB unique index `uk_control_link_unique` |
| I3 | HeapId ≥ 1; default 1 | `CreateControlLinkFlatRequest` default + `CreateControlLinkHandler` |
| I4 | Allocated intents ⊆ supported intents of every module in chain | `CreateControlLinkHandler` step 8 (intent resolution) |
| I5 | Intent propagation touches all ports in the connected SCL component atomically | `CreateControlLinkHandler` step 11 — all writes in same `groupId` |
| I6 | Self-loops forbidden | `ControlLink` constructor (`SameNodeException`) + `CreateControlLinkHandler` step 1 |

---

## 11. Exception Mapping

| Domain Exception | HTTP Status | Trigger |
|---|---|---|
| `ResourceNotFoundException` | 404 | Node / port / link not found |
| `DomainRuleViolationException` | 422 | Business rule violation (self-loop, wrong intent, etc.) |
| `DuplicateLinkException` (new) | 409 | Non-deleted link already exists for port pair |
| `SessionRequiredError` | 422 | Write endpoint called without active session (`BaseCommand.requiresSession = true`) |

`DuplicateLinkException` is registered in `AllExceptionsFilter`'s `DOMAIN_STATUS_MAP`:
```typescript
[DuplicateLinkException, HttpStatus.CONFLICT],
```

---

## 12. New Files

| File | Purpose |
|---|---|
| `packages/core/src/shared/exceptions/duplicate-link.exception.ts` | New 409 exception |
| `packages/core/src/application/usecase-designer/control-links/patch/patch-control-link-properties.command.ts` | PATCH command |
| `packages/core/src/application/usecase-designer/control-links/patch/patch-control-link-properties.handler.ts` | PATCH handler |
| `packages/core/src/application/usecase-designer/control-links/queries/get-control-link-properties.query.ts` | GET query |
| `packages/core/src/application/usecase-designer/control-links/queries/get-control-link-properties.handler.ts` | GET handler |
| `packages/core/src/application/usecase-designer/control-links/queries/query-control-links.query.ts` | POST /query query |
| `packages/core/src/application/usecase-designer/control-links/queries/query-control-links.handler.ts` | POST /query handler |

---

## 13. Testing Strategy

### 13.1 Unit Tests

| Subject | Key cases |
|---|---|
| `CreateControlLinkHandler` | Self-loop → 422; subsystem ID in flat view → 422; duplicate port pair → 409; soft-deleted reactivation; INTRA_SUBGRAPH vs INTRA_USECASE vs INTER_USECASE linkType derivation; intent intersection empty → 422; intent propagation calls cascadePropagate |
| `DeleteControlLinkHandler` | Not found → 404; module port cleanup resets to definition intents; subsystem port cleanup calls findPortsToClear |
| `PatchControlLinkPropertiesHandler` | Both fields absent → 422; empty intents → 422; heapId no-op when equal; both fields update together |
| `GetControlLinkPropertiesHandler` | Not found → 404; SupportedIntents absent when no module endpoint; correct prop IDs |
| `QueryControlLinksHandler` | All found → 200; some missing → 207 partial; empty input → 200 empty |
| `ControlIntentPropagationService` | Already covered by existing unit tests |

### 13.2 Integration Tests

- `TypeOrmControlLinkRepository`: create → findActiveByPortPair hit; softDelete → findSoftDeletedByPortPair hit → reactivate; SCL creation; intent create/delete round-trip.
- `DbControlLinkQueryService.findBySystemIds`: overlay applied (staged CREATEs visible; staged DELETEs hidden).
- `DbUseCaseQueryService.findUsecaseIdsBySubgraphIds`: returns correct usecase IDs per subgraph.
