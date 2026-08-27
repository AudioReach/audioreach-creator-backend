<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# LLD2 — Module Write Path

**Status:** Draft
**Owner:** Nithin Simon

**Parent:** `overall-design.md` (this folder). Read that first for storage model, aggregate registry, and write-flow context.
**Depends on:** `foundation.md` (LLD1) — schema, `PendingChangeWriter`, `WriteContext`, `SessionGuard`, `CommandBus` mode check.
**Prior art:** `docs/superpowers/specs/2026-06-11-modification-framework-design.md` — first-pass module write path against the old schema. LLD2 supersedes it, retaining the domain-verb repo pattern but updating for the new `edit_actions` shape, `PendingChangeWriter`, and `ActiveSession` / `WriteContext`.
**Source of truth:** `docs/superpowers/specs/2026-07-04-modification-framework-requirements.md`

**Scope:** the module aggregate's write path — a consolidated PATCH endpoint for module structural updates (alias, containerId, port counts) and a POST endpoint for Add Module (three creation variants with auto-created Subgraph and Container). Also delivers the sibling `ISubgraphEditRepository`, `IContainerEditRepository`, `ISubsystemEditRepository`, `IModuleDefinitionEditRepository`, and link-read ports (`IDataLinkReadRepository`, `IControlLinkReadRepository`) needed by AddModule and PATCH port-count changes. Sized for one PR.

---

## 1. Purpose & Scope

- One paragraph on this LLD's role — the first user-visible write path on top of LLD1's foundation.
- **In scope:**
  - `IModuleEditRepository` port + adapter with domain-verb methods: `renameModule`, `changeContainer`, `changeNumberOfInputPorts`, `changeNumberOfOutputPorts`, `changeNumberOfControlPorts`, `addDataPort`, `addControlPort`, `removeDataPort`, `removeControlPort`, `createModule`.
  - `ISubgraphEditRepository` port + adapter: `subgraphExists`, `createSubgraph`. Property-data defaults on auto-create are deferred (§10).
  - `IContainerEditRepository` port + adapter: `containerExists`, `createContainer`, `getContainerById`. Property-data defaults on auto-create are deferred.
  - `ISubsystemEditRepository` port + adapter: `subsystemExists`. Subsystem CREATE/EDIT is deferred; LLD2 only validates existence when AddModule's `parentId` references one.
  - `IModuleDefinitionEditRepository` port + adapter: `findByModuleIdAndProcId`.
  - `IDataLinkReadRepository` port + adapter: `getLinksByPortSystemIds` — needed by PATCH port-count-decrease flow to detect "unused" ports.
  - `IControlLinkReadRepository` port + adapter: `getLinksByPortSystemIds` — same purpose for ControlPorts.
  - CQRS commands + handlers:
    - `PatchSpfModuleCommand` / `PatchSpfModuleHandler` — one consolidated command backing `PATCH /spf-modules/:id` with optional fields (alias, containerId, numberOfInputPorts, numberOfOutputPorts, numberOfControlPorts).
    - `AddModuleCommand` / `AddModuleHandler` — backs `POST /spf-modules` (three variants).
  - Existence validation via read ports (REQ-VAL-01, REQ-VAL-02).
  - Container-type compatibility validation on PATCH containerId change.
  - Port-count validation (against definition max) + LIFO unused-port removal on PATCH port-count decrease.
  - Wiring in `UnitOfWork`, command handler registry.
- **Out of scope:**
  - Module DELETE and last-module cascade (LLD5; see `../module-write/requirements/delete-module-requirements.md` and `../module-write/design/delete-module-design.md`).
  - Read overlay updates for module GETs (LLD3).
  - Commit service, stage/unstage APIs (LLD4).
  - Property-data seeding for auto-created Subgraph and Container (deferred; see §10 open question).
  - DiffMerge writes and definition CRUD (LLD6a-c).

---

## 2. Requirements Owned

- REQ-MOD-01 to REQ-MOD-04 (module modification rules, accumulated payload, base-version preservation).
- REQ-PORT-01 to REQ-PORT-03 (port modification rules; port names read-only per REQ-PORT-03).
- REQ-ADD-01 to REQ-ADD-08 minus REQ-ADD-04 property-data seeding which is deferred to a follow-up on LLD2 or a small dedicated LLD (§10). Specifically LLD2 delivers:
  - REQ-ADD-01 three creation variants.
  - REQ-ADD-02, REQ-ADD-03, REQ-ADD-05 default subgraph name, container type resolution, definition lookup.
  - REQ-ADD-06 port auto-creation from definition (static ports only).
  - REQ-ADD-07 (atomicity via shared `groupId`) — atomically stages every entity produced by Add Module.
  - REQ-ADD-08 multi-aggregate spanning.
- REQ-VAL-01 (existence check on UPDATE), REQ-VAL-02 (existence check on AddModule variants with provided subgraphSystemId / containerSystemId).
- REQ-SESS-06 mode allow-list enforcement — LLD2 declares `allowedModes = [DESIGNER, DIFF_MERGE]` per REQ-SESS-07 on all commands.

---

## 3. Frozen Constraints (unchanged by this LLD)

- `spf_modules`, `nodes`, `data_ports`, `control_ports`, `subgraphs`, `containers`, `spf_module_definitions` entity tables and TypeORM schemas.
- Domain entities: `SpfModule`, `DataPort`, `ControlPort`, `Subgraph`, `Container`, `SpfModuleDefinition` — imported by write repos and handlers.
- LLD1 deliverables (`PendingChangeWriter`, `WriteContext` on UoW, `SessionGuard`, `CommandBus` mode check).

---

## 4. Architecture Overview (LLD2 slice)

LLD2 sits on top of LLD1's foundation. It adds aggregate-specific edit repos + CQRS handlers, but every write ultimately flows into LLD1's `PendingChangeWriter`.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  @arc/api                                                               │
│    SpfModuleController + endpoints                                      │
│    @UseGuards(SessionGuard) applied per endpoint                        │
└───────────────────────────┬─────────────────────────────────────────────┘
                            │  commandBus.execute(cmd, session)
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  @arc/core (application)                                                │
│                                                                         │
│    Commands (each declares static readonly requiresSession + allowedModes): │
│      PatchSpfModuleCommand   (generic PATCH — alias, containerId, port counts)│
│      AddModuleCommand                                                   │
│                                                                         │
│    Handlers (one per command; register in CommandHandlerRegistry):      │
│      PatchSpfModuleHandler                                              │
│      AddModuleHandler                                                   │
│                                                                         │
│    Ports (new):                                                         │
│      IModuleEditRepository                                              │
│      ISubgraphEditRepository                                            │
│      IContainerEditRepository                                           │
│      IModuleDefinitionEditRepository                                    │
│                                                                         │
│    Existing (unchanged):                                                │
│      Domain entities (SpfModule, DataPort, ControlPort, Subgraph, ...)  │
│      IdGenerationPort           (system IDs — existing)                 │
│      NaturalIdGenerationPort    (natural IDs — existing; see §5.4)      │
│      BaseCommand (extended in LLD1)                                     │
│      CommandBus (extended in LLD1)                                      │
│      UnitOfWork port (extended in LLD1)                                 │
└───────────────────────────┬─────────────────────────────────────────────┘
                            │  port implementations
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  @arc/infrastructure/persistence                                        │
│                                                                         │
│    Adapters (new):                                                      │
│      ModuleEditRepository        →  PendingChangeWriter (LLD1)          │
│      SubgraphEditRepository      →  PendingChangeWriter                 │
│      ContainerEditRepository     →  PendingChangeWriter                 │
│      ModuleDefinitionEditRepository (raw TypeORM read)                  │
│                                                                         │
│    Extended (LLD1):                                                     │
│      TypeOrmUnitOfWork  ← expose new repos via new getters              │
│                                                                         │
│    Reused (LLD1):                                                       │
│      PendingChangeWriter, WriteContext, EditActionsQueryService         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Data flow per write API call:**

```
1. Client → HTTP request (POST/PATCH on /projects/{projectId}/spf-modules/...).
2. SessionGuard resolves session → request.arcSession populated.
3. Controller reads request.arcSession, builds command, calls
     commandBus.execute(cmd, request.arcSession).
4. CommandBus mode check (LLD1) — allowed? → 403 if not.
5. CommandBus stamps WriteContext = { session, groupId: uuid() } on UoW.
6. CommandBus starts transaction, invokes handler.
7. Handler:
     - Validates entity existence via read ports (moduleExists, containerExists...).
     - For AddModule: loads definition, allocates systemIds, constructs domain objects.
     - Calls edit repo method(s).
8. Edit repo adapter maps domain args → PendingChangeWriter call
     (fieldGroup + payload derived from mode + operation type).
9. PendingChangeWriter (LLD1) writes edit_actions row(s), captures baseVersion.
10. Handler commits transaction, returns Result.ok({ groupId }).
```

---

## 5. Aggregate Write Pattern

Every edit-repo method across every aggregate follows the same shape. LLD2 establishes it for module/subgraph/container; LLD3 and Phase 2 LLDs extend the same pattern to other aggregates.

### 5.1 Method signature convention

```ts
recordXxxChange(
  ...positional required domain args...,   // ids, domain values, or domain objects
  uow: UnitOfWork,
  options?: {
    fieldGroup?:         string
    linkedEntityGroupId?: string
    cache?:              boolean
    source?:             Source                     // default MANUAL
    changeStatus?:       "STAGED" | "UNSTAGED"      // honored only when source = DIFF_TOOL
  },
): Promise<void>
```

**Rules:**
- **Domain-verb method names** — `renameModule`, `changeContainer`, `addDataPort`, `createModule`. Not `stage*`. The repository *class* (`IModuleEditRepository`) already conveys the "pending edit" nature.
- **`sessionId`, `groupId`, `mode` are read from `uow.getWriteContext()`** inside the adapter. Never on the method signature.
- **Options bag is optional.** DESIGNER handlers omit it entirely — defaults apply (`source = MANUAL`, `fieldGroup = null` (accumulator), `cache = false`).
- **Return type `Promise<void>`.** The handler-level write response returns only `{ groupId }` (the atomic-unit handle); repo callers don't need per-write row identifiers. Consumers that need row-level detail can query `edit_actions WHERE group_id = ?`.

### 5.2 Handler pattern

Every command handler follows the same skeleton:

```ts
class SomeHandler implements CommandHandler<SomeCommand> {
  async handle(command: SomeCommand, uow: UnitOfWork): Promise<void> {
    // 1. Get repos from UoW
    const moduleRepo = uow.getModuleEditRepository()

    // 2. Validate existence via read-side checks
    const exists = await moduleRepo.moduleExists(command.moduleSystemId, command.fileSystemId)
    if (!exists) throw new EntityNotFoundException('SpfModule', command.moduleSystemId)

    // 3. For multi-aggregate handlers: load context (definitions), allocate systemIds,
    //    construct domain objects. AddModule specifically.

    // 4. Call domain-verb repo method(s)
    await moduleRepo.renameModule(command.moduleSystemId, command.newAlias, uow)

    // 5. (No commit / return statement — CommandBus owns transaction lifecycle)
  }
}
```

**Handler responsibilities:**
- Read-side existence validation (REQ-VAL-01, REQ-VAL-02).
- ID allocation for CREATEs — see §5.4 for the two-tier system+natural ID pattern.
- Domain-object construction (`new SpfModule(...)`, `new DataPort(...)`).
- Delegation to edit repo methods with pure domain args.

**Handler must NOT:**
- Reference SQL, TypeORM, or `edit_actions` row shapes.
- Compute `aggregateId`, `fieldGroup`, or `groupId` — those live in the adapter / CommandBus.
- Perform DB writes directly. All writes go through edit repos.
- Own the transaction — CommandBus starts and commits.

### 5.3 Adapter pattern

Every edit-repo adapter is a thin translation layer over `PendingChangeWriter`:

```ts
class ModuleEditRepository implements IModuleEditRepository {
  constructor(
    private readonly writer: PendingChangeWriter,   // LLD1
    private readonly qr: QueryRunner,                // for existence checks
  ) {}

  async moduleExists(systemId: number, fileSystemId: number): Promise<boolean> {
    const row = await this.qr.manager
      .createQueryBuilder()
      .select('1')
      .from(ENTITY_NAMES.SpfModule, 'm')
      .where('m.systemId = :systemId AND m.fileSystemId = :fileSystemId',
             { systemId, fileSystemId })
      .getRawOne()
    return !!row
  }

  async renameModule(
    moduleSystemId: number,
    newAlias: string,
    uow: UnitOfWork,
    options?: EditOptions,
  ): Promise<void> {
    const { sessionId, groupId } = uow.getWriteContext()
    await this.writer.writeDelta({
      targetTable:    ENTITY_NAMES.SpfModule,
      targetSystemId: moduleSystemId,
      aggregateId:    moduleSystemId,               // module is its own aggregate root
      delta:          { alias: newAlias },
      ...options,
    }, sessionId, groupId, this.qr)
  }

  // ... changeContainer, addDataPort, addControlPort, createModule similarly ...
}
```

**Adapter responsibilities:**
- Domain object → delta/payload record mapping.
- Assigns `aggregateId` and `targetTable` per §5 of overall-design.
- Derives infrastructure-only FK columns (e.g., `nodeSystemId` on a DataPort payload, since domain `DataPort` has no `nodeSystemId` field).
- Extracts `sessionId` and `groupId` from `uow.getWriteContext()` and passes them (along with `this.qr`) explicitly to `PendingChangeWriter` methods. `PendingChangeWriter` does not accept `UnitOfWork`.
- Existence-check methods use `qr.manager` directly (no writer involvement).

**Adapter must NOT:**
- Interact with the command bus.
- Own transaction control.
- Add `getQueryRunner()` to the core `UnitOfWork` port — `qr` is injected via constructor at construction time by `TypeOrmUnitOfWork` (persistence adapter), never exposed through the core interface.

### 5.4 ID Allocation — two-tier pattern

Every entity has TWO identifiers, allocated by two different ports. Both are needed when constructing new domain objects for CREATE.

| ID | Purpose | Source |
|---|---|---|
| `systemId` | Server-generated primary key, unique across the DB. Used by FK columns, edit_actions, and internal wiring. | `IdGenerationPort.getNextId(fileSystemId)` — existing. |
| Natural ID (`subgraphId`, `containerId`, `instanceId`, `parentId` for subsystems) | Domain-visible identifier, unique per file per entity kind. Used in cross-references within `.awsp`/`.acdb` binary formats and by the module runtime. | `NaturalIdGenerationPort.getNextId(fileSystemId, type)` where `type: NaturalIdType` is one of `SUBGRAPH`, `CONTAINER`, `MODINSTANCE`, `SUBSYSTEM`. |

**When to use which:**
- Subgraph → `subgraph.systemId = idGeneration.getNextId(fileId)` **and** `subgraph.subgraphId = naturalIdGeneration.getNextId(fileId, SUBGRAPH)`.
- Container → same pattern with `NaturalIdType.CONTAINER`.
- SpfModule → `systemId` via `IdGenerationPort`; `instanceId` via `naturalIdGeneration.getNextId(fileId, MODINSTANCE)`.
- Node — 1:1 with SpfModule; shares systemId. No separate natural ID.
- DataPort / ControlPort — `systemId` via `IdGenerationPort`; natural IDs (`dataPortId`, `portId`) come from the **module definition** (`DataPortDefinition.dataPortId`, `StaticControlPortDefinition.portId`), NOT the generator. They are definition-scoped identifiers, not file-scoped.

**Handler access:**

Both ports are injected into command handlers via `CommandHandlerDependencies` (the existing pattern used by `CommandHandlerRegistry`):

```ts
export interface CommandHandlerDependencies {
  uow: UnitOfWork
  idGeneration: IdGenerationPort              // ← systemId allocator
  naturalIdGeneration: NaturalIdGenerationPort // ← natural ID allocator
  // ... other existing deps ...
}

class AddModuleHandler {
  constructor(
    private readonly idGeneration: IdGenerationPort,
    private readonly naturalIdGeneration: NaturalIdGenerationPort,
  ) {}
  // ...
}
```

Handlers access them as `this.idGeneration` and `this.naturalIdGeneration`. Not through UoW — natural ID and systemId allocation are separate concerns from transactional state.

**Post-commit / release:**
- Deferred to Commit LLD and Delete Module LLD (LLD5). LLD2's Add Module allocates IDs but does not release or reuse IDs after DELETE.

---

## 6. `IModuleEditRepository`

### 6.1 Port interface (`@arc/core`)

```ts
// packages/core/src/application/ports/persistence/repositories/module/module-edit.repository.ts
export interface IModuleEditRepository {

  // ── Existence check (REQ-VAL-01) ──────────────────────────────────────
  moduleExists(systemId: number, fileSystemId: number): Promise<boolean>

  // Read supporting the port-count and container-change flows in PATCH.
  findModuleForPatch(systemId: number, fileSystemId: number): Promise<SpfModuleReadModel | null>

  // ── Module root ───────────────────────────────────────────────────────
  renameModule(
    moduleSystemId: number,
    newAlias: string,
    uow: UnitOfWork,
    options?: EditOptions,
  ): Promise<void>

  changeContainer(
    moduleSystemId: number,
    newContainerSystemId: number,
    uow: UnitOfWork,
    options?: EditOptions,
  ): Promise<void>

  // ── Port-count changes (used by PATCH) ────────────────────────────────
  // Adds ports of the specified kind up to the requested count, or removes
  // unused ports (LIFO on systemId) to reach the requested count. The handler
  // (§11) is responsible for the count-delta computation and the "unused only"
  // check. These repo methods just stage the individual add/remove writes.

  // ── Individual ports (create) ─────────────────────────────────────────
  // Used internally by AddModule (§6.2) and by PatchSpfModuleHandler when
  // port count increases. Not exposed as their own CQRS commands.
  addDataPort(
    port: DataPort,
    moduleSystemId: number,
    uow: UnitOfWork,
    options?: EditOptions,
  ): Promise<void>

  addControlPort(
    port: ControlPort,
    moduleSystemId: number,
    uow: UnitOfWork,
    options?: EditOptions,
  ): Promise<void>

  // ── Individual ports (delete) ─────────────────────────────────────────
  // Used by PatchSpfModuleHandler when port count decreases. Full "delete
  // module + cascade" is LLD5; these are per-port deletes only.
  removeDataPort(
    dataPortSystemId: number,
    moduleSystemId: number,
    uow: UnitOfWork,
    options?: EditOptions,
  ): Promise<void>

  removeControlPort(
    controlPortSystemId: number,
    moduleSystemId: number,
    uow: UnitOfWork,
    options?: EditOptions,
  ): Promise<void>

  // ── Module + all children (atomic creation) ───────────────────────────
  createModule(
    module: SpfModule,
    uow: UnitOfWork,
    options?: EditOptions,
  ): Promise<void>
}
```

`EditOptions` is the shared options-bag type (§5.1), exported from a shared location under `@arc/core/application/ports/persistence/`.

`SpfModuleReadModel` on `findModuleForPatch` returns the module with its current ports enumerated — needed for port-count delta computation. If a suitable read shape already exists on the read side, reuse it; otherwise minimum fields the PATCH handler needs are: `systemId`, `containerSystemId`, `definitionSystemId`, `dataPorts[]` (with systemId + portIoType), `controlPorts[]` (with systemId).

### 6.2 Adapter (`@arc/persistence`)

```
packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/module/
  module-edit.repository.ts
```

- Constructed per-request from `TypeOrmUnitOfWork` with `PendingChangeWriter` (shared) + `QueryRunner` (per-transaction).
- `moduleExists` — TypeORM SELECT `1` from `spf_modules` filtered by `(systemId, fileSystemId)`.
- `findModuleForPatch` — reads `spf_modules` + joined `data_ports` + `control_ports` for this module with effective-state overlay applied. Write handlers must see committed data plus all active `STAGED` and `UNSTAGED` edit-actions so sequential writes in one session operate on the user's current graph.
- `renameModule` → `writer.writeDelta({ targetTable: SpfModule, targetSystemId: moduleSystemId, aggregateId: moduleSystemId, delta: { alias: newAlias }, ...options })`.
- `changeContainer` → same pattern with `{ containerSystemId: newContainerSystemId }`.
- `addDataPort` → `writer.writeCreate({ targetTable: DataPort, targetSystemId: port.systemId, aggregateId: moduleSystemId, payload: {...port fields..., nodeSystemId: moduleSystemId}, ...options })`.
- `addControlPort` → same pattern with `targetTable: ControlPort`. `port.nodeSystemId` set by caller.
- `removeDataPort` → `writer.writeDelete({ targetTable: DataPort, targetSystemId: dataPortSystemId, aggregateId: moduleSystemId, ...options })`.
- `removeControlPort` → same pattern with `targetTable: ControlPort`.
- `createModule` → sequence of `writer.writeCreate` calls in FK order:
  1. Node row (`aggregateId = module.systemId, targetTable = Node`).
  2. SpfModule row (`aggregateId = module.systemId, targetTable = SpfModule`).
  3. Each DataPort in `module.dataPorts` (all `aggregateId = module.systemId, targetTable = DataPort`).
  4. Each ControlPort in `module.controlPorts` (same aggregate, `targetTable = ControlPort`).
  All share the ambient `groupId` from WriteContext, giving REQ-ADD-07 single-undo-step atomicity.

### 6.3 Reused infrastructure

- `IdGenerationPort` — handlers allocate `systemId` via `this.idGeneration.getNextId(fileSystemId)` before calling `addDataPort` / `addControlPort` / `createModule` (see §5.4).
- `NaturalIdGenerationPort` — handlers allocate natural IDs (`subgraphId`, `containerId`, `instanceId`) via `this.naturalIdGeneration.getNextId(fileSystemId, type)` (see §5.4).
- `ENTITY_NAMES` — canonical `targetTable` values.
- `PendingChangeWriter` (LLD1).

---

## 6a. Link Read Repositories (support for port-count decrease)

Two read-only ports supporting the "which ports are unused" check in `PatchSpfModuleHandler` when port count decreases.

### 6a.1 Port interfaces (`@arc/core`)

```ts
// packages/core/src/application/ports/persistence/repositories/data-link/data-link-read.repository.ts
export interface IDataLinkReadRepository {
  // Returns the systemIds of all DataLinks that reference ANY of the given
  // DataPort systemIds as source or destination.
  getLinksByPortSystemIds(portSystemIds: number[]): Promise<Array<{
    linkSystemId: number
    portSystemId: number       // which of the input ports this link references
  }>>
}

// packages/core/src/application/ports/persistence/repositories/control-link/control-link-read.repository.ts
export interface IControlLinkReadRepository {
  getLinksByPortSystemIds(portSystemIds: number[]): Promise<Array<{
    linkSystemId: number
    portSystemId: number
  }>>
}
```

### 6a.2 Adapters

- Simple SELECT on `data_links` / `control_links` filtering by src or dst port systemId in the given list.
- Overlay-aware — the PATCH handler must consider committed links plus all active `STAGED` and `UNSTAGED` edit-actions when determining whether a port is linked.
- Empty input array → empty result (no query).

### 6a.3 Usage

Called by `PatchSpfModuleHandler` during port-count decrease flow. Handler computes which ports are unused by comparing the module's port systemIds against the linked-port set returned by these repos. See §11.2 for the full handler flow.

### 6a.4 Delete Module follow-on

Delete Module extends the same repository family with write methods for deleting canonical links and their subsystem link segments. Its read methods must be effective-state aware: committed rows plus active `STAGED` and `UNSTAGED` edit-actions. Link deletion is based on module or port endpoints; `subgraphId` columns on links are not ownership references.

Detailed design: `../module-write/design/delete-module-design.md`.

---

## 7. `ISubgraphEditRepository`

### 7.1 Port interface (`@arc/core`)

```ts
// packages/core/src/application/ports/persistence/repositories/subgraph/subgraph-edit.repository.ts
export interface ISubgraphEditRepository {
  subgraphExists(systemId: number, fileSystemId: number): Promise<boolean>

  createSubgraph(
    subgraph: Subgraph,
    uow: UnitOfWork,
    options?: EditOptions,
  ): Promise<void>

  // Deferred to follow-up (§10 / OQ-1):
  //   createSubgraphPropertyDefaults(subgraphSystemId: number, uow: UnitOfWork, options?: EditOptions): Promise<void>
}
```

### 7.2 Adapter

- `subgraphExists` — `SELECT 1 FROM subgraphs WHERE system_id = ? AND file_system_id = ?`.
- `createSubgraph` → `writer.writeCreate({ targetTable: Subgraph, targetSystemId: subgraph.systemId, aggregateId: subgraph.systemId, payload: {...subgraph fields...}, ...options })`.
- Placeholder in the file for `createSubgraphPropertyDefaults` — throws `NotImplementedException` until follow-up LLD lands.

---

## 8. `IContainerEditRepository`

### 8.1 Port interface (`@arc/core`)

```ts
// packages/core/src/application/ports/persistence/repositories/container/container-edit.repository.ts
export interface IContainerEditRepository {
  containerExists(systemId: number, fileSystemId: number): Promise<boolean>

  // Used by PatchSpfModuleHandler to check container type compatibility with the module's definition.
  getContainerById(systemId: number, fileSystemId: number): Promise<Container | null>

  createContainer(
    container: Container,
    uow: UnitOfWork,
    options?: EditOptions,
  ): Promise<void>

  // Deferred to follow-up (§10 / OQ-1):
  //   createContainerPropertyDefaults(containerSystemId: number, uow: UnitOfWork, options?: EditOptions): Promise<void>
}
```

### 8.2 Adapter

- `containerExists` — `SELECT 1 FROM containers WHERE system_id = ? AND file_system_id = ?`.
- `getContainerById` — full row fetch, returned as domain `Container` (with `containerTypeSystemId` visible for the PATCH type-compat check). Raw committed state, no overlay.
- `createContainer` → `writer.writeCreate({ targetTable: Container, targetSystemId: container.systemId, aggregateId: container.systemId, payload: {...container fields...}, ...options })`.
- Placeholder for `createContainerPropertyDefaults` — throws until follow-up.

---

## 8a. `ISubsystemEditRepository`

### 8a.1 Port interface (`@arc/core`)

```ts
// packages/core/src/application/ports/persistence/repositories/subsystem/subsystem-edit.repository.ts
export interface ISubsystemEditRepository {
  subsystemExists(systemId: number, fileSystemId: number): Promise<boolean>

  // Deferred: Subsystem CREATE / UPDATE / DELETE are out of scope for LLD2.
  // LLD5 (Delete Module) and a future subsystem-write LLD will extend this repo.
}
```

### 8a.2 Adapter

- `subsystemExists` — `SELECT 1 FROM nodes WHERE system_id = ? AND file_system_id = ? AND type = 'subsystem'`. Subsystems are stored in the `nodes` table with `type = 'subsystem'` (the same table also holds module nodes with `type = 'module'`).

### 8a.3 Usage in LLD2

Only one consumer — `AddModuleHandler`. When the command carries a non-null `parentId`, the handler validates the referenced subsystem exists in the target file before proceeding. If missing → `EntityNotFoundException('Subsystem', parentId)` → 404 at the api layer.

Subsystems are **never auto-created** by AddModule. If the client wants a module under a subsystem, that subsystem must already exist. (Contrast with Subgraph and Container, which are auto-created in Add-Module Variants 1 and 2 respectively.)

---

## 9. `IModuleDefinitionEditRepository`

### 9.1 Port interface (`@arc/core`)

```ts
// packages/core/src/application/ports/persistence/repositories/module/module-definition-edit.repository.ts
export interface IModuleDefinitionEditRepository {
  findByModuleIdAndProcId(
    moduleId: number,       // maps to SpfModuleDefinition.moduleDefinitionId
    procId: number,         // processor identifier
    fileSystemId: number,
  ): Promise<SpfModuleDefinition | null>
}
```

### 9.2 Adapter

- Reads `spf_module_definitions` joined with related definition tables (`processor_definitions`, `module_definition_processor_links`, `data_port_groups`, `data_port_definitions`, `static_control_port_definitions`, `module_definition_container_type_links`) — enough to construct the full domain `SpfModuleDefinition` needed by AddModule's port materialization.
- Returns a domain `SpfModuleDefinition` including:
  - `systemId`
  - `moduleDefinitionId`
  - `containerTypesSystemIds` (needed for REQ-ADD-03 — first-entry-wins container type resolution).
  - `dataPortGroups[]` with their `staticPortDefinitions[]` (needed for REQ-ADD-06 static DataPort creation).
  - `staticControlPorts[]` (needed for REQ-ADD-06 static ControlPort creation).
- Returns `null` when no definition matches `(moduleId, procId, fileSystemId)`; handler maps to 404 (REQ-ADD-05).

---

## 10. Property-Data Defaults on Auto-Create — Deferred

### 10.1 What's deferred

- REQ-ADD-04 requires that when a Subgraph or Container is auto-created (Add Module Variants 1 and 2), the framework also stages property-data rows using default payloads from subgraph/container property definitions.
- Requires:
  - A read port for subgraph property definitions.
  - A read port for container property definitions.
  - Domain-shaped defaults (may need DTO-level defaulting logic).
  - `createSubgraphPropertyDefaults` and `createContainerPropertyDefaults` on the respective edit repos.

### 10.2 Handling in LLD2

- Ports declared with TODO stubs on `ISubgraphEditRepository` and `IContainerEditRepository`.
- AddModule handler places TODO comments where the property-data seeding calls will land.
- Actual implementation is a follow-up LLD (or an extension to LLD2 in a follow-up PR).
- LLD2's Add Module stages Subgraph and Container CREATE rows but no property-data rows. Users may see subgraphs/containers with no property data — acceptable in Phase 1 dev.

Open question — track as OQ-1 in the requirements doc; expect resolution in the follow-up LLD.

---

## 11. Commands and Handlers

Two user-facing CQRS commands back the two write endpoints:

- `PatchSpfModuleCommand` — backs `PATCH /projects/:projectId/spf-modules/:spfModuleSystemId`.
- `AddModuleCommand` — backs `POST /projects/:projectId/spf-modules`.

The former per-field commands (`SetModuleAliasCommand`, `SetModuleContainerCommand`, `AddDataPortCommand`, `AddControlPortCommand`) are removed. `PATCH` handles all module structural updates in one call; individual port add/remove operations remain as internal `IModuleEditRepository` methods used by `AddModuleHandler` and `PatchSpfModuleHandler`.

Folder structure (`packages/core/src/application/`):

```
module/
  patch/
    patch-spf-module.command.ts
    patch-spf-module.handler.ts
  add-module/
    add-module.command.ts
    add-module.handler.ts
```

### 11.1 PatchSpfModuleHandler

Command:
```ts
// packages/core/src/application/module/patch/patch-spf-module.command.ts
export class PatchSpfModuleCommand extends BaseCommand {
  static readonly allowedModes: readonly SessionMode[] = [
    SESSION_MODE.Designer,
    SESSION_MODE.DiffMerge,   // REQ-SESS-07
  ]

  constructor(
    clientId:                                string,   // for BaseCommand — request-scoped identifier
    public readonly moduleSystemId:          number,
    public readonly fileSystemId:            number,
    public readonly alias?:                  string,
    public readonly containerSystemId?:      number,   // FK — must reference existing container
    public readonly numberOfInputPorts?:     number,
    public readonly numberOfOutputPorts?:    number,
    public readonly numberOfControlPorts?:   number,
  ) { super(clientId) }
}
```

The controller constructs `new PatchSpfModuleCommand(...)` inline from the request DTO. No `fromPayload` yet — add it (and the matching `FixCommandDispatcher.registerAll()` line) if/when a validation rule surfaces this command as an auto-fix action.

Handler — returns `Result<WriteResult>` per the core-result-format design (`docs/core-result-format/design/core-result-format-design.md`):

```ts
// packages/core/src/application/module/patch/patch-spf-module.handler.ts
export class PatchSpfModuleHandler implements CommandHandler<PatchSpfModuleCommand, Result<WriteResult>> {
  constructor(
    private readonly idGeneration: IdGenerationPort,
  ) {}

  async handle(command: PatchSpfModuleCommand, uow: UnitOfWork): Promise<Result<WriteResult>> {
    await uow.startTransaction()
    try {
      const moduleRepo    = uow.getModuleEditRepository()
      const containerRepo = uow.getContainerEditRepository()
      const defRepo       = uow.getModuleDefinitionEditRepository()
      const dataLinkRead  = uow.getDataLinkReadRepository()
      const ctrlLinkRead  = uow.getControlLinkReadRepository()
      const fileId = command.fileSystemId

      // 0. Existence check
      const module = await moduleRepo.findModuleForPatch(command.moduleSystemId, fileId)
      if (!module) {
        await uow.rollback()
        return Result.fail(IssueFactory.notFound(
          ISSUE_ENTITY_TYPE.SpfModule, command.moduleSystemId,
        ))
      }

      // 1. alias — trivial rename
      if (command.alias !== undefined) {
        await moduleRepo.renameModule(command.moduleSystemId, command.alias, uow)
      }

      // 2. containerSystemId — validate + change
      if (command.containerSystemId !== undefined) {
        const r = await this.applyContainerChange(command.containerSystemId, module, defRepo, containerRepo, uow, moduleRepo, fileId)
        if (r.kind === 'fail') { await uow.rollback(); return r }
      }

      // 3-5. port-count changes — each returns Result; short-circuit on fail
      for (const [ioType, requested] of [
        ['INPUT',   command.numberOfInputPorts]   as const,
        ['OUTPUT',  command.numberOfOutputPorts]  as const,
      ]) {
        if (requested === undefined) continue
        const r = await this.applyDataPortCountChange(module, ioType, requested, defRepo, dataLinkRead, moduleRepo, uow, fileId)
        if (r.kind === 'fail') { await uow.rollback(); return r }
      }
      if (command.numberOfControlPorts !== undefined) {
        const r = await this.applyControlPortCountChange(module, command.numberOfControlPorts, defRepo, ctrlLinkRead, moduleRepo, uow, fileId)
        if (r.kind === 'fail') { await uow.rollback(); return r }
      }

      await uow.commit()
      return Result.ok({ groupId: uow.getWriteContext().groupId })
    } catch (err) {
      await uow.rollback()
      throw err
    }
  }
}
```

All writes staged within this handler share the same `groupId` via ambient WriteContext — the entire PATCH is one atomic undo step (REQ-ATO-01). Handler owns transaction lifecycle per foundation §7a.4; each `Result.fail(...)` short-circuit rolls back before returning.

### 11.1.a Container change (with type-compatibility check)

Returns `Result<void>` — chained by the top-level handler. Container-type-incompatibility is a structured domain issue, returned via `Result.fail`:

```ts
private async applyContainerChange(
  newContainerSystemId: number,
  module: SpfModuleReadModel,
  defRepo: IModuleDefinitionEditRepository,
  containerRepo: IContainerEditRepository,
  uow: UnitOfWork,
  moduleRepo: IModuleEditRepository,
  fileId: number,
): Promise<Result<void>> {
  const container = await containerRepo.getContainerById(newContainerSystemId, fileId)
  if (!container) {
    return Result.fail(IssueFactory.notFound(
      ISSUE_ENTITY_TYPE.Container, newContainerSystemId,
    ))
  }

  const definition = await defRepo.findByModuleIdAndProcId(
    module.moduleId, module.procId, fileId,
  )
  if (!definition) {
    return Result.fail(IssueFactory.notFound(
      ISSUE_ENTITY_TYPE.SpfModuleDefinition, module.moduleId,
    ))
  }

  const allowedTypes = new Set(definition.containerTypesSystemIds)
  if (container.containerTypeSystemId !== null && !allowedTypes.has(container.containerTypeSystemId)) {
    return Result.fail({
      code:     'ARC-MOD-CONTAINER-TYPE-INCOMPATIBLE',
      message:  `Container ${newContainerSystemId} type ${container.containerTypeSystemId} is not compatible with module definition. Allowed types: [${[...allowedTypes].join(', ')}]`,
      severity: IssueSeverity.Error,
      impactedEntity: {
        entityType: ISSUE_ENTITY_TYPE.Container,
        systemId:   newContainerSystemId,
      },
    })
  }

  await moduleRepo.changeContainer(module.systemId, newContainerSystemId, uow)
  return Result.ok(undefined)
}
```

### 11.1.b Port-count changes — algorithm

Same Result-based pattern. Below is DataPort (INPUT); OUTPUT is identical with a different filter; ControlPort uses the control-link read repo instead of data-link.

```ts
private async applyDataPortCountChange(
  module:      SpfModuleReadModel,
  ioType:      'INPUT' | 'OUTPUT',
  requested:   number,
  defRepo:     IModuleDefinitionEditRepository,
  linkRead:    IDataLinkReadRepository,
  moduleRepo:  IModuleEditRepository,
  uow:         UnitOfWork,
  fileId:      number,
): Promise<Result<void>> {
  // 1. Enumerate current ports of this ioType
  const current = module.dataPorts.filter(p => p.portIoType === ioType)
  const currentCount = current.length
  if (requested === currentCount) return Result.ok(undefined)   // no-op

  // 2. Load definition — check absolute max
  const definition = await defRepo.findByModuleIdAndProcId(module.moduleId, module.procId, fileId)
  if (!definition) {
    return Result.fail(IssueFactory.notFound(
      ISSUE_ENTITY_TYPE.SpfModuleDefinition, module.moduleId,
    ))
  }
  const maxAllowed = ioType === 'INPUT'
    ? definition.maxInputPortsSupported
    : definition.maxOutputPortsSupported

  if (requested > maxAllowed) {
    return Result.fail({
      code:     'ARC-MOD-PORT-COUNT-EXCEEDS-DEFINITION',
      message:  `Requested ${ioType.toLowerCase()} port count ${requested} exceeds module definition limit ${maxAllowed}`,
      severity: IssueSeverity.Error,
      impactedEntity: {
        entityType: ISSUE_ENTITY_TYPE.SpfModule,
        systemId:   module.systemId,
      },
    })
  }

  if (requested > currentCount) {
    // ── ADD ── stage |diff| new DataPorts using definition's port template
    const diff = requested - currentCount
    const group = definition.dataPortGroups.find(g => g.portIoType === ioType)
    if (!group) {
      return Result.fail({
        code:     'ARC-MOD-PORT-COUNT-EXCEEDS-DEFINITION',
        message:  `Module definition has no ${ioType.toLowerCase()} port group; requested count ${requested} cannot be materialized`,
        severity: IssueSeverity.Error,
        impactedEntity: { entityType: ISSUE_ENTITY_TYPE.SpfModule, systemId: module.systemId },
      })
    }

    // OQ-4 (see §17): definition-slot assignment for newly-added ports
    for (let i = 0; i < diff; i++) {
      const port = new DataPort({
        systemId:   this.idGeneration.getNextId(fileId),
        dataPortId: /* next unused slot from group.staticPortDefinitions */ ,
        portIoType: ioType,
        isStatic:   true,
        name:       /* per definition */ ,
      })
      await moduleRepo.addDataPort(port, module.systemId, uow)
    }
  } else {
    // ── REMOVE ── unused-only, LIFO
    const diff = currentCount - requested

    const currentIds = current.map(p => p.systemId)
    const links = await linkRead.getLinksByPortSystemIds(currentIds)
    const linkedPortIds = new Set(links.map(l => l.portSystemId))
    const unused = current.filter(p => !linkedPortIds.has(p.systemId))

    if (unused.length < diff) {
      // Emit one Issue per blocked port — each with the blocked port as impactedEntity
      // and its blocking-link systemIds in the message. Client can act on each issue
      // individually (delete link → retry PATCH).
      const blockedPorts = current.filter(p => linkedPortIds.has(p.systemId))
      const linksByPort = new Map<number, number[]>()
      for (const l of links) {
        const arr = linksByPort.get(l.portSystemId) ?? []
        arr.push(l.linkSystemId)
        linksByPort.set(l.portSystemId, arr)
      }
      const issues = blockedPorts.map(p => ({
        code:     'ARC-MOD-PORT-COUNT-DECREASE-BLOCKED',
        message:  `Cannot remove ${ioType.toLowerCase()} port ${p.systemId} — it has ${linksByPort.get(p.systemId)!.length} data-link(s) attached (linkSystemIds: [${linksByPort.get(p.systemId)!.join(', ')}]). Delete the link(s) first.`,
        severity: IssueSeverity.Error,
        impactedEntity: {
          entityType: ISSUE_ENTITY_TYPE.DataPort,   // requires ISSUE_ENTITY_TYPE.DataPort in the enum
          systemId:   p.systemId,
        },
      }))
      return Result.fail(...issues)
    }

    // LIFO on systemId; take |diff|
    const toRemove = [...unused]
      .sort((a, b) => b.systemId - a.systemId)
      .slice(0, diff)

    for (const p of toRemove) {
      await moduleRepo.removeDataPort(p.systemId, module.systemId, uow)
    }
  }

  return Result.ok(undefined)
}
```

`applyControlPortCountChange` mirrors this with the control-link repo. Emitted issues use `ISSUE_ENTITY_TYPE.ControlPort` for the blocked-port `impactedEntity` — same enum extension.

### 11.1.c Issue codes (structured domain outcomes)

Three domain issue codes emitted via `Result.fail(...)` — no custom Exception classes needed. HTTP status is derived by the existing http-status-map's `ARC-` prefix rule (→ 422 Unprocessable Entity).

| Code | Meaning | Body fields |
|---|---|---|
| `ARC-MOD-CONTAINER-TYPE-INCOMPATIBLE` | Target container's type is not in the module definition's allowed list | `impactedEntity.systemId` = container systemId; `message` includes allowed types |
| `ARC-MOD-PORT-COUNT-EXCEEDS-DEFINITION` | Requested port count exceeds definition's declared max | `impactedEntity.systemId` = module systemId; `message` includes requested + max |
| `ARC-MOD-PORT-COUNT-DECREASE-BLOCKED` | Cannot decrease port count — one or more ports have data-links / control-links attached | ONE ISSUE PER BLOCKED PORT: `impactedEntity` = the blocked port; `message` lists the blocking link systemIds. Client acts on each independently. |

**Vocabulary extension needed:** the core-result-format design's `ISSUE_ENTITY_TYPE` enum (in `packages/core/src/shared/issues/impacted-entity.ts`) currently lists: SpfModule, DataLink, ControlLink, Subgraph, UseCase, Container, SpfModuleDefinition. LLD2 extends this enum with `DataPort` and `ControlPort` so the port-count-decrease-blocked issues can point at specific ports. Small addition, single-file change.

### 11.2 AddModuleHandler

Command:
```ts
export class AddModuleCommand extends BaseCommand {
  static readonly allowedModes: readonly SessionMode[] = [
    SESSION_MODE.Designer,
    SESSION_MODE.DiffMerge,
  ]

  constructor(
    clientId:                          string,          // for BaseCommand — request-scoped identifier
    public readonly fileSystemId:      number,
    public readonly moduleId:          number,          // natural module ID (= moduleDefinitionId)
    public readonly procId:            number,          // processor ID
    public readonly parentId:          number | null,   // subsystem parent; null = top-level
    public readonly subgraphSystemId:  number | null,   // null → auto-create (Variant 1)
    public readonly containerSystemId: number | null,   // null → auto-create (Variants 1, 2)
  ) { super(clientId) }
}
```

The controller constructs `new AddModuleCommand(...)` inline from the request DTO. No `fromPayload` yet — add it (and the matching `FixCommandDispatcher.registerAll()` line) if/when a validation rule surfaces this command as an auto-fix action.

Handler flow:

```ts
class AddModuleHandler {
  constructor(
    private readonly idGeneration: IdGenerationPort,
    private readonly naturalIdGeneration: NaturalIdGenerationPort,
  ) {}

  async handle(command: AddModuleCommand, uow: UnitOfWork): Promise<Result<WriteResult>> {
    await uow.startTransaction()
    try {
      const defRepo       = uow.getModuleDefinitionEditRepository()
      const subgraphRepo  = uow.getSubgraphEditRepository()
      const containerRepo = uow.getContainerEditRepository()
      const subsystemRepo = uow.getSubsystemEditRepository()
      const moduleRepo    = uow.getModuleEditRepository()
      const fileId = command.fileSystemId

      // 1. Load definition (REQ-ADD-05)
      const definition = await defRepo.findByModuleIdAndProcId(
        command.moduleId, command.procId, fileId,
      )
      if (!definition) {
        await uow.rollback()
        return Result.fail(IssueFactory.notFound(
          ISSUE_ENTITY_TYPE.SpfModuleDefinition, command.moduleId,
        ))
      }

      // 1a. Parent subsystem existence check (if parentId provided; not auto-created)
      if (command.parentId !== null) {
        if (!await subsystemRepo.subsystemExists(command.parentId, fileId)) {
          await uow.rollback()
          return Result.fail(IssueFactory.notFound(
            ISSUE_ENTITY_TYPE.Subsystem, command.parentId,      // requires Subsystem in ISSUE_ENTITY_TYPE
          ))
        }
      }

      // 2. Subgraph (Variant 1 = auto-create; otherwise validate)
      let subgraphSystemId: number
      if (command.subgraphSystemId === null) {
        subgraphSystemId    = this.idGeneration.getNextId(fileId)
        const subgraphId    = this.naturalIdGeneration.getNextId(fileId, NaturalIdType.SUBGRAPH)
        const subgraph = new Subgraph({
          systemId:     subgraphSystemId,
          subgraphId,                                // natural ID via NaturalIdGenerationPort
          name:         `SG_${subgraphId}`,           // REQ-ADD-02 default name
          isExported:   false,
          fileSystemId: fileId,
        })
        await subgraphRepo.createSubgraph(subgraph, uow)
        // TODO(OQ-1): subgraphRepo.createSubgraphPropertyDefaults(subgraphSystemId, uow)
      } else {
        subgraphSystemId = command.subgraphSystemId
        if (!await subgraphRepo.subgraphExists(subgraphSystemId, fileId)) {
          await uow.rollback()
          return Result.fail(IssueFactory.notFound(
            ISSUE_ENTITY_TYPE.Subgraph, subgraphSystemId,
          ))
        }
      }

      // 3. Container (Variants 1 & 2 = auto-create; Variant 3 validates)
      let containerSystemId: number
      if (command.containerSystemId === null) {
        const containerTypeSystemId = [...definition.containerTypesSystemIds][0] ?? null   // REQ-ADD-03
        containerSystemId  = this.idGeneration.getNextId(fileId)
        const containerId  = this.naturalIdGeneration.getNextId(fileId, NaturalIdType.CONTAINER)
        const container = new Container(
          containerSystemId,       // systemId
          containerId,             // natural ID via NaturalIdGenerationPort
          containerTypeSystemId,
          fileId,
        )
        await containerRepo.createContainer(container, uow)
        // TODO(OQ-1): containerRepo.createContainerPropertyDefaults(containerSystemId, uow)
      } else {
        containerSystemId = command.containerSystemId
        if (!await containerRepo.containerExists(containerSystemId, fileId)) {
          await uow.rollback()
          return Result.fail(IssueFactory.notFound(
            ISSUE_ENTITY_TYPE.Container, containerSystemId,
          ))
        }
      }

      // 4. Materialize static ports from definition (REQ-ADD-06)
      // Port natural IDs (dataPortId, portId) come from the DEFINITION, not from
      // NaturalIdGenerationPort — they are definition-scoped identifiers.
      const dataPorts: DataPort[] = definition.dataPortGroups.flatMap(group =>
        group.staticPortDefinitions.map(def => new DataPort({
          systemId:   this.idGeneration.getNextId(fileId),
          dataPortId: def.dataPortId,                // ← from definition
          portIoType: group.portIoType,
          isStatic:   true,
          name:       def.name,
        })),
      )

      // 5. Module: allocate systemId + natural instanceId, build the aggregate
      const moduleSystemId = this.idGeneration.getNextId(fileId)
      const instanceId     = this.naturalIdGeneration.getNextId(fileId, NaturalIdType.MODINSTANCE)

      const controlPorts: ControlPort[] = definition.staticControlPorts.map(def =>
        new ControlPort({
          systemId:        this.idGeneration.getNextId(fileId),
          portId:          def.portId,               // ← from definition
          isStatic:        true,
          nodeSystemId:    moduleSystemId,
          name:            def.portName,
          intentSystemIds: [],
        }),
      )

      const module = new SpfModule({
        systemId:           moduleSystemId,
        instanceId,                                   // natural ID via NaturalIdGenerationPort
        definitionSystemId: definition.systemId,
        containerSystemId,
        subgraphSystemId,
        fileSystemId:       fileId,
        parentSystemId:     command.parentId ?? undefined,
        dataPorts,
        controlPorts,
      })

      await moduleRepo.createModule(module, uow)

      // 6. All edit_actions rows across steps 2-5 share the same groupId via WriteContext
      //    → single-undo-step atomicity (REQ-ADD-07)

      await uow.commit()
      return Result.ok({ groupId: uow.getWriteContext().groupId })
    } catch (err) {
      await uow.rollback()
      throw err
    }
  }
}
```

**REQ-ADD traceability inside this handler:**
- REQ-ADD-01 — the three variants distinguished by which optionals are null.
- REQ-ADD-02 — `SG_${subgraphSystemId}` default name.
- REQ-ADD-03 — `[0]` of `containerTypesSystemIds`.
- REQ-ADD-05 — definition lookup + 404 on miss.
- REQ-ADD-06 — static port materialization from `dataPortGroups` and `staticControlPorts`.
- REQ-ADD-07 — shared `groupId` via ambient WriteContext (not visible in handler code — it just works).
- REQ-ADD-08 — multi-aggregate spanning across Subgraph, Container, Module (distinct `aggregateId` per row).

---

## 12. Existence & Domain Validation

Per the core-result-format design, LLD2 handlers express **structured failures via `Result.fail(...)`** with issue codes and `impactedEntity`. Only truly exceptional failures (DB errors, framework bugs) throw exceptions (caught by `AllExceptionsFilter` → 500). No custom Exception classes for domain violations.

**Existence checks — return `Result.fail(IssueFactory.notFound(...))` with 404 mapping via `resolveHttpStatus('ENTITY_NOT_FOUND')` → 404:**
- `PatchSpfModuleHandler` — target module (via `findModuleForPatch`), plus target container (when `containerSystemId` present) and module definition.
- `AddModuleHandler` — definition, provided `subgraphSystemId` / `containerSystemId` (REQ-VAL-02), provided `parentId` (subsystem — §8a).

**Domain-rule violations — return `Result.fail({code, message, severity, impactedEntity})` with 422 mapping via the `ARC-` prefix rule in `resolveHttpStatus`:**
- `ARC-MOD-CONTAINER-TYPE-INCOMPATIBLE` — target container's type not in the module definition's allowed list.
- `ARC-MOD-PORT-COUNT-EXCEEDS-DEFINITION` — requested port count > definition max.
- `ARC-MOD-PORT-COUNT-DECREASE-BLOCKED` — one issue per blocked port (has attached data-link / control-link).

**Session gating (403) is handled upstream — not the handler's concern:**
- `SESSION_NOT_OPEN` (SessionGuard) → 403 exception.
- `SESSION_MODE_NOT_ALLOWED` (CommandBus mode check per LLD1) → 403 exception.

All checks run before any staging. Order within the handler: existence → domain rules → writes. `Result.fail` short-circuits — no partial writes escape.

---

## 12a. Handler and API Response Shape

**Handler contract** (per core-result-format design):

```ts
type WriteResult = {
  groupId: string       // atomic handle for undo/redo/stage/unstage of the whole call
}

// Both PatchSpfModuleHandler and AddModuleHandler:
//   Promise<Result<WriteResult>>
```

- `Result.ok({groupId})` on success. Callers that need row-level detail (individual `change_id`s) can query `edit_actions WHERE group_id = ?` — the atomic-unit handle is the useful boundary; row enumeration is a follow-up concern.
- `Result.fail(...issues)` on structured failure (existence, domain rule violations).
- `throw` only for exceptional infrastructure failures (caught by `AllExceptionsFilter` → 500).

**Controller pattern** — dispatch write via CommandBus, then invoke query for the response DTO:

```ts
async patchModule(params, body, @Req request): Promise<ApiResult<SpfModuleDto>> {
  const cmd = new PatchSpfModuleCommand(...)
  const writeResult = await this.commandBus.execute(cmd, request.arcSession)
  throwIfFailed(writeResult)                                          // core-result-format helper

  // Follow-up read for the response body
  const readResult = await this.spfModuleQueryService.findOne(
    params.spfModuleSystemId, request.arcSession.fileSystemId,
  )
  throwIfFailed(readResult)
  return toApiResult(readResult)                                      // core-result-format helper
}
```

**Why controller composes reads + writes:**

- Preserves CQRS separation — command handlers stage edits, query services return effective state.
- LLD2 (writes) stays independently buildable/testable — no dependency on LLD3 (reads) landing first.
- Read overlay includes the just-written `edit_actions` row (`validUntil IS NULL` filter). Single-active-session invariant (I1) guarantees no interleaving.

For AddModule, allocated systemIds (module, subgraph, container, ports) surface naturally in the returned `SpfModuleDto` — no separate `allocatedSystemIds` envelope needed.

---

## 13. `UnitOfWork` Wiring

### 13.1 Accessors added

```
interface UnitOfWork {
  // existing (LLD1): setWriteContext, getWriteContext, getPendingChangeCache, applyCachedActions

  getModuleEditRepository():           IModuleEditRepository
  getSubgraphEditRepository():         ISubgraphEditRepository
  getContainerEditRepository():        IContainerEditRepository
  getSubsystemEditRepository():        ISubsystemEditRepository
  getModuleDefinitionEditRepository(): IModuleDefinitionEditRepository
  getDataLinkReadRepository():         IDataLinkReadRepository
  getControlLinkReadRepository():      IControlLinkReadRepository
}
```

### 13.2 Adapter wiring

- `TypeOrmUnitOfWork` returns instances scoped to the current `queryRunner`.
- Each adapter is constructed with the shared `PendingChangeWriter` and the queryRunner.
- Link-read adapters use `queryRunner.manager` for their SELECTs (no writer needed).

### 13.3 Handler registration

- Register each new command handler in `CommandHandlerRegistry.registerAllCommandHandlers()` using a `CommandHandlerFactory` that plucks the ports the handler needs from `CommandHandlerDependencies`:

```ts
// Inside registerAllCommandHandlers():
this.registerFactory(PatchSpfModuleCommand, {
  create: (deps) => new PatchSpfModuleHandler(deps.idGeneration),
})

this.registerFactory(AddModuleCommand, {
  create: (deps) => new AddModuleHandler(deps.idGeneration, deps.naturalIdGeneration),
})
```

`CommandHandlerDependencies` already exposes `idGeneration` and `naturalIdGeneration` (existing).

---

## 14. File Layout

Full folder tree — files created or modified:

- `packages/core/src/application/ports/persistence/repositories/module/module-edit.repository.ts` — new port.
- `.../repositories/subgraph/subgraph-edit.repository.ts` — new port.
- `.../repositories/container/container-edit.repository.ts` — new port.
- `.../repositories/subsystem/subsystem-edit.repository.ts` — new port.
- `.../repositories/module/module-definition-edit.repository.ts` — new port.
- `.../repositories/data-link/data-link-read.repository.ts` — new port (link-read, §6a).
- `.../repositories/control-link/control-link-read.repository.ts` — new port (link-read, §6a).
- `packages/core/src/application/module/patch/*.ts` — `PatchSpfModuleCommand` + `PatchSpfModuleHandler`.
- `packages/core/src/application/module/add-module/*.ts` — `AddModuleCommand` + `AddModuleHandler`.
- `packages/core/src/shared/issues/impacted-entity.ts` — extend `ISSUE_ENTITY_TYPE` enum with `DataPort`, `ControlPort`, and `Subsystem` values (needed for existence-check and port-count-decrease `impactedEntity` values). Single-file additive change.
- `packages/core/src/application/ports/persistence/unit-of-work.ts` — extend with new accessors.
- `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/module/module-edit.repository.ts` — new adapter.
- `.../repositories/subgraph/subgraph-edit.repository.ts` — new adapter.
- `.../repositories/container/container-edit.repository.ts` — new adapter.
- `.../repositories/subsystem/subsystem-edit.repository.ts` — new adapter.
- `.../repositories/module/module-definition-edit.repository.ts` — new adapter.
- `.../repositories/data-link/data-link-read.repository.ts` — new adapter.
- `.../repositories/control-link/control-link-read.repository.ts` — new adapter.
- `.../unit-of-work/typeorm-unit-of-work.ts` — extend to expose new accessors.
- `packages/core/src/application/orchestration/cqrs/registries/command-handler-registry.ts` — register `PatchSpfModuleHandler` and `AddModuleHandler` via factories.
- API controller wiring — `PATCH /spf-modules/:id` and `POST /spf-modules` methods in `SpfModuleController` — call `commandBus.execute()`, use `throwIfFailed()` + follow-up query + `toApiResult()` per the core-result-format design's controller pattern. No custom exception filters needed for LLD2 domain errors — the `ARC-` prefix rule in `http-status-map.ts` already maps them to 422.

---

## 15. Testing Strategy

### 15.1 Unit tests

- `PatchSpfModuleHandler` — stub repos verify:
  - Each optional field routed correctly (alias → renameModule; containerId → validate + changeContainer; port counts → add/remove with correct LIFO ordering).
  - Container type-compatibility check triggers the right error.
  - Port-count exceed-max throws `PortCountExceedsDefinitionError`.
  - Port-count decrease with linked ports throws `PortCountDecreaseBlockedError`; error body has expected `blockedPortSystemIds` / `blockingLinkSystemIds`.
  - No-op fields (undefined optionals) don't invoke repos.
  - Multi-field PATCH stages all changes under one groupId.
- `AddModuleHandler` — three variants + failure paths (missing definition, missing subgraph, missing container, missing subsystem).
- Each adapter tested with a stub `PendingChangeWriter` — verify domain → payload mapping + `targetTable` / `aggregateId` assignment + `fieldPath` mode derivation.
- `IDataLinkReadRepository` / `IControlLinkReadRepository` — basic query correctness with fixture links.

### 15.2 Integration tests (`packages/infrastructure/persistence/tests/integration`)

- In-memory SQLite; realistic module aggregate setup.
- End-to-end: dispatch command → verify `edit_actions` rows produced (correct `aggregateId`, `fieldPath`, `newValue`, `source = MANUAL`, `changeStatus = STAGED`, shared `groupId` where applicable).
- PATCH with all five fields — verify all writes share one `groupId`.
- PATCH port-count decrease — with fixture data-links, verify unused ports are removed and linked ports are protected; count exactly matching linked-count fails with the expected error body.
- AddModule Variant 1: verify 4+ rows produced (Subgraph, Container, Module, Node, N DataPorts, N ControlPorts) all sharing one `groupId`.

### 15.3 E2E (`packages/api/tests/e2e`)

- Full HTTP path through SessionGuard + controller + CommandBus + handler + repo + writer.
- Verify 403 on wrong mode, 404 on missing entity, 422 on domain-rule violations, 200 on success with correct `SpfModuleDto` in the response.

---

## 16. Migration & Rollout Notes

- No schema changes in this LLD (LLD1 owns them).
- Existing `SpfModuleQueryHandler` (query-spf-modules.handler.ts) is not touched by LLD2 — reads are LLD3's concern. LLD2's PATCH/AddModule controllers invoke the existing read service for the response — it works with the current overlay implementation; LLD3 will rewrite that overlay in place.
- PR #90 (colleague's API-layer PR) adds `PATCH /spf-modules/:id` and related endpoints as stubs throwing `NotImplementedException`. LLD2 replaces those stubs with real dispatches to `PatchSpfModuleCommand` / `AddModuleCommand`. Note: PR #90's `PatchSpfModuleRequestDto` field names (`maxInputPortsSupported` etc.) will need renaming to `numberOfInputPorts` / `numberOfOutputPorts` / `numberOfControlPorts` to match LLD2 semantics — coordinate before LLD2 execution begins.
- **Core-result-format PR** (`docs/core-result-format/design/core-result-format-design.md`) must land before LLD2. LLD2 depends on: `Result<T>` type, `Issue` interface, `IssueFactory`, `ISSUE_ENTITY_TYPE` enum, `throwIfFailed()`, `resolveHttpStatus()`, `ApiResult<T>` DTO, `ApiIssueItem` DTO. Rebase LLD2's execution branch onto post-core-result-format `main` before beginning.
- LLD1 must land before LLD2 execution starts (schema + `PendingChangeWriter` + `SessionGuard` + `CommandBus` mode check are LLD2 dependencies).
- **Delete the existing `CreateModuleCommand` stub** that is re-exported as `AddModuleCommand` from `packages/core/src/application/usecase-designer/index.ts`. Concretely:
  - Delete the old command class file (`create-module.command.ts` or equivalent) under `packages/core/src/application/usecase-designer/`.
  - Delete its handler class + file.
  - Remove its entry from `CommandHandlerRegistry`.
  - Remove the `AddModuleCommand` re-export line from `packages/core/src/application/usecase-designer/index.ts`.
  - Delete any test file(s) that exclusively cover the old stub.
  - Verify no other imports reference the old symbol; the new `AddModuleCommand` lives at `packages/core/src/application/module/add-module/` (§11.2).

---

## 17. Open Questions

- **OQ-1 — Property-data defaults on auto-create** (§10). Deferred to a follow-up. Needs read ports for subgraph and container property definitions plus a domain-shaped defaulting policy.
- **OQ-2 — Container type resolution for DIFF_MERGE AddModule** — REQ-ADD-03 says "first entry" from the definition. If the diff-tool wants to specify a different container type, would need an extension. Not blocking for Phase 1.
- **OQ-3 — Write-handler error style: `Result<T>` vs exceptions — RESOLVED.** The core-result-format design (`docs/core-result-format/design/core-result-format-design.md`) settles this: handlers return `Result<T>` for structured outcomes (both success and structured failure); throw exceptions only for exceptional/infrastructure failures. LLD2 handlers return `Promise<Result<WriteResult>>`. Domain violations use `Result.fail({code: 'ARC-MOD-*', ...})`. Existence failures use `Result.fail(IssueFactory.notFound(...))`. Session-mode/session-not-open remain exceptions (thrown upstream by CommandBus/SessionGuard per LLD1).
- **OQ-4 — Definition slot assignment for PATCH port-count increase.** When PATCH increases `numberOfInputPorts` from 2 to 5, the handler stages 3 new DataPort CREATEs. Which `dataPortId` (natural ID from the definition's `staticPortDefinitions[]`) and `name` do the new ports use? Assumed: definition-slot-order — take the next unused slot from `staticPortDefinitions[]`. If definitions declare only up to `numberOfCurrentPorts` and no more slots exist, the operation should error (impossible if `maxInputPortsSupported ≥ requested`, but worth confirming). LLD2 execution phase must confirm the exact slot-assignment rule.

---

*End of Outline*
