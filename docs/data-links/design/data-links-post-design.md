# Design: POST /data-links and POST /data-links/with-subsystems

Requirements: [../requirements/data-links-post-requirements.md](../requirements/data-links-post-requirements.md)

**Status:** APPROVED  
**Date:** 2026-08-12

---

## 1.1 Link Classification Contract

Data-link requests supply `linkType` directly. The legacy shared `LinkType`,
derived `INTRA_*`, and internal `isEc` contracts are removed.

```typescript
DATA_LINK_TYPE = {
  Normal: 'NORMAL',
  InterUsecase: 'INTER_USECASE',
  Ec: 'EC',
}
```

`NORMAL` requires endpoints in the same usecase, `INTER_USECASE` requires
endpoints in different usecases, and `EC` is invalid only when both endpoints
are in the same subgraph. Classification mismatches return `422`.

Subsystem domain objects retain `linkType` in memory. Pending subsystem CREATE
payloads store it in `edit_actions.newValue.linkType`; resolved subsystem links
derive it from their owning canonical link, while unresolved/action-only links
use the pending payload. Subsystem tables do not persist classification
columns.

The file format remains unchanged: upload maps `isEcLink` to `EC`, and download
maps `EC` back to `isEcLink: true`.

---

## 1. Architecture Overview

Two separate endpoints, two separate command+handler pairs. Both share the same `DataLinkEditRepository` write port and `SubsystemBoundaryPathService` for traversal segment derivation.

All writes go through `PendingChangeWriter.writeCreate()` into `edit_actions`, following the CREATE Spf Module pattern exactly (FR-DL-13, FR-DLS-12).

```
Controller
  ├── POST /data-links              → CreateDataLinkCommand        → CreateDataLinkHandler
  └── POST /data-links/with-subsystems → CreateDataLinkWithSubsystemsCommand → CreateDataLinkWithSubsystemsHandler

Both handlers use:
  - SubsystemRepository.getAllNodesWithParents()  (nodeParentMap load)
  - SubsystemBoundaryPathService.compute()  (traversal segments)
  - DataLinkEditRepository                        (write port, new)
    └── PendingChangeWriter.writeCreate()         (edit_actions insertion)
```

`SubsystemBoundaryPathService` provides the shared traversal segment descriptors.
The upload path uses the same descriptor output, preserving its traversal behavior.

---

## 2. New Commands and Request DTOs

The data-link commands accept `linkType: DataLinkType`. All systemId fields are
`string` (matching the API convention).

### 2.1 CreateDataLinkCommand

```
packages/core/src/application/usecase-designer/data-links/create/
  create-data-link.command.ts
  create-data-link.handler.ts
```

```typescript
class CreateDataLinkCommand extends BaseCommand {
  constructor(
    readonly sourceModuleSystemId: string,
    readonly sourcePortSystemId: string,
    readonly destinationModuleSystemId: string,
    readonly destinationPortSystemId: string,
    readonly linkType: DataLinkType,
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
    readonly linkType: DataLinkType,
  )
}
```

### 2.3 Request DTOs (packages/api)

`CreateDataLinkRequest` — fields match FR-DL-01; all systemId fields
`@IsString()` and `linkType` is validated against `DATA_LINK_TYPE`.
`CreateDataLinkWithSubsystemsRequest` — fields match FR-DLS-01; all systemId
fields `@IsString()` and `linkType` is validated against `DATA_LINK_TYPE`.

`CreateDataLinkRequest` uses `linkType` rather than the former `type` field.

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
6. **linkType validation** (FR-LTC-06): load source/dest module subgraph and usecase context and validate the client-supplied `linkType`.
7. **nodeParentMap** load via `subsystemRepo.getAllNodesWithParents(fileSystemId)` (FR-DL-11)
8. **Segment derivation**: `SubsystemBoundaryPathService.compute({sourceNodeSystemId, destinationNodeSystemId, nodeParentMap})`
9. If `segments.length > 0` (cross-subsystem traversal):
   - For each descriptor endpoint with a non-null boundary port type: allocate a boundary DataPort systemId with that `portIoType`
   - For each descriptor: construct the corresponding `SubsystemDataLink` using its source and destination node IDs
10. Construct `DataLink` domain object with all SLS attached
11. `dataLinkEditRepo.createDataLink(dataLink)` — writes all `edit_actions` with shared `groupId`
12. `uow.commit()`
13. Return `UseCaseComponentsReadModel` with `dataLinks: [DataLinkReadModel]`

**§5.1a Re-activation path (FR-DL-07a):** Skip create; derive fresh SLS chain (steps 7–10); call `dataLinkEditRepo.reactivateDataLink(systemId, aggregateId, payload)` for the DataLink; then write fresh SLS + boundary port CREATE rows. All share the same `groupId`.

### 5.2 CreateDataLinkWithSubsystemsHandler

```
packages/core/src/application/usecase-designer/data-links/create/create-data-link-with-subsystems.handler.ts
```

**Step 0 — shared upfront validation:** self-loop check (FR-DLS-04), then validate the client-supplied `linkType` against endpoint topology before branching.

**Branch A (`handleModuleLinks`) — Both endpoints are modules (FR-DLS-10):**
- Same validation as flat handler (ports, directions, no self-loop, no duplicate)
- Same linkType validation, SLS traversal, DataLink creation
- DataLink is written to `edit_actions` (persisted) but is **not** included in the response
- Response: `UseCaseComponentsWithSubsystemsReadModel(subsystemDataLinks, autoCreatedDataPorts)`

**Branch B (`handleSubsystemLinks`) — At least one endpoint is a subsystem (FR-DLS-11):**
- Accept `linkType` and retain it on the unresolved subsystem link without applying module-to-module canonical-link validation
- Validate port exists; validate subsystem port occupancy (FR-DLS-07); validate portIoType (FR-DLS-08)
- Allocate one SLS systemId; no DataLink created
- Construct one `SubsystemDataLink` with `dataLinkSystemId = null` and the requested `linkType`
- Write one `SubsystemDataLink` CREATE edit_action with `linkType` in `newValue`
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
- `createDataLink()` instantiates `CreateDataLinkCommand` from `CreateDataLinkRequest`
- `createDataLinkWithSubsystems()` instantiates `CreateDataLinkWithSubsystemsCommand` from `CreateDataLinkWithSubsystemsRequest`
- `toComponentCollectionDto()` maps `UseCaseComponentsReadModel` (unchanged)
- `toComponentCollectionWithSubsystemsDto()` maps `UseCaseComponentsWithSubsystemsReadModel` → populates `subsystems = []`, populates `dataLinks = []`, and maps SLS to a new `SubsystemDataLinkDto`

### 7.2 New DTOs (packages/api)

`SubsystemDataLinkDto` — maps from `SubsystemDataLinkReadModel`.  
`CreateDataLinkRequest` — accepts `linkType: DataLinkType`.
`CreateDataLinkWithSubsystemsRequest` — accepts `linkType: DataLinkType`.

### 7.3 Command registry update

`CommandHandlerRegistry` is updated to register:
- `CreateDataLinkCommand` → `CreateDataLinkHandler`
- `CreateDataLinkWithSubsystemsCommand` → `CreateDataLinkWithSubsystemsHandler`

The command registrations use the type-specific `DataLinkType` classification.

---

## 8. File and Port Scaffolding

**Existing files modified:**
- `packages/core/src/application/ports/persistence/repositories/subsystem/subsystem.repository.ts` — add `getAllNodesWithParents()`
- `packages/core/src/application/ports/persistence/unit-of-work.ts` — add `getDataLinkEditRepository()`
- `packages/core/src/domain/entities/usecase-data/links/subsystem-data-link.ts` — retain transient `linkType`
- `packages/infrastructure/persistence/.../entity-schema/usecase-data/Links/subsystem-data-link.schema.ts` — omit classification columns
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
- API: `CreateDataLinkRequest`, `CreateDataLinkWithSubsystemsRequest`, `SubsystemDataLinkDto`

**Deleted files:** None for the classification change. Existing commands,
handlers, and request DTOs are updated in place.

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
| Classification contract — client classification and topology validation | §1.1, §5.1 step 6 |
| FR-DL-11 — subsystem boundary traversal | §5.1 steps 7–9 |
| FR-DL-12 — flat response | §6, §7.1 |
| FR-DL-13 — persistence via edit_actions | §4.3 |
| FR-DLS-01–09 — subsystem endpoint validation | §5.2 |
| FR-DLS-10 — both modules: full traversal | §5.2 Branch A |
| FR-DLS-11 — subsystem endpoint: single SLS | §5.2 Branch B |
| FR-DLS-12 — edit_actions persistence | §4.3 |
| FR-DLS-14 — subsystem response | §6.2, §7.1 |
| FR-SVC-01–03 — traversal service contract and upload integration | §1, §5.1 steps 8-9 |
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
