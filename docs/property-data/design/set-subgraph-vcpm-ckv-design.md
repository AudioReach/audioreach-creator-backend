<!--
  Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
  SPDX-License-Identifier: BSD-3-Clause
-->

# Set Subgraph VCPM CKV — Low-Level Design (Draft)

**Feature folder:** `docs/property-data/`
**Status:** DRAFT — Ready for review
**Date:** 2026-08-28
**Related LLD:** `set-subgraph-scenario-design.md` (introduces `VcpmDefinitionQueryService`)

---

## Requirements

Requirements source: [../set-subgraph-vcpm-ckv-requirements.md](../set-subgraph-vcpm-ckv-requirements.md)

| ID | Requirement |
|---|---|
| FR#5 | `POST /subgraphs/:id/vcpm-ckv` — create a new CKV entry with default payloads for all parameters |
| FR#6 | `DELETE /subgraphs/:id/vcpm-ckv/:ckvSystemId` — delete a CKV and all its parameter payloads |
| FR#7 | `PUT /subgraphs/:id/vcpm-ckv/:ckvSystemId/cal-data` — update cal payloads for one or more parameters; partial success supported |
| FR-CCR-01 | Active session required → 403 |
| FR-CCR-02 | DESIGNER / DIFF_MERGE modes only → 403 |
| FR-CCR-03/04 | All writes staged; visible via overlay read immediately |
| FR-CCR-05 | groupId in all responses |

---

## Section 1: Architecture & Call Flow

All three endpoints follow hexagonal + CQRS. Commands and handlers are already stubbed — this LLD implements them.

### 1.1 High-Level Workflow Diagrams

#### POST /vcpm-ckv

```mermaid
flowchart TD
    A([Client POST /vcpm-ckv]) --> B[SessionGuard]
    B -->|No session| C([HTTP 403])
    B -->|OK| D[CommandBus: check allowedModes]
    D -->|Not allowed| C
    D -->|OK| E[subgraphExists → 404]
    E -->|Not found| F([HTTP 404])
    E -->|Found| G[Load VcpmInstance for subgraph → 404 if none]
    G -->|Not found| F
    G -->|Found| H[Duplicate CKV guard → 422 if exists]
    H -->|Duplicate| I([HTTP 422])
    H -->|OK| J[Create VcpmCkv + VcpmCkvValues + VcpmParameterPayloads]
    J --> K[Lookup keyId+valueId via keyValueDefQueryService]
    K --> L([HTTP 200 CreateVcpmCkvDto])
```

#### DELETE /vcpm-ckv/:ckvSystemId

```mermaid
flowchart TD
    A([Client DELETE /vcpm-ckv/:ckvSystemId]) --> B[SessionGuard]
    B -->|No session| C([HTTP 403])
    B -->|OK| D[CommandBus: check allowedModes]
    D -->|Not allowed| C
    D -->|OK| E[subgraphExists → 404]
    E -->|Not found| F([HTTP 404])
    E -->|Found| G[vcpmCkvExists → 404 if not found]
    G -->|Not found| F
    G -->|Found| H[DELETE VcpmParameterPayloads + VcpmCkvValues + VcpmCkv]
    H --> I([HTTP 204])
```

#### PUT /vcpm-ckv/:ckvSystemId/cal-data

```mermaid
flowchart TD
    A([Client PUT /vcpm-ckv/:ckvSystemId/cal-data]) --> B[SessionGuard]
    B -->|No session| C([HTTP 403])
    B -->|OK| D[CommandBus: check allowedModes]
    D -->|Not allowed| C
    D -->|OK| E[subgraphExists → 404]
    E -->|Not found| F([HTTP 404])
    E -->|Found| G[vcpmCkvExists → 404]
    G -->|Not found| F
    G -->|Found| H[For each parameter: validate + serialize]
    H --> I[writeDelta on VcpmParameterPayload rows]
    I --> J[Re-query via GetVcpmCalDataQuery]
    J --> K([HTTP 200 / 207 CkvCalDataResponseDto])
```

### 1.2 File and Folder Organization

Files annotated **(existing)** already exist; **(modified)** means changed; **(new)** means new file.

#### Presentation Layer
```
packages/api/src/presentation/rest/modules/subgraph/
└── subgraph.controller.ts                                               (modified — implement createVcpmCkv, deleteVcpmCkv, updateVcpmCalData stubs)
```

#### Core Layer
```
packages/core/src/application/
├── ports/persistence/repositories/
│   ├── subgraph/subgraph.repository.ts                                   (modified)
│   ├── vcpm/vcpm-definition.repository.ts                               (present, not wired into UnitOfWork)
│   └── key-value/key-value-definition.repository.ts                     (present, not wired into UnitOfWork)
├── ports/persistence/query-services/vcpm/
│   └── vcpm-calibration-query-service.ts                                 (present, not exposed by QueryServices)
├── orchestration/cqrs/registries/
│   ├── command-handler-registry.ts                                      (modified)
│   └── query-handler-registry.ts                                        (modified; GET handlers registered)
└── usecase-designer/subgraph/
    ├── create-vcpm-ckv/create-vcpm-ckv.handler.ts                       (implemented)
    ├── delete-vcpm-ckv/delete-vcpm-ckv.handler.ts                       (implemented)
    ├── get-vcpm-ckv/get-vcpm-ckv.handler.ts                             (registered; not implemented)
    ├── get-vcpm-cal-data/get-vcpm-cal-data.handler.ts                   (registered; not implemented)
    └── update-vcpm-cal-data/
        ├── update-vcpm-cal-data.command.ts                              (implemented)
        ├── update-vcpm-cal-data.handler.ts                              (implemented)
        └── put-vcpm-cal-data-result.ts                                  (present)
```

#### Infrastructure Layer
```
packages/infrastructure/persistence/src/persistence-typeorm-sqllite/
├── fetchers/
│   ├── vcpm-ckv-overlay-fetcher.ts                                      (present; read-side)
│   └── vcpm-parameter-payload-fetcher.ts                                (present; read-side)
├── queries/vcpm/
│   └── db-vcpm-calibration-query-service.ts                             (present; not wired into QueryServices)
└── repositories/
    ├── subgraph/subgraph.repository.ts                                  (implemented; inline write-side overlay)
    ├── vcpm/vcpm-definition.repository.ts                               (present; not wired)
    └── key-value/key-value-definition.repository.ts                     (present; not wired)
```

No schema changes — no migration needed.

### 1.3 Layer Responsibilities

```
Presentation (API)
  POST /vcpm-ckv:
    → new CreateVcpmCkvCommand(subgraphSystemId, dto.ckv)
    → CommandBus.execute → CreateVcpmCkvDto
    → toApiResult(Result.ok(result)) → 200

  DELETE /vcpm-ckv/:ckvSystemId:
    → new DeleteVcpmCkvCommand(subgraphSystemId, ckvSystemId)
    → CommandBus.execute → void → 204

  PUT /vcpm-ckv/:ckvSystemId/cal-data:
    → new UpdateVcpmCalDataCommand(subgraphSystemId, ckvSystemId, dto.parameters)
    → CommandBus.execute → PutVcpmCalDataResult
    → re-query via GetVcpmCalDataQuery (succeeded params only)
    → assemble ApiResult<CkvCalDataDto> → 200 / 207

Core (Application)
  CreateVcpmCkvHandler:
    1. subgraphExists → 404
    2. Load VcpmInstance for subgraph via VcpmDefinitionQueryService → 404 if none
    3. Duplicate guard: vcpmCkvExists(instanceSystemId, valueSystemIds) → 422
    4. createVcpmCkv(subgraphSystemId, instanceSystemId, valueSystemIds, paramDefs)
    5. Lookup keyId+valueId via keyValueDefQueryService.getKeyValueSummaryForGivenValues
    6. Return CreateVcpmCkvDto { groupId, ckvSystemId, ckv: [{keyId, valueId}] }

  DeleteVcpmCkvHandler:
    1. subgraphExists → 404
    2. vcpmCkvExistsBySystemId(ckvSystemId, subgraphSystemId) → 404
    3. deleteVcpmCkv(subgraphSystemId, ckvSystemId) — deletes payloads + values + ckv row
    4. Return void

  UpdateVcpmCalDataHandler:
    1. subgraphExists → 404
    2. vcpmCkvExistsBySystemId(ckvSystemId, subgraphSystemId) → 404
    3. getVcpmCkvPayloads(ckvSystemId, subgraphSystemId) → existing payload rows (overlay-aware)
    4. Load VcpmModuleParameterDefinition for each payload via VcpmDefinitionQueryService
    5. For each submitted parameter:
         - no existing payload → per-parameter failure (update-only)
         - isReadOnly → per-parameter failure
         - serializeParameterData → per-parameter failure if fails
    6. updateVcpmCalData(subgraphSystemId, ckvSystemId, payloadUpdates)
    7. Return PutVcpmCalDataResult { groupId, succeededParamSystemIds }

Infrastructure (Persistence)
  createVcpmCkv:
    → writeCreate VcpmCkv row (aggregateId = subgraphSystemId)
    → writeCreate VcpmCkvValues rows (one per valueSystemId)
    → writeCreate VcpmParameterPayload rows (one per param, default payload)

  deleteVcpmCkv:
    → fetch existing VcpmParameterPayload rows for ckvSystemId
    → writeDelete each VcpmParameterPayload (aggregateId = subgraphSystemId)
    → writeDelete VcpmCkv row (aggregateId = subgraphSystemId)
    (VcpmCkvValues cascade via DB ON DELETE CASCADE)

  updateVcpmCalData:
    → writeDelta on each VcpmParameterPayload (aggregateId = subgraphSystemId,
      delta = { payload: serializedBytes })
```

---

### 1.4 Current implementation alignment

The snippets in this document are aligned with the current source tree as it
exists today:

- `CreateVcpmCkvHandler`, `DeleteVcpmCkvHandler`, and
  `UpdateVcpmCalDataHandler` are implemented.
- Create and update currently receive `QueryServices` and use
  `vcpmDefinitionQueryService`; the command-side VCPM and key/value repository
  adapters exist as separate files but are not yet exposed by `UnitOfWork` or
  used by these handlers.
- `TypeOrmSubgraphRepository` currently performs VCPM effective-state reads
  through its inline `EditActionsQueryService`/`OverlayMergeImpl` logic. The
  dedicated VCPM fetchers are used by `DbVcpmCalibrationQueryService`, not by
  the write repository.
- The write repository currently passes an inline predicate as the third
  argument to `applyToCollection`, while the dedicated fetchers pass the
  `matchesEffective` options object. This API usage must be reconciled before
  treating the snippets as compile-ready.
- `GetVcpmCkvHandler` and `GetVcpmCalDataHandler` are registered, but their
  current implementations still throw `not implemented yet`.
- `VcpmCkvValues` is inserted directly by `createVcpmCkv`; it is not staged as
  an `edit_actions` row.

---

## Section 2: Presentation Layer

**File:** `packages/api/src/presentation/rest/modules/subgraph/subgraph.controller.ts` (modified)

### 2.1 POST /vcpm-ckv

The existing `createVcpmCkv` stub is already wired correctly — only the handler needs implementation. No controller changes needed.

### 2.2 DELETE /vcpm-ckv/:ckvSystemId

The existing `deleteVcpmCkv` stub is already wired correctly — no controller changes needed.

### 2.3 PUT /vcpm-ckv/:ckvSystemId/cal-data

The existing `updateVcpmCalData` stub uses `UpdatePropertyRequestDto` (single property elements). This must be updated to accept `UpdateSpfModuleCalDataRequest` (list of parameters with systemIds) — same DTO as the SPF module PUT cal-data endpoint:

```typescript
@Put('/:subgraphSystemId/vcpm-ckv/:ckvSystemId/cal-data')
@UseGuards(SessionGuard)
async updateVcpmCalData(
  @Param('projectId') projectId: string,
  @Param('subgraphSystemId', ParseIntPipe) subgraphSystemId: number,
  @Param('ckvSystemId', ParseIntPipe) ckvSystemId: number,
  @Body() dto: UpdateSpfModuleCalDataRequest,
  @ArcSession() session: ActiveSession,
): Promise<ApiResult<CkvCalDataResponseDto>> {
  const putResult = await this.commandBus.execute<Result<PutVcpmCalDataResult>>(
    new UpdateVcpmCalDataCommand(subgraphSystemId, ckvSystemId, dto.parameters),
    session,
  );
  if (putResult.kind === RESULT_KIND.Fail) throw new Error('Unexpected Fail');

  let data: CkvCalDataDto | undefined;
  if (putResult.data.succeededParamSystemIds.length > 0) {
    const query = new GetVcpmCalDataQuery(
      projectId, String(subgraphSystemId), String(ckvSystemId), 'api-client',
      putResult.data.succeededParamSystemIds.join(','),
    );
    const readResult = await this.queryBus.execute<Result<CkvCalDataDto>>(query);
    data = readResult.kind !== RESULT_KIND.Fail ? readResult.data : undefined;
  }

  const issues = putResult.issues ?? [];
  const resultEnvelope = issues.length > 0 ? Result.partial(data, issues) : Result.ok(data);
  return toApiResult(resultEnvelope);
}
```

---

## Section 3: Core Layer

### 3.1 UpdateVcpmCalDataCommand (modified)

**File:** `packages/core/src/application/usecase-designer/subgraph/update-vcpm-cal-data/update-vcpm-cal-data.command.ts` (modified)

`data: unknown[]` → `parameters: Array<{ systemId: number; elements: ParameterElementSummaryDto[] }>`:

```typescript
export class UpdateVcpmCalDataCommand extends BaseCommand {
  static override readonly requiresSession = true;
  static override readonly allowedModes: readonly SessionMode[] = [
    SESSION_MODE.Designer,
    SESSION_MODE.DiffMerge,
  ];

  constructor(
    public readonly subgraphSystemId: number,
    public readonly ckvSystemId: number,
    public readonly parameters: Array<{systemId: number; elements: ParameterElementSummaryDto[]}>,
  ) {
    super();
  }
}
```

### 3.2 CreateVcpmCkvHandler

**File:** `packages/core/src/application/usecase-designer/subgraph/create-vcpm-ckv/create-vcpm-ckv.handler.ts` (modified)

```typescript
export class CreateVcpmCkvHandler implements CommandHandler<
  CreateVcpmCkvCommand,
  CreateVcpmCkvDto
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly queryServices: QueryServices,
  ) {}

  async handle(command: CreateVcpmCkvCommand): Promise<CreateVcpmCkvDto> {
    const {session, groupId} = this.uow.getWriteContext();
    const fileSystemId = session.fileSystemId;
    const repository = this.uow.getSubgraphRepository();

    if (
      !(await repository.subgraphExists(command.subgraphSystemId, fileSystemId))
    ) {
      throw new ResourceNotFoundException(
        `Subgraph ${command.subgraphSystemId} not found`,
      );
    }

    const definitions =
      await this.queryServices.vcpmDefinitionQueryService.getVcpmModuleDefinitionsWithParams(
        fileSystemId,
      );
    const definition = definitions[0];
    if (!definition) {
      throw new ResourceNotFoundException(
        `No VCPM module definition found for file ${fileSystemId}`,
      );
    }

    const instanceSystemId = await repository.getVcpmInstanceSystemId(
      command.subgraphSystemId,
      definition.systemId,
    );
    if (instanceSystemId === null) {
      throw new ResourceNotFoundException(
        `VcpmInstance not found for subgraph ${command.subgraphSystemId}`,
      );
    }

    const valueSystemIds = command.ckv.flatMap(pair =>
      pair.valueSystemIds.map(Number),
    );
    if (await repository.vcpmCkvExists(instanceSystemId, valueSystemIds)) {
      throw new DomainRuleViolationException([
        IssueFactory.parseError(
          'VCPM_CKV_DUPLICATE',
          `A VCPM CKV with the requested values already exists for instance ${instanceSystemId}`,
        ),
      ]);
    }

    await this.uow.startTransaction();
    let ckvSystemId: number;
    try {
      ckvSystemId = await repository.createVcpmCkv(
        command.subgraphSystemId,
        instanceSystemId,
        valueSystemIds,
        definition.parameters,
      );
      await this.uow.commit();
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }

    const keyValueResult =
      await this.queryServices.keyValueDefQueryService.getKeyValueSummaryForGivenValues(
        valueSystemIds,
        fileSystemId,
      );
    const ckv =
      keyValueResult.kind === RESULT_KIND.Fail
        ? []
        : keyValueResult.data.map(pair => ({
            keyId: pair.key.keyId,
            valueId: pair.value.valueId,
          }));

    return {groupId, ckvSystemId: String(ckvSystemId), ckv};
  }
}
```

Registry entry:
```typescript
this.commandHandlerFactories.set(CreateVcpmCkvCommand, {
  create: deps => new CreateVcpmCkvHandler(deps.uow, deps.queryServices),
});
```

### 3.3 DeleteVcpmCkvHandler

**File:** `packages/core/src/application/usecase-designer/subgraph/delete-vcpm-ckv/delete-vcpm-ckv.handler.ts` (modified)

```typescript
export class DeleteVcpmCkvHandler implements CommandHandler<DeleteVcpmCkvCommand, void> {
  constructor(private readonly uow: UnitOfWork) {}

async handle(command: DeleteVcpmCkvCommand): Promise<void> {
  const {session} = this.uow.getWriteContext();
  const repository = this.uow.getSubgraphRepository();

  if (
    !(await repository.subgraphExists(
      command.subgraphSystemId,
      session.fileSystemId,
    ))
  ) {
    throw new ResourceNotFoundException(
      `Subgraph ${command.subgraphSystemId} not found`,
    );
  }

  if (
    !(await repository.vcpmCkvExistsBySystemId(
      command.ckvSystemId,
      command.subgraphSystemId,
    ))
  ) {
    throw new ResourceNotFoundException(
      `VcpmCkv ${command.ckvSystemId} not found`,
    );
  }

  await repository.deleteVcpmCkv(
    command.subgraphSystemId,
    command.ckvSystemId,
  );
}
}
```

### 3.4 UpdateVcpmCalDataHandler

**File:** `packages/core/src/application/usecase-designer/subgraph/update-vcpm-cal-data/update-vcpm-cal-data.handler.ts` (modified)

Mirrors `PutCkvCalDataHandler` for SPF modules. The current implementation
collects per-parameter issues and returns `Result.partial` when at least one
submitted payload cannot be updated.

```typescript
export class UpdateVcpmCalDataHandler implements CommandHandler<
  UpdateVcpmCalDataCommand,
  Result<PutVcpmCalDataResult>
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly queryServices: QueryServices,
  ) {}

  async handle(command: UpdateVcpmCalDataCommand): Promise<Result<PutVcpmCalDataResult>> {
    const {session, groupId} = this.uow.getWriteContext();
    const fileSystemId = session.fileSystemId;
    const repository = this.uow.getSubgraphRepository();

    // Step 1: subgraph existence
    const exists = await repository.subgraphExists(
      command.subgraphSystemId,
      fileSystemId,
    );
    if (!exists) throw new ResourceNotFoundException(`Subgraph ${command.subgraphSystemId} not found`);

    // Step 2: CKV existence
    const ckvExists = await repository.vcpmCkvExistsBySystemId(
      command.ckvSystemId,
      command.subgraphSystemId,
    );
    if (!ckvExists) throw new ResourceNotFoundException(`VcpmCkv ${command.ckvSystemId} not found`);

    // Step 3: fetch existing payload rows (overlay-aware — includes same-session CREATEs)
    const existingPayloads = await repository.getVcpmCkvPayloads(
      command.ckvSystemId,
      command.subgraphSystemId,
    );

    // Step 4: load parameter definitions for this CKV's VCPM definition
    const definitions =
      await this.queryServices.vcpmDefinitionQueryService.getVcpmModuleDefinitionsWithParams(
        fileSystemId,
      );
    const defBySystemId = new Map(
      definitions
        .flatMap(definition => definition.parameters)
        .map(parameter => [parameter.systemId, parameter]),
    );

    // Step 5: per-parameter validation + serialization
    const payloadMap = new Map(existingPayloads.map(p => [p.systemId, p]));
    const succeededParamSystemIds: number[] = [];
    const issues: Issue[] = [];
    const writeBatch: Array<{payloadSystemId: number; payload: Uint8Array}> = [];

    for (const param of command.parameters) {
      const existing = payloadMap.get(param.systemId);
      if (!existing) {
        issues.push(IssueFactory.paramPayloadNotFound(param.systemId));
        continue;
      }
      const def = defBySystemId.get(existing.vcpmParameterSystemId);
      if (!def) throw new Error(`VcpmParameterDefinition missing for systemId=${existing.vcpmParameterSystemId} — DB integrity violation`);
      if (def.isReadOnly) {
        issues.push(IssueFactory.paramReadOnly(param.systemId));
        continue;
      }
      const serialized = serializeParameterData(
        def,
        mapDtoToParameterCalibration(
          param.elements as unknown as ParameterElementDto[],
        ),
      );
      if (!serialized.ok) {
        issues.push(
          IssueFactory.paramSerializationFailed(
            param.systemId,
            serialized.error,
          ),
        );
        continue;
      }
      succeededParamSystemIds.push(param.systemId);
      writeBatch.push({payloadSystemId: param.systemId, payload: serialized.value});
    }

    // Step 6: write successful payloads
    await this.uow.startTransaction();
    try {
      await repository.updateVcpmCalData(
        command.subgraphSystemId,
        command.ckvSystemId,
        writeBatch,
      );
      await this.uow.commit();
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }

    const data: PutVcpmCalDataResult = {groupId, succeededParamSystemIds};
    return issues.length > 0 ? Result.partial(data, issues) : Result.ok(data);
  }
}
```

**Result type** (`put-vcpm-cal-data-result.ts` — new):
```typescript
export interface PutVcpmCalDataResult {
  groupId: string;
  succeededParamSystemIds: number[];
}
```

Registry entries:
```typescript
this.commandHandlerFactories.set(DeleteVcpmCkvCommand, {
  create: deps => new DeleteVcpmCkvHandler(deps.uow),
});
this.commandHandlerFactories.set(UpdateVcpmCalDataCommand, {
  create: deps => new UpdateVcpmCalDataHandler(deps.uow, deps.queryServices),
});
```

### 3.5 Current GET handler status

The GET handlers are registered by `QueryHandlerRegistry`, but their current
source implementations are placeholders:

```typescript
export class GetVcpmCkvHandler implements QueryHandler<
  GetVcpmCkvQuery,
  Promise<Result<VcpmCkvDto>>
> {
  constructor(_queryServices: QueryServices) {}

  handle(_query: GetVcpmCkvQuery): Promise<Result<VcpmCkvDto>> {
    throw new Error('GetVcpmCkvHandler not implemented yet');
  }
}

export class GetVcpmCalDataHandler implements QueryHandler<
  GetVcpmCalDataQuery,
  Promise<Result<CkvCalDataDto>>
> {
  constructor(_queryServices: QueryServices) {}

  handle(_query: GetVcpmCalDataQuery): Promise<Result<CkvCalDataDto>> {
    throw new Error('GetVcpmCalDataHandler not implemented yet');
  }
}
```

The read-side fetchers and `DbVcpmCalibrationQueryService` shown in section 4.9
are therefore not yet connected to these handlers.

### 3.6 SubgraphRepository Port Extensions

**File:** `packages/core/src/application/ports/persistence/repositories/subgraph/subgraph.repository.ts` (modified)

```typescript
export interface VcpmPayloadRow {
  systemId: number;             // PK of VcpmParameterPayload — matches client param.systemId
  vcpmParameterSystemId: number; // FK → VcpmModuleParameterDefinition.systemId
}

export interface VcpmPayloadUpdate {
  payloadSystemId: number;  // PK of VcpmParameterPayload
  payload: Uint8Array;
}

export interface SubgraphRepository {
  // ... existing methods ...

  // Returns the VcpmInstance.systemId for the given subgraph + VCPM definition.
  // Returns null if no VcpmInstance exists (subgraph not yet voice-enabled).
  getVcpmInstanceSystemId(
    subgraphSystemId: number,
    vcpmDefinitionSystemId: number,
  ): Promise<number | null>;

  // Returns true if a VcpmCkv with exactly the same valueSystemIds already exists
  // under the given VcpmInstance. Used as duplicate guard in POST.
  vcpmCkvExists(
    instanceSystemId: number,
    valueSystemIds: number[],
  ): Promise<boolean>;

  // Returns true if a VcpmCkv with the given systemId exists under this subgraph.
  // Used for existence check in DELETE and PUT.
  vcpmCkvExistsBySystemId(
    ckvSystemId: number,
    subgraphSystemId: number,
  ): Promise<boolean>;

  // Stages CREATE for VcpmCkv + VcpmCkvValues + VcpmParameterPayload rows.
  // Default payload is produced by serializeDefaultParameterData(param).
  // Returns the new VcpmCkv.systemId.
  createVcpmCkv(
    subgraphSystemId: number,
    instanceSystemId: number,
    valueSystemIds: number[],
    params: ParameterDefinitionBase[],
  ): Promise<number>;

  // Stages DELETE for VcpmParameterPayload rows + VcpmCkv row.
  // VcpmCkvValues cascade automatically (ON DELETE CASCADE).
  // aggregateId = subgraphSystemId on all writes.
  deleteVcpmCkv(
    subgraphSystemId: number,
    ckvSystemId: number,
  ): Promise<void>;

  // Returns existing VcpmParameterPayload rows for a CKV (overlay-aware).
  // Includes staged CREATEs from the same session (e.g. POST then PUT in same session).
  getVcpmCkvPayloads(
    ckvSystemId: number,
    subgraphSystemId: number,
  ): Promise<VcpmPayloadRow[]>;

  // Stages writeDelta on VcpmParameterPayload rows.
  // aggregateId = subgraphSystemId on all writes.
  updateVcpmCalData(
    subgraphSystemId: number,
    ckvSystemId: number,
    updates: VcpmPayloadUpdate[],
  ): Promise<void>;
}
```

---

## Section 4: Infrastructure Layer

**File:** `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/subgraph/subgraph.repository.ts` (modified)

### 4.1 getVcpmInstanceSystemId

```typescript
async getVcpmInstanceSystemId(
  subgraphSystemId: number,
  vcpmDefinitionSystemId: number,
): Promise<number | null> {
  const row = await this.manager
    .getRepository(ENTITY_NAMES.VcpmInstance)
    .createQueryBuilder('vi')
    .where('vi.subgraphSystemId = :subgraphSystemId', {subgraphSystemId})
    .andWhere('vi.vcpmDefinitionId = :vcpmDefinitionSystemId', {vcpmDefinitionSystemId})
    .getOne();
  return row?.systemId ?? null;
}
```

### 4.2 vcpmCkvExists (duplicate guard)

Checks committed DB rows + staged CREATEs from `edit_actions` for the subgraph aggregate:

```typescript
async vcpmCkvExists(
  instanceSystemId: number,
  valueSystemIds: number[],
): Promise<boolean> {
  const {session} = this.uow.getWriteContext();

  // Layer 1: base rows from DB
  const ckvRows = await this.manager
    .getRepository(ENTITY_NAMES.VcpmCkv)
    .createQueryBuilder('ckv')
    .leftJoinAndSelect('ckv.values', 'vals')
    .where('ckv.vcpmInstanceSystemId = :instanceSystemId', {instanceSystemId})
    .getMany();

  // Layer 2: include staged CREATEs from edit_actions
  // VcpmCkv aggregateId = subgraphSystemId — retrieve via instanceSystemId's parent subgraph
  const actions = await this.editActionsSvc.getByTable(
    session.sessionId, ENTITY_NAMES.VcpmCkv,
  );
  const stagedCkvIds = new Set(
    actions
      .filter(a =>
        a.operation === CHANGE_OPERATION.Create &&
        (a.newValue as any)?.vcpmInstanceSystemId === instanceSystemId,
      )
      .map(a => a.targetSystemId),
  );

  const sortedInput = [...valueSystemIds].sort();

  // Check committed rows
  for (const ckv of ckvRows) {
    const existing = ((ckv as any).values ?? [])
      .map((v: any) => v.valueDefSystemId as number)
      .sort();
    if (
      existing.length === sortedInput.length &&
      existing.every((v: number, i: number) => v === sortedInput[i])
    ) return true;
  }

  // Check staged CKVs via VcpmCkvValues (direct table — composite PK, not overlaid)
  for (const stagedCkvId of stagedCkvIds) {
    const stagedValues = await this.manager
      .getRepository(ENTITY_NAMES.VcpmCkvValues)
      .createQueryBuilder('v')
      .where('v.vcpmCkvSystemId = :stagedCkvId', {stagedCkvId})
      .getMany();
    const existing = stagedValues
      .map((v: any) => v.valueDefSystemId as number)
      .sort();
    if (
      existing.length === sortedInput.length &&
      existing.every((v: number, i: number) => v === sortedInput[i])
    ) return true;
  }

  return false;
}
```

### 4.3 vcpmCkvExistsBySystemId

Checks committed DB rows + staged CREATEs and excludes staged DELETEs:

```typescript
async vcpmCkvExistsBySystemId(
  ckvSystemId: number,
  subgraphSystemId: number,
): Promise<boolean> {
  const {session} = this.uow.getWriteContext();

  // Layer 1: check DB
  const count = await this.manager
    .getRepository(ENTITY_NAMES.VcpmCkv)
    .createQueryBuilder('ckv')
    .innerJoin('ckv.vcpmInstance', 'vi')
    .where('ckv.systemId = :ckvSystemId', {ckvSystemId})
    .andWhere('vi.subgraphSystemId = :subgraphSystemId', {subgraphSystemId})
    .getCount();

  // Layer 2: apply overlay — check for staged CREATE or DELETE
  const actions = await this.editActionsSvc.getByAggregateId(
    session.sessionId, subgraphSystemId,
  );
  const ckvActions = actions.filter(
    a => a.targetTable === ENTITY_NAMES.VcpmCkv && a.targetSystemId === ckvSystemId,
  );
  const isCreated = ckvActions.some(a => a.operation === CHANGE_OPERATION.Create);
  const isDeleted = ckvActions.some(a => a.operation === CHANGE_OPERATION.Delete);

  if (isDeleted) return false;
  return count > 0 || isCreated;
}
```

### 4.4 createVcpmCkv

```typescript
async createVcpmCkv(
  subgraphSystemId: number,
  instanceSystemId: number,
  valueSystemIds: number[],
  params: ParameterDefinitionBase[],
): Promise<number> {
  const {session, groupId} = this.uow.getWriteContext();
  const ckvSystemId = await this.idGeneration.getNextId(session.fileSystemId);

  await this.writer.writeCreate(
    {
      targetTable: ENTITY_NAMES.VcpmCkv,
      targetSystemId: ckvSystemId,
      aggregateId: subgraphSystemId,
      payload: {vcpmInstanceSystemId: instanceSystemId},
    },
    session.sessionId,
    groupId,
    this.manager,
  );

  // Create VcpmCkvValues rows (composite PK — written directly, not via PendingChangeWriter)
  for (const valueSystemId of valueSystemIds) {
    await this.manager
      .getRepository(ENTITY_NAMES.VcpmCkvValues)
      .insert({
        vcpmCkvSystemId: ckvSystemId,
        valueDefSystemId: valueSystemId,
      });
  }

  for (const param of params) {
    const payloadSystemId = await this.idGeneration.getNextId(
      session.fileSystemId,
    );
    const serialized = serializeDefaultParameterData(param);
    if (!serialized.ok) {
      throw new Error(
        `Failed to serialize default payload for VcpmParameterDefinition ${param.systemId}: ${serialized.error}`,
      );
    }
    await this.writer.writeCreate(
      {
        targetTable: ENTITY_NAMES.VcpmParameterPayload,
        targetSystemId: payloadSystemId,
        aggregateId: subgraphSystemId,
        payload: {
          vcpmCkvSystemId: ckvSystemId,
          vcpmParameterSystemId: param.systemId,
          payload: serialized.value,
        },
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }

  return ckvSystemId;
}
```

**Note:** `VcpmCkvValues` uses a composite PK and is **never overlaid** (same as `CkvValues` and `TkvValues`). It is written directly via `manager.insert()` rather than `PendingChangeWriter`, consistent with how the upload flow inserts these composite-PK join tables.

### 4.5 deleteVcpmCkv

Uses `getVcpmCkvPayloads` (overlay-aware) to find all payload rows — including any staged
CREATEs from the same session — before staging their DELETEs:

```typescript
async deleteVcpmCkv(
  subgraphSystemId: number,
  ckvSystemId: number,
): Promise<void> {
  const {session, groupId} = this.uow.getWriteContext();

  // Fetch payload rows overlay-aware (includes same-session CREATEs)
  const payloads = await this.getVcpmCkvPayloads(ckvSystemId, subgraphSystemId);

  for (const payload of payloads) {
    await this.writer.writeDelete(
      {targetTable: ENTITY_NAMES.VcpmParameterPayload, targetSystemId: payload.systemId,
       aggregateId: subgraphSystemId},
      session.sessionId, groupId, this.manager,
    );
  }

  // Delete VcpmCkv row (VcpmCkvValues cascade via ON DELETE CASCADE)
  await this.writer.writeDelete(
    {targetTable: ENTITY_NAMES.VcpmCkv, targetSystemId: ckvSystemId,
     aggregateId: subgraphSystemId},
    session.sessionId, groupId, this.manager,
  );
}
```

### 4.6 getVcpmCkvPayloads

Overlay-aware — uses `getByAggregateId(sessionId, subgraphSystemId)` to include staged CREATEs
from `edit_actions` (e.g. payloads created by POST in the same session):

```typescript
async getVcpmCkvPayloads(
  ckvSystemId: number,
  subgraphSystemId: number,
): Promise<VcpmPayloadRow[]> {
  const {session} = this.uow.getWriteContext();

  // Layer 1: base rows from DB
  const baseRows = await this.manager
    .getRepository(ENTITY_NAMES.VcpmParameterPayload)
    .createQueryBuilder('p')
    .where('p.vcpmCkvSystemId = :ckvSystemId', {ckvSystemId})
    .getMany() as unknown as Array<{systemId: number; vcpmParameterSystemId: number}>;

  // Layer 2: apply overlay scoped to the subgraph aggregate
  const actions = await this.editActionsSvc.getByAggregateId(
    session.sessionId,
    subgraphSystemId,
  );
  const payloadActions = actions.filter(
    a => a.targetTable === ENTITY_NAMES.VcpmParameterPayload,
  );

  const overlaid = this.overlay.applyToCollection(
    baseRows as unknown as Array<{systemId: number}>,
    payloadActions,
    newValue => Number(newValue.vcpmCkvSystemId) === ckvSystemId,
  );

  return overlaid.map(result => {
    const effective = result.effective as {
      systemId: number;
      vcpmParameterSystemId: number;
    };
    return {
      systemId: effective.systemId,
      vcpmParameterSystemId: effective.vcpmParameterSystemId,
    };
  });
}
```

### 4.7 updateVcpmCalData

```typescript
async updateVcpmCalData(
  subgraphSystemId: number,
  ckvSystemId: number,
  updates: VcpmPayloadUpdate[],
): Promise<void> {
  const {session, groupId} = this.uow.getWriteContext();
  for (const update of updates) {
    await this.writer.writeDelta(
      {
        targetTable: ENTITY_NAMES.VcpmParameterPayload,
        targetSystemId: update.payloadSystemId,
        aggregateId: subgraphSystemId,
        delta: {payload: update.payload},
      },
      session.sessionId,
      groupId,
      this.manager,
    );
  }
}
```

### 4.8 PendingChangeWriter Specs

**`createVcpmCkv` — VcpmCkv row:**

| Field | Value |
|---|---|
| `targetTable` | `VcpmCkv` |
| `targetSystemId` | new `ckvSystemId` |
| `aggregateId` | `subgraphSystemId` |
| `payload` | `{ vcpmInstanceSystemId }` |

**`createVcpmCkv` — VcpmParameterPayload rows:**

| Field | Value |
|---|---|
| `targetTable` | `VcpmParameterPayload` |
| `targetSystemId` | new `payloadSystemId` |
| `aggregateId` | `subgraphSystemId` |
| `payload` | `{ vcpmCkvSystemId, vcpmParameterSystemId, payload: <Uint8Array> }` |

**`updateVcpmCalData`:**

| Field | Value |
|---|---|
| `targetTable` | `VcpmParameterPayload` |
| `targetSystemId` | `payloadSystemId` (PK) |
| `aggregateId` | `subgraphSystemId` |
| `delta` | `{ payload: <Uint8Array> }` |

### 4.9 Read-side VCPM fetchers

These fetchers are separate from the write repository. They are consumed by
DbVcpmCalibrationQueryService. The write repository currently keeps its own
inline overlay logic, as described in sections 4.2–4.6.

#### 4.9.1 VcpmCkvOverlayFetcher

File: packages/infrastructure/persistence/src/persistence-typeorm-sqllite/fetchers/vcpm-ckv-overlay-fetcher.ts

The fetcher loads committed CKVs, applies actions for the owning subgraph, and
normalizes committed values and staged CREATE value-definition IDs into the
same read shape:

~~~typescript
async fetchOne(
  ckvSystemId: number,
  subgraphSystemId: number,
  sessionId: number | null,
): Promise<OverlaidVcpmCkv | null> {
  const baseRow = (await this.manager
    .getRepository(ENTITY_NAMES.VcpmCkv)
    .createQueryBuilder('ckv')
    .innerJoin('ckv.vcpmInstance', 'instance')
    .leftJoinAndSelect('ckv.values', 'values')
    .where('ckv.systemId = :ckvSystemId', {ckvSystemId})
    .andWhere('instance.subgraphSystemId = :subgraphSystemId', {
      subgraphSystemId,
    })
    .getOne()) as VcpmCkvRow | null;

  if (sessionId === null) {
    return baseRow ? this.toOverlaid(baseRow) : null;
  }

  const actions = await this.editActionsSvc.getByAggregateId(
    sessionId,
    subgraphSystemId,
  );
  const ckvActions = actions.filter(
    action =>
      action.targetTable === ENTITY_NAMES.VcpmCkv &&
      action.targetSystemId === ckvSystemId,
  );
  const result = this.overlay.applyToSingle(baseRow, ckvActions, {
    matchesEffective: row => row.systemId === ckvSystemId,
  });

  return result ? this.toOverlaid(result.effective) : null;
}

private toOverlaid(row: VcpmCkvOverlayRow): OverlaidVcpmCkv {
  const valueDefSystemIds =
    row.valueDefSystemIds ??
    (row.values ?? []).map(value => value.valueDefSystemId);

  return {
    systemId: row.systemId,
    vcpmInstanceSystemId: row.vcpmInstanceSystemId,
    values: valueDefSystemIds.map(valueDefSystemId => ({
      vcpmCkvSystemId: row.systemId,
      valueDefSystemId,
    })),
  };
}
~~~

`fetchMany` uses the same `applyToCollection` path and filters effective rows by
`vcpmInstanceSystemId`:

```typescript
async fetchMany(
  vcpmInstanceSystemId: number,
  subgraphSystemId: number,
  sessionId: number | null,
): Promise<OverlaidVcpmCkv[]> {
  const baseRows = (await this.manager
    .getRepository(ENTITY_NAMES.VcpmCkv)
    .createQueryBuilder('ckv')
    .leftJoinAndSelect('ckv.values', 'values')
    .where('ckv.vcpmInstanceSystemId = :vcpmInstanceSystemId', {
      vcpmInstanceSystemId,
    })
    .getMany()) as VcpmCkvRow[];

  if (sessionId === null) {
    return baseRows.map(row => this.toOverlaid(row));
  }

  const actions = await this.editActionsSvc.getByAggregateId(
    sessionId,
    subgraphSystemId,
  );
  const ckvActions = actions.filter(
    action => action.targetTable === ENTITY_NAMES.VcpmCkv,
  );

  return this.overlay
    .applyToCollection(baseRows, ckvActions, {
      matchesEffective: row =>
        row.vcpmInstanceSystemId === vcpmInstanceSystemId,
    })
    .map(result => this.toOverlaid(result.effective));
}
```

#### 4.9.2 VcpmParameterPayloadFetcher

File: packages/infrastructure/persistence/src/persistence-typeorm-sqllite/fetchers/vcpm-parameter-payload-fetcher.ts

The payload fetcher scopes edit actions by the owning subgraph and supports
optional payload-row filters:

~~~typescript
async fetchMany(
  ckvSystemId: number,
  subgraphSystemId: number,
  sessionId: number | null,
  filters?: VcpmParameterPayloadFilters,
): Promise<VcpmParameterPayloadBase[]> {
  const aggregateActions =
    sessionId === null
      ? []
      : await this.editActionsSvc.getByAggregateId(
          sessionId,
          subgraphSystemId,
        );
  const payloadActions = aggregateActions.filter(
    action => action.targetTable === ENTITY_NAMES.VcpmParameterPayload,
  );

  const query = this.manager
    .getRepository(ENTITY_NAMES.VcpmParameterPayload)
    .createQueryBuilder('payload')
    .where('payload.vcpmCkvSystemId = :ckvSystemId', {ckvSystemId});

  if (sessionId === null && filters) {
    applyEntityFilters(query, 'payload', filters);
  }

  const base = ((await query.getMany()) as VcpmParameterPayloadRow[]).map(
    row => this.toBase(row),
  );

  if (sessionId === null || payloadActions.length === 0) {
    return this.filterPayloads(base, filters);
  }

  return this.overlay
    .applyToCollection(base, payloadActions, {
      matchesEffective: row =>
        row.vcpmCkvSystemId === ckvSystemId &&
        (filters === undefined ||
          matchesEntityFilters(
            row as unknown as Record<string, unknown>,
            filters,
          )),
    })
    .map(result => result.effective);
}
~~~

#### 4.9.3 DbVcpmCalibrationQueryService

File: packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/vcpm/db-vcpm-calibration-query-service.ts

~~~typescript
async getCkv(
  fileSystemId: number,
  subgraphSystemId: number,
  ckvSystemId: number,
): Promise<VcpmCkvReadModel | null> {
  const sessionId = await resolveActiveSessionId(
    this.dataSource,
    fileSystemId,
  );
  const row = await this.ckvFetcher.fetchOne(
    ckvSystemId,
    subgraphSystemId,
    sessionId,
  );
  if (row === null) return null;

  const valueSystemIds = row.values.map(
    value => value.valueDefSystemId,
  );
  const pairsResult =
    await this.keyValueDefQueryService.getKeyValueSummaryForGivenValues(
      valueSystemIds,
      fileSystemId,
    );
  if (pairsResult.kind === RESULT_KIND.Fail) {
    throw new Error('Failed to resolve VCPM CKV values');
  }

  return {
    systemId: row.systemId,
    keyValuePairs: pairsResult.data,
  };
}

async getPayloads(
  fileSystemId: number,
  subgraphSystemId: number,
  ckvSystemId: number,
  payloadSystemIds?: number[],
): Promise<VcpmParameterPayloadReadModel[]> {
  const sessionId = await resolveActiveSessionId(
    this.dataSource,
    fileSystemId,
  );
  const payloads = await this.payloadFetcher.fetchMany(
    ckvSystemId,
    subgraphSystemId,
    sessionId,
    payloadSystemIds && payloadSystemIds.length > 0
      ? {systemId: payloadSystemIds}
      : undefined,
  );

  return payloads.map(payload => ({
    systemId: payload.systemId,
    vcpmParameterSystemId: payload.vcpmParameterSystemId,
    payload: payload.payload,
  }));
}
~~~

The current QueryServices port does not expose VcpmCalibrationQueryService,
and the two VCPM GET handlers remain stubs. Therefore this read-side adapter
is present but is not yet reachable through QueryBus.

### 4.10 Present but not wired command-side repository adapters

The following adapters are present in the working tree, but the current
UnitOfWork port and TypeOrmUnitOfWork do not expose them. They are therefore
not dependencies of the current create or update handlers.

#### 4.10.1 TypeOrmVcpmDefinitionRepository

File: packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/vcpm/vcpm-definition.repository.ts

~~~typescript
export class TypeOrmVcpmDefinitionRepository
  implements VcpmDefinitionRepository
{
  constructor(
    private readonly manager: EntityManager,
    private readonly uow: UnitOfWork,
  ) {}

  async getDefinitionWithParameters(
    fileSystemId: number,
  ): Promise<VcpmDefinitionWithParameters | null> {
    const row = (await this.manager
      .getRepository(ENTITY_NAMES.VcpmModuleDefinition)
      .createQueryBuilder('definition')
      .leftJoinAndSelect('definition.parameters', 'parameters')
      .where('definition.fileSystemId = :fileSystemId', {fileSystemId})
      .getOne()) as VcpmModuleDefinitionRow | null;

    if (row === null) return null;
    this.uow.getWriteContext();

    return {
      systemId: row.systemId,
      parameters: (row.parameters ?? []).map(parameter => ({
        systemId: parameter.systemId,
        isReadOnly: parameter.isReadOnly,
        elementsStructure: parameter.elementsStructure ?? '',
      })),
    };
  }
}
~~~

#### 4.10.2 TypeOrmKeyValueDefinitionRepository

File: packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/key-value/key-value-definition.repository.ts

~~~typescript
export class TypeOrmKeyValueDefinitionRepository
  implements KeyValueDefinitionRepository
{
  private readonly keyFetcher: KeyValueDefinitionFetcher;

  constructor(
    manager: EntityManager,
    private readonly uow: UnitOfWork,
  ) {
    const editActionsSvc = new EditActionsQueryService(manager);
    const valueFetcher = new ValueDefinitionFetcher(manager, editActionsSvc);
    this.keyFetcher = new KeyValueDefinitionFetcher(
      manager,
      editActionsSvc,
      valueFetcher,
    );
  }

  async getSummariesForValues(
    fileSystemId: number,
    valueSystemIds: readonly number[],
  ): Promise<KeyValueSummary[]> {
    if (valueSystemIds.length === 0) return [];

    const sessionId = this.uow.getWriteContext().session.sessionId;
    const requestedIds = [...new Set(valueSystemIds)];
    const keys = await this.keyFetcher.fetchMany(
      'all',
      fileSystemId,
      sessionId,
      undefined,
      {systemId: requestedIds},
    );
    const summariesByValueId = new Map<number, KeyValueSummary>();

    for (const key of keys) {
      for (const value of key.values) {
        summariesByValueId.set(value.systemId, {
          keyId: key.naturalId,
          valueId: value.naturalId,
        });
      }
    }

    return valueSystemIds.flatMap(valueSystemId => {
      const summary = summariesByValueId.get(valueSystemId);
      return summary === undefined ? [] : [summary];
    });
  }
}
~~~

---

## Section 5: Testing Strategy

### Unit Tests

#### CreateVcpmCkvHandler

**File:** `packages/core/tests/unit/application/usecase-designer/subgraph/create-vcpm-ckv/create-vcpm-ckv.handler.spec.ts` (new)

| Scenario | Expected outcome |
|---|---|
| Subgraph not found | throws `ResourceNotFoundException` → 404 |
| No VCPM definitions found | throws `ResourceNotFoundException` → 404 |
| VcpmInstance not found | throws `ResourceNotFoundException` → 404 |
| Duplicate CKV | throws `DomainRuleViolationException` → 422 |
| Success | `createVcpmCkv` called; returns `CreateVcpmCkvDto` with correct `ckvSystemId` and `ckv` |

#### DeleteVcpmCkvHandler

**File:** `packages/core/tests/unit/application/usecase-designer/subgraph/delete-vcpm-ckv/delete-vcpm-ckv.handler.spec.ts` (new)

| Scenario | Expected outcome |
|---|---|
| Subgraph not found | throws `ResourceNotFoundException` → 404 |
| VcpmCkv not found | throws `ResourceNotFoundException` → 404 |
| Success | `deleteVcpmCkv` called with correct args |

#### UpdateVcpmCalDataHandler

**File:** `packages/core/tests/unit/application/usecase-designer/subgraph/update-vcpm-cal-data/update-vcpm-cal-data.handler.spec.ts` (new)

| Scenario | Expected outcome |
|---|---|
| Subgraph not found | throws `ResourceNotFoundException` → 404 |
| VcpmCkv not found | throws `ResourceNotFoundException` → 404 |
| No existing payload row | issue pushed `PARAM_PAYLOAD_NOT_FOUND` |
| Parameter is read-only | issue pushed `PARAM_READ_ONLY` |
| Serialization fails | issue pushed `PARAM_SERIALIZATION_FAILED` |
| All succeed | `Result.ok` with `succeededParamSystemIds` |
| Partial success | `Result.partial` with issues |
| Write throws | `rollback()` called; error re-thrown |

### Integration Tests

**File:** `packages/infrastructure/persistence/tests/integration/repositories/subgraph/subgraph-vcpm-ckv.repository.spec.ts` (new)

| Scenario | Expected outcome |
|---|---|
| `createVcpmCkv` — writes CKV + values + payload | edit_actions rows + direct VcpmCkvValues insert |
| `deleteVcpmCkv` — deletes payloads + CKV row | DELETE edit_actions for payload + CKV |
| `vcpmCkvExists` — matching values | returns `true` |
| `vcpmCkvExists` — different values | returns `false` |
| `vcpmCkvExistsBySystemId` — correct subgraph | returns `true` |
| `vcpmCkvExistsBySystemId` — wrong subgraph | returns `false` |
| `getVcpmCkvPayloads` — committed rows | returns payload rows with `systemId` + `vcpmParameterSystemId` |
| `getVcpmCkvPayloads` — staged CREATE overlay (same-session POST then PUT) | includes staged payload rows |
| `getVcpmCkvPayloads` — staged DELETE overlay | excludes deleted payload rows |
| `vcpmCkvExistsBySystemId` — staged CREATE (same session) | returns `true` |
| `vcpmCkvExistsBySystemId` — staged DELETE (same session) | returns `false` |
| `updateVcpmCalData` — writes delta | edit_actions UPDATE row with correct delta |
| `updateVcpmCalData` — supersession | old row superseded; new merged row inserted |

#### VCPM read-side fetchers and query adapter

The current read-side implementation should also be covered by integration
tests:

| Scenario | Expected outcome |
|---|---|
| `VcpmCkvOverlayFetcher.fetchOne` with committed CKV | returns the CKV scoped to the requested subgraph |
| `VcpmCkvOverlayFetcher.fetchOne` with staged CREATE | returns normalized `values` from `valueDefSystemIds` |
| `VcpmCkvOverlayFetcher.fetchOne` with staged DELETE | returns `null` |
| `VcpmParameterPayloadFetcher.fetchMany` with staged CREATE | includes the effective payload row |
| `VcpmParameterPayloadFetcher.fetchMany` with staged UPDATE | returns the merged payload |
| `VcpmParameterPayloadFetcher.fetchMany` with staged DELETE | excludes the deleted payload |
| `DbVcpmCalibrationQueryService.getCkv` | resolves CKV value IDs through `KeyValueDefQueryService` |
| `DbVcpmCalibrationQueryService.getPayloads` | applies optional payload-system-ID filters |

### End-to-End Tests

**File:** `packages/api/tests/e2e/subgraph/vcpm-ckv.e2e-spec.ts` (new)

| Scenario | HTTP status |
|---|---|
| POST — no active session | 403 |
| POST — subgraph not found | 404 |
| POST — duplicate CKV | 422 |
| POST — success | 200 with `ckvSystemId` + `ckv` |
| DELETE — subgraph not found | 404 |
| DELETE — CKV not found | 404 |
| DELETE — success | 204 |
| PUT — subgraph not found | 404 |
| PUT — CKV not found | 404 |
| PUT — all parameters succeed | 200 `CkvCalDataResponseDto` |
| PUT — partial failure | 207 |
| PUT — all parameters fail | 207 no data |

---

## Open Questions

| # | Question |
|---|---|
| OQ-1 | ~~Multi-VcpmInstance future~~ — **Resolved:** There is always exactly one VCPM module definition per file, so there is always exactly one `VcpmInstance` per subgraph. POST creates one `VcpmCkv` under that instance and returns a single `ckvSystemId`. No looping over definitions needed. |
| OQ-2 | ~~`VcpmCkvValues` staging~~ — **Resolved:** `VcpmCkvValues` is a composite-PK table (no `systemId`) — `PendingChangeWriter` cannot target it directly. Direct `manager.insert()` is correct and safe. On undo of POST: the staged DELETE on `VcpmCkv` triggers `ON DELETE CASCADE` on `VcpmCkvValues` automatically — no orphans. General rule: tables without their own `systemId` rely on their parent's lifecycle in `edit_actions`; tables with `systemId` (e.g. `VcpmParameterPayload`) are targeted directly with `aggregateId = subgraphSystemId` (the aggregate root). |
| OQ-3 | ~~`getVcpmCkvPayloads` overlay~~ — **Resolved:** The current raw DB query implementation is wrong. It must be overlay-aware — same pattern as `ContainerOverlayFetcher.fetchOne` which calls `getByAggregateId(sessionId, subgraphSystemId)` to pick up staged CREATEs from `edit_actions`. Fix: query `vcpm_parameter_payload WHERE vcpmCkvSystemId = X` as base rows, then apply `getByAggregateId(sessionId, subgraphSystemId)` overlay filtering to `VcpmParameterPayload` rows — includes staged CREATEs (from POST in same session), applies staged UPDATEs, excludes staged DELETEs. Section 4.6 is updated accordingly. |
