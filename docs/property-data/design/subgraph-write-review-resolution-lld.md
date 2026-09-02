# Subgraph Write Review Resolution — Low-Level Design

**Status:** Draft for review  
**Date:** 2026-09-02  
**Scope:** Reconcile the subgraph property/scenario write design with the rebased repository architecture.

## 1. Context

The original property-data design was written before the repository layer was rebased. The rebased implementation now has a routing-focused `SubgraphRepository` with these existing responsibilities:

- `getSgkvs`
- `findByIds`
- `findIsMdfInScope`
- `findChangedInSession`
- scalar-only domain aggregate hydration through `hydrate(SubgraphBase)`

The review resolution must preserve those APIs while addressing three concerns:

1. Command handlers should not receive `QueryServices`.
2. Property reads must use the rebased overlay fetcher design.
3. Zero-CKV identification and default-payload generation belong in core; persistence applies the resulting write plan.

Controller-specific review comments remain out of scope for this LLD.

## 2. Requirements

### Functional requirements

| ID | Requirement |
|---|---|
| FR-01 | Subgraph command handlers receive only `UnitOfWork` and other non-query dependencies; they do not receive `QueryServices`. |
| FR-02 | Property reads used by command handlers include the active edit-session overlay, including session-created, updated, and deleted rows. |
| FR-03 | Existing routing repository methods and scalar-only `Subgraph` hydration remain unchanged. |
| FR-04 | Core identifies zero CKVs and generates factory-default payload bytes. |
| FR-05 | Persistence stages CKV/TKV deletes and zero-CKV payload updates supplied by core. It does not decide which CKV is zero or serialize defaults. |
| FR-06 | Existing zero-CKV rows retain their system IDs during calibration reset. Only non-zero CKVs are deleted; zero-CKV payloads are reset. |
| FR-07 | VCPM default-data creation receives already-serialized payloads from core; persistence only stages the VCPM hierarchy rows. |

### Invariants

**I1 — Overlay visibility:** A command in an active session must see its own pending changes.

**I2 — Aggregate hydration stability:** Existing routing methods must continue returning scalar `Subgraph` aggregates without implicitly loading property data.

**I3 — Transaction ownership:** The command handler owns transaction boundaries; repositories only stage writes using the current `UnitOfWork` context.

**I4 — Zero-CKV identity:** Audio → Voice reset preserves the existing zero-CKV system ID.

## 3. Target architecture

**Current:** Command handlers use `QueryServices` for effective property and VCPM-definition reads. `TypeOrmModuleRepository.wipeCalData()` currently owns CKV classification, default-payload serialization, and the corresponding persistence writes. The scenario handler also references a VCPM default-data repository operation that is not present in the rebased repository port or adapter.

**After change:** Command handlers use read/write ports exposed by the same `UnitOfWork`; core owns business decisions and serialization, and persistence applies explicit write plans.

```text
Command handler
  └─ UnitOfWork
     ├─ SubgraphRepository
     │    ├─ effective subgraph/property reads
     │    ├─ property writes
     │    └─ relationship traversal
     ├─ SubgraphPropertyDefinitionRepository
     │    └─ effective property-definition reads
     ├─ ModuleRepository
      │    ├─ effective calibration-state reads
      │    └─ apply calibration reset plan
      └─ VcpmDefinitionRepository
           └─ effective VCPM definition reads

Core domain/application services
  ├─ serialize property/VSID/default payloads
  ├─ identify zero CKV and build reset plans
  └─ decide scenario/Voice/VCPM business outcomes

Persistence adapters
  ├─ SubgraphOverlayFetcher + SubgraphPropertyDataFetcher
  ├─ CkvOverlayFetcher / TkvOverlayFetcher
  └─ PendingChangeWriter
```

The controller continues to validate HTTP input and dispatch commands. It does not perform persistence reads.

## 4. Core port changes

### 4.1 Preserve rebased subgraph methods

The following methods remain unchanged:

**Current:** These routing and scalar-read methods already exist in the rebased repository:

```ts
getSgkvs(...)
findByIds(...)
findIsMdfInScope(...)
findChangedInSession(...)
```

**After change:** Keep the same methods and behavior. No property data is loaded implicitly.

The existing `hydrate(SubgraphBase)` remains the mapper for these methods.

### 4.2 Add property-aware subgraph reads

Add dedicated property read-model methods rather than changing `findByIds()` to load properties:

**Current:** Effective property payloads are currently read through `QueryServices.subgraphQueryService.findPropertyPayloads()`, and property-definition metadata is currently read through `QueryServices.subgraphPropertyDefQueryService`. Separately, `findByIds()` returns scalar-only `Subgraph` aggregates and does not load property data.

**After change:** Add separate property-aware methods to the UoW-bound subgraph repository for effective property payloads, while preserving the existing scalar-only contract. Keep property-definition metadata on a dedicated property-definition read port:

```ts
findByIdWithProperties(
  subgraphSystemId: number,
  fileSystemId: number,
): Promise<SubgraphWithProperties | null>;

findByIdsWithProperties(
  subgraphSystemIds: readonly number[],
  fileSystemId: number,
): Promise<Map<number, SubgraphWithProperties>>;
```

`SubgraphWithProperties` remains a query/read model under:

`packages/core/src/application/ports/persistence/query-services/subgraph-property-definition/subgraph-property-definition-with-elements-read-model.ts`

It is not a replacement for the domain `Subgraph` aggregate.

### 4.3 Add write-side property operations

The subgraph repository port adds:

**Current:** The effective property information needed by command handlers is currently read through `QueryServices`:

- `QueryServices.subgraphQueryService.findPropertyPayloads()` reads effective property payloads.
- `QueryServices.subgraphPropertyDefQueryService.getSubgraphPropertyWithElements()` reads one effective property definition.
- `QueryServices.subgraphPropertyDefQueryService.getSubgraphPropertiesWithElements()` reads effective property definitions with element metadata.

The write operations themselves are not part of `QueryServices`, because `QueryServices` is read-only. In the rebased `SubgraphRepository` port, `rename()`, `setPropertyData()`, and same-usecase relationship traversal are not currently declared.

**After change:** Keep the effective-read responsibility behind UoW-bound ports used by command handlers, and add the write-side methods below to the subgraph repository port. `setPropertyData()` accepts already serialized payload bytes:

```ts
rename(subgraphSystemId: number, name: string): Promise<void>;

setPropertyData(
  subgraphSystemId: number,
  propertySystemId: number,
  payload: Uint8Array,
): Promise<void>;

getSubgraphIdsInSameUsecases(
  subgraphSystemId: number,
  fileSystemId: number,
): Promise<number[]>;
```

`setPropertyData` receives final bytes. It does not receive a property definition and does not serialize data.

### 4.4 Replace command-handler query-service dependencies

The required reads currently supplied by `QueryServices` need UoW-bound repository ports:

- `SubgraphRepository` supplies effective subgraph and property-data reads needed by subgraph commands.
- A dedicated `SubgraphPropertyDefinitionRepository` supplies effective property-definition metadata, including element structures needed for serialization.
- A dedicated `VcpmDefinitionRepository` port supplies effective VCPM definitions. VCPM definitions should not be placed on `SubgraphRepository` merely to avoid adding a port.
- `ModuleRepository` supplies effective CKV reset input and applies CKV/TKV reset operations.

The `UnitOfWork` exposes these repositories, and the command registry constructs handlers with `deps.uow` only.

### 4.5 Add the core CKV reset-plan function

**Current:** No core CKV reset function exists. `TypeOrmModuleRepository.wipeCalData()` currently reads CKVs and payloads, identifies the zero CKV, serializes default payloads, and stages the writes.

**After change:** Add a stateless pure function at:

`packages/core/src/application/usecase-designer/subgraph/update-scenario/create-ckv-reset-plan.ts`

The function reuses the existing core read models from:

`packages/core/src/application/ports/persistence/query-services/spf-module/tuning/tuning-config-read-model.ts`

- `CkvReadModel` identifies the CKV and its key-value pairs.
- `CkvParamReadModel` identifies each payload row and includes its parameter definition and `elementsStructure`.

The combined input groups one CKV with its parameter payloads:

**Current:** The existing repository fetcher models are split: CKV rows come from `fetchForModule()`, and payload rows come from `fetchCkvPayloads()`.

**After change:** The repository maps those existing models into the combined input, and the core function creates the plan:

```ts
import type {
  CkvReadModel,
  CkvParamReadModel,
} from '../../../ports/persistence/query-services/spf-module/tuning/tuning-config-read-model.js';
import {serializeDefaultParameterData} from '../../shared/serialize-elements.js';

export interface CkvResetCkvInput {
  ckv: CkvReadModel;
  payloads: readonly CkvParamReadModel[];
}

export type CkvResetInput = readonly CkvResetCkvInput[];

export interface CkvResetPlan {
  zeroCkvSystemId: number;
  nonZeroCkvSystemIds: number[];
  nonZeroCkvPayloadSystemIds: number[];
  zeroCkvPayloadUpdates: Array<{
    payloadSystemId: number;
    payload: Uint8Array;
  }>;
}

export function createCkvResetPlan(
  input: CkvResetInput,
): CkvResetPlan {
  const zeroCkvs = input.filter(
    item => item.ckv.keyValuePairs.length === 0,
  );

  if (zeroCkvs.length !== 1) {
    throw new Error(
      `Expected exactly one zero CKV, found ${zeroCkvs.length}`,
    );
  }

  const zeroCkv = zeroCkvs[0]!;
  const nonZeroCkvs = input.filter(
    item => item.ckv.keyValuePairs.length > 0,
  );

  const nonZeroCkvSystemIds = nonZeroCkvs.map(
    item => item.ckv.systemId,
  );

  const nonZeroCkvPayloadSystemIds = nonZeroCkvs.flatMap(
    item => item.payloads.map(payload => payload.systemId),
  );

  const zeroCkvPayloadUpdates = zeroCkv.payloads.map(payload => {
    const definition = payload.definition;

    if (!definition.elementsStructure) {
      throw new Error(
        `Missing elementsStructure for parameter ${definition.systemId}`,
      );
    }

    const serialized = serializeDefaultParameterData({
      systemId: definition.systemId,
      elementsStructure: definition.elementsStructure,
    });

    if (!serialized.ok) {
      throw new Error(
        `Failed to serialize default payload for parameter ${definition.systemId}`,
      );
    }

    return {
      payloadSystemId: payload.systemId,
      payload: serialized.value,
    };
  });

  return {
    zeroCkvSystemId: zeroCkv.ckv.systemId,
    nonZeroCkvSystemIds,
    nonZeroCkvPayloadSystemIds,
    zeroCkvPayloadUpdates,
  };
}
```

The function does not access a database, `QueryServices`, TypeORM, or a persistence fetcher. It only converts effective CKV input into a reset plan.

### 4.6 Call the pure function from the scenario handler

**Current:** `UpdateSubgraphScenarioHandler.wipeModuleCalData()` calls `ModuleRepository.wipeCalData()`, which performs both business decisions and persistence writes.

**After change:** The handler obtains effective reset input through the UoW-bound module repository, calls the pure core function, and passes the resulting plan back to persistence:

```ts
import {createCkvResetPlan} from './create-ckv-reset-plan.js';

const moduleRepository = this.uow.getModuleRepository();

const resetInput = await moduleRepository.getCkvResetInput(
  mod.systemId,
  fileSystemId,
);

const resetPlan = createCkvResetPlan(resetInput);

await moduleRepository.wipeAllCkvData(
  mod.systemId,
  resetPlan,
);

await moduleRepository.wipeAllTkvData(mod.systemId);
```

`MutationLog` remains a separate response accumulator for the scenario result. It is not used to make CKV reset decisions and is not passed to persistence as the reset plan. The current `moduleCkvsAdded` response name should be reviewed later because the existing zero CKV is preserved and reset, not added.

## 5. Persistence adapter changes

### 5.1 Property fetcher wiring

`SubgraphOverlayFetcher` already supports `SubgraphPropertyDataFetcher`. The TypeORM repository must pass the existing fetcher instance when constructing it:

**Current:** The repository constructs `SubgraphOverlayFetcher` without the property-data fetcher, so this repository instance cannot retrieve effective property rows through the overlay fetcher.

**After change:** Construct the existing `SubgraphPropertyDataFetcher` and inject it into `SubgraphOverlayFetcher`:

```ts
const propertyDataFetcher = new SubgraphPropertyDataFetcher(
  manager,
  editActionsQueryService,
);

this.subgraphFetcher = new SubgraphOverlayFetcher(
  manager,
  editActionsQueryService,
  propertyDataFetcher,
  this.sgkvFetcher,
);
```

No new property-fetching abstraction is required.

### 5.2 Property-aware reads

`findByIdWithProperties()` delegates to `subgraphFetcher.fetchOne()` and maps the effective `properties` array to `SubgraphWithProperties`.

`findByIdsWithProperties()` must assemble scalar rows and effective property rows without changing the existing scalar-only `fetchMany()` contract. It may use a dedicated batch fetcher method or fetch and group property rows separately.

### 5.3 CKV reset input and plan application

**Current:** `TypeOrmModuleRepository.wipeCalData()` directly calls `CkvOverlayFetcher`, fetches parameter definitions, classifies CKVs, serializes defaults, and stages CKV/TKV writes.

**After change:** Add the following UoW-bound module repository operations:

```ts
getCkvResetInput(
  moduleSystemId: number,
  fileSystemId: number,
): Promise<CkvResetInput>;

wipeAllCkvData(
  moduleSystemId: number,
  resetPlan: CkvResetPlan,
): Promise<void>;

wipeAllTkvData(moduleSystemId: number): Promise<void>;
```

`getCkvResetInput()` uses the existing overlay fetchers and maps the effective CKV rows plus full parameter payload read models into `CkvResetInput`. `wipeAllCkvData()` applies the plan by deleting non-zero CKV payloads and rows, then updating the existing zero-CKV payload rows. It does not classify CKVs or serialize defaults. `wipeAllTkvData()` handles TKV/tag data separately.

### 5.4 Property writes

`setPropertyData()`:

1. Reads the effective subgraph through `fetchOne()`.
2. Resolves the property-data row by `propertySystemId`.
3. Uses the resolved row `systemId` as the `edit_actions.targetSystemId`.
4. Stages `{ payload }` through `PendingChangeWriter`.

It must not query only base tables because the property row may have been created or changed earlier in the same session.

### 5.5 Name and relationship writes/reads

- `rename()` stages a `Subgraph` name delta.
- `getSubgraphIdsInSameUsecases()` retains the existing relationship query behavior and excludes zero-GKV usecases and the source subgraph.
- Existing SGKV/routing methods are retained without behavior changes.

## 6. Zero-CKV design

### 6.1 Current problem

`ModuleRepository.wipeCalData()` currently combines:

- effective CKV/TKV reads;
- zero/non-zero CKV classification;
- parameter-definition lookup;
- default-payload serialization;
- delete and delta writes.

The current scenario handler requests VCPM definitions through `QueryServices.vcpmDefinitionQueryService` and then calls `addVcpmCfgDefaultData()` on `SubgraphRepository`. However, the rebased `SubgraphRepository` port and `TypeOrmSubgraphRepository` adapter do not currently declare or implement `addVcpmCfgDefaultData()`. The VCPM default-data persistence path therefore still needs to be introduced in the target design.

### 6.2 Core reset plan

The pure `createCkvResetPlan()` function defined in §4.5 builds the explicit reset plan. The plan contains the identity and payload data persistence needs:

**Current:** Persistence currently classifies CKVs and serializes zero-CKV defaults while performing the delete/update writes.

**After change:** Core classifies CKVs and creates the serialized reset payloads; persistence receives and applies the plan defined in §4.5.

The core function:

1. Loads effective calibration state through a port.
2. Classifies the zero CKV using the domain rule that it has no key values.
3. Selects non-zero CKVs for deletion.
4. Serializes factory defaults for each existing zero-CKV payload.
5. Returns the reset plan.

### 6.3 Persistence application

`ModuleRepository.wipeAllCkvData(moduleSystemId, resetPlan)` applies the CKV plan by:

- deleting non-zero CKV payloads and CKV rows in FK order;
- updating existing zero-CKV payload rows with the supplied bytes.

`ModuleRepository.wipeAllTkvData(moduleSystemId)` separately deletes TKV/tagged calibration data.

Persistence does not classify CKVs or call `serializeDefaultParameterData()`.

### 6.4 VCPM default data

Core builds VCPM default entries with serialized payloads:

**Current:** The scenario handler gets VCPM definitions from `QueryServices.vcpmDefinitionQueryService` and passes them to `SubgraphRepository.addVcpmCfgDefaultData()`. In the rebased repository code, that subgraph-repository method is not yet part of the port or adapter, so there is no completed current persistence implementation for this path.

**After change:** Core supplies serialized payloads in the default-data plan, and a UoW-bound persistence repository only stages the hierarchy rows:

```ts
interface VcpmDefaultData {
  definitionSystemId: number;
  parameters: Array<{
    parameterSystemId: number;
    payload: Uint8Array;
  }>;
}
```

The persistence repository receives these entries and stages:

1. `VcpmInstance` CREATE;
2. zero-CKV `VcpmCkv` CREATE;
3. `VcpmParameterPayload` CREATE rows.

It does not derive payload bytes from parameter definitions.

## 7. Transaction and error handling

- Scenario transitions start one transaction before the cascade.
- All repository writes use the same `UnitOfWork` context.
- Any failure rolls back the transaction.
- A missing effective row is reported as a domain/application error by the handler or service; persistence does not expose TypeORM details.

## 8. Review-comment mapping

| Review/design concern | Resolution in this LLD |
|---|---|
| Remove `QueryServices` from command handlers | Add required effective reads to UoW-bound repository ports. |
| Property data must use the rebased subgraph fetcher | Wire `SubgraphPropertyDataFetcher` into `SubgraphOverlayFetcher` and use overlay-aware property reads. |
| Zero-CKV logic belongs in core | The pure `createCkvResetPlan()` function classifies zero CKVs and serializes defaults; persistence applies the explicit plan. |

## 9. Out of scope

- Controller-specific endpoint mapping comments.
- `Update` versus `Put`/`Patch` command naming.
- Database schema or migration changes.
- Replacing the rebased routing repository APIs.
- Test execution in this review session.
