# Design: POST /data-links and POST /data-links/with-subsystems

Requirements: [../requirements/data-links-post-requirements.md](../requirements/data-links-post-requirements.md)

**Status:** APPROVED  
**Date:** 2026-08-12

---

## 1. Architecture Overview

Two separate endpoints, two separate command+handler pairs. Both share the same `DataLinkEditRepository` write port and the existing `SubsystemBoundaryPathService` for traversal path computation.

All writes go through `PendingChangeWriter.writeCreate()` into `edit_actions`, following the CREATE Spf Module pattern exactly (FR-DL-13, FR-DLS-12).

```
Controller
  ├── POST /data-links              → CreateDataLinkFlatCommand    → CreateDataLinkFlatHandler
  └── POST /data-links/with-subsystems → CreateDataLinkWithSubsystemsCommand → CreateDataLinkWithSubsystemsHandler

Both handlers use:
  - SubsystemRepository.getAllNodesWithParents()  (nodeParentMap load)
  - SubsystemBoundaryPathService.compute()        (traversal path, unchanged)
  - DataLinkEditRepository                        (write port, new)
    └── PendingChangeWriter.writeCreate()         (edit_actions insertion)
```

No changes to `SubsystemBoundaryPathService`. No changes to upload path.

---

## 2. New Commands and Request DTOs

The stub `CreateDataLinkCommand` (with `type: 'normal' | 'EC' | 'interUsecase'`) is **replaced** by two new commands. All systemId fields are `string` (matching the requirements spec and project API convention).

### 2.1 CreateDataLinkFlatCommand

```
packages/core/src/application/usecase-designer/data-links/create/
  create-data-link-flat.command.ts
  create-data-link-flat.handler.ts
```

```typescript
class CreateDataLinkFlatCommand extends BaseCommand {
  constructor(
    readonly sourceModuleSystemId: string,
    readonly sourcePortSystemId: string,
    readonly destinationModuleSystemId: string,
    readonly destinationPortSystemId: string,
    readonly isInterUsecase?: boolean,
    readonly isEc?: boolean,
  )
}
```

### 2.2 CreateDataLinkWithSubsystemsCommand

```
packages/core/src/application/usecase-designer/data-links/create/
  create-data-link-with-subsystems.command.ts
  create-data-link-with-subsystems.handler.ts
```

```typescript
class CreateDataLinkWithSubsystemsCommand extends BaseCommand {
  constructor(
    readonly sourceNodeSystemId: string,
    readonly sourcePortSystemId: string,
    readonly destinationNodeSystemId: string,
    readonly destinationPortSystemId: string,
    readonly isInterUsecase?: boolean,
    readonly isEc?: boolean,
  )
}
```

### 2.3 Request DTOs (packages/api)

`CreateDataLinkFlatRequest` — fields match FR-DL-01; all systemId fields `@IsString()`.  
`CreateDataLinkWithSubsystemsRequest` — fields match FR-DLS-01; all systemId fields `@IsString()`.

The existing `CreateDataLinkRequest` (with `type` enum) is removed.

---

## 3. Query Extension — SubsystemRepository

New method added to the `SubsystemRepository` core port and its TypeORM adapter:

```typescript
// packages/core/src/application/ports/persistence/repositories/subsystem/subsystem.repository.ts
interface SubsystemRepository {
  subsystemExists(systemId: number, fileSystemId: number): Promise<boolean>;

  /** Returns a map of all node systemIds → parentId (or null if top-level) for the given file.
   *  Covers both subsystem nodes and module nodes.
   *  Used by handlers to construct the nodeParentMap for SubsystemBoundaryPathService. */
  getAllNodesWithParents(fileSystemId: number): Promise<Map<number, number | null>>;
}
```

**TypeORM adapter** (`TypeOrmSubsystemRepository`) queries the `nodes` table with `file_system_id = fileSystemId`, returning `system_id` and `parent_id` for all rows. The `parent_id` column is nullable.

---

## 4. Write Port — DataLinkEditRepository

### 4.1 Core port

```
packages/core/src/application/ports/persistence/repositories/data-link/data-link-edit.repository.ts
```

```typescript
export interface DataLinkEditRepository {
  /**
   * Writes CREATE edit_action rows for the DataLink, all its SubsystemDataLinks,
   * and all auto-created boundary DataPorts. All rows share the groupId from
   * the WriteContext stamped by CommandBus.
   */
  createDataLink(dataLink: DataLink, options?: EditOptions): Promise<void>;

  /**
   * Finds a DataLink in the session overlay by (sourcePortSystemId, destinationPortSystemId).
   * Checks base data_links table + active CREATE/DELETE edit_action overlay.
   * Returns null if not found at all.
   * Returns {systemId, isDeleted: true, payload} if a DELETE edit_action exists.
   * Returns {systemId, isDeleted: false, payload} if active (base or staged CREATE).
   */
  findByPortPair(
    sourcePortSystemId: number,
    destPortSystemId: number,
    fileSystemId: number,
  ): Promise<{systemId: number; isDeleted: boolean; payload: Record<string, unknown>} | null>;

  /**
   * Re-activates a soft-deleted DataLink (FR-DL-07a).
   * Supersedes the current DELETE edit_action row, then inserts a new CREATE row
   * with the provided payload. The new CREATE gets a fresh groupId from WriteContext.
   */
  reactivateDataLink(
    systemId: number,
    aggregateId: number,
    payload: Record<string, unknown>,
    options?: EditOptions,
  ): Promise<void>;
}
```

### 4.2 UnitOfWork extension

`UnitOfWork` gets a new method:
```typescript
getDataLinkEditRepository(): DataLinkEditRepository;
```

### 4.3 TypeORM adapter

```
packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/data-link/data-link-edit.repository.ts
```

- `createDataLink()` calls `writer.writeCreate()` for each entity in this order:
  1. One `Node` CREATE row per auto-created boundary DataPort (targetTable=`Node`)
  2. One `DataPort` CREATE row per auto-created boundary port (targetTable=`DataPort`)
  3. One `DataLink` CREATE row (targetTable=`DataLink`)
  4. One `SubsystemDataLink` CREATE row per SLS segment (targetTable=`SubsystemDataLink`)
  - All share the same `sessionId`, `groupId`, `aggregateId = dataLink.systemId`

- `findByPortPair()` queries `data_links` table first, then checks `edit_actions` overlay for CREATE/DELETE in the session.

- `reactivateDataLink()`:
  1. `supersedeCurrent(sessionId, systemId, null, manager)` — stamps `valid_until` on the existing DELETE row
  2. `writer.writeCreate({targetTable: 'DataLink', targetSystemId: systemId, aggregateId: systemId, payload})` — inserts new CREATE row

---

## 5. Handlers

### 5.1 CreateDataLinkFlatHandler

```
packages/core/src/application/usecase-designer/data-links/create/create-data-link-flat.handler.ts
```

Orchestration (all within one transaction):

1. `uow.startTransaction()`
2. Get `{session, groupId}` from `uow.getWriteContext()`; extract `fileSystemId`
3. Parse string IDs → numbers
4. **Validation:**
   - Nodes exist and are module-type nodes (FR-DL-02, FR-DL-03)
   - Source ≠ dest (FR-DL-06)
   - Source port is OUTPUT, dest port is INPUT; ports belong to their respective modules (FR-DL-04, FR-DL-05)
5. **Duplicate check** via `dataLinkEditRepo.findByPortPair(srcPort, dstPort, fileSystemId)`:
   - Active link → throw `409 Conflict`
   - Soft-deleted → re-activate path (see §5.1a)
   - Not found → proceed with create
6. **linkType derivation** (FR-DL-09): load source/dest module's `subgraphSystemId`, derive `INTRA_SUBGRAPH` / `INTRA_USECASE` / `INTER_USECASE`. Validate `isEc` constraint (FR-DL-10).
7. **nodeParentMap** load via `subsystemRepo.getAllNodesWithParents(fileSystemId)` (FR-DL-11)
8. **Path computation**: `SubsystemBoundaryPathService.compute({sourceNodeId, destNodeId, nodeParentMap})`
9. If `nodeSequence.length > 2` (cross-subsystem traversal):
   - For each subsystem node in `nodeSequence[1..-2]`: allocate boundary DataPort systemId, create `DataPort` domain object with the required `portIoType` from `requiredPortType`
   - For each adjacent pair in `nodeSequence`: construct `SubsystemDataLink` domain object; call `dataLink.addSubsystemDataLink()`
10. Construct `DataLink` domain object with all SLS attached
11. `dataLinkEditRepo.createDataLink(dataLink)` — writes all `edit_actions` with shared `groupId`
12. `uow.commit()`
13. Return `UseCaseComponentsReadModel` with `dataLinks: [DataLinkReadModel]`

**§5.1a Re-activation path (FR-DL-07a):** Skip create; derive fresh SLS chain (steps 7–10); call `dataLinkEditRepo.reactivateDataLink(systemId, aggregateId, payload)` for the DataLink; then write fresh SLS + boundary port CREATE rows. All share the same `groupId`.

### 5.2 CreateDataLinkWithSubsystemsHandler

```
packages/core/src/application/usecase-designer/data-links/create/create-data-link-with-subsystems.handler.ts
```

**Branch A — Both endpoints are modules (FR-DLS-10):**
- Same validation as flat handler (ports, directions, no self-loop, no duplicate)
- Same linkType derivation, SLS traversal, DataLink creation
- DataLink is written to `edit_actions` (persisted) but is **not** included in the response
- Response: `UseCaseComponentsWithSubsystemsReadModel(subsystemDataLinks, autoCreatedDataPorts)`

**Branch B — At least one endpoint is a subsystem (FR-DLS-11):**
- Validate `isInterUsecase` and `isEc` are absent (FR-DLS-11 last para)
- Validate port exists; validate subsystem port occupancy (FR-DLS-07); validate portIoType (FR-DLS-08)
- Allocate one SLS systemId; no DataLink created
- Construct one `SubsystemDataLink` with `dataLinkSystemId = null`
- Write one `SubsystemDataLink` CREATE edit_action
- Response: `UseCaseComponentsWithSubsystemsReadModel(subsystemDataLinks: [sls], autoCreatedDataPorts: [])`

**Node type detection:** a node is a subsystem if it exists in the `subsystems` table (overlay-aware). Query via `subsystemRepo.subsystemExists()`.

---

## 6. Read Models

### 6.1 SubsystemDataLinkReadModel (new)

```
packages/core/src/application/ports/persistence/query-services/usecase/query-models/subsystem-data-link-read-model.ts
```

```typescript
interface SubsystemDataLinkReadModel {
  systemId: number;
  sourceNodeSystemId: number;
  destinationNodeSystemId: number;
  sourcePortSystemId: number;
  destinationPortSystemId: number;
  dataLinkSystemId: number | null;
}
```

### 6.2 UseCaseComponentsWithSubsystemsReadModel (new)

```
packages/core/src/application/ports/persistence/query-services/usecase/query-models/usecase-components-with-subsystems-read-model.ts
```

```typescript
class UseCaseComponentsWithSubsystemsReadModel {
  constructor(
    readonly subsystemDataLinks: SubsystemDataLinkReadModel[],
    readonly autoCreatedDataPorts: DataPortReadModel[],
  )
}
```

Constructed directly by the handler from the domain objects — no additional DB read needed.

---

## 7. API Layer Changes

### 7.1 Controller updates

`DataLinkController`:
- `createDataLink()` instantiates `CreateDataLinkFlatCommand` from `CreateDataLinkFlatRequest`
- `createDataLinkWithSubsystems()` instantiates `CreateDataLinkWithSubsystemsCommand` from `CreateDataLinkWithSubsystemsRequest`
- `toComponentCollectionDto()` maps `UseCaseComponentsReadModel` (unchanged)
- `toComponentCollectionWithSubsystemsDto()` maps `UseCaseComponentsWithSubsystemsReadModel` → populates `subsystems = []`, populates `dataLinks = []`, and maps SLS to a new `SubsystemDataLinkDto`

### 7.2 New DTOs (packages/api)

`SubsystemDataLinkDto` — maps from `SubsystemDataLinkReadModel`.  
`CreateDataLinkFlatRequest` — replaces `CreateDataLinkRequest`.  
`CreateDataLinkWithSubsystemsRequest` — new.

### 7.3 Command registry update

`CommandHandlerRegistry` is updated to register:
- `CreateDataLinkFlatCommand` → `CreateDataLinkFlatHandler`
- `CreateDataLinkWithSubsystemsCommand` → `CreateDataLinkWithSubsystemsHandler`

The old `CreateDataLinkCommand` → `CreateDataLinkHandler` registration is removed.

---

## 8. File and Port Scaffolding

**Existing files modified:**
- `packages/core/src/application/ports/persistence/repositories/subsystem/subsystem.repository.ts` — add `getAllNodesWithParents()`
- `packages/core/src/application/ports/persistence/unit-of-work.ts` — add `getDataLinkEditRepository()`
- `packages/core/src/application/orchestration/cqrs/registries/command-handler-registry.ts` — update registrations
- `packages/api/src/infrastructure-wrapper/persistence/unit-of-work/typeorm-unit-of-work.ts` — implement `getDataLinkEditRepository()`
- `packages/api/src/presentation/rest/modules/data-link/data-link.controller.ts` — update to new commands and DTOs
- Subsystem repository TypeORM adapter — add `getAllNodesWithParents()`

**New files:**
- Core commands × 2
- Core handlers × 2
- Core read models × 2 (`SubsystemDataLinkReadModel`, `UseCaseComponentsWithSubsystemsReadModel`)
- Core port: `data-link-edit.repository.ts`
- Persistence adapter: `data-link-edit.repository.ts` (TypeORM implementation)
- Persistence adapter: extend `typeorm-subsystem.repository.ts`
- API: `CreateDataLinkFlatRequest`, `CreateDataLinkWithSubsystemsRequest`, `SubsystemDataLinkDto`

**Deleted files:**
- `packages/core/src/application/usecase-designer/data-links/create/create-data-link.command.ts` (replaced)
- `packages/core/src/application/usecase-designer/data-links/create/create-data-link.handler.ts` (replaced)
- `packages/api/src/presentation/rest/modules/data-link/dto/request/create-data-link-request.dto.ts` (replaced)

---

## 9. Requirements–Design Alignment Check

| Requirement | Design Element |
|---|---|
| FR-DL-01 — endpoint + request body | §2.1, §7.1 |
| FR-DL-02 — module-only validation | §5.1 step 4 |
| FR-DL-03 — node/port existence | §5.1 step 4 |
| FR-DL-04 — port direction | §5.1 step 4 |
| FR-DL-05 — port ownership | §5.1 step 4 |
| FR-DL-06 — no self-loops | §5.1 step 4 |
| FR-DL-07 — duplicate 409 | §5.1 step 5 |
| FR-DL-07a — soft-delete re-activation | §5.1a, §4.1 reactivateDataLink |
| FR-DL-08 — subgraph IDs server-derived | §5.1 step 6 |
| FR-DL-09 — linkType derivation | §5.1 step 6 |
| FR-DL-10 — EC flag constraint | §5.1 step 6 |
| FR-DL-11 — subsystem boundary traversal | §5.1 steps 7–9 |
| FR-DL-12 — flat response | §6, §7.1 |
| FR-DL-13 — persistence via edit_actions | §4.3 |
| FR-DLS-01–09 — subsystem endpoint validation | §5.2 |
| FR-DLS-10 — both modules: full traversal | §5.2 Branch A |
| FR-DLS-11 — subsystem endpoint: single SLS | §5.2 Branch B |
| FR-DLS-12 — edit_actions persistence | §4.3 |
| FR-DLS-14 — subsystem response | §6.2, §7.1 |
| FR-SVC-01–04 — path service: no change | §1 (SubsystemBoundaryPathService untouched) |
| I1–I10 — invariants | enforced in handler validations §5.1/5.2 |

---

## 10. Verification

1. Run unit tests in `packages/core/tests/unit/application/usecase-designer/data-links/`
2. Run integration tests in `packages/infrastructure/persistence/tests/integration/repositories/data-link/`
3. Run E2E tests in `packages/api/tests/e2e/` covering:
   - Happy path flat: POST /data-links with module endpoints, no cross-subsystem
   - Happy path flat: POST /data-links with cross-subsystem (SLS auto-created)
   - Happy path subsystem: POST /data-links/with-subsystems both modules
   - Happy path subsystem: POST /data-links/with-subsystems with one subsystem endpoint
   - Re-activation: POST after DELETE for same port pair
   - 409: POST for duplicate active link
   - 422: wrong port direction, wrong port ownership, subsystem where module expected, etc.
   - 404: non-existent node/port
