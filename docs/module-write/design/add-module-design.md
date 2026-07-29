<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Add Module — Design

**Status:** Draft
**Owner:** Nithin Simon

**Requirements:** [`../requirements/add-module-requirements.md`](../requirements/add-module-requirements.md)
**Parent design:** [`../overall-design.md`](../overall-design.md)
**Handler guidelines:** `.agents/skills/add-write-api/references/handler-design-guidelines.md`
**Depends on:** LLD1 (Foundation), LLD2 PATCH chapter (complete)

---

## 1. Scope

This document specifies the implementation design for `POST /projects/:projectId/spf-modules` (Add Module), including all requirements added beyond the original LLD2 chapter 03 scope. It also covers the PATCH container-change stack size enhancement (FR-CSS-08), delivered via a shared `ContainerStackSizeService`.

---

## 2. Architecture Overview

No new layers. The design adds:
- A domain-layer rename and one new domain-layer utility file.
- One new port interface (`SubgraphRepository`) + new accessor on `UnitOfWork`.
- Three new methods on existing port interfaces (`ContainerRepository`, `ModuleRepository`).
- Schema changes: `is_imported` rename on `subgraphs`, `heap_property` new column on `spf_modules`.
- One new application service (`ContainerStackSizeService`).
- `AddModuleHandler` + `AddModuleCommand` (new).
- `PatchSpfModuleHandler` extended (stack size on container change).

Handler pattern follows established conventions from `handler-design-guidelines.md`:
- `handle(command)` — no `uow` param; `UnitOfWork` is constructor-injected.
- Returns success payload directly: `Promise<{groupId: string}>`.
- All failures throw exceptions: `ResourceNotFoundException` (404), `DomainRuleViolationException([...])` (422).

```
@arc/api
  SpfModuleController.addSpfModule (POST /spf-modules)
  @UseGuards(SessionGuard)
        │ commandBus.execute(AddModuleCommand, session)
        ▼
@arc/core (application / usecase-designer)
  AddModuleHandler
    ├── ContainerStackSizeService (also used by PatchSpfModuleHandler)
    ├── SubgraphRepository.getSubgraphById
    ├── ContainerRepository (getContainerById, getPropertyValue, setPropertyValue)
    ├── ModuleDefinitionRepository.findByModuleIdAndProcId
    ├── SubsystemRepository.subsystemExists
    └── ModuleRepository.createModule
@arc/core (domain utils)
  decodeUint32Le / encodeUint32Le  (new — property-encoding.ts)
  spf-ids.ts constants (existing — CONTAINER_PROP_ID_STACK_SIZE, CONTAINER_HEAP_PROP_ID, HEAP_ID_DEFAULT)
@arc/persistence
  TypeOrmSubgraphRepository (getSubgraphById)
  TypeOrmContainerRepository (getPropertyValue, setPropertyValue)
  TypeOrmModuleRepository (getModulesWithStackSizeByContainer)
  TypeOrmUnitOfWork (new getSubgraphRepository accessor)
```

---

## 3. Domain Layer Changes

### 3.1 Subgraph: rename `isExported` → `isImported`

**File:** `packages/core/src/domain/entities/usecase-data/subgraph/subgraph.ts`

Rename the `isExported: boolean` property to `isImported: boolean`. Semantics unchanged: `true` means the subgraph originated from an external file and is read-only for structural modifications.

All downstream files that construct or read this field are updated in the same chapter:
- Domain entity: `packages/core/src/domain/entities/usecase-data/subgraph/subgraph.ts`
- TypeORM schema: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/usecase-data/subgraph/subgraph.schema.ts` — rename column `is_exported` → `is_imported`
- Entity builder: `packages/core/src/application/file-operations/upload-file/services/entity-builders/subgraph-builder.ts`
- All unit tests referencing `isExported`: `calibration-data-builder.spec.ts`, `subgraph-builder.spec.ts`
- Migration regenerated after schema update.

### 3.2 Container property IDs — use existing constants

**No new file.** The constants already exist in `packages/core/src/application/file-operations/shared/constants/spf-ids.ts`:

```ts
export const CONTAINER_PROP_ID_STACK_SIZE = 0x08_00_10_13;
export const CONTAINER_HEAP_PROP_ID       = 0x08_00_11_74;
export const DEFAULT_CONTAINER_STACK_SIZE = 0xff_ff_ff_ff;
export const HEAP_ID_DEFAULT              = 1;
```

All new code imports directly from `spf-ids.ts`. No additional constant file is created.

### 3.3 Uint32 LE encoding utilities

**File (new):** `packages/core/src/domain/utils/property-encoding.ts`

```ts
export function decodeUint32Le(blob: Uint8Array): number {
  return (blob[0] | (blob[1] << 8) | (blob[2] << 16) | (blob[3] << 24)) >>> 0;
}

export function encodeUint32Le(value: number): Uint8Array {
  const buf = new Uint8Array(4);
  buf[0] = value & 0xff;
  buf[1] = (value >>> 8) & 0xff;
  buf[2] = (value >>> 16) & 0xff;
  buf[3] = (value >>> 24) & 0xff;
  return buf;
}
```

Pure functions, zero dependencies — safe for `@arc/core` domain layer.

---

## 4. Schema Changes

### 4.1 `subgraphs` table — rename column

`is_exported` → `is_imported`. Migration regenerated via the project's `initial-create` workflow (CLAUDE.md §Database Migration Workflow).

### 4.2 `spf_modules` table — new column

Add `heap_property INTEGER NOT NULL DEFAULT 1`. Stored as a plain integer — the 4-byte LE encoding is only needed for the `.acdb` binary format, not for the SQLite column.

---

## 5. Port Interface Changes (`@arc/core`)

**Naming convention (established by existing codebase):** `ModuleRepository`, `ContainerRepository`, `ModuleDefinitionRepository` — no `Edit` suffix. UoW accessors: `getModuleRepository()`, `getContainerRepository()`, `getModuleDefinitionRepository()`.

### 5.1 `SubgraphRepository` — new port

**File (new):** `packages/core/src/application/ports/persistence/repositories/subgraph/subgraph.repository.ts`

```ts
export interface SubgraphRepository {
  getSubgraphById(systemId: number, fileSystemId: number): Promise<Subgraph | null>;
  createSubgraph(subgraph: Subgraph, options?: EditOptions): Promise<void>;
}
```

`UnitOfWork` gains accessor `getSubgraphRepository(): SubgraphRepository`. `TypeOrmUnitOfWork` implements it.

Also needed: `SubsystemRepository` (existence check only) with `subsystemExists(systemId, fileSystemId): Promise<boolean>`, accessible via `uow.getSubsystemRepository()`.

### 5.2 `ContainerRepository` — extend with property methods

Add to `packages/core/src/application/ports/persistence/repositories/container/container.repository.ts`:

```ts
getPropertyValue(
  containerSystemId: number,
  propertySystemId: number,
  fileSystemId: number,
): Promise<Uint8Array | null>;

setPropertyValue(
  containerSystemId: number,
  propertySystemId: number,
  value: Uint8Array,
  options?: EditOptions,
): Promise<void>;
```

Persistence is entirely generic — reads/writes blobs by `propertySystemId`. Core owns semantic mapping via `spf-ids.ts` constants.

`setPropertyValue` stages a `container_property_data` UPDATE (existing row) or CREATE (new row) via `PendingChangeWriter`. `aggregateId = containerSystemId`.

### 5.3 `ModuleRepository` — extend with stack size read

Add to `packages/core/src/application/ports/persistence/repositories/module/module.repository.ts`:

```ts
getModulesWithStackSizeByContainer(
  containerSystemId: number,
  fileSystemId: number,
): Promise<Array<{ moduleSystemId: number; stackSize: number }>>;
```

Joins `spf_modules` with `spf_module_definitions` on `definition_system_id`. Returns `stack_size` from the definition for every module in the container. Returns empty array for empty containers. Committed state only — no overlay.

---

## 6. `ContainerStackSizeService` (`@arc/core` application layer)

**File (new):** `packages/core/src/application/usecase-designer/spf-module/services/container-stack-size.service.ts`

Encapsulates all stack size read/write logic. Shared by `AddModuleHandler`, `PatchSpfModuleHandler`, and future `DeleteModuleHandler` (LLD5).

```ts
export class ContainerStackSizeService {
  constructor(private readonly uow: UnitOfWork) {}

  async initializeStackSize(
    containerSystemId: number,
    moduleStackSize: number,
  ): Promise<void>;

  async updateOnAdd(
    containerSystemId: number,
    moduleStackSize: number,
    fileSystemId: number,
  ): Promise<void>;

  async recalculateForContainer(
    containerSystemId: number,
    fileSystemId: number,
  ): Promise<void>;
}
```

**Implementation notes:**
- All three methods use `CONTAINER_PROP_ID_STACK_SIZE` from `spf-ids.ts` and `decodeUint32Le`/`encodeUint32Le` from `property-encoding.ts`.
- `getPropertyValue` returning `null` → treat current value as 0.
- `initializeStackSize`: skip write when `moduleStackSize === 0`. Otherwise `containerRepo.setPropertyValue(..., CONTAINER_PROP_ID_STACK_SIZE, encodeUint32Le(moduleStackSize))`.
- `updateOnAdd`: read current → decode → write only if `moduleStackSize > current`.
- `recalculateForContainer`: `moduleRepo.getModulesWithStackSizeByContainer(...)` → `Math.max(...sizes, 0)` → `containerRepo.setPropertyValue` unconditionally.
- Accesses `uow.getContainerRepository()` and (in `recalculateForContainer`) `uow.getModuleRepository()` — no extra constructor params.

**Registration:** Both `AddModuleHandler` and `PatchSpfModuleHandler` receive a `ContainerStackSizeService` instance constructed in `CommandHandlerRegistry` with the shared `uow`.

---

## 7. `AddModuleHandler` + `AddModuleCommand` (`@arc/core`)

**Files (new):**
- `packages/core/src/application/usecase-designer/spf-module/add-module/add-module.command.ts`
- `packages/core/src/application/usecase-designer/spf-module/add-module/add-module.handler.ts`

Pattern: `handle(command)` — UoW constructor-injected, returns `Promise<{groupId: string}>`, throws on all failures.

### Command

```ts
export class AddModuleCommand extends BaseCommand {
  static override readonly requiresSession = true;
  static override readonly allowedModes: readonly SessionMode[] = [
    SESSION_MODE.Designer,
    SESSION_MODE.DiffMerge,
  ];

  constructor(
    clientId: string,
    public readonly moduleId: number,
    public readonly procId: number,
    public readonly parentId: number | null,
    public readonly subgraphSystemId: number | null,
    public readonly containerSystemId: number | null,
  ) { super(clientId); }
}
```

### Handler skeleton

```ts
export class AddModuleHandler implements CommandHandler<AddModuleCommand, {groupId: string}> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
    private readonly naturalIdGeneration: NaturalIdGenerationPort,
    private readonly stackSizeService: ContainerStackSizeService,
  ) {}

  async handle(command: AddModuleCommand): Promise<{groupId: string}> {
    const uow = this.uow;
    const fileSystemId = uow.getWriteContext().session.fileSystemId;

    await uow.startTransaction();
    try {
      // 1. Load definition — throw ResourceNotFoundException on miss
      // 2. Optional parentId subsystem check — throw ResourceNotFoundException on miss
      // 3. Subgraph resolution:
      //    Variant 1 (null): allocate systemId+naturalId; new Subgraph({isImported:false}); createSubgraph
      //    Variants 2/3: getSubgraphById → null=404; isImported=true → DomainRuleViolationException([ARC-MOD-SUBGRAPH-IMPORTED])
      // 4. Container resolution:
      //    Variants 1/2 (null): allocate ids; buildContainerCopy or new Container; createContainer
      //                         stackSizeService.initializeStackSize(containerSystemId, definition.stackSize)
      //    Variant 3: getContainerById → null=404; type compat check → DomainRuleViolationException([ARC-MOD-CONTAINER-TYPE-INCOMPATIBLE])
      //               stackSizeService.updateOnAdd(containerSystemId, definition.stackSize, fileSystemId)
      // 5. Heap: getPropertyValue(containerSystemId, CONTAINER_HEAP_PROP_ID, fileSystemId)
      //          heapValue = blob ? decodeUint32Le(blob) : HEAP_ID_DEFAULT
      // 6. Materialize static DataPort[] + ControlPort[] from definition
      //    - dataPortId/portId come from definition staticPortDefinitions, NOT naturalIdGeneration
      //    - systemId per port via idGeneration.getNextId(fileSystemId)
      // 7. moduleSystemId = idGeneration.getNextId(fileSystemId)
      //    instanceId = naturalIdGeneration.getNextId(fileSystemId, NaturalIdType.MODINSTANCE)
      // 8. new SpfModule({..., heapProperty: heapValue})
      // 9. moduleRepo.createModule(module)
      await uow.commit();
      return {groupId: uow.getWriteContext().groupId};
    } catch (error) {
      if (uow.isInTransaction()) await uow.rollback();
      throw error;
    }
  }
}
```

**New issue codes** (for `DomainRuleViolationException`):

| Code | HTTP | Meaning |
|---|---|---|
| `ARC-MOD-SUBGRAPH-IMPORTED` | 422 | Provided subgraph is imported — structural changes disallowed |

`ARC-MOD-CONTAINER-TYPE-INCOMPATIBLE` is reused from PatchSpfModuleHandler via `IssueFactory`.

---

## 8. `PatchSpfModuleHandler` Enhancement

**File:** `packages/core/src/application/usecase-designer/spf-module/patch/patch-spf-module.handler.ts`

The only change is inside `applyContainerChange`. Replace the existing TODO comment at line 207 (`// Add TODO: recalculate stack size...`) with:

```ts
// FR-CSS-08: recalculate old container (module is leaving it)
await this.stackSizeService.recalculateForContainer(module.containerSystemId, fileSystemId);
// FR-CSS-03: update new container (module is entering it)  
await this.stackSizeService.updateOnAdd(newContainerId, definition.stackSize, fileSystemId);
```

`definition` is already in scope (loaded for type-compat check). `module.containerSystemId` is the old container before the change.

Constructor updated to accept `ContainerStackSizeService`:
```ts
constructor(
  private readonly uow: UnitOfWork,
  private readonly idGeneration: IdGenerationPort,
  private readonly stackSizeService: ContainerStackSizeService,
) {}
```

`CommandHandlerRegistry` entries:
```ts
// Updated:
PatchSpfModuleCommand → new PatchSpfModuleHandler(deps.uow, deps.idGeneration, deps.stackSizeService)
// New:
AddModuleCommand      → new AddModuleHandler(deps.uow, deps.idGeneration, deps.naturalIdGeneration, deps.stackSizeService)
```

`CommandHandlerDependencies` gains `stackSizeService: ContainerStackSizeService` (constructed once with `deps.uow`).

---

## 9. Persistence Adapters (`@arc/persistence`)

### 9.1 `TypeOrmSubgraphRepository` — implement `getSubgraphById` + `createSubgraph`

`SELECT * FROM subgraphs WHERE system_id = ? AND file_system_id = ?`. Map to domain `Subgraph` with `isImported` from the renamed column. `createSubgraph` → `writer.writeCreate({ targetTable: Subgraph, targetSystemId: subgraph.systemId, aggregateId: subgraph.systemId, payload: {...} })`.

### 9.2 `TypeOrmContainerRepository` — implement `getPropertyValue` + `setPropertyValue`

- `getPropertyValue`: `SELECT payload FROM container_property_data WHERE container_system_id = ? AND property_system_id = ? AND file_system_id = ?`. Return null if no row; cast blob to `Uint8Array`.
- `setPropertyValue`: check for existing row by `(container_system_id, property_system_id)`. If exists → `writer.writeDelta(...)`. If no row → allocate new systemId via `IdGenerationPort` + `writer.writeCreate(...)`. `aggregateId = containerSystemId`.

### 9.3 `TypeOrmModuleRepository` — implement `getModulesWithStackSizeByContainer`

```sql
SELECT sm.system_id AS moduleSystemId, COALESCE(smd.stack_size, 0) AS stackSize
FROM spf_modules sm
LEFT JOIN spf_module_definitions smd ON smd.system_id = sm.definition_system_id
WHERE sm.container_system_id = ? AND sm.file_system_id = ?
```

Returns committed data only.

### 9.4 `TypeOrmModuleRepository` — extend `createModule` for `heapProperty`

The SpfModule CREATE payload includes `heap_property: module.heapProperty`. No interface change — `SpfModule` carries the field after the domain entity update.

### 9.5 `TypeOrmUnitOfWork` — add `getSubgraphRepository()` + `getSubsystemRepository()`

Construct and return `TypeOrmSubgraphRepository` and `TypeOrmSubsystemRepository` scoped to the current `queryRunner`.

---

## 10. `AddModuleCommand` and API Wiring

**Controller** follows the pattern from `handler-design-guidelines.md §4` exactly:

```ts
@Post()
@HttpCode(HttpStatus.OK)
@UseGuards(SessionGuard)
async addSpfModule(
  @Param('projectId', ParseIntPipe) projectId: number,
  @Body() dto: AddModuleRequestDto,
  @ArcSession() session: ActiveSession,
): Promise<ApiResult<SpfModuleDto>> {
  await this.commandBus.execute<{groupId: string}>(
    new AddModuleCommand('api-client', dto.moduleId, dto.procId, dto.parentId ?? null, dto.subgraphSystemId ?? null, dto.containerSystemId ?? null),
    session,
  );
  // Follow-up read via existing SpfModuleQuery to return the created module DTO.
  // Module systemId recovery: query edit_actions WHERE group_id = ? AND target_table = 'SpfModule'
  // to get the newly staged module systemId, then feed to SpfModuleQuery.
  // ...
}
```

**`AddModuleRequestDto`** fields: `moduleId: number`, `procId: number`, `parentId?: number | null`, `subgraphSystemId?: number | null`, `containerSystemId?: number | null`. All optional fields use `@IsOptional()` + `@IsInt()`.

---

## 11. `UnitOfWork` — new accessors

`getSubgraphRepository(): SubgraphRepository` and `getSubsystemRepository(): SubsystemRepository` added to the core port.

---

## 12. Testing Strategy

### 12.1 Unit tests (`@arc/core`)

**`ContainerStackSizeService`:**
- `initializeStackSize`: calls `setPropertyValue` with correct encoded value; skips write when `moduleStackSize === 0`.
- `updateOnAdd`: writes when incoming > current; skips when incoming ≤ current; treats null blob as 0.
- `recalculateForContainer`: correct max; writes 0 when no modules remain.

**`AddModuleHandler`:**
- All three variants happy path — `createModule` called with correct `SpfModule`.
- Definition miss → `ResourceNotFoundException`.
- Subsystem miss (parentId provided) → `ResourceNotFoundException`.
- Provided subgraph miss → `ResourceNotFoundException`.
- Provided subgraph `isImported = true` → `DomainRuleViolationException` with `ARC-MOD-SUBGRAPH-IMPORTED`; rollback called.
- Variant 3 container miss → `ResourceNotFoundException`.
- Variant 3 type mismatch → `DomainRuleViolationException` with `ARC-MOD-CONTAINER-TYPE-INCOMPATIBLE`; rollback called.
- Variants 1/2: `initializeStackSize` called; Variant 3: `updateOnAdd` called.
- `createModule` receives `SpfModule` with correct `heapProperty` (container value or `HEAP_ID_DEFAULT`).

**`decodeUint32Le` / `encodeUint32Le`:** round-trip for 0, 1, 1024, `0xFFFFFFFF`.

**`PatchSpfModuleHandler` new cases:** container change triggers `recalculateForContainer` on old container and `updateOnAdd` on new container.

### 12.2 Integration tests (`@arc/persistence`)

- `SubgraphRepository.getSubgraphById`: returns correct entity with `isImported`; null for missing.
- `ContainerRepository.getPropertyValue`/`setPropertyValue`: correct blob read/write; CREATE for new property row; UPDATE for existing.
- `ModuleRepository.getModulesWithStackSizeByContainer`: correct pairs; empty array for empty container.
- Add Module write path: Variant 1 produces Subgraph CREATE + Container CREATE + stack size property CREATE + Node CREATE + SpfModule CREATE (with `heap_property`) + port CREATEs — all sharing one `group_id`.

### 12.3 E2E tests (`@arc/api`)

- 403: no session / wrong mode.
- 404: definition not found; provided subgraph not found; provided container not found; parentId subsystem not found.
- 422 `ARC-MOD-SUBGRAPH-IMPORTED`: provided subgraph has `isImported = true`.
- 422 `ARC-MOD-CONTAINER-TYPE-INCOMPATIBLE`: Variant 3 type mismatch.
- 200 Variant 1: `SpfModuleDto` includes `heapProperty`.
- PATCH container change: stack size updated on both old and new containers.

---

## 13. File Layout

**New files:**
- `packages/core/src/domain/utils/property-encoding.ts`
- `packages/core/src/application/ports/persistence/repositories/subgraph/subgraph.repository.ts`
- `packages/core/src/application/usecase-designer/spf-module/add-module/add-module.command.ts`
- `packages/core/src/application/usecase-designer/spf-module/add-module/add-module.handler.ts`
- `packages/core/src/application/usecase-designer/spf-module/services/container-stack-size.service.ts`
- `packages/api/src/presentation/rest/modules/spf-module/dto/request/add-module-request.dto.ts`
- Subsystem port interface (if not already present)
- Test files (three layers)

**Modified files:**
- `packages/core/src/domain/entities/usecase-data/subgraph/subgraph.ts` — rename `isExported`→`isImported`
- `packages/core/src/domain/entities/usecase-data/module/spf-module.ts` — add `heapProperty: number`
- `packages/core/src/application/ports/persistence/repositories/container/container.repository.ts` — add property methods
- `packages/core/src/application/ports/persistence/repositories/module/module.repository.ts` — add `getModulesWithStackSizeByContainer`
- `packages/core/src/application/ports/persistence/unit-of-work.ts` — add `getSubgraphRepository()`, `getSubsystemRepository()`
- `packages/core/src/application/orchestration/cqrs/registries/command-handler-registry.ts` — new + updated entries
- `packages/core/src/application/orchestration/cqrs/dependencies/command-handler-dependencies.ts` — add `stackSizeService`
- `packages/core/src/application/usecase-designer/spf-module/patch/patch-spf-module.handler.ts` — add stack size calls + `stackSizeService` to constructor
- `packages/core/src/index.ts` — export new types and commands
- Subgraph entity builder + test files (`isExported`→`isImported`)
- Subgraph TypeORM schema + migration
- SpfModule TypeORM schema + migration
- `packages/infrastructure/persistence/src/.../repositories/subgraph/subgraph.repository.ts` — new adapter
- `packages/infrastructure/persistence/src/.../repositories/container/container.repository.ts` — add property methods
- `packages/infrastructure/persistence/src/.../repositories/module/module.repository.ts` — add `getModulesWithStackSizeByContainer`; update `createModule` payload
- `packages/infrastructure/persistence/src/.../unit-of-work/typeorm-unit-of-work.ts` — add subgraph/subsystem accessors
- `packages/api/src/presentation/rest/modules/spf-module/spf-module.controller.ts` — implement `addSpfModule`

---

## 14. Open Questions

**OQ-4:** `setPropertyValue` for a container that has no existing property row needs a new `systemId` for the property data row. Confirm whether `IdGenerationPort` is the right allocator (consistent with all other CREATE rows), or whether property data rows use a different strategy.
