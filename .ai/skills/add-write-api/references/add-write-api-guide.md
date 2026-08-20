<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Add a Write API — Developer Guide

**Status:** Reference  
**Applies to:** All CQRS write endpoints in `@arc/core` + `@arc/api`

**Related docs (read these first):**
- `docs/edit-crud/overall-design.md` — Write pipeline, edit_actions storage model, aggregate scoping
- `docs/edit-crud/foundation.md` — PendingChangeWriter, session context, UoW extensions
- `handler-design-guidelines.md` — Handler return types, exception mapping, controller pattern (same `references/` folder)
- `docs/write-path-validation-reads-pattern.md` — Where validation reads live and how they share with the query side

---

## 1. Golden Rule — One Edit Repo Per Aggregate

Every aggregate root defined in `overall-design.md §5` has **exactly one** edit repository interface in `@arc/core` and exactly one adapter in `@arc/persistence`. All write operations on that aggregate and its child entities flow through the same repo.

**Current aggregate → edit repo mapping:**

| Aggregate | Edit repo interface | Child entities written through it |
|---|---|---|
| `SpfModule` | `ModuleEditRepository` | DataPort, ControlPort, Intent, SpfModulePropertiesData, Node (same systemId) |
| `Container` | `ContainerEditRepository` | ContainerPropertyData |
| `Subgraph` | `SubgraphEditRepository` *(LLD2+)* | SubgraphPropertyData |
| `SpfModuleDefinition` | `ModuleDefinitionEditRepository` | DataPortDefinition, DataPortGroupDefinition, StaticControlPortDefinition, DynamicIntentDefinition, etc. |
| `KeyDefinition` | `KeyDefinitionEditRepository` *(LLD6b)* | ValueDefinition |

**Rule: do NOT create a new edit repo for a child entity.** If you need to add a port, add the method to `ModuleEditRepository` — not a separate `DataPortEditRepository`.

---

## 2. New Repo vs Extend Existing

### Extend an existing repo when:
- The entity you're writing to is a child of an aggregate that already has a repo
- Example: Adding `setSubgraphName()` → add to `SubgraphEditRepository`

### Create a new repo when:
- The aggregate root has never been brought into edit scope
- Its `overall-design.md §5` entry says "brought into edit scope as later design passes address them"
- Example: Adding PATCH for Subsystem nodes → new `SubsystemEditRepository`

When creating a new repo, you need all 4 layers:
1. Interface in `@arc/core/application/ports/persistence/repositories/<aggregate>/`
2. `UnitOfWork` accessor: `get<Aggregate>EditRepository(): <Aggregate>EditRepository`
3. Adapter in `@arc/persistence/repositories/<aggregate>/`
4. Wire into `TypeOrmUnitOfWork`

---

## 3. Validation Reads — Where They Live

When a handler needs to read current entity state **before** writing (to validate the operation is legal), the read method belongs on the edit repository — **not** on a query service.

### Decision tree

```
Does the validation read data from the same aggregate as the write?
  YES → Add a validation read method to that aggregate's edit repository.
        The repo gets sessionId from uow.getWriteContext().session.sessionId.
        
  NO  → The data belongs to a different aggregate.
        Use a separate cross-aggregate read port (dedicated interface in core).
        Do not place reads for foreign aggregate data on an unrelated edit repo.
```

### What return type to use — apply YAGNI, don't preemptively build the hierarchy

Before adding any type or method, ask: **what does this specific handler actually need right now?** Introduce only what that handler requires. Do not preemptively create `XxxBase` or the full aggregate type because "future APIs might need them." If you are unsure whether an abstraction is the right call, raise it with the API author before adding it — a two-sentence question saves everyone from unwinding a premature design decision.

**Existence only (null-check, no fields used) → `exists()` returning `Promise<boolean>`**

```typescript
// In the edit repo interface
ckvExists(spfModuleSystemId: number, ckvSystemId: number): Promise<boolean>;

// In the handler
if (!await moduleRepo.ckvExists(command.spfModuleSystemId, command.ckvSystemId))
  throw new ResourceNotFoundException('CKV not found');
```

**Scalar fields needed → return a stable `XxxBase` interface defined in the domain folder**

Only introduce this when a handler genuinely reads fields off the result — not just null-checks it. Define one base interface per aggregate root capturing all scalar columns (no relational collections). The full aggregate type extends this base. Once `XxxBase` exists, all subsequent write APIs that need scalar fields reuse it — no per-API micro-types.

```typescript
// packages/core/src/domain/entities/usecase-data/node/spf-module-base.ts
export interface SpfModuleBase {
  systemId: number;
  definitionSystemId: number;
  subgraphSystemId: number;
  containerSystemId: number;
  aliasName: string;
  // all scalar columns — no ports[], ckvs[], intents[] collections
}

// The full aggregate extends it (only introduce this when relations are genuinely needed)
export interface SpfModule extends SpfModuleBase {
  ports: DataPort[];
  intents: Intent[];
  // ...
}

// In the edit repo interface
findModuleBase(systemId: number, fileSystemId: number): Promise<SpfModuleBase | null>;
```

**Do NOT create a new return type per write API.** A proliferation of `SpfModuleForValidation`, `SpfModuleForDelete`, `SpfModuleForAddCkv`, etc. is unmaintainable at scale. The performance argument for column-selective single-row PK lookups is negligible.

### Relation loading — focused methods, not full aggregate

The **aggregate boundary governs writes** — all writes to `Ckv` and `DataPort` flow through `ModuleRepository`. It does **not** mean reads must load the full aggregate. Add focused read methods per relation slice on the same repository interface, and only when a handler actually needs that slice:

```typescript
interface ModuleRepository {
  // Existence check
  ckvExists(spfModuleSystemId: number, ckvSystemId: number): Promise<boolean>;

  // Scalar fields only
  findModuleBase(systemId: number, fileSystemId: number): Promise<SpfModuleBase | null>;

  // Relation slices — return the actual domain child type, no new types invented
  getCkvs(moduleSystemId: number): Promise<Ckv[]>;
  getDataPorts(moduleSystemId: number): Promise<DataPort[]>;

  // Full aggregate with all relations loaded — name this to convey what it returns,
  // not which operation uses it. E.g. findModuleFull(), not findModuleForPatch().
  // Only introduce this when a handler genuinely needs multiple relations together.
  findModuleFull(systemId: number, fileSystemId: number): Promise<SpfModule | null>;

  // Writes
  setCkvCalData(...): Promise<void>;
  addDataPort(...): Promise<void>;
}
```

**Naming the full-aggregate method:** use a name that describes the return shape, not the caller. `findModuleFull` or `findModuleWithRelations` are good; `findModuleForPatch` is bad because it implies the method belongs to one operation and discourages reuse.

Handlers compose what they need and can fan out in parallel:

```typescript
const [module, ckvs] = await Promise.all([
  repo.findModuleBase(systemId, fileSystemId),
  repo.getCkvs(systemId),
]);
```

**Payoff threshold:** if three or more handlers end up calling the same relation read method, it has paid for itself. Below that threshold, consider whether inlining the logic is simpler.

**Do not use the Specification pattern for relation loading.** It grows unbounded and the result type is hard to express precisely in TypeScript without a generated type layer.

**Do not use a generic `include` option bag** (`findModule(id, {include: ['ckvs', 'ports']})`). This requires Prisma-level generated types to be type-safe. Without that infrastructure, it produces unsafe casts or `any`.

### Shared fetcher — when both query side and write side read the same data

When both a query service and an edit repo need the same overlaid DB data:
- Create a **shared internal fetcher** in `@arc/persistence/fetchers/`
- The fetcher is NOT a port — it is not exported to `@arc/core`
- Both the query service adapter and edit repo adapter call the same fetcher
- The fetcher takes `sessionId: number | null` — null means base-only (no overlay)
- Each consumer does its own Layer 3 mapping (query service → verbose read model; edit repo → base type or child type)

See `write-path-validation-reads-pattern.md §4` and the existing fetchers in
`packages/infrastructure/persistence/src/persistence-typeorm-sqllite/fetchers/` for worked examples.

---

## 4. Implementation Checklist — New Write Endpoint

### Step 1: Command
**Location:** `packages/core/src/application/usecase-designer/<aggregate>/<verb>/`

```typescript
export class SetSubgraphNameCommand extends BaseCommand {
  static override readonly requiresSession = true;
  static override readonly allowedModes: readonly SessionMode[] = [
    SESSION_MODE.Designer,
    SESSION_MODE.DiffMerge,
  ];
  constructor(
    clientId: string,
    public readonly subgraphSystemId: number,
    public readonly fileSystemId: number,
    public readonly name: string,
  ) { super(clientId); }
}
```

### Step 2: Handler
**Location:** same folder as the command

```typescript
export class SetSubgraphNameHandler
  implements CommandHandler<SetSubgraphNameCommand, {groupId: string}>
{
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  async handle(command: SetSubgraphNameCommand): Promise<{groupId: string}> {
    // 1. Validate business logic first — before startTransaction
    if (!command.name?.trim()) {
      throw new InvalidOperationException('name must not be blank');
    }

    await this.uow.startTransaction();
    try {
      const repo = this.uow.getSubgraphEditRepository();

      // 2. Existence / cross-entity checks
      const subgraph = await repo.findSubgraphForPatch(
        command.subgraphSystemId, command.fileSystemId,
      );
      if (!subgraph) throw new ResourceNotFoundException(`Subgraph ${command.subgraphSystemId} not found`);

      // 3. Domain rule checks → throw DomainRuleViolationException([issues]) for 422
      // ... validate rules here ...

      // 4. Write via the aggregate's edit repo (aggregateId = subgraph systemId)
      await repo.renameSubgraph(command.subgraphSystemId, command.name);

      await this.uow.commit();
      return {groupId: this.uow.getWriteContext().groupId};
    } catch (err) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw err;
    }
  }
}
```

### Step 3: Register in CommandHandlerRegistry
**Location:** `packages/core/src/application/orchestration/cqrs/registries/command-handler-registry.ts`

```typescript
this.commandHandlerFactories.set(SetSubgraphNameCommand, {
  create: deps => new SetSubgraphNameHandler(deps.uow, deps.idGeneration),
});
```

### Step 4: Request DTO
**Location:** `packages/api/src/presentation/rest/modules/<resource>/dto/request/`

All optional fields **must** have `@IsOptional()` + a type validator (`@IsString()`, `@IsInt()`, etc.) — `ValidationPipe` with `whitelist: true` **strips fields without class-validator decorators**.

```typescript
export class SetSubgraphNameRequestDto {
  @ApiProperty({required: true})
  @IsString()
  @IsNotEmpty()
  name!: string;
}
```

### Step 5: Controller method
**Location:** `packages/api/src/presentation/rest/modules/<resource>/<resource>.controller.ts`

```typescript
@Patch('/:subgraphSystemId')
@UseGuards(SessionGuard)
async setSubgraphName(
  @Param('projectId', ParseIntPipe) projectId: number,
  @Param('subgraphSystemId', ParseIntPipe) subgraphSystemId: number,
  @Body() dto: SetSubgraphNameRequestDto,
  @ArcSession() session: ActiveSession,
): Promise<ApiResult<SubgraphDto>> {
  await this.commandBus.execute<{groupId: string}>(
    new SetSubgraphNameCommand('api-client', subgraphSystemId, session.fileSystemId, dto.name),
    session,
  );
  const readResult = await this.queryBus.execute<Result<SubgraphReadModel>>(
    new SubgraphQuery([subgraphSystemId], projectId, false, 'api-client'),
  );
  return toApiResult(readResult, model => this.mapToSubgraphDto(model));
}
```

### Step 6: Export command from `@arc/core`
**Location:** `packages/core/src/index.ts`

```typescript
export {SetSubgraphNameCommand} from './application/usecase-designer/subgraph/set-name/set-subgraph-name.command.js';
```

### Step 7: New repo interface (only if bringing a new aggregate into edit scope)

Interface in `packages/core/src/application/ports/persistence/repositories/<aggregate>/<aggregate>-edit.repository.ts`:
```typescript
export interface SubgraphEditRepository {
  findSubgraphForPatch(systemId: number, fileSystemId: number): Promise<SubgraphBase | null>;
  renameSubgraph(systemId: number, name: string, options?: EditOptions): Promise<void>;
}
```

UoW accessor + adapter + TypeOrmUnitOfWork wiring — follow the Module pattern exactly.

### Step 8: Tests

Follow the test pattern from `docs/edit-crud/plans/chapters/01b-patch-tests.md`:

- **Handler unit tests** — mock repos, cover: empty/invalid input (400), not found (404), domain rule violation (422), happy path + groupId, rollback called on failure
- **Edit repo integration tests** — real SQLite DB, seed prerequisites, verify `edit_actions` rows have correct `target_table`, `aggregate_id`, `change_status`, `source`
- **Write path integration test** — verify all rows from one command share the same `group_id`; verify supersession (second write supersedes first)
- **E2E tests** — upload fixture → start session → test each documented HTTP code (403/400/404/422/200) + response body on success

---

## 5. File Location Conventions

```
packages/core/src/application/usecase-designer/
  <aggregate>/                          ← folder name = aggregate domain concept
    <verb>/                             ← verb = domain operation (set-name, add-port, delete, etc.)
      <Name>Command.ts
      <Name>Handler.ts
    <shared-helpers>/                   ← shared non-handler logic (e.g., container/build-container-copy.ts)

packages/core/src/application/ports/persistence/repositories/
  <aggregate>/
    <aggregate>-edit.repository.ts      ← interface only

packages/infrastructure/persistence/src/persistence-typeorm-sqllite/
  repositories/<aggregate>/
    <aggregate>-edit.repository.ts      ← TypeOrm adapter
  fetchers/
    <aggregate>-overlay-fetcher.ts      ← shared fetcher (NOT a port)

packages/core/tests/unit/application/usecase-designer/<aggregate>/<verb>/
  <Name>Handler.spec.ts
packages/infrastructure/persistence/tests/integration/repositories/<aggregate>/
  <aggregate>-edit.repository.integration.spec.ts
  <aggregate>-write-path.integration.spec.ts
packages/api/tests/e2e/<resource>/
  <resource>-<verb>.e2e-spec.ts
```

---

## 6. Key Constraints from `overall-design.md`

### `aggregateId` on every write
Every `edit_actions` row must carry `aggregateId = <aggregate root systemId>`, even when writing a child entity:

```typescript
// Writing DataPort — aggregateId is the MODULE's systemId, not the port's
await this.writer.writeCreate({
  targetTable: ENTITY_NAMES.DataPort,
  targetSystemId: port.systemId,
  aggregateId: moduleSystemId,   // ← aggregate root
  payload: {...},
});
```

### `groupId` atomicity
All writes in one command share the same `groupId` (stamped by CommandBus onto `WriteContext`). Do not generate a new groupId — read it from `uow.getWriteContext().groupId`.

### Session mode enforcement
`static override readonly allowedModes` on the command class enforces which session modes can execute this command. DESIGNER-only operations use `[SESSION_MODE.Designer]`. Operations valid in both manual-edit modes use `[SESSION_MODE.Designer, SESSION_MODE.DiffMerge]`.

### Domain verbs, not `stage*` prefix
Edit repo method names describe the domain operation: `renameModule`, `addDataPort`, `createContainer`. Not `stageModuleRename`, `stagePortCreate`. The "staging" is implicit — that's what edit repos do.

---

## 7. Multi-API LLDs

When an LLD covers multiple write APIs, dedicate **one chapter per API**. Each chapter is self-contained and produces a working, committable increment. Ordering rule: dependencies first (e.g., if POST "add module" depends on the container auto-create path from PATCH "patch module", ship PATCH first).

Chapter naming convention: `<NN>-<verb>-<resource>.md` (e.g., `03-post-add-spf-module.md`, `04-delete-spf-module.md`).
