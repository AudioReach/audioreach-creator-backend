<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Delete Module - Design

**Status:** Approved
**Owner:** Nithin Simon
**Amendments:**
- 2026-09-07 surviving Container stack-size response (Approved)
- 2026-09-07 application-service ownership (Approved)
- 2026-09-07 connected link deletion mode (Approved)

**Requirements:** [`../requirements/delete-module-requirements.md`](../requirements/delete-module-requirements.md)
**Parent design:** [`../../edit-crud/overall-design.md`](../../edit-crud/overall-design.md)
**Write-path context:** [`../../edit-crud/module-write-path.md`](../../edit-crud/module-write-path.md)

---

## 1. Scope

This document specifies the implementation design for:

```http
DELETE /arc-api/v1/projects/{projectId}/spf-modules/{spfModuleSystemId}
```

The endpoint records an undoable module delete in the active edit session. The operation deletes the requested module aggregate, deletes links connected to that module, deletes the container and/or subgraph only when they become empty, removes UseCase relationships for a deleted subgraph, and updates response summaries so the UI can update its local state.

The initial implementation is enabled only in `Designer` sessions. `DiffMerge` enablement is deferred until the general dependency-selection mechanism can stage and unstage dependent change units.

---

## 2. Architecture Decision

Use a direct transactional pipeline inside `DeleteSpfModuleHandler`, coordinated by a small application service:

```text
SpfModuleController.deleteSpfModule
  -> CommandBus.execute(DeleteSpfModuleCommand, session)
     -> DeleteSpfModuleHandler
        -> ModuleDeletionService
           -> DataLinkDeletionService
           -> ControlLinkDeletionService
           -> ContainerLifecycleService
           -> SubgraphLifecycleService
            -> UsecaseRepository relationship cleanup
```

The handler owns transaction boundaries through `UnitOfWork`, consistent with the existing command pattern.

Core owns business decisions:

- whether the module can be deleted;
- which connected links are part of the cascade;
- whether the container survives and needs stack-size recalculation;
- whether the subgraph survives;
- which UseCase relationships must be removed;
- which subsystem ControlPorts need intent cleanup.

Persistence adapters own translation to edit-actions:

- mapping domain-level operations to `targetTable`, `targetSystemId`, `aggregateId`, and payload shape;
- capturing base versions;
- enumerating owned persistence rows for aggregate deletes;
- generating persistence-only IDs for rows that need edit identity.

The core layer never imports TypeORM, SQL table schemas, or edit-action row classes.

---

## 3. API and Command Shape

### 3.1 Controller

Replace the existing `deleteSpfModule` stub in:

```text
packages/api/src/presentation/rest/modules/spf-module/spf-module.controller.ts
```

The controller:

- uses `@Delete('/:spfModuleSystemId')`;
- uses `@UseGuards(SessionGuard)` for the endpoint;
- parses `projectId` and `spfModuleSystemId` through `ParseIntPipe`;
- accepts optional `@Query('linkDeletionMode')` with `@ApiQuery` enum metadata;
- validates `full` or `segmentOnly` before constructing a command, defaulting an
  omitted value to `full` and throwing `BadRequestException` for any other value;
- constructs `DeleteSpfModuleCommand(spfModuleSystemId, linkDeletionMode)`;
- awaits `CommandBus.execute(command, session)`;
- returns `{data: commandResult.response}` directly after awaiting the handler's
  internal result.

The handler returns `{groupId, response}` internally. Command failures throw domain
exceptions rather than returning `Result.fail()`, so `toApiResult` is not used for
this command. The HTTP response omits the internal `groupId`.

### 3.2 Command

New files:

```text
packages/core/src/application/usecase-designer/spf-module/delete/delete-spf-module.command.ts
packages/core/src/application/usecase-designer/spf-module/delete/delete-spf-module.handler.ts
```

`LinkDeletionMode` is a core-owned string-union contract, defined adjacent to the
command so application services never receive an HTTP-specific query string:

```ts
export const LINK_DELETION_MODE = {
  Full: 'full',
  SegmentOnly: 'segmentOnly',
} as const;

export type LinkDeletionMode =
  (typeof LINK_DELETION_MODE)[keyof typeof LINK_DELETION_MODE];

export class DeleteSpfModuleCommand extends BaseCommand {
  static readonly requiresSession = true;
  static readonly allowedModes = [SESSION_MODE.Designer];

  constructor(
    readonly spfModuleSystemId: number,
    readonly linkDeletionMode: LinkDeletionMode = LINK_DELETION_MODE.Full,
  ) {
    super();
  }
}
```

Add a TODO beside `allowedModes`:

```ts
// TODO(diff-merge-selection-dependencies): add SessionMode.DiffMerge after
// module-delete registers and stages required dependency closures.
```

---

## 4. Result DTO

Refine the existing Delete Module-specific Zod schema in `@arc/core`:

```text
packages/core/src/application/usecase-designer/spf-module/dto/delete-spf-module-result.schema.ts
```

Core DTO shape:

```ts
const DeletedIdSchema = z.object({
  systemId: z.string(),
});

const DeletedLinkSchema = z.object({
  systemId: z.string(),
  subsystemLinks: z.array(DeletedIdSchema).optional(),
});

const UpdatedSubsystemSchema = z.object({
  systemId: z.string(),
  intentsClearedControlPorts: z.array(DeletedIdSchema),
});

const UpdatedContainerSchema = z.object({
  systemId: z.string(),
  stackSize: z.number().int().nonnegative(),
});

export const DeleteSpfModuleResultSchema = z.object({
  deleted: z.object({
    spfModules: z.array(DeletedIdSchema),
    subgraphs: z.array(DeletedIdSchema),
    containers: z.array(DeletedIdSchema),
    dataLinks: z.array(DeletedLinkSchema),
    controlLinks: z.array(DeletedLinkSchema),
    unresolvedSubsystemDataLinks: z.array(DeletedIdSchema).optional(),
    unresolvedSubsystemControlLinks: z.array(DeletedIdSchema).optional(),
  }),
  updated: z.object({
    containers: z.array(UpdatedContainerSchema),
    usecases: z.array(DeletedIdSchema),
    subsystems: z.array(UpdatedSubsystemSchema).optional(),
  }),
});

export type DeleteSpfModuleResult = z.infer<
  typeof DeleteSpfModuleResultSchema
>;
```

For non-subsystem-capable files, omit:

- `dataLinks[].subsystemLinks`;
- `controlLinks[].subsystemLinks`;
- `deleted.unresolvedSubsystemDataLinks`;
- `deleted.unresolvedSubsystemControlLinks`;
- `updated.subsystems`.

For subsystem-capable files, include those fields and use empty arrays when a category is unaffected.

`@arc/api` reuses this schema rather than defining a mirrored schema. The existing
`RemoveSpfModuleResponseDto` remains a `createZodDto(DeleteSpfModuleResultSchema)`
wrapper for runtime validation and Swagger generation. System IDs are serialized as
decimal strings. `updated.containers` is always present: it contains the surviving
affected Container and its recalculated effective stack size, or `[]` when that
Container is deleted. A Container cannot appear in both `deleted.containers` and
`updated.containers`. Link deletion mode adds no response field: a detached sibling
segment is retained and omitted from the deletion summary.

---

## 5. Domain Model Adjustments

### 5.1 `SpfModuleBase`

Delete does not need CKVs, TKVs, payload blobs, or module ports in core to make cascade decisions. Reuse the existing lightweight `SpfModuleBase` in:

```text
packages/core/src/domain/entities/usecase-data/module/spf-module.ts
```

```ts
export interface SpfModuleBase {
  systemId: number;
  definitionSystemId: number;
  containerSystemId: number;
  subgraphSystemId: number;
  alias?: string;
}
```

`alias` is optional and is used only for structured logging. Do not introduce
`SpfModuleBaseInit` or refactor `SpfModuleInit`; instance ID, parent ID, and file ID
are not needed by Delete Module. Repository methods used for delete return
`SpfModuleBase | null`. Existing full-module reads remain available for operations
that need ports, CKV/TKV details, or payload data.

---

## 6. Port Interface Changes

### 6.1 `ModuleRepository`

Extend:

```ts
/**
 * Read methods on this write-side repository return effective state by default:
 * committed rows + active STAGED and UNSTAGED edit-actions for the active session.
 */
findModuleById(
  systemId: number,
  fileSystemId: number,
): Promise<SpfModuleBase | null>;

findModulesByContainerId(
  containerSystemId: number,
  fileSystemId: number,
): Promise<SpfModuleBase[]>;

findModulesBySubgraphId(
  subgraphSystemId: number,
  fileSystemId: number,
): Promise<SpfModuleBase[]>;

deleteModule(
  moduleSystemId: number,
  fileSystemId: number,
  options?: EditOptions,
): Promise<void>;
```

The return type tells callers that these methods return the lightweight base projection, not the full `SpfModule` aggregate.

`deleteModule` records delete actions for the module aggregate and all owned rows that exist in effective state:

- Node;
- SpfModule;
- DataPorts;
- ControlPorts;
- Intents owned by those ControlPorts;
- CKVs, CKV parameter payloads, and CKV value associations;
- module tag mappings, TKVs, TKV parameter payloads, and TKV value associations.

It does not delete shared definition rows. It does not delete `spf_module_properties_data`; that table is expected to be removed.

### 6.2 `DataLinkRepository`

Extend:

```ts
import type {DataLink} from '../../../../../domain/entities/usecase-data/links/data-link.js';
import type {SubsystemDataLink} from '../../../../../domain/entities/usecase-data/links/subsystem-data-link.js';
import type {NodeType} from '../../../../../domain/entities/usecase-data/node/node.js';

export interface SubsystemDataRouteContext {
  subsystemDataLinks: SubsystemDataLink[];
  nodeTypeBySystemId: ReadonlyMap<number, NodeType>;
}

findLinksConnectedToModule(
  moduleSystemId: number,
  fileSystemId: number,
): Promise<DataLink[]>;

findUnresolvedSubsystemLinksFromModule(
  moduleSystemId: number,
  fileSystemId: number,
): Promise<SubsystemDataLink[]>;

findSubsystemDataRouteContext(
  fileSystemId: number,
): Promise<SubsystemDataRouteContext>;

deleteAggregate(
  dataLinkSystemId: number,
  fileSystemId: number,
  options?: EditOptions,
): Promise<void>;

deleteSubsystemDataLinks(
  subsystemLinkSystemIds: number[],
  fileSystemId: number,
  options?: EditOptions,
): Promise<void>;
```

The repository applies effective-state overlay before returning links. It returns existing domain entities rather than delete-specific DTO types. `DataLink.subsystemDataLinks` carries resolved subsystem segments for response reporting and explicit deletion. Unresolved subsystem links are returned separately because they are not attached to a canonical link. `findSubsystemDataRouteContext` returns every effective subsystem segment and types for every referenced node so core can classify unresolved paths without persistence-specific joins. Canonical DataLink discovery matches the deleted module's `sourceNodeSystemId` or `destinationNodeSystemId`; port IDs identify the interface but do not determine whether a valid canonical link belongs in the module-delete cascade.

### 6.3 `ControlLinkRepository`

Extend with the same deletion methods as `DataLinkRepository`, plus route context needed for intent cleanup:

```ts
import type {ControlLink} from '../../../../../domain/entities/usecase-data/links/control-link.js';
import type {SubsystemControlLink} from '../../../../../domain/entities/usecase-data/links/subsystem-control-link.js';
import type {NodeType} from '../../../../../domain/entities/usecase-data/node/node.js';

export interface SubsystemControlRouteContext {
  subsystemControlLinks: SubsystemControlLink[];
  nodeTypeBySystemId: ReadonlyMap<number, NodeType>;
}

findLinksConnectedToModule(
  moduleSystemId: number,
  fileSystemId: number,
): Promise<ControlLink[]>;

findUnresolvedSubsystemLinksFromModule(
  moduleSystemId: number,
  fileSystemId: number,
): Promise<SubsystemControlLink[]>;

findSubsystemControlRouteContext(
  fileSystemId: number,
): Promise<SubsystemControlRouteContext>;

deleteAggregate(
  controlLinkSystemId: number,
  fileSystemId: number,
  options?: EditOptions,
): Promise<void>;

deleteSubsystemControlLinks(
  subsystemLinkSystemIds: number[],
  fileSystemId: number,
  options?: EditOptions,
): Promise<void>;
```

`SubsystemControlRouteContext.subsystemControlLinks` contains every effective
`SubsystemControlLink` segment in the file, not every canonical `ControlLink`.
It serves both unresolved-chain classification and intent cleanup. Intent cleanup
needs the remaining segment topology to determine whether an affected component
still reaches a module through another route. DataLink has the equivalent route
context for chain classification only; no state is propagated onto surviving
DataPorts.

Canonical ControlLink discovery similarly matches `peerNodeASystemId` or
`peerNodeBSystemId` to the deleted module.

#### Effective subsystem-link loaders

Extend `LinkOverlayFetcher` with typed, effective-state loaders for
`subsystem_data_links` and `subsystem_control_links`. The loaders apply the active
session overlay to their own tables and support:

- resolved segments filtered by canonical link system IDs;
- unresolved segments filtered by a null canonical link ID; and
- file-wide DataLink and ControlLink segment retrieval for route context.

The persistence filter implementation must translate a null canonical-link filter
to SQL `IS NULL` and apply the equivalent null predicate to CREATE payloads. Do not
reuse `DbSubsystemQueryService`: its UseCase-scoped inner joins cannot discover
unresolved segments and do not support this write-path cascade.

### 6.4 `ContainerRepository`

Extend:

```ts
deleteContainer(
  containerSystemId: number,
  fileSystemId: number,
  options?: EditOptions,
): Promise<void>;
```

The adapter records delete actions for the container root and owned `container_property_data` rows that exist in effective state.

### 6.5 `SubgraphRepository`

Extend:

```ts
deleteSubgraph(
  subgraphSystemId: number,
  fileSystemId: number,
  options?: EditOptions,
): Promise<void>;
```

Use the existing overlay-aware `findByIds(fileSystemId, [subgraphSystemId])` for
the imported-subgraph guard; do not add a single-ID read method.

The adapter records delete actions for the subgraph root and owned `subgraph_property_data`, SGKV, and VCPM rows that exist in effective state.

Subgraph deletion must not discover or delete DataLinks or ControlLinks by `subgraphId`. Canonical link deletion is based only on module node endpoints, not port projections.

### 6.6 `UsecaseRepository`

Extend the existing `UsecaseRepository` exposed by `UnitOfWork.getUsecaseRepository()`.
Do not create a separate `UseCaseRelationshipRepository`.

```ts
export interface UsecaseRepository {
  removeSubgraphReferences(
    subgraphSystemId: number,
    fileSystemId: number,
    options?: EditOptions,
  ): Promise<{affectedUseCaseSystemIds: number[]}>;
}
```

The persistence adapter reads effective `use_case_subgraphs` rows referencing the
subgraph and effective `use_case_subgraph_pairs` rows where the subgraph is either
endpoint in two batched reverse queries. Each baseline query is file-scoped through
its owning UseCase and overlays active CREATE, UPDATE, and DELETE actions before
filtering the effective rows. The adapter deletes each returned relationship by its
persistence `systemId`, uses its `usecaseSystemId` as `aggregateId`, and returns
deduplicated affected UseCase IDs. Do not implement this operation through
`applyStructuralChange`, which performs per-relationship lookups. UseCases remain.

### 6.7 `SubsystemRepository`

Extend:

```ts
hasSubsystems(fileSystemId: number): Promise<boolean>;

clearControlPortIntents(
  controlPortSystemIds: number[],
  fileSystemId: number,
  options?: EditOptions,
): Promise<void>;
```

`hasSubsystems` controls whether subsystem-specific response fields are included.
The intent-cleanup service returns each affected ControlPort together with its
owning subsystem, so no additional ownership lookup is required.
`clearControlPortIntents` belongs to this repository because the surviving
ControlPorts and their Intents are owned by the Subsystem aggregate, not by a
ControlLink aggregate.

---

## 7. Existing UseCase Relationship Identity

`use_case_subgraphs` and `use_case_subgraph_pairs` already have edit-addressable,
persistence-only generated `system_id` values.

Natural uniqueness constraints remain unchanged. Bulk import already assigns the IDs
through file-scoped ID generation. Delete Module uses them only for edit-action
addressing, base-version capture, and overlay processing; they remain absent from
the core `UseCase` entity and public API.

---

## 8. Application Services

Application services live under the `usecase-designer` folder of the aggregate
whose state transition they primarily coordinate. `ModuleDeletionService` remains
the SPF-module operation coordinator: it creates and calls the aggregate-owned
collaborators, but does not duplicate their logic. This is a structural relocation
only; no handler registration, transaction boundary, persistence port, edit-action,
or response behavior changes.

### 8.1 `ModuleDeletionService`

New file:

```text
packages/core/src/application/usecase-designer/spf-module/delete/module-deletion.service.ts
```

Responsibilities:

- load `SpfModuleBase`, including its optional alias for logging;
- validate the imported-subgraph guard through `SubgraphRepository.findByIds` and
  `Subgraph.isImported`;
- pass the command's `LinkDeletionMode` to DataLink and ControlLink deletion;
- coordinate link deletion, module deletion, container lifecycle, subgraph lifecycle, and UseCase cleanup;
- build `DeleteSpfModuleResult` and return the deleted module as internal log context;
- sort and deduplicate every response array.

It does not access persistence-specific table names.

### 8.2 `DataLinkDeletionService`

New file:

```text
packages/core/src/application/usecase-designer/data-links/delete/data-link-deletion.service.ts
```

Responsibilities:

- find canonical DataLinks connected to the module;
- find resolved subsystem DataLink segments for those canonical links;
- classify unresolved subsystem DataLink chains reached from the deleted module
  with the existing pure `ChainResolutionService` and effective route context;
- apply `LinkDeletionMode` without materializing a temporary canonical DataLink;
- call `deleteAggregate` for full canonical deletion and
  `deleteSubsystemDataLinks` for segment-only canonical deletion;
- return the response summary entries.

For a resolved canonical link, `full` calls `deleteAggregate`, while
`segmentOnly` supplies only segments incident to the deleted module to
`deleteSubsystemDataLinks`. The latter deletes the canonical link, deletes those
target segments, and detaches its remaining siblings through null-FK overlay
updates. An unresolved complete path is classified in memory: `full` deletes its
complete path, while `segmentOnly` deletes only its module-incident segments. An
unresolved path that cannot complete is deleted in full for either mode. It does
not remove subsystem DataPorts.

### 8.3 `ControlLinkDeletionService`

New file:

```text
packages/core/src/application/usecase-designer/control-links/delete/control-link-deletion.service.ts
```

Extend the existing pure `ControlIntentPropagationService` with a bulk-delete
operation while retaining its existing single-segment operation for current
callers:

```ts
export interface FindPortsToClearAfterDeletingLinksInput {
  allSubsystemControlLinks: readonly SubsystemControlLink[];
  deletedSubsystemControlLinkSystemIds: readonly number[];
  nodeTypeMap: ReadonlyMap<number, NodeType>;
}

export interface IntentClearedControlPort {
  subsystemSystemId: number;
  controlPortSystemId: number;
}

findPortsToClearAfterDeletingLinks(
  input: FindPortsToClearAfterDeletingLinksInput,
): {portsToClear: IntentClearedControlPort[]};
```

The operation builds the remaining graph by excluding the complete deletion
set. It uses the pre-delete segment set to retain port-to-subsystem ownership
for ports that become fully isolated. It evaluates only components affected by
the deleted segments and clears a subsystem port only when its remaining
component has no module anchor. Returning both IDs avoids a second repository
query solely for response grouping.

Responsibilities:

- find canonical ControlLinks connected to the module;
- find resolved subsystem ControlLink segments for those canonical links;
- classify unresolved subsystem ControlLink chains reached from the deleted module
  with the existing pure `ControlChainResolutionService` and effective route
  context;
- apply `LinkDeletionMode` without materializing a temporary canonical
  ControlLink;
- call `deleteAggregate` for full canonical deletion and
  `deleteSubsystemControlLinks` for segment-only canonical deletion;
- compute surviving subsystem ControlPorts whose intents must be cleared using
  `ControlIntentPropagationService.findPortsToClearAfterDeletingLinks`;
- call `SubsystemRepository.clearControlPortIntents`;
- return deleted link entries and `updated.subsystems[].intentsClearedControlPorts`.

It computes the exact deleted segment-ID set once, before persistence writes, and
passes that set with the complete pre-delete route context to
`findPortsToClearAfterDeletingLinks`. In `segmentOnly` mode, detached siblings are
not in that set and therefore remain in the graph used by the reachability check.
This is equivalent to the direct Control Subsystem Link Segment delete Case B:
ports retain intents whenever the remaining graph still reaches a module, and
ports in components that become unanchored have their intents cleared. It does
not remove subsystem ControlPorts.

### 8.4 `ContainerLifecycleService`

New file:

```text
packages/core/src/application/usecase-designer/container/delete/container-lifecycle.service.ts
```

Responsibilities:

- after excluding the deleted module, query effective modules in the affected container;
- if none remain, call `ContainerRepository.deleteContainer`;
- if modules remain, call `ContainerStackSizeService.recalculateForContainer`.

Its `apply` result is a discriminated lifecycle result rather than a boolean:

```ts
type ContainerLifecycleResult =
  | {deleted: true}
  | {deleted: false; stackSize: number};
```

When the Container survives, `ContainerStackSizeService.recalculateForContainer`
returns the exact non-negative stack size it records in the edit action. The lifecycle
service returns that value without rereading `container_property_data` or duplicating
the maximum calculation. When the Container is deleted, it returns `{deleted: true}`.

`ContainerStackSizeService` is the shared application service specified by
`add-module-design.md`. If it is absent on the implementation branch, implement
that shared service and its required effective-state repository reads as a
prerequisite to this lifecycle service; do not duplicate stack-size logic in
Delete Module.

`ContainerStackSizeService` is located at:

```text
packages/core/src/application/usecase-designer/container/services/container-stack-size.service.ts
```

It remains shared by Add Module, PATCH Module, and Delete Module because each
operation updates Container-owned stack-size state.

Container deletion and subgraph deletion are independent. A container should not be deleted just because its subgraph is deleted unless its own effective occupancy is empty.

### 8.5 `SubgraphLifecycleService`

New file:

```text
packages/core/src/application/usecase-designer/subgraph/delete/subgraph-lifecycle.service.ts
```

Responsibilities:

- after excluding the deleted module, query effective modules in the affected subgraph;
- if none remain, call `SubgraphRepository.deleteSubgraph`;
- if deleted, call `UsecaseRepository.removeSubgraphReferences`;
- return deleted subgraph and affected UseCase IDs.

It does not remove UseCase rows.

---

## 9. Handler Flow

```ts
async handle(command: DeleteSpfModuleCommand): Promise<DeleteSpfModuleInternalResult> {
  await this.uow.startTransaction();
  try {
    const fileSystemId = this.uow.getWriteContext().session.fileSystemId;

    const {response, deletedModule} = await this.moduleDeletionService.deleteModule(
      command.spfModuleSystemId,
      fileSystemId,
      command.linkDeletionMode,
    );

    // TODO(diff-merge-selection-dependencies): when DiffMerge is enabled,
    // register required change-unit dependencies and stage the forward closure
    // in this same transaction.

    await this.uow.commit();
    this.logger?.logInfo({
      msg: `Deleted module '${deletedModule.alias ?? 'unknown'}' (${BinaryUtils.toHexString(deletedModule.systemId)})`,
      action: 'delete-spf-module',
      component: 'DeleteSpfModuleHandler',
      tag: 'module-delete',
      timestamp: new Date(),
    });
    return {
      groupId: this.uow.getWriteContext().groupId,
      response,
    };
  } catch (error) {
    if (this.uow.isInTransaction()) await this.uow.rollback();
    this.logger?.logError({
      msg: `Delete module failed (${BinaryUtils.toHexString(command.spfModuleSystemId)})`,
      action: 'delete-spf-module',
      component: 'DeleteSpfModuleHandler',
      tag: 'module-delete',
      timestamp: new Date(),
      error: error instanceof Error ? error : new Error(String(error)),
    });
    throw error;
  }
}
```

`DeleteSpfModuleHandler` receives the optional `Logger` port through command-handler
registration. The success log is emitted only after commit; the failure log includes
the caught error. Cascade counts may be added to the success log, but child IDs are
not individually logged.

Detailed operation sequence:

1. Resolve `fileSystemId` from the active session in `WriteContext`, following existing write-command conventions.
2. Load the requested module through `ModuleRepository.findModuleById`.
3. If missing, throw `ResourceNotFoundException` carrying the not-found issue.
4. Load its subgraph through `findByIds`; if `isImported`, throw
   `DomainRuleViolationException` carrying `ARC-MOD-SUBGRAPH-IMPORTED`.
5. Delete connected DataLinks under the requested `linkDeletionMode`.
6. Delete connected ControlLinks under the requested `linkDeletionMode`.
7. Clear routed-control intents from surviving subsystem ControlPorts affected by deleted control routes.
8. Call `ModuleRepository.deleteModule`.
9. Evaluate the module's container occupancy and either call `ContainerRepository.deleteContainer` or recalculate its stack size.
10. Evaluate the module's subgraph occupancy and, when empty, call `SubgraphRepository.deleteSubgraph` and remove UseCase relationships.
11. Commit, log the successful operation, and return the deterministic response summary.

Discovery and writes happen in one transaction. Validation happens before any delete-operation edit action is recorded.

---

## 10. Effective-State Reads

All decisions are made from effective state:

```text
committed rows + active edit_actions rows with changeStatus STAGED or UNSTAGED
```

This applies to module existence, ports, links, subsystem route segments, container/subgraph occupancy, UseCase relationships, and routed-control intent cleanup.

Repository method names should not mention `effective` or `staged` unless they intentionally depart from the default. In write-side repositories, read methods return effective state by default. Committed-only methods, if ever needed, must say so explicitly, for example `findCommittedModuleById`. Delete Module adds no committed-only module read methods.

For the initial `Designer` implementation, all new delete-operation edit actions are recorded as `STAGED`. That default does not change the read rule above.

---

## 11. Link Deletion Modes And Subsystem Handling

### 11.1 Route classification

The mode applies to every connected DataLink and ControlLink route in the request.
Each link-deletion service reads, before writing:

1. canonical links connected to the module, with their resolved segments;
2. effective unresolved segments reachable from the module; and
3. full effective subsystem route context, including node types.

It passes all effective unresolved segments to `ChainResolutionService` for data
or `ControlChainResolutionService` for control. This is a read-only
classification. The service never creates a canonical link merely to delete it,
so no temporary ID, edit action, or response entry exists for a previously
unresolved route.

The classifier produces duplicate-free segment ID sets for complete paths that
reach the deleted module and unresolved fallback paths that cannot complete.
When a segment participates in an incomplete branch, the fallback deletion wins
for that segment so incomplete topology cannot survive because another branch was
complete. Segments unrelated to the deleted module are excluded.

### 11.2 `full` mode

For each connected canonical link, call `deleteAggregate`; it deletes the
canonical link and every resolved segment. For all reachable unresolved paths,
delete every segment. This retains the current Delete Module behavior.

### 11.3 `segmentOnly` mode

For each connected canonical link with route segments:

1. select every segment whose source/destination node is the deleted DataLink
   module or whose peer A/B node is the deleted ControlLink module;
2. call `deleteSubsystemDataLinks` or `deleteSubsystemControlLinks` with those
   target IDs;
3. allow the repository to delete the canonical link and detach all other
   resolved siblings by recording null-FK updates.

A canonical link with no route segments is deleted through `deleteAggregate`,
because it cannot survive with an endpoint on the deleted module.

For a complete unresolved path involving the deleted module, delete only its
module-incident segments. Its surviving segments already have null canonical FKs
and remain unresolved. For an unresolved path that cannot complete, delete the
full reachable path. This fallback is independent of the selected mode.

### 11.4 Control intent cleanup

For subsystem-capable files, `ControlLinkDeletionService` captures effective
subsystem ControlLinks before link writes and computes a single deleted-ID set:

- `full`: all segments from deleted canonical routes and full unresolved paths;
- `segmentOnly`: module-incident resolved or complete-unresolved targets plus
  every segment in unresolved fallback paths.

It calls `ControlIntentPropagationService.findPortsToClearAfterDeletingLinks`
once with that set and the complete pre-delete topology. The service derives the
remaining graph by removing only those IDs. A sibling detached by a null-FK update
is not deleted, remains in the graph, and continues to anchor a component when it
still reaches a module. This is the same behavior required by the Control
Subsystem Link Segment delete Case B.

The result identifies only subsystem-owned ControlPorts in components with no
remaining module anchor. `SubsystemRepository.clearControlPortIntents` records
their Intent deletes in the active operation group. Module-owned ports are not
returned by this operation. Data routes do not require intent cleanup.

### 11.5 Response construction

For subsystem-capable files:

- a deleted canonical link reports exactly its deleted resolved segments under
  `subsystemLinks`;
- in `segmentOnly` mode, detached siblings are neither deleted nor reported;
- deleted unresolved segments report under
  `deleted.unresolvedSubsystemDataLinks` or
  `deleted.unresolvedSubsystemControlLinks`;
- `subsystemLinks` is `[]` when a canonical link has no deleted route segment;
- affected subsystem ControlPorts are grouped under
  `updated.subsystems[].intentsClearedControlPorts`.

For non-subsystem-capable files, all subsystem-specific fields remain omitted.

---

## 12. Response Construction

Build the response from service outputs, not by reading `edit_actions` after the fact. This keeps the public contract domain-oriented and independent of persistence table layout.

For the affected Container, `ModuleDeletionService` maps the container lifecycle
result as follows:

```ts
deleted: {
  containers: result.deleted ? [id(containerSystemId)] : [],
  // ...
},
updated: {
  containers: result.deleted
    ? []
    : [{systemId: String(containerSystemId), stackSize: result.stackSize}],
  // ...
},
```

`updated.usecases` remains an ID-only summary. The deleted subgraph and links already
describe the graph changes that caused each UseCase update; this endpoint does not
return a duplicate UseCase projection.

Ordering rule:

- `deleted.spfModules` always contains exactly the requested module ID;
- sort every array by numeric `systemId` ascending;
- remove duplicates before serialization;
- serialize all IDs as decimal strings at the DTO boundary.

Example subsystem-capable response:

```json
{
  "deleted": {
    "spfModules": [{"systemId": "1001"}],
    "subgraphs": [{"systemId": "2001"}],
    "containers": [],
    "dataLinks": [
      {
        "systemId": "4001",
        "subsystemLinks": [{"systemId": "4101"}]
      }
    ],
    "controlLinks": [
      {
        "systemId": "5001",
        "subsystemLinks": [{"systemId": "5101"}]
      }
    ],
    "unresolvedSubsystemDataLinks": [],
    "unresolvedSubsystemControlLinks": [{"systemId": "5201"}]
  },
  "updated": {
    "containers": [{"systemId": "7001", "stackSize": 4096}],
    "usecases": [{"systemId": "6001"}],
    "subsystems": [
      {
        "systemId": "3001",
        "intentsClearedControlPorts": [{"systemId": "5301"}]
      }
    ]
  }
}
```

---

## 13. DiffMerge Dependency Selection

The delete pipeline should be implemented so it can later plug into a general dependency selector without rewriting cascade logic.

Initial implementation:

- `DeleteSpfModuleCommand.allowedModes = [Designer]`;
- every edit action produced by the request is `STAGED`;
- no attempt is made to stage pre-existing `UNSTAGED` dependency changes;
- leave a TODO at the handler after cascade discovery and before commit.

Future mechanism:

- use `ChangeSelectionService` from `docs/edit-crud/design/change-selection-dependencies-design.md`;
- call `stage({sessionId, groupIds: [deleteGroupId]}, uow)` before commit;
- let dependency rules derive required existing changes from pending history and domain relationships;
- let `IChangeStatusRepository` update only the exact `changeId` values returned by the planner.

For module deletion in a `DiffMerge` session, the dependency builder would derive required change units from effective-state cascade results. Example:

- an unstaged DiffMerge-created DataLink connected to the module is effective;
- the user deletes the module manually;
- the delete operation records its own `STAGED` delete actions;
- the dependency service records that the module-delete group requires the DataLink create change unit;
- staging the module-delete group auto-stages that DataLink create, then the delete action removes it in effective state;
- unstaging the DataLink create later auto-unstages the module-delete group because the delete depends on it.

This mechanism is intentionally outside the initial Delete Module implementation.

---

## 14. Error Handling

Use existing domain-exception conventions:

- invalid `linkDeletionMode`: controller throws `BadRequestException` before command
  execution, mapped to HTTP 400;
- missing module: throw `ResourceNotFoundException` carrying `IssueFactory.notFound(ISSUE_ENTITY_TYPE.SpfModule, spfModuleSystemId)`, mapped to HTTP 404;
- imported subgraph: throw `DomainRuleViolationException` containing an issue with code `ARC-MOD-SUBGRAPH-IMPORTED`, mapped to HTTP 422;
- session missing or mode not allowed: `SessionGuard`/`CommandBus` mapped to HTTP 403;
- unexpected persistence failure: rollback and let the common exception filter map the error.

For the imported-subgraph rule, the top-level error code remains
`DOMAIN_RULE_VIOLATION`; `ARC-MOD-SUBGRAPH-IMPORTED` is the structured issue code in
the `issues` array.

No partial response is returned after a failed transaction.

---

## 15. Tests

### 15.1 Core unit tests

Cover:

- missing module throws `ResourceNotFoundException` with the required not-found issue;
- imported subgraph throws `DomainRuleViolationException` with `ARC-MOD-SUBGRAPH-IMPORTED`;
- connected data/control links are deleted;
- omitted `linkDeletionMode` uses `full`, and that mode preserves existing complete
  route deletion;
- `segmentOnly` deletes only module-incident resolved DataLink and ControlLink
  segments, deletes their canonical link, and retains siblings as unresolved;
- `segmentOnly` does not clear ControlPort intents when retained siblings still
  provide a route to another module, and clears them when the remaining component
  has no module anchor;
- complete unresolved chains are classified without temporary canonical-link edit
  actions; `full` deletes them in full while `segmentOnly` deletes only
  module-incident segments;
- incomplete unresolved chains are deleted in full for either mode;
- subsystem-capable and non-subsystem response shapes differ correctly;
- subsystem boundary ports are retained;
- control intents are cleared and reported;
- deleting a complete control route clears intents from ports that become fully
  isolated;
- ports that retain an effective route to another module keep their intents;
- empty container is deleted;
- surviving container stack size is recalculated and returned under
  `updated.containers`;
- deleted and updated Container summaries are mutually exclusive;
- empty subgraph is deleted and UseCase relationships are removed;
- UseCases remain even when emptied;
- success and failure logs contain the required structured fields and hexadecimal module ID.

### 15.2 Persistence integration tests

Cover:

- relationship delete actions target existing generated IDs for committed and session-created relationships;
- effective-state link, subsystem-link, module occupancy, and UseCase relationship queries include active `STAGED` and `UNSTAGED` rows;
- subsystem-link loaders distinguish resolved canonical-link IDs from null canonical-link IDs;
- DataLink and ControlLink route context returns every effective segment and the
  referenced effective node-type map;
- segment-only writes delete targets and the canonical link while recording null-FK
  updates only for surviving siblings, all under the request group;
- aggregate delete repositories record deletes for owned rows while preserving shared definitions;
- module-properties rows are not expected.

### 15.3 API e2e tests

Cover:

- route succeeds in a Designer session;
- route fails without an active session;
- route fails in unsupported session modes until DiffMerge is enabled;
- route returns 404 for a missing/effectively deleted module;
- route returns 422 for an imported subgraph;
- omitted `linkDeletionMode` and explicit `full` return the same deletion contract;
- `linkDeletionMode=segmentOnly` is accepted, and an unknown value returns HTTP 400
  before any edit action is recorded;
- response fields match subsystem-capable and non-subsystem-capable files;
- a surviving Container response includes a decimal-string `systemId` and a
  non-negative integer `stackSize` under `updated.containers`.

---

## 16. Implementation Sequence

1. Add `LinkDeletionMode` to `DeleteSpfModuleCommand`; parse and document the
   optional controller query parameter.
2. Add DataLink effective route context and reuse ControlLink effective route
   context for chain classification.
3. Pass the mode through `ModuleDeletionService` and apply it in the DataLink and
   ControlLink deletion services.
4. Preserve the direct subsystem-segment deletion write semantics for resolved
   `segmentOnly` routes; do not materialize canonical links for unresolved routes.
5. Compute control intent cleanup from the exact deletion set before writes.
6. Add core unit tests, persistence integration tests, API e2e coverage, and
   regenerate Swagger.

---

## 17. Requirements Traceability

| Requirement | Design coverage |
|-------------|-----------------|
| FR-DM-01 to FR-DM-05 | Sections 3, 9, 14 |
| FR-DM-06, FR-DM-06A | Sections 3.2, 10, 13 |
| FR-DM-07, FR-DM-08 | Sections 9, 14 |
| FR-DM-09 to FR-DM-13 | Sections 5, 6, 8, 9, 11 |
| FR-DM-10A, FR-DM-10B, FR-DM-11A | Sections 3, 6, 8, 9, 11, 15 |
| FR-DM-14 to FR-DM-16A | Sections 4, 6.4, 8.4, 9, 12 |
| FR-DM-17 to FR-DM-20 | Sections 6.5, 6.6, 7, 8.5, 9 |
| FR-DM-21 to FR-DM-25 | Sections 9, 10, 13 |
| FR-DM-26 to FR-DM-30 | Sections 4, 11, 12 |
| Invariants | Sections 8 to 13 |
| Non-functional requirements | Sections 9, 10, 14, 15 |

---

## 18. Open Implementation TODOs

- Add `SessionMode.DiffMerge` after the general change-selection dependency mechanism is implemented.
- Add dependency registration/staging at the handler integration point for DiffMerge.
