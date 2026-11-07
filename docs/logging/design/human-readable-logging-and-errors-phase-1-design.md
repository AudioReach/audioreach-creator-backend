<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Human-Readable Logging and Errors: Phase 1 Design

**Requirements:**
[Identity-Aware Logging and Errors Requirements](../identity-aware-logging-and-errors-requirements.md)  
**Date:** 2026-10-31  
**Status:** Approved implementation design  
**Initial adoption:** Auto and manual use-case routing  
**Target scope:** Project-wide incremental adoption

## 1. Decision Summary

Implement human-readable entity identity in server logs and API errors now,
without implementing distributed correlation or redesigning telemetry storage.

This phase will:

- describe known entities using natural identity, with one scheme shared by
  user-facing messages and logs;
- use an explicitly labelled hexadecimal system ID only when natural identity
  is not available;
- provide typed issue context for client interaction;
- remove caller-controlled `source` from the core logger write contract and
  from log storage;
- record which program wrote each log (`service_name`, `service_instance_id`)
  and which client and launch it belongs to (`client_name`,
  `client_instance_id`), all set by infrastructure (§6.2); and
- let a reader page through a project's logs, its own and the server's, by
  client and launch, and list the client launches that have project logs
  (§10).

This phase will not add `action`, `traceId`, `spanId`, spans, OpenTelemetry,
worker-local telemetry, or trace-oriented APIs.

The following documents own that later work:

- [Distributed Observability HLD](./distributed-observability-hld.md)
- [OpenTelemetry Adoption LLD](./opentelemetry-adoption-lld.md)

## 2. Why This Can Be Delivered Independently

Human-readable identity and distributed correlation solve different problems:

- identity explains **what entity** was affected;
- trace context explains **which operation** an event belongs to; and
- resource metadata explains **which runtime** produced the event.

The first concern belongs in core because core understands domain identity. The
other two belong in API and infrastructure because they depend on runtime and
transport context.

A core log call produced by this phase remains valid after OpenTelemetry is
adopted:

```typescript
logger.logWarn({
  eventName: 'module.validation.failed',
  description: "Module 'RX MFC' (0x0000A1B2) failed validation",
  component: 'ModuleValidator',
  tag: 'validation',
});
```

The future infrastructure logger can append trace, span, and resource fields
without changing this call.

## 3. Scope

### 3.1 In scope

- canonical natural-identity formatting;
- hexadecimal formatting for natural IDs, and for system IDs used as the
  fallback when natural identity is missing;
- human-readable log descriptions;
- human-readable issue and expected-error messages;
- typed, issue-code-specific context;
- issue facts with an application-layer renderer, and the issue wire changes
  in §8.4;
- complete stored data-loss issues (§8.5);
- batched DataLink and ControlLink identity resolution;
- repositories extending query services, and read/write type placement (§5.4,
  §5.5);
- the null-versus-optional field rule and the routing-scope field decisions,
  including a required, derived `UseCase.type` (§5.6);
- layer-boundary lint (§5.7);
- regeneration of the single project-data migration (§11);
- best-effort audit descriptions after successful commits;
- removal of `source` from core logger writes and from `log_entries`;
- producer identity (`service_name`, `service_instance_id`) and the client
  and launch a record belongs to (`client_name`, `client_instance_id`) on
  every log (§6.2);
- a required client name at registration, carried in the access token (§6.2);
- the `X-ARC-Client-Instance-Id` request header and a request-scoped log
  context that also carries the route's project ID (§6.2);
- the new client-log contract (§7);
- project-log reads filtered by client name, launch, origin, and minimum
  level, and a list
  of client launches (§10); and
- regeneration of the single logging migration (§11).

### 3.2 Out of scope

- OpenTelemetry SDK setup;
- W3C `traceparent` propagation;
- trace and span creation;
- per-request correlation IDs (trace IDs come with OpenTelemetry);
- worker-local logging or telemetry propagation;
- `service_version`, `observed_timestamp`, trace columns, and span
  persistence;
- trace-oriented diagnostic APIs and time-range search;
- diagnostic-bundle implementation;
- client trace context in submitted logs;
- OTLP-based client telemetry export or deprecation of the client-log
  endpoint;
- log authorization beyond the current local trust model;
- other changes to HTTP lifecycle logging, such as request metadata capture
  and removal of header/body logging, exception logging, or unexpected-error
  response mapping;
- a new `action` field;
- localization; and
- compliance-grade audit storage.

### 3.3 Requirements delivery boundary

This is an incremental delivery of the linked frozen requirements (as amended
on 2026-10-30 for a single identity scheme), not their
complete implementation. The `action` portion of FR-ILE-12, per-request correlation in
FR-ILE-13, HTTP lifecycle logging in FR-ILE-18 and
FR-ILE-19, and safe unexpected-error and client-log projections in FR-ILE-20
remain open. FR-ILE-24 and FR-ILE-25 (producer identity and client-session
export, amended 2026-10-31) are delivered in full. The TODOs in Sections 7 through 10 identify the affected future
work. Phase 1 must still satisfy the identity and expected-error message
invariants, including omission of system IDs for known entities in messages
and logs.

## 4. Identity Rules

### 4.1 Known entities

There is one identity scheme. User-facing messages and logs identify a known
entity the same way: by its natural identity, without the persistence
`systemId`.

```text
Module 'RX MFC' (0x0000A1B2) cannot be removed because it is still connected.
```

Here `0x0000A1B2` is the module's natural ID, not its system ID. The system ID
may still be present as opaque structured issue context when required for a
client action (§8.2), but it is never rendered in text for a known entity.

### 4.2 Missing natural identity

The system ID appears in text only when natural identity is missing, as an
explicitly labelled hexadecimal fallback. Messages and logs use the same
fallback:

```text
Module with systemId: 0x10000002 was not found in this project.
```

The usual case is a caller-supplied system ID that does not match any entity
in scope: commands carry system IDs, and client data can be out of date with
the database. The fallback also covers the rare case where natural identity
cannot be resolved for an entity that exists (for example a dangling reference
or a failed identity read). That case indicates a data-integrity or read
problem, and the system ID is the most useful information to report. There is
no separate `unknown module` label.

### 4.3 Canonical representations

Any numeric natural ID, and any system ID used as the fallback in §4.2, is
rendered with `BinaryUtils.toHexString()`.

Use deterministic natural identities:

| Entity | Preferred human identity |
|---|---|
| Project | name, then project UUID when needed |
| UseCase | alias when present, then the ordered GKV pairs by name, `keyName:valueName`, without natural IDs |
| Subgraph | name plus natural subgraph ID |
| SPF module (driver module uses the same form) | alias when present, otherwise the module definition name, plus the module instance natural ID |
| Container | container natural ID (containers have no name) |
| Subsystem | name plus subsystem natural ID |
| Module definition | name plus module-definition natural ID |
| Key definition | name plus key natural ID |
| Value definition | its GKV pair, `keyName:valueName (keyNaturalId:valueNaturalId)` |
| Property definition (subgraph, container) | name plus property natural ID |
| DataLink | `endpoint / portName` → `endpoint / portName`, where each endpoint is the Module or Subsystem identity |
| ControlLink | canonical `endpoint / portName` ↔ `endpoint / portName`, where each endpoint is the Module or Subsystem identity, ordered ascending by endpoint natural ID |
| SGKV/CKV/TKV | owning entity plus ordered key/value identity |

Optional aliases improve a canonical identity but do not replace it. An alias
is a user-given label and may not be unique, so the natural ID or GKV pairs
always follow it. Example:

```text
UseCase 'Playback' [StreamType:Playback, DeviceRx:Speaker]
UseCase [StreamType:Record, DeviceTx:Handset_Mic]
```

A UseCase's GKV has several pairs, so its text uses names only: natural IDs
for every pair would make the identity too long to read. Key and value names
come from the definition file and identify the pair; the reference's
`systemId` remains in structured context for machines.

A port without a name is shown by its natural ID (`port 0x00000002`).

**No Node identity.** A node is never identified as "node". Every node
reference resolves to its concrete type (`SpfModule` or `Subsystem`; later
also `DriverModule`) before it reaches an issue fact, a log description, or a
link endpoint, and is rendered with that entity's identity. There is no `NodeIdentity` type and no `Node` entity type in
`EntityRef`.

**Not-found hex rule.** `IssueFactory.notFound` and any message that uses the
§4.2 fallback must render the system ID in the text using
`BinaryUtils.toHexString()` (e.g., `systemId: 0x0000002A`), not a bare decimal
integer. Hexadecimal is a text-rendering rule only: it
applies to messages, log descriptions, and `displayName`. Machine
fields that carry a system ID on the wire (`systemId` in entity references and
`commandPayload`) stay decimal strings or numbers; see §8.2.

**UseCase GKV ordering.** GKV entry order follows the order of
`keyVector.valueSystemIds` as loaded from persistence. Key and value names and
natural IDs are resolved through the batched key-value-definition service (the
`getKeyValueSummaryForGivenValues` path). The `orderedKeys` field on the domain
entity carries natural-ID ordering only; full names come from key-value-definition
resolution. In a UseCase, one pair is `keyName:valueName` and pairs are
separated by `, `. A value definition on its own is one pair with its natural
IDs, `keyName:valueName (0xKeyNaturalId:0xValueNaturalId)`.

### 4.4 Identity formatting

There is one entity-reference type per layer, and no separate identity
projection:

| Layer | Type | Defined in |
|---|---|---|
| Domain | `EntityRef` (reference inside an issue fact; identity may be missing) | §8.3 |
| Application | `RenderedEntityRef` (renderer output; name always filled) | §8.3 |
| API | `ApiEntityRef` (wire shape) | §8.2 |

**Identity types.** An identity is plain data: the fields §4.3 needs, with no
text. The types live in `domain/identity/` because domain issue facts carry
them (§5.7 forbids domain imports from application). Read methods return the
same types.

```typescript
// domain/identity/
interface NamedNaturalId {
  readonly name: string;
  readonly naturalId: number;
}
interface NamedKeyValue {
  readonly key: NamedNaturalId;
  readonly value: NamedNaturalId;
}
interface PortIdentity {
  readonly name: string | null;
  readonly naturalId: number;
}
interface LinkEndpoint {
  readonly node: EntityRef<'SpfModule'> | EntityRef<'Subsystem'>; // identity set
  readonly port: PortIdentity;
}

interface EntityIdentityMap {
  UseCase: {readonly alias?: string; readonly gkv: readonly NamedKeyValue[]};
  Subgraph: NamedNaturalId;
  SpfModule: {
    readonly alias?: string;
    readonly definitionName: string;
    readonly naturalId: number;
  };
  Container: {readonly naturalId: number};
  Subsystem: NamedNaturalId;
  SpfModuleDefinition: NamedNaturalId;
  KeyDefinition: NamedNaturalId;
  ValueDefinition: NamedKeyValue;
  SubgraphPropertyDefinition: NamedNaturalId;
  ContainerPropertyDefinition: NamedNaturalId;
  DataLink: {readonly source: LinkEndpoint; readonly destination: LinkEndpoint};
  ControlLink: {readonly endpoints: readonly [LinkEndpoint, LinkEndpoint]}; // any order
  Project: {readonly name: string; readonly uuid: string};
}

type IdentityFor<T extends IssueEntityType> =
  T extends keyof EntityIdentityMap ? EntityIdentityMap[T] : never;

type EntityRef<T extends IssueEntityType = IssueEntityType> = {
  [K in T]: {
    readonly entityType: K;
    readonly systemId: number;
    readonly identity?: IdentityFor<K>;
  };
}[T];
```

`EntityRef<T>` lives in `domain/identity/` with the identity types, because
the formatter takes it; issue facts (§8.3) import it. It is discriminated on
`entityType`, so a reference can only carry the identity of its own type.
Phase 2 adds the map entries for the eight types routing uses (UseCase,
Subgraph, SpfModule, Subsystem, DataLink, ControlLink, KeyDefinition,
ValueDefinition). Each other type gets its entry, and its formatter case,
with its first Phase 6 producer. Until then its references have no identity
and use the fallback.

**Where identity comes from.** There are no adapters from entities to
identity. A producer fills `identity` from a batched `find…Identities` read
(§5.2, §5.3), or sets it inline when it already holds the exact fields (for
example `{name: sg.name, naturalId: sg.naturalId}` from a loaded subgraph).
The §4.3 rules that need related data (alias or definition name, GKV order)
live in the identity reads. The formatter orders control-link endpoints
itself, so the same link reads the same way whoever built its identity;
endpoints without node identity go last. A shared function is added only when
two producers repeat the same rule.
Existing names such as `SpfModuleIdentity` are aliases
(`IdentityFor<'SpfModule'>`).

**Formatter.** `IdentityFormatter` in `application/issues/` is pure and has a
single format method, used for both issue messages and log descriptions:

```typescript
interface IdentityFormatter {
  format(ref: EntityRef): string;
}
```

When `identity` is present, it returns the natural identity from §4.3 and
ignores `systemId`. When `identity` is missing, it returns the §4.2 fallback,
`<Entity type> with systemId: 0x...`. It never performs identity lookup.

Every result starts with the entity's type label, so a `displayName` or a log
description can be read on its own: `Module 'RX MFC' (0x0000A1B2)`,
`Subgraph 'Speaker' (0x00000004)`. The label is the type name, except
`SpfModule` is `Module`, `KeyDefinition` is `Key`, and `ValueDefinition` is
`Value`. Templates do not repeat the type before a formatted reference
(`requested: Subgraph 'Mic capture' (0x00000010)`).

## 5. Identity Resolution

### 5.1 No hidden lookup

Formatters are pure. They do not query repositories, inspect a transaction, or
depend on the logger.

Ordinary entities are formatted from the entity or read model already held by
the caller.

### 5.2 Composite links

DataLink and ControlLink require endpoint identity that may not be present on
the link aggregate. Batched identity reads are methods on the existing query
services (§5.4), not a separate resolver port. Persistence implements them
using the active file/project/session scope.

```typescript
interface DataLinkQueryService {
  // ...existing query methods
  findDataLinkIdentities(
    scope: IdentityResolutionScope,
    links: readonly DataLink[],
  ): Promise<LinkIdentityResolution<'dataLink'>>;
}

interface ControlLinkQueryService {
  // ...existing query methods
  findControlLinkIdentities(
    scope: IdentityResolutionScope,
    links: readonly ControlLink[],
  ): Promise<LinkIdentityResolution<'controlLink'>>;
}
```

The identity reads:

- accepts effective link aggregates, not unscoped IDs;
- batches endpoint reads — in a single batched operation it resolves node type
  (Module or Subsystem), node name and natural ID, and port name and natural ID
  for every endpoint across all supplied links;
- respects project, file, and active-session isolation;
- returns resolved and unresolved results without changing business outcomes;
- never performs one query per entity; and
- does not run from inside a formatter or logger adapter.

Routing may build one immutable, request-local identity map after loading its
effective graph. Pure phases consume that map and perform no persistence I/O.

**Module and Subsystem identity reads.** Code that holds only node system IDs
(for example topology from `getAllNodesWithParents()`, which returns
`{systemId, parentSystemId, type}`) resolves identity through the concrete
entity's query service. There is no node identity read:

```typescript
interface SpfModuleQueryService {
  // ...existing query methods
  findSpfModuleIdentities(
    scope: IdentityResolutionScope,
    spfModuleSystemIds: readonly number[],
  ): Promise<ReadonlyMap<number, SpfModuleIdentity>>;
}

interface SubsystemQueryService {
  // ...existing query methods
  findSubsystemIdentities(
    scope: IdentityResolutionScope,
    subsystemSystemIds: readonly number[],
  ): Promise<ReadonlyMap<number, SubsystemIdentity>>;
}
```

The caller splits node IDs by the node type it already holds and calls both
reads in parallel. Command handlers reach them through
`uow.getModuleRepository()` (which returns SPF modules and extends
`SpfModuleQueryService`) and `uow.getSubsystemRepository()` (which extends
`SubsystemQueryService`), per §5.4. The empty placeholder `ModuleQueryService`
is not used.

References always carry the concrete entity type: `SpfModule` or `Subsystem`,
never a generic `Module` or `Node`. Today a node of type `module` is an SPF
module. Driver modules will have their own repository and query service, with
a matching `findDriverModuleIdentities` and the `DriverModule` entity type. An ID missing from the returned map uses the §4.2
fallback. The same session overlay used for the topology read applies, so
identity is read from the same view that produced the IDs. The link identity
reads above use the same per-entity resolution internally for their endpoints.

### 5.3 Routing issue identity sources

The §4.2 fallback is only for entities that are actually missing. If an entity
exists but its identity has not been loaded yet, the code that creates the
issue must load it with a batched identity read. Reads that are only needed
for an issue run on the failure path only, so successful routing costs
nothing extra.

Every identity comes from one of these sources:

- **Snapshot:** the routing identity map (§5.2), built after the effective
  graph is loaded. It covers subgraphs, UseCases, links, subsystems, and the
  key and value definitions referenced by the graph.
- **Pre-snapshot read:** a batched read in the producing service, for issues
  raised before the snapshot exists.
- **Committed read:** an entity deleted in the current session no longer
  exists in the session view but still exists in committed data. Its identity
  is read with `READ_MODE.Committed`.
- **Fallback:** the entity is missing from both views (§4.2).

| Producer | Entities in the message | Identity source |
|---|---|---|
| `IssueFactory.notFound` from `resolveRoutingLinkSelection` and `RoutingGraphSnapshotBuilder` | caller-supplied link or subgraph that was not found | fallback |
| `duplicateActiveSubgraphSelections` | caller-selected subgraphs | snapshot; move the check after `getSubgraphRepository().getAggregates(...)`; fallback for any that do not exist |
| `dataLinkIntegrity` | the data link; its missing endpoint subgraph | link: `findDataLinkIdentities`; endpoint: fallback |
| `incompleteDataChain`, `incompleteControlChain` | start module, reachable modules and subsystems; subsystem-link segments | nodes: pre-snapshot read with `findSpfModuleIdentities` / `findSubsystemIdentities`; segment IDs move to structured context, not text |
| `additionScopeConflict` | subgraphs and links added by the request but missing from the routing input | snapshot when they exist in the file; fallback otherwise |
| `mdfKvAssigned`, `islandDetected`, `cycleDetected`, `orphanSubgraph`, `orphanSubgraphHasKvs` | subgraph | snapshot |
| `orphanSubsystem` | subsystem | snapshot |
| `orphanDataLink`, `orphanControlLink` | link | snapshot |
| `multipleEcConnectionsInUsecase` | UseCase; EC data links | snapshot |
| `multipleEcConnectionsOnPath`, `manualCycleDetected` | path subgraphs; data links | snapshot |
| `ecBridgeIncompatible`, `noValidCombination` | path subgraphs; data links; key definitions | snapshot |
| `sgkvMalformed` | subgraph; value definitions | snapshot |
| `sgkvValuesNotFound` | subgraph; values missing from the file definitions | subgraph: snapshot; values: fallback |
| `deletionSelectionRequired`, `deletionScopeIncomplete` | UseCases; subgraphs and links missing from the routing input | snapshot when present in the file; fallback otherwise |
| `usecaseAutoIsland` | UseCase; subgraph pairs; data links deleted in this session | UseCase and subgraphs: snapshot; deleted links: committed read |
| `manualUsecaseDependenciesBroken` | UseCase; subgraphs and links that no longer exist or were deleted in this session | UseCase: snapshot; deleted in session: committed read; otherwise fallback |
| `sameGkvChoiceRequired` fix-option descriptions | UseCases; subgraphs and subgraph pairs | snapshot |
| `manualGkvConflict` | GKV values; UseCases; requested subgraphs and pairs | snapshot |
| `interUsecaseEndpointUncovered` | inter-UseCase link; endpoint subgraph | snapshot |
| `stagingPairEndpointMissing` | subgraph pair absent from the resulting UseCase | snapshot (the subgraphs exist; they are missing from the UseCase, not from the file) |

**Values that are not entities.** Some messages include identifiers that are
not entities. They are not shown as raw values:

| Value | Used by | In text | In structured context |
|---|---|---|---|
| `collisionId` | `sameGkvChoiceRequired`, `sameGkvChoiceStale`, fix-option IDs | the collided GKV: `Same-GKV collision for <GKV identity>` | `collisionId` stays in `params` and `commandPayload` |
| edit-action `changeId` | `manualUsecaseDependenciesBroken`, `multipleManualGkvOverrides` | the edited UseCase identity, or `a pending manual UseCase edit` when the edit has no UseCase | `changeId` / `changeIds` stay in `params` and `commandPayload` |
| `alternativeId` | `sameGkvChoiceRequired` fix options | the candidate number (`candidate 2`), as today | `alternativeId` stays in `commandPayload` |
| `pairCount` | `multipleEcConnectionsInUsecase` | omitted; the EC data links are listed by identity | `params` |

Any system ID that does appear in text (fallback only) uses
`BinaryUtils.toHexString()`. Lists of system IDs that the client needs for an
action move to `relatedEntities` or `commandPayload`; they are not repeated in
the message.

### 5.4 Where identity reads live (CQRS)

The existing CQRS split stays. `CommandBus.execute` keeps owning session
policy, unit-of-work creation and release, `setWriteContext`, rollback, and
command logging. Manual handler registration (needed for React Native) is
unchanged.

Command handlers must read identity that includes writes made earlier in the
same transaction. To give them that without a second read port, each
repository extends the full query service for its entity:

```typescript
interface UsecaseRepository extends UseCaseQueryService {
  // existing write methods
}
```

- **Commands** read identity through the repository obtained from their unit
  of work, so they see their own writes already applied to the transaction
  (see "Pending change cache" below).
- **Queries** keep using the query services directly.
- **Persistence** implements the shared query methods once, in the existing
  overlay fetchers (for example `UsecaseOverlayFetcher`), and both the
  TypeORM repository and the `Db*QueryService` delegate to them. No query logic
  is duplicated.

**Repositories in scope.** These are the unit-of-work repositories that the
routing handlers (`create-usecases`, `create-manual-usecases`,
`resolve-same-gkv-collision`) and their services use, plus the one routing
needs for key and value names. No method name is shared between a repository
and its query service today, so extending does not conflict.

| Unit-of-work getter | Repository | Extends | Persistence delegates to | Identity read added in Phase 5 |
|---|---|---|---|---|
| `getUsecaseRepository()` | `UsecaseRepository` | `UseCaseQueryService` | `UsecaseOverlayFetcher` | — |
| `getSubgraphRepository()` | `SubgraphRepository` | `SubgraphQueryService` | `SubgraphOverlayFetcher` | — |
| `getDataLinkRepository()` | `DataLinkRepository` | `DataLinkQueryService` | `LinkOverlayFetcher` | `findDataLinkIdentities` |
| `getControlLinkRepository()` | `ControlLinkRepository` | `ControlLinkQueryService` | `LinkOverlayFetcher` | `findControlLinkIdentities` |
| `getSubsystemRepository()` | `SubsystemRepository` | `SubsystemQueryService` | `SubsystemOverlayFetcher` | `findSubsystemIdentities` |
| `getModuleRepository()` | `ModuleRepository` (SPF modules) | `SpfModuleQueryService` | `SpfModuleOverlayFetcher` | `findSpfModuleIdentities` |
| `getKeyValueDefinitionRepository()` (**new**) | `KeyValueDefinitionRepository` (read-only) | `KeyValueDefQueryService` | `DbKeyValueDefQueryService` (no overlay) | — |

- **Key and value definitions.** No command reads them today; only two key
  definition query handlers do. Routing needs them for UseCase GKV identity,
  `ValueDefinition` references, and key definitions in
  `ecBridgeIncompatible` and `noValidCombination`. Definitions are not edited
  in a session, so the new repository has no write methods and no overlay
  fetcher. It uses the existing `getKeyValueSummaryForGivenValues` (§4.3).
- **SPF module identity** needs the module definition name (§4.3).
  `findSpfModuleIdentities` reads it in the same batched query, so
  `ModuleDefinitionRepository` does not change.
- **One method per read (implementation note).** Extending must not leave two
  methods that read the same thing. Today the repositories and query services
  overlap, for example:
  - `UsecaseRepository.findAll(fileSystemId)` and
    `UseCaseQueryService.getAllUseCases(fileId)`;
  - `UsecaseRepository.findBySystemIds(fileSystemId, ids)` and
    `UseCaseQueryService.getUsecasesWithGkv(fileId, ids)`;
  - `ModuleRepository.findModuleById(systemId, fileSystemId)` and
    `SpfModuleQueryService.getSpfModule(...)` / `getSpfModules(...)`;
  - `ModuleRepository.findModulesBySubgraphIds(ids, fileSystemId)` and
    `SpfModuleQueryService.findBySubgraphId(id, fileSystemId)`.

  They also differ in naming (`find` / `get`, `fileId` / `fileSystemId`),
  parameter order, single versus batch input, and errors (`Result<T>` versus
  throwing). Before each repository is changed, its plan lists every read
  method on the repository and the query service, with its return shape and
  callers, and decides for each overlap:
  - **Same data:** keep one method, on the query service, and move the
    callers to it. The repository inherits it.
  - **Different data:** keep both only when the repository method loads an
    aggregate that the command then changes (`UseCase`, `SpfModule`), and the
    query method returns a read model for display or decisions. Name each for
    what it returns, so the difference is visible.
  - **Single and batch variants:** keep the batch form only.
  - **Conventions:** applied to the methods that remain (see "Read method
    naming" below).

  The goal is small, clean interfaces: each read exists once, and a repository
  adds only the write methods and aggregate loads that commands need.
- **Read method naming.** The verb says what happens when data is missing:

  | Prefix | Meaning | When an entity is missing | Example |
  |---|---|---|---|
  | `get…` | the caller expects it to exist | returns a not-found `Result` error | `getUseCases(scope, systemIds)` fails if any ID is missing |
  | `find…` | it may not exist | returns `null`, an empty list, or a partial map | `findSpfModuleIdentities(scope, systemIds)` returns only the IDs it found |

  `get` is the default; use `find` only when a missing result is normal. The
  identity reads (`findDataLinkIdentities`, `findControlLinkIdentities`,
  `findSpfModuleIdentities`, `findSubsystemIdentities`) are `find` reads
  because missing IDs use the §4.2 fallback. In addition:
  - batch reads have plural names (`getUseCases`) and are the only form;
  - parameters are scope first, then IDs, then options;
  - the file parameter is `fileSystemId`, never `fileId`; and
  - each interface uses one error style for all its reads.
- **Out of scope:** `ContainerRepository`, `ModuleDefinitionRepository`,
  `VcpmDefinitionRepository`, `ProjectRepository`, `BulkImportRepository`,
  `ValidationPreferencesRepository`, and `ISessionRepository`. Routing does not
  report identities through them. Phase 6 extends one when a converted
  producer needs a command-side identity read for that entity.

No `CommandReadService` or identity-projection port is introduced. The
existing lint rule `custom/no-query-services-in-command-handler` already
enforces that handlers read only through unit-of-work repositories.

**Pending change cache.** `PendingChangeCache` holds edit-action mutations of
a single command only; it never spans commands. `TypeOrmUnitOfWork.commit()`
flushes it (`applyCachedActions()`) and then commits, so other operations see
the writes only if the command commits. The cache is not a read layer: reads
inside the command do not see mutations that are still cached. Therefore:

- **Failed commands** roll back, so their errors never depend on the command's
  own writes. They describe entities from the IDs and input supplied with the
  command, using the `systemId` fallback (§4.2, §5.3) when an entity is not
  found.
- **Successful commands** that report warnings about entities they created or
  changed set `EntityRef.identity` in the fact from the data they already hold.
  The renderer does not look those entities up and does not flush the cache.

### 5.5 Type placement

Types are split into a write group and a read group. Each lives in one place.

| Group | Contents | Location |
|---|---|---|
| Shared record | per-entity `XxxRecord` (the persisted field set shared by write and read types) | next to the entity, e.g. `domain/entities/usecase-data/usecase/usecase.record.ts` |
| Write | entities, `*Init` (e.g. `UseCaseInit extends UsecaseRecord`), write inputs, write results | `domain/entities/...` and the owning application module |
| Identity | `EntityRef<T>`, `EntityIdentityMap`, `IdentityFor<T>`, `NamedNaturalId`, `NamedKeyValue`, `PortIdentity`, `LinkEndpoint` (§4.4); used by issue facts and returned by read methods | `domain/identity/` |
| Read | facets (`WithGkv`, `WithSubgraphs`, `WithLinks`), `ReadOptions` | `application/read-models/<entity>/`; shared types in `application/read-models/common/` |
| Persistence rows | TypeORM entity schemas | infrastructure only |
| API DTOs | wire classes and mappers | API layer only |

### 5.6 Null versus optional

One rule applies to every field touched by this phase:

- `field?: T` means the field is truly optional. It is omitted on the wire.
- `field: T | null` means null has a domain meaning. It is sent as `null`.
- A field never uses both (`field?: T | null` is not allowed).
- No empty-string sentinel: a missing name is `null` (or omitted, for `?`
  fields), never `''`. Mappers stop substituting `''`.

Persistence rows follow their column: a nullable column is `T | null`, a
non-null column is `T`, and row fields never use `?`. Mappers convert a row
`null` to an omitted field when the domain field is optional.

Decisions for the routing scope:

| Field | Today | Phase 1 |
|---|---|---|
| `UseCase.type` | `UseCaseInit`/`UseCase` `type?`; `UseCaseReadModel` `type?: UsecaseType \| null`; `OverlaidUseCase` `UsecaseType \| null`; row `type?`, nullable column. Import leaves it unset when UI metadata has no match (`usecase-builder.ts`). | **Required** `type: UsecaseType` in every layer; non-null column (§11). Import always derives the type with `usecase-type-classifier.ts`, the same classifier routing uses; the derived value wins over any type in UI metadata. |
| `UseCase.alias`, `UseCase.aliasId` | domain and read model `?`; row and change-details snapshot `\| null`. Independent: the parser accepts an alias ID without a name. | Domain, read model, wire: `alias?: string`, `aliasId?: number`, independent. Change-details snapshot keeps `T \| null` (null means "no alias in this before/after state"). Row: `T \| null`. |
| `UseCase.orderedKeys` | domain `Array<{naturalId}>?`; row `string?`, nullable column | Domain `orderedKeys?` (absent means key-vector file order). Row `string \| null`. |
| `SubsystemDataLink.dataLinkSystemId`, `SubsystemControlLink.controlLinkSystemId` | domain `number \| null`; row `number`, non-null column | Edit-action payloads keep `number \| null` (null means the chain is not resolved yet). Committed rows stay `number`; a committed segment always has a link. Both types document this. |
| `SpfModule.alias` | domain `?`; row `string \| null`, nullable column; read model `string` via `alias ?? ''` | `alias: string \| null` in domain, read model, and row; sent as `null`. Remove the `?? ''` fallback. |
| `DataPort.name`, `ControlPort.name` | `DataPort` `string \| null` (constructor `?: string \| null`); `ControlPort` `?`; node read model `string` via `''` fallback; SPF-port read model `string \| null`; API schema `string \| null` but mapper sends `''` | `name: string \| null` for both ports in domain, read models, row, and wire. Empty input is stored as `null`. Remove every `''` fallback, so the node read model and the API send `null` (**API change**). Import may still generate names, but a port name is not guaranteed. |

### 5.7 Layer boundaries (lint)

The root `eslint.config.js` gains a `no-restricted-imports` configuration that
enforces the placement in §5.5. It replaces the custom
`custom/no-domain-infrastructure-deps` rule, whose bans move into the domain
row; the built-in rule also covers `export … from` and package subpaths, which
the custom rule missed:

| Files | Must not import |
|---|---|
| `packages/core/src/domain/**` | `packages/core/src/application/**`; infrastructure and API packages; `typeorm`, `express` |
| `packages/core/src/shared/**` | `packages/core/src/application/**`, `packages/core/src/domain/**` |
| `packages/core/src/application/read-models/**` | infrastructure and API packages |

The rule is added as `error` with no allowlist. The existing violations are
fixed in the same change by moving the imported types down a layer:

- `domain/entities/common/entities/header.entity.ts` imports
  `application/file-operations/shared/acdb-chunks/header-chunk.js`;
- `domain/entities/definitions/common/types/element-data.ts` imports
  `application/.../definitions/common/type/data-type.js` and
  `application/usecase-designer/shared/element-definition.js`;
- `shared/dto/property-dto.ts` imports
  `application/usecase-designer/shared/element-definition.js` and
  `property-read-model.js`.

## 6. Core Logger Contract

### 6.1 Write contract

The core `Logger` method set remains unchanged. `LogData` becomes an independent
write shape rather than inheriting producer identity from a persisted/read
model:

```typescript
interface LogData {
  readonly eventName: string;
  readonly description: string;
  readonly component: string;
  readonly tag: string;
  readonly timestamp?: Date;
  readonly error?: Error;
}

interface Logger {
  logVerbose(data: LogData): void;
  logDebug(data: LogData): void;
  logInfo(data: LogData): void;
  logWarn(data: LogData): void;
  logError(data: LogData): void;
  logCritical(data: LogData): void;
}
```

`timestamp` is optional: `PinoLogService` sets it to the time of the log call
when it is omitted, as Pino and OpenTelemetry do. A caller passes it only for
an event that happened earlier than the call. It is set at the call, not when
the record is stored, because the SQLite transport writes in batches.

All callers were moved to this contract in one step in Phase 1 (§13.1); there
is no legacy call shape.

Core does not provide:

- `source`;
- authenticated client identity;
- producer/resource identity;
- request or correlation identity; or
- trace/span identity.

### 6.2 Producer and client-instance identity

`source` used to answer two questions in one column: which program wrote the
record (`Server` or a client) and which client a server record belonged to
(the authenticated client ID). HTTP lifecycle logs and worker task errors were
written by the server but stored with the client ID, so neither
`source = 'Server'` nor `source = clientId` gave a correct answer. This phase
removes `source` and stores the two answers separately, following the
OpenTelemetry Logs Data Model and its resource attributes.

| Column | Question | OpenTelemetry name | Set by |
|---|---|---|---|
| `service_name` | Which program wrote this record? | resource `service.name` | logger infrastructure (server) or the client-log endpoint (client) |
| `service_instance_id` | Which running instance of it? | resource `service.instance.id` | the same |
| `client_name` | Which client does this record belong to? | ARC attribute `client.name` | the access token (both sides) |
| `client_instance_id` | Which client launch does this record belong to? | ARC attribute `client.instance.id` (HLD §8.4) | the request context (server) or the submitted body (client) |

Example with one UI launch `6aa7...` calling one API process `91c2...`:

| Record | `service_name` | `service_instance_id` | `client_name` | `client_instance_id` |
|---|---|---|---|---|
| UI log "Save clicked" | `audioreach-creator-ui` | `6aa7...` | `audioreach-creator-ui` | `6aa7...` |
| API log "usecase.create.succeeded" | `audioreach-creator-api` | `91c2...` | `audioreach-creator-ui` | `6aa7...` |

`service_instance_id` always identifies the writer. A server record never
stores the UI's ID there, because that would claim the UI wrote it. A client
record stores its own name and launch in both pairs of columns, so
`client_instance_id = service_instance_id` and `client_name = service_name`
mark it as written by the client; any other record was written by the server.
Readers get this as `origin` (`CLIENT` or `SERVER`), never as raw resource
columns (§10). Because `client_name` and `client_instance_id` are filled on
both sides, one filter on them finds the client's own records and the server
records written for it.

**Client name.** Registration requires a `clientName` (at most 256
characters, for example `audioreach-creator-ui`), which is signed into the
access token with the `clientId`. A client cannot choose the API's own name,
`audioreach-creator-api` (`DEFAULT_SERVICE_NAME`), so no client record can
look as if the server wrote it (OpenTelemetry LLD §16.3). A token without a
`clientName` is rejected with 401, so clients holding an older token must
register again. The registration `clientId` is used only for authentication;
it is not a telemetry identity or a log-ownership key (HLD §8.3).

**Server producer identity.** The API composition root builds one
`LogProducerIdentity` at startup. Its two fields are the OpenTelemetry resource
attributes `service.name` and `service.instance.id`; the type is named for what
it holds, not after the standard:

```typescript
interface LogProducerIdentity {
  readonly serviceName: string;       // OTEL_SERVICE_NAME, default 'audioreach-creator-api'
  readonly serviceInstanceId: string; // randomUUID() once per process
}
```

`OTEL_SERVICE_NAME` is the standard OpenTelemetry environment variable for the
service name, so the later OpenTelemetry SDK reads the same setting.

`PinoLogService` receives it through its constructor and adds both fields to
every record. Worker task errors are logged by the parent process, so they
carry the API resource until workers log on their own (OpenTelemetry LLD §10).

**Client instance header.** The UI generates one UUID per launch, its own
`service.instance.id`, and sends it on every request:

```http
X-ARC-Client-Instance-Id: 6aa7bf9e-2d6f-4df7-b87b-9812a493bc52
```

- `RequestLoggerMiddleware` validates the value as a UUID and lower-cases
  it. A missing or invalid value is ignored and the request proceeds; the
  value is never used for authorization. `POST /logs` is the exception: it
  needs the launch for the record it stores, so it rejects a missing header
  (400 `ERR_1002`) or a non-UUID value (400 `ERR_1004`) through the
  `@ClientInstanceId()` parameter decorator (§7).
- The middleware runs the rest of the request inside a request-scoped context:
  `logContext.run({clientInstanceId}, next)`. It reads neither the token nor
  the URL.
- Later stages add what they learn to that same context with
  `logContext.enrich(...)`, rather than opening a nested one, so the
  exception filters and the response log, which run outside any nested
  context, see the values too:
  - `ProjectLogContextGuard`, a global guard (`APP_GUARD`), adds the matched
    route's `:projectId` (at most 256 characters). Nest runs global guards
    before controller and route guards, so the authentication 401 and the
    `SessionGuard` 403 carry it. It never rejects a request.
  - `JwtStrategy.validate` adds the client name once the token signature
    and expiry are verified. A token that fails verification adds nothing,
    so a forged name never reaches the logs.
- Records written before routing (`incomingRequest`, `requestHeaders`) and
  records of a request that matches no route carry
  neither value; their `tag` links them to the request's later records.
- `PinoLogService` reads the context when it writes a record and stores
  `client_name`, `client_instance_id`, and `project_id`. The project comes
  only from the route; `LogData` has no `projectId`. Records written outside
  a request, such as startup, have none.
- The context is an infrastructure-only port, `ActiveLogContextProvider`
  (OpenTelemetry LLD §8.1) with `current()`, `run(context, fn)`, and
  `enrich(values)`. `enrich` changes the context of the innermost active
  `run` for all of that run's code, including code already scheduled; it
  never reaches an outer or concurrent run, ignores `undefined` values, and
  does nothing outside a `run`. Every context `current()` returns is frozen.
  Phase 1 implements the port with Node `AsyncLocalStorage`, storing one
  mutable slot per `run`. The OpenTelemetry phase replaces the implementation
  with the OpenTelemetry context, which uses `AsyncLocalStorage` internally,
  so there is never a second context store.
- `NodeWorkerPoolAdapter` binds its result and error callbacks to the async
  context of the submitting call (`AsyncResource.bind`), so worker task errors
  logged by the parent keep the originating `client_instance_id`. This is the
  phase 1 form of the parent-side correlation in FR-ILE-13 and does not touch
  the worker task contract.

**Core.** Core `LogData` has none of these fields, and core never reads the
context. Core call sites stay unchanged when trace and span IDs are added
later (OpenTelemetry LLD §5.4).

### 6.3 Event fields in this phase

- `eventName` is the stable, low-cardinality event name. New names use a
  dot-separated `<domain>.<operation>.<outcome>` convention and never contain
  entity IDs or other per-occurrence values. Names are lowercase, and words
  within a part are joined with underscores, as in the
  [OpenTelemetry naming rules](https://github.com/open-telemetry/semantic-conventions/blob/main/docs/general/naming.md)
  (for example, `command.transaction.rollback_failed`). They have no
  application prefix while logs stay in the application's own store.
  A `no-restricted-syntax` lint rule reports a string-literal `eventName`
  that does not match this convention, and any template-literal `eventName`
  (§13.1).
- `description` contains human-readable contextual detail.
- `component` identifies the emitting application component.
- `tag` remains the broad category.

`eventName` is the core/application contract name and maps directly to
OpenTelemetry `EventName` later. It is stored in the `event_name` column, which
replaces `msg` (§11). Pino's transport-level `msg` remains an adapter concern
and contains the human-readable `description`; it is not exposed as the event
identifier, and no API contract uses `msg`.

Do not add `action` in this phase. The distributed-observability design can
later decide whether action is a separate field or a structured attribute.

### 6.4 Best-effort behavior

The logger remains synchronous and non-throwing from the caller's perspective.
Serialization or transport failure must not fail a command, alter transaction
outcome, or replace the primary error.

## 7. Client-Submitted Logs

`POST /arc-api/v1/logs` stores logs written by a client. They are the client's
records, so they carry the client's own resource identity, never the server's
(HLD §10.1).

Request DTO (breaking change; `msg` is removed):

| Field | Type | Rule |
|---|---|---|
| `level` | `LogLevel` | required |
| `eventName` | string | required, at most 256 characters |
| `description` | string | required; no field limit (see below) |
| `component`, `tag` | string | required, at most 256 characters each |
| `timestamp` | ISO-8601 string | required; when the client produced the record |
| `projectId` | string | optional |
| `error` | string | optional; no field limit (see below) |

Neither the client name nor the launch is a body field. The name comes from
the access token and the launch from the required `X-ARC-Client-Instance-Id`
header (§6.2). Unknown fields are rejected with 400, so `msg`, `serviceName`,
`serviceInstanceId`, `clientName`, and `clientInstanceId` cannot be sent.

**Why the launch comes from the header.** Clients send only records of the
launch that is running, so the record's launch is always the request's
launch. One source means the two cannot disagree. A body field would be
needed only for resending records of an earlier launch, which no client does;
it can be added back as an optional field, defaulting to the header, if one
does.

**Size limits.** The whole request is bounded by the HTTP JSON body limit
(Express default, 100 KB; larger bodies get 413). On top of that, only the
short identifier-like fields that are filtered or grouped on (`eventName`,
`component`, `tag`) have a per-field limit of 256 characters.
Free text (`description`, `error`) has no per-field limit. This follows common
practice (OWASP input validation: bound every input; per-field limits on
keys, request-level limits on free text).

**Why the name comes from the token.** A body field would let one client
write records under another client's name, or under the server's. The name is
checked once, at registration (§6.2), and then travels in the signed token.

The endpoint does not use the core `Logger`, because core `LogData` describes
the server's own records. It uses an infrastructure-only writer in
`infrastructure/logger`:

```typescript
interface ClientLogWriter {
  write(record: ClientLogRecord): void; // DTO fields after validation
}
```

`PinoClientLogWriter` writes through the same Pino instance and SQLite
transport. It stores the token's client name in `service_name` and
`client_name`, and the header's launch ID in `service_instance_id` and
`client_instance_id` (§6.2). The JWT `clientId` is not stored.

TODO(OpenTelemetry): Add client trace context and observed time when
implementing Section 11.5 of the OpenTelemetry Adoption LLD. The preferred end
state is OTLP export from the UI and deprecation of this endpoint.

## 8. User-Facing Errors and Issues

### 8.1 Messages and machine context

Each issue contains:

- a stable issue code;
- severity and existing blocking/fix semantics;
- a complete human-readable message; and
- optional code-specific structured context.

Clients branch on issue code and consume typed context. They do not parse
message text.

`FixOption.description` and `ClientInputSpec.label` are user-facing text and
follow the same natural-identity rules as `issue.message`. Known entities use
natural identity without persistence system IDs, and use the §4.2 fallback
only when natural identity is missing.

### 8.2 Entity references

Issue context uses the same natural-identity vocabulary as logs. A reference
carries the entity's system ID, for selection and follow-up commands, and one
display string. The UI shows `message` and `displayName`; it never builds
identity text from other fields.

On the wire, `systemId` stays a **decimal string** (`String(systemId)`).
Hexadecimal appears only in text: messages, log descriptions, and
`displayName`. Clients treat `systemId` as opaque.

```typescript
interface ApiEntityRef {
  readonly entityType: IssueEntityType;
  readonly systemId: string;    // decimal, String(systemId)
  readonly displayName: string; // always filled by the renderer
}
```

`displayName` is the §4.3 identity, or the §4.2 fallback, so it already
contains the alias and natural IDs when they exist. A reference has no separate
`alias` or `naturalId` field. This is the usual shape of a reference in an API
response: an opaque ID for machines and one display string for people. A field
can be added later if a client needs it; removing one would break clients.

`ISSUE_ENTITY_TYPE` gains `ValueDefinition` so GKV values can be referenced.

### 8.3 Issue facts and rendering

Issue creators produce **facts**. A renderer turns facts into the rendered
`Issue`. Creators no longer build message text. The field names are the same
in every layer (`impactedEntity`, `relatedEntities`, `params`,
`impactedUsecases`, `fixOptions`); only the entity-reference type changes.

| Layer | Issue | Entity reference | Fix option |
|---|---|---|---|
| Domain (`domain/issues/`) | `IssueFact<C>` | `EntityRef<T>` | `FixOptionFact<C>` |
| Application (`application/issues/`) | `Issue<C>` | `RenderedEntityRef` | `RenderedFixOption<C>` |
| API | per-code `ApiIssueItem` variant (§8.4) | `ApiEntityRef` | `ApiFixOption` |

**Per-code context.** One map in `domain/issues/` declares, for each issue code
that has context, its related entities, parameters, and fix-option kinds.
Codes are keyed by their wire value (`ISSUE_CODE.*`):

```typescript
// domain/issues/issue-context-map.ts
type NoContext = Record<never, never>;
type ParamValue = string | number | boolean | readonly (string | number)[];

interface IssueContextMap {
  [ISSUE_CODE.ROUTING_MANUAL_GKV_CONFLICT]: {
    relatedEntities: {
      gkvValues: readonly EntityRef<'ValueDefinition'>[];
      subgraphs: readonly EntityRef<'Subgraph'>[];
    };
    params: NoContext;
    fixOptions: NoContext;
  };
  [ISSUE_CODE.ROUTING_SAME_GKV_CHOICE_REQUIRED]: {
    relatedEntities: {gkvValues: readonly EntityRef<'ValueDefinition'>[]};
    params: {collisionId: string};
    fixOptions: {
      SELECT_CANDIDATE: {
        relatedEntities: {subgraphs: readonly EntityRef<'Subgraph'>[]};
        params: {candidateNumber: number};
      };
      KEEP_EXISTING: {
        relatedEntities: {
          usecase: EntityRef<'UseCase'>;
          subgraphs: readonly EntityRef<'Subgraph'>[];
        };
        params: NoContext;
      };
      MERGE_ALL: {
        relatedEntities: {
          usecase?: EntityRef<'UseCase'>;
          subgraphs: readonly EntityRef<'Subgraph'>[];
        };
        params: NoContext;
      };
    };
  };
  // one entry per converted code
}

type ContextFor<C extends IssueCode> = C extends keyof IssueContextMap
  ? IssueContextMap[C]
  : {relatedEntities: NoContext; params: NoContext; fixOptions: NoContext};
```

`relatedEntities` values are `EntityRef` or arrays of them; `params` values
are `ParamValue`. A code without an entry has no context. Fix-option kinds
are the existing `COLLISION_RESOLUTION_MODE` values for same-GKV collisions,
written as literals because domain cannot import application.

**Facts.**

```typescript
// domain/issues/ (EntityRef is imported from domain/identity/, §4.4)
interface IssueFact<C extends IssueCode = IssueCode> {
  readonly code: C;
  readonly severity: IssueSeverity;
  readonly category?: IssueCategory;
  readonly impactedEntity?: EntityRef;
  readonly relatedEntities: ContextFor<C>['relatedEntities'];
  readonly params: ContextFor<C>['params'];
  readonly impactedUsecases?: readonly EntityRef<'UseCase'>[];
  readonly fixOptions?: readonly FixOptionFact<C>[];
}

type FixOptionFact<C extends IssueCode = IssueCode> = {
  [K in keyof ContextFor<C>['fixOptions']]: {
    readonly id: string;               // e.g. "delete-duplicate-link"
    readonly kind: K;                  // selects the description template
    readonly relatedEntities: ContextFor<C>['fixOptions'][K]['relatedEntities'];
    readonly params: ContextFor<C>['fixOptions'][K]['params'];
    readonly commandType: string;
    readonly commandPayload: Readonly<Record<string, unknown>>;
    readonly requiredClientInputs: readonly ClientInputSpec[];
  };
}[keyof ContextFor<C>['fixOptions']];
```

- The code fixes the shape of `relatedEntities`, `params`, and each fix
  option, so a code and its context cannot be mismatched.
- A creator sets `EntityRef.identity` when it already holds the identity. It
  must set it for an entity that cannot be looked up later: an entity whose
  insert failed, or an entity created or changed by the current command whose
  write may still be in the pending change cache (§5.4).
- The fix-option ID field is renamed from `systemId` to `id`, as on the wire;
  it is not an entity system ID.
- `ClientInputSpec.label` is fixed text that describes the input. It never
  names an entity.
- `commandPayload` keeps numeric system IDs and is not rendered.
- `domain/issues/` contains only fact types. Rendered types, `IssueRenderer`,
  the per-code templates, and `IdentityFormatter` live in
  `application/issues/`.

**Rendered issue.** Same shape, with text added and every `EntityRef` replaced
by a `RenderedEntityRef`:

```typescript
// application/issues/
interface RenderedEntityRef {
  readonly entityType: IssueEntityType;
  readonly systemId: number;
  readonly displayName: string; // IdentityFormatter.format; always filled
}

type Rendered<T> = T extends EntityRef
  ? RenderedEntityRef
  : T extends readonly EntityRef[]
    ? readonly RenderedEntityRef[]
    : {readonly [K in keyof T]: Rendered<T[K]>};

interface Issue<C extends IssueCode = IssueCode> {
  readonly code: C;
  readonly severity: IssueSeverity;
  readonly category?: IssueCategory;
  readonly message: string;
  readonly impactedEntity?: RenderedEntityRef;
  readonly relatedEntities: Rendered<ContextFor<C>['relatedEntities']>;
  readonly params: ContextFor<C>['params'];
  readonly impactedUsecases?: readonly RenderedEntityRef[];
  readonly fixOptions?: readonly RenderedFixOption<C>[];
}

// FixOptionFact<C> with `description: string` added and its relatedEntities
// rendered
type RenderedFixOption<C extends IssueCode = IssueCode> = /* ... */;
```

The API mapper converts `Issue` to its §8.4 wire variant only by changing
representation: every `systemId` becomes `String(systemId)`, and empty
`relatedEntities` and `params` are omitted.

**Rendering.**

- The renderer collects every `EntityRef` without `identity`, batches lookups
  per entity type, then applies the code's template for `message` and each fix
  option kind's template for `description`.
- In a command, it runs inside the handler before commit or rollback, using the
  unit-of-work repositories' read methods (§5.4). Queries render through query
  services.
- An entity that cannot be resolved uses the fallbacks in §4.2 and §5.3.
- `Result<T>` accepts only rendered issues. During migration it also accepts a
  deprecated `LegacyIssue` from producers not yet converted (§13.1).

**Producers converted to facts.** Converted factories keep their current inputs,
additionally receive the identity of each referenced entity (from the routing
identity map or the reads in §5.3), and stop producing text:

- `IssueFactory` (about 20 methods, about 44 call-site files);
- `RoutingIssueFactory` (about 30 methods, about 19 call-site files);
- domain validation rules;
- `newInsertFailureIssue`;
- `ArcDbFile.dataLossIssues` (see §8.5).

This split is a project design choice, not a named pattern. It applies the
same idea as Fowler's
[Notification](https://martinfowler.com/articles/replaceThrowWithNotification.html)
pattern: collect structured problems, present them at the boundary.

### 8.4 Wire changes

`ApiIssueItem` changes as follows. Issue APIs may change in this phase.

| Field | Before | After |
|---|---|---|
| `code` | `string` | discriminator of the per-code variant (below) |
| `impactedEntity` | `{entityType, systemId, displayName?}` | `ApiEntityRef` |
| `relatedEntities` | — | per-code object of `ApiEntityRef` or `ApiEntityRef[]`; omitted when the code has none |
| `params` | — | per-code object; omitted when the code has none |
| `impactedUsecases` | `number[]` | `ApiEntityRef[]`, **breaking** |
| `fixOptions[].kind` | — | per-code fix kind |
| `fixOptions[].relatedEntities`, `fixOptions[].params` | — | per fix kind, as on the issue |
| `fixOptions[].commandPayload` | numeric IDs | **unchanged** (machine contract) |

**OpenAPI: discriminated union on `code`.** `ApiResult<T>.issues` is an array
of `oneOf` per-code variants with `discriminator: {propertyName: 'code',
mapping}`:

- `ApiIssueItemBase` holds the shared fields (`code`, `severity`, `category`,
  `message`, `impactedEntity`, `impactedUsecases`, `fixOptions`).
- Each code with an `IssueContextMap` entry has its own DTO class that extends
  the base, restricts `code` to its single value, and declares typed
  `relatedEntities`, `params`, and fix-option classes.
- All other codes share one `ApiPlainIssueItem` variant with no
  `relatedEntities` or `params`. The discriminator `mapping` sends each of
  those codes to it; OpenAPI allows several values to map to one schema.
- One registry in the API layer, typed
  `satisfies Record<IssueCode, Type<ApiIssueItemBase>>`, lists the variant for
  every code. The `oneOf`, the `mapping`, and `@ApiExtraModels` are built from
  it, so adding a code without a variant fails to compile.
- Clients generated from the spec get a TypeScript union narrowed by `code`.
  A client treats an unknown `code` as a plain issue (show `message`), so new
  codes do not break older clients.
- A code moves from the plain variant to its own variant in the PR that
  converts its producer (Phase 4 or 6).

**Worked example.** A manual use case is requested with subgraphs
"Mic capture" and "Speaker out" and GKV `StreamType:Playback`, which existing
use case 412 (alias "Playback") already has.

The factory creates a fact; no identities are set because every entity exists:

```typescript
{
  code: 'ARC-ROUTING-MANUAL-GKV-CONFLICT',
  severity: 'ERROR',
  relatedEntities: {
    gkvValues: [{entityType: 'ValueDefinition', systemId: 77}],
    subgraphs: [
      {entityType: 'Subgraph', systemId: 101},
      {entityType: 'Subgraph', systemId: 102},
    ],
  },
  params: {},
  impactedUsecases: [{entityType: 'UseCase', systemId: 412}],
}
```

The renderer batches one identity read per entity type, fills each
`displayName`, and applies the template for `message`. The API mapper turns
each `systemId` into a string and omits the empty `params`:

```json
{
  "code": "ARC-ROUTING-MANUAL-GKV-CONFLICT",
  "severity": "ERROR",
  "message": "Manual UseCase topology conflicts with UseCase 'Playback' [StreamType:Playback, DeviceRx:Speaker] (requested: Subgraph 'Mic capture' (0x00000010), Subgraph 'Speaker out' (0x00000011); requested pair: Subgraph 'Mic capture' (0x00000010) -> Subgraph 'Speaker out' (0x00000011)).",
  "relatedEntities": {
    "gkvValues": [
      {"entityType": "ValueDefinition", "systemId": "77",
       "displayName": "Value StreamType:Playback (0x0000A1B2:0x00000001)"}
    ],
    "subgraphs": [
      {"entityType": "Subgraph", "systemId": "101", "displayName": "Subgraph 'Mic capture' (0x00000010)"},
      {"entityType": "Subgraph", "systemId": "102", "displayName": "Subgraph 'Speaker out' (0x00000011)"}
    ]
  },
  "impactedUsecases": [
    {"entityType": "UseCase", "systemId": "412",
     "displayName": "UseCase 'Playback' [StreamType:Playback, DeviceRx:Speaker]"}
  ]
}
```

Today the same issue reads `Manual UseCase topology conflicts with another
topology for GKV values [77] (requested members: [101, 102]; requested pairs:
[101->102]).` and carries only `impactedUsecases: [412]`.

**How a client uses an issue.**

| Field | Client use |
|---|---|
| `code` | Choose behaviour; narrows the TypeScript type. Never parse `message`. |
| `severity`, `category` | Icon, and whether the issue blocks the user. |
| `message` | Show as is. |
| `impactedEntity.systemId` | Select or highlight the entity. |
| `relatedEntities.<key>[].systemId` | Highlight the other entities involved. |
| `displayName` | Labels in lists and tooltips. |
| `impactedUsecases` | Mark the affected use cases. |
| `params` | Code-specific values, for example `collisionId`. |
| `fixOptions[]` | Show `description` as an action. On selection, collect `requiredClientInputs`, then send `commandType` and `commandPayload` unchanged. |

Rules:

- `impactedUsecases` is sent only when it is not empty. The mapper treats `[]`
  as absent, and creators stop setting `[]`.
- Same-GKV collision issues have no `impactedEntity`. The colliding GKV values
  go in `relatedEntities.gkvValues`, and each fix option names its candidate's
  subgraphs in `relatedEntities.subgraphs`. Subgraph pairs stay in the
  description text and `commandPayload`.
- New candidates have no `systemId`, so a collision lists at most the existing
  or staged use cases. `impactedUsecases` is therefore absent when only new
  candidates collide:

| Situation | Code | `impactedUsecases` |
|---|---|---|
| Auto: two or more new candidates, no existing use case | `ROUTING_SAME_GKV_CHOICE_REQUIRED` | absent |
| Auto: existing use case plus a different candidate | `ROUTING_SAME_GKV_CHOICE_REQUIRED` | the existing use case |
| Auto: one staged manual use case has the GKV | no issue (the manual edit wins) | — |
| Auto: two or more staged manual use cases | `ROUTING_MULTIPLE_MANUAL_GKV_OVERRIDES` | the staged use cases |
| Manual: two candidates in one request, nothing existing | `ROUTING_MANUAL_GKV_CONFLICT` | absent |
| Manual: candidate conflicts with an existing or staged use case | `ROUTING_MANUAL_GKV_CONFLICT` | that use case |

### 8.5 Data-loss issues: stored, not re-rendered

Data-loss issues are the one exception to "render at the end of the command".
The entities they describe were never inserted, and the parsed file is gone
once the upload command finishes. They cannot be looked up later.

| Step | Data-loss behaviour |
|---|---|
| Create | Creators use a strict fact type in which every `EntityRef` must carry `identity`. A missing identity is a compile error, not a hex fallback. |
| Render | At upload, using the parsed file as the only name source, never the database. |
| Store | The **complete rendered issue** (message, `impactedEntity`, `relatedEntities`, `params`, fix options) is stored as JSON in `files.data_loss_issues`. |
| Read | `ValidationOrchestrator.validate` → `findStoredDataLossIssues` returns the stored issues exactly as saved, without re-rendering. |
| Acknowledge | `AcknowledgeDataLossHandler` clears all of a file's issues at once. Per-issue acknowledgement is not supported. |

The old stored format is dropped; no reader for it is kept (§11). The user can
also fix the source file and load it into a new project instead of
acknowledging.

**Blocking edits (later).** Blocking edits on a file with unacknowledged data
loss is not implemented in this phase. When it is, the blocked command returns
a leading `FILE_DATA_LOSS_UNACKNOWLEDGED` error about the file, with an
"Acknowledge data loss" fix option, followed by the stored issues unchanged.
This response shape is agreed now so the later work does not change the issue
contract.

### 8.6 Unexpected failures: Deferred

Unexpected-error response mapping is owned by the API exception boundary and
is not changed in this phase.

TODO(API hardening): Update the shared exception boundary to log the original
`Error` once and return a fixed safe message without stack traces, internal
exception details, or discovered system IDs. This work does not depend on
OpenTelemetry and should be prioritized separately if the API is exposed
beyond its current trusted environment. A trace reference may be added later by
the distributed-observability design.

## 9. Logging Ownership

| Event | Owner | Rule |
|---|---|---|
| Command/query lifecycle | CQRS boundary | Stable lifecycle events; do not duplicate terminal failures |
| Transaction safety | Command bus/handler | Log rollback safety failures as separate secondary events |
| Mutation audit | Command handler | Emit only after successful commit |
| Recoverable identity warning | Owning handler/service | Aggregate warnings rather than one per missing entity |
| Transport failure | Logger infrastructure | Swallow and report through a non-recursive fallback |

A layer does not log an error merely to rethrow it. The final boundary owns the
terminal error log.

Mutation audit events are emitted only after commit. They include a stable
`eventName`, project scope, committed outcome, and the affected entity's
identity in the description, formatted by `IdentityFormatter` (§4.4).
Infrastructure adds the service resource and client instance (§6.2).

TODO(OpenTelemetry): Define and implement API-owned HTTP completion and terminal
failure logging when implementing Sections 7.2, 8.4, and 16.2 of the
OpenTelemetry Adoption LLD. That work owns route metadata, duration, request
context, trace enrichment, and terminal exception logging.

## 10. Log Retrieval

Logs are read per project. Records without a project, such as startup or
housekeeping logs, are not exposed through the API in this phase.

Log reads do not go through core or the query bus. Logs are operational data,
not domain data: no domain rule reads them and no command depends on them. The
read contract (`LogQueryService`, its criteria, pages, read models,
`LogOrigin`, `LogSortOrder`, and `InvalidLogCursorError`) lives in
`@arc/logger`, next to its only implementation, `DbLogQueryService`. The API
logging controller calls it directly through the `LOG_QUERY_SERVICE` token,
the same way `POST /logs` calls `ClientLogWriter` (§7). Core keeps only the
write contract (`Logger`, `LogData`, `LogLevel`). This is the one agreed
exception to "do not bypass CQRS" (decision 26). It replaces
`GetLogsByProjectQuery` and `getLogsByProject(projectId, clientId)`.

| Endpoint | `LogQueryService` method |
|---|---|
| `GET /arc-api/v1/projects/:projectId/logs` | `searchProjectLogs(criteria)` |
| `GET /arc-api/v1/client-instances` | `listClientInstances(criteria)` |

```typescript
interface ProjectLogFilter {
  readonly projectId: string;
  readonly clientName?: string;       // records written by or for this client
  readonly clientInstanceId?: string; // records written by or for this launch
  readonly origin?: LogOrigin;        // 'CLIENT' | 'SERVER'
  readonly minLevel?: LogLevel;       // this level or more severe
}

interface ProjectLogSearchCriteria extends ProjectLogFilter {
  readonly limit: number;             // 1..1000
  readonly order: LogSortOrder;       // 'desc' (newest first) | 'asc'
  readonly cursor?: string;           // opaque; keyed on (timestamp, systemId)
}

interface ClientInstanceSearchCriteria {
  readonly clientName?: string;
  readonly limit: number;
  readonly cursor?: string;           // keyed on (lastTimestamp, clientName, clientInstanceId)
}
```

Both return a page, `{items, nextCursor?, totalCount?}`; `nextCursor` is
omitted on the last page, and `totalCount` is set only on the first page
(see "Pagination"). A bad cursor throws `InvalidLogCursorError`, a plain `Error`; the
controller turns it into a 400 with `errorCode` `ERR_1004`.

**Project logs.** All given filters apply together, so filters that disagree
(for example a launch of another client) return an empty page rather than an
error. `clientName` and `clientInstanceId` match the client's own records and
the server records written for it, because both carry those columns (§6.2):

```sql
WHERE project_id = :projectId
  AND client_name = :clientName              -- when given
  AND client_instance_id = :clientInstanceId -- when given
  AND <origin predicate>                     -- when given (§6.2)
  AND level IN (:minLevel and above)         -- when given
ORDER BY timestamp DESC, id DESC             -- or ASC with order=asc
```

Levels are stored as text, so `logLevelsAtOrAbove(minLevel)` in
`@arc/logger` turns the minimum into the list of levels from `minLevel` up to
`CRITICAL`, using `LOG_LEVEL_ORDER` (`VERBOSE` < `DEBUG` < `INFO` < `WARN` <
`ERROR` < `CRITICAL`). This is
the OpenTelemetry severity-threshold model; an exact-level or level-set filter
is not offered until a reader needs one.

It no longer filters by the JWT `clientId`.

**Client instances.** `GET /arc-api/v1/client-instances` lists client
launches, optionally for one `clientName`, newest `lastTimestamp` first. A
launch is the pair (`clientName`, `clientInstanceId`): the name comes from the
access token, the launch ID is reported by the client. Two clients that send
the same launch ID are two rows, and records without a name form their own
row. Ties on `lastTimestamp` are broken by name, then launch ID. Only
records with a project count, so the list matches what the project endpoint
can return. Each item has `clientName`, `clientInstanceId`, `projectIds`
(ascending), `firstTimestamp`, `lastTimestamp`, `recordCount`, and
`errorCount` (`ERROR` and `CRITICAL` records). A reader picks a launch here,
then reads its records per project. There is no `order` parameter.

**Enum values.** `LogLevel` and `LogOrigin` values are UPPER_SNAKE, like the
other enums in the codebase (for example `Severity`), in storage, requests,
and responses; lowercase values are rejected with 400. The Pino level
formatter writes `LogLevel` values, so console and file output use them too.
`LogSortOrder` keeps `desc`/`asc`, the usual query-parameter spelling. Each
enum has an OpenAPI `enumName`.

**Pagination.**

| Parameter | Rule |
|---|---|
| `limit` | integer 1–1000, default 200; out of range is 400, not silently capped |
| `order` | project logs only: `desc` (default, newest first) or `asc` (oldest first) |
| `cursor` | the `nextCursor` of the previous page; opaque |

Pagination is keyset-based ("rows after this cursor"), not offset-based, so
new records arriving while paging do not shift or duplicate pages. Project
logs sort by `(timestamp, systemId)`; `systemId` breaks ties. A cursor records
the listing, filters, and order it was issued for; a malformed cursor or one
used with different filters or order is 400 (`ERR_1004`). The page size is
not bound, so a reader may change `limit` between pages.

The response is the normal `ApiResult` envelope with a page as its payload:
`{ data: { items: [...], nextCursor?: string, totalCount?: number } }`. The
envelope keeps its two fields (`data`, `issues`); paging metadata belongs to
the payload.

**Total count.** The first page (a request without `cursor`) also returns
`totalCount`: the number of records, or launches, that match the filters at
that moment, ignoring `limit`. A client uses it to show progress while it
downloads logs. It is counted after the page query, with the same filters,
by one extra query: `COUNT(*)` for project logs, and a distinct count of
(`clientName`, `clientInstanceId`) over records with a project for launches.
Pages requested with a cursor do not count again. The count is an estimate:
the listing is complete when `nextCursor` is absent. With `order=desc`,
records written during the download sort before the cursor and are not
returned, so the count matches; with `order=asc` they can arrive at the end,
and with launches an active launch can move to the top, so the client caps
progress at 100%.

**Read model and response DTO.** `LogEntryReadModel` and
`LogEntryResponseDto` carry `systemId` (a string in the DTO), `level`,
`timestamp`, `eventName`, `description`, `component`, `tag`, `origin`, and,
when known, `clientName`, `clientInstanceId`, `serverInstanceId` (server
records only), `projectId`, and `error`. The resource columns `service_name`
and `service_instance_id` are not exposed; `origin` replaces them. `msg` and
`source` are removed. The read model is flat; the former shared
`LogEntryBase` is removed.

**Access.** Instance IDs and client names are selectors, not secrets. Both
endpoints keep the current authentication and local trust model. Diagnostic
authorization is owned by OpenTelemetry LLD §16.4.

- The client name of a `CLIENT` record and of a `SERVER` record for an
  authenticated request comes from the verified token. The launch ID is
  self-reported in the header and checked only as a UUID, so a client can
  send another launch's ID. Keying a launch on both values keeps such records
  out of the other client's launch; a reader that wants one client's launch
  filters by both `clientName` and `clientInstanceId`.
- Registration is unauthenticated, so any caller can obtain a token for any
  name except the API's. The name therefore identifies a program, not a
  verified party, until registration authenticates.
- Server records get the client name only from `JwtStrategy`, after the
  token is verified (§6.2), so the records of a request rejected with 401
  carry no name.
- The launch ID stays out of the token, because a token outlives a launch
  (30 days). When
  registration authenticates users, the verified user joins the launch key
  and reads are scoped to the caller (decision 28).

**Removed.** `GET /arc-api/v1/diagnostics/logs` is removed (404). Reading one
launch across projects is done by listing it under `/client-instances` and
reading each of its `projectIds`.

TODO(OpenTelemetry): Add time-range, event, level, and trace filters and the
get-trace query when implementing Sections 13.1 through 13.3 of the
OpenTelemetry Adoption LLD.

## 11. Persistence

Logging schema changes (`log_entries`):

| Change | Column |
|---|---|
| drop | `source` and index `(source, project_id, timestamp)` |
| rename | `msg` to `event_name` |
| add | `service_name TEXT NOT NULL` |
| add | `service_instance_id TEXT NOT NULL` |
| add | `client_name TEXT NULL` |
| add | `client_instance_id TEXT NULL` |
| add index | `(project_id, timestamp)` |
| add index | `(client_instance_id, project_id)` |

- `LogSource` is deleted from core.
- The single logging migration is regenerated with the workflow in
  OpenTelemetry LLD §12.4; no incremental migration is added and existing log
  rows are not kept. The regenerated migration gets a new timestamp and starts
  with `DROP TABLE IF EXISTS "log_entries"`, so a `logging.db` that already ran
  the old migration is rebuilt on the next start instead of keeping the old
  columns (and silently failing every insert).
- Infrastructure assigns every new column; core callers do not.
- Natural identity remains in `description` rather than an arbitrary entity
  JSON column.
- Existing error storage must remain protected from client-facing projections.
- `service_version`, `observed_timestamp`, trace columns, and span storage are
  added by the OpenTelemetry LLD (§12.1–12.2).

Project-data schema changes in this phase (not logging):

- `use_cases.type` becomes non-null, matching the required `UseCase.type`
  (§5.6).
- `files.data_loss_issues` stores the complete rendered issue JSON (§8.5). The
  old stored format is dropped and no reader for it is kept.
- The project keeps a **single** migration. The existing initial migration
  (`1793004360309-initial-create.ts`) is regenerated rather than adding an
  incremental one.

## 12. Security and Reliability

- New or changed phase 1 log descriptions must not include authorization
  headers, cookies, credentials, tokens, raw file contents, request bodies,
  response bodies, raw URLs, or query values.
- Request bodies are never logged. The request logger writes no body record,
  and a validation failure logs only the failed rules, which name the
  property and the rule but not the submitted value.
- Bound client-controlled input: the HTTP body limit bounds every request,
  and the client-log DTO limits identifier-like fields to 256 characters (§7).
- Serialize protected errors using only approved fields such as name, message,
  and stack; do not recursively serialize arbitrary error properties.
- Identity resolution failure is diagnostic failure, not business failure.
- `X-ARC-Client-Instance-Id` must be a UUID. An invalid header is ignored,
  except on `POST /logs`, which rejects it.
- A client cannot claim the server's name: registration rejects
  `audioreach-creator-api`, and the client-log body has no name field (§6.2,
  §7).
- No code decodes the access token outside `JwtStrategy`; the logged client
  name is always the verified one.
- Instance IDs and client names select logs but never grant access (§10).
- No formatter or logger performs hidden persistence reads.
- Natural-identity resolution is scoped to the authorized project/file and the
  effective session view.

## 13. Implementation Sequence

### 13.1 Migration strategy

The logger and issue contracts are used across the codebase (285 `logger.log*`
calls in 44 files; issue factories in about 60 call-site files), while this
work adopts them in routing first. They migrate differently.

**Logger: one-step migration (Phase 1).** The change at each log call is
mechanical: rename `msg` to `eventName` and pass an `Error` instead of a string
`error`. One commit therefore changes every call with a script, fixes the few
that the compiler reports by hand, and deletes the old shape. There is no
legacy overload, no translation code, and no `never` field to keep two shapes
apart. The commit is separate from the contract change, so it can be reverted
on its own.

The event names kept their old values. Renaming them to the §6.3 convention
needs knowledge of each call, so it is not scripted. A `no-restricted-syntax`
lint rule tracks it:

- as `warn` everywhere; the warning count is the names still to rename; and
- as `error`, through a `files` override in `eslint.config.js`, for renamed
  areas. The list starts with `application/usecase-designer/use-case-creator/**`
  and `application/orchestration/command-bus.ts`; each renaming change adds
  the areas it converts.

The rule reports a string-literal `eventName` in a `log*()` call that does not
match `<domain>.<operation>.<outcome>`, and any template-literal `eventName`,
which would carry per-occurrence values. When it reports no warnings, it
becomes `error` everywhere and the override is removed.

Tests that assert an event name change with the name.

**Issues: parallel change (Phase 4).** Issue producers need typed facts and
templates per code, which cannot be scripted. The issue contract therefore
changes with
[Parallel Change](https://martinfowler.com/bliki/ParallelChange.html):
expand, migrate, contract. Code not yet migrated keeps compiling and behaving
as today, and each later PR migrates one feature area.

**Expand (issues, Phase 4).** The current `Issue` shape, with free-text
`message`, is kept as a deprecated `LegacyIssue`. `Result<T>` accepts rendered
issues and `LegacyIssue`. The API mapper maps a `LegacyIssue` to the
`ApiPlainIssueItem` variant (§8.4), without `relatedEntities` or `params`; its
code stays mapped to that variant until its producer is converted. A legacy
`FixOption.systemId` is sent as `id` with no `kind`. Because `impactedUsecases`
becomes `ApiEntityRef[]` (§8.4), the mapper gives each legacy use-case ID the
§4.2 fallback `displayName` (`UseCase with systemId: 0x...`) until its producer
is converted.

**Guardrails (issues).** `@typescript-eslint/no-deprecated` is enabled as
`warn` everywhere; Phase 4 adds a `files` override that makes it `error` for
`LegacyIssue` in migrated areas. `sonarjs/deprecation`, enabled as `error` by
the sonarjs recommended config, is turned off: it duplicates `no-deprecated`.
If `no-deprecated` does not report a deprecated type, the fallback is a
`no-restricted-syntax` rule for the migrated areas that rejects `LegacyIssue`
(§18).

**Migrate (Phase 6).** Each PR converts one feature area's issue producers,
and adds that area to the `error` override. It changes nothing else.

**Contract (Phase 7).** Delete the issue compatibility code (see Phase 7). The
compiler then reports any remaining producer.

**Not bridged.** These changes are not call-site compatible and ship complete
in their own PR:

- the stored data-loss format and the regenerated migration (§8.5, §11);
- required `UseCase.type` and its non-null column (§5.6);
- port names `''` to `null`, together with the UI (§5.6); and
- the `no-restricted-imports` boundaries with their violations fixed (§5.7).

### Phase 1: Contract boundary

- Add `LogProducerIdentity`, `ActiveLogContextProvider` with its
  `AsyncLocalStorage` implementation, and the `X-ARC-Client-Instance-Id`
  handling in `RequestLoggerMiddleware`; bind worker pool callbacks to the
  submitting context (§6.2).
- Change `log_entries` and regenerate the logging migration (§11).
- Remove `source` and `LogSource` from core. `JwtStrategy` adds the verified
  client name and `ProjectLogContextGuard` the route's project ID to the log
  context (§6.2).
- Replace the client-log endpoint contract and add `ClientLogWriter` (§7).
- Add `clientName` to registration and the access token (§6.2).
- Replace `GetLogsByProjectQuery` with the `@arc/logger` `LogQueryService`
  methods `searchProjectLogs` and `listClientInstances`, called directly by
  the API, and add `GET /client-instances` (§10).
- API changes may break compatibility: there is no released UI client yet.
  When the UI is built, it implements the client name, launch ID, request
  header, and new DTOs against this contract.
- Make core `LogData` independent of the persisted read shape.
- Rename the stable event identifier from `msg` to `eventName` in the core
  write contract, and make `timestamp` optional (§6.1).
- Migrate the `command-bus.ts` log calls to the new contract and the §6.3
  event names.
- In a separate commit, move every other log call to the new contract in one
  step and add the event-name lint rule (§13.1). Event names keep their old
  values.

### Phase 2: Identity kernel

- Add `EntityRef`, `IdentityFor`, and the identity types in `domain/identity/`,
  with `EntityIdentityMap` entries for the eight routing types (§4.4). Add
  `ValueDefinition` to `ISSUE_ENTITY_TYPE` (§8.2).
- Add `IdentityFormatter` (single `format` method) in `application/issues/`,
  with a case for each of those entries (§4.4).
- Unit-test each §4.3 format and the hexadecimal system-ID fallback.
- No entity-to-identity adapters (§4.4).

### Phase 3: Read side, types, and boundaries

- Add the `no-restricted-imports` boundaries and fix the existing violations
  (§5.7).
- Make the six repositories in the §5.4 "Repositories in scope" table extend
  their query services, delegating to the shared overlay fetchers, and add the
  read-only `KeyValueDefinitionRepository` with
  `UnitOfWork.getKeyValueDefinitionRepository()` (§5.4).
- For each repository, first audit the overlapping read methods and their
  callers, and unify them under the §5.4 "one method per read" rule. One PR per
  repository; it changes callers and implementations together.
- Add `XxxRecord` types and the `application/read-models/` folder (§5.5).
- Apply the §5.6 field decisions, including removing `''` name fallbacks.
- Make `UseCase.type` required, derive it at import, change the column to
  non-null, and regenerate the single migration (§5.6, §11).

### Phase 4: Issue contract

- Add `IssueFact`, `FixOptionFact`, and `IssueContextMap` in
  `domain/issues/`, replacing `shared/issues/`; facts use the Phase 2
  `EntityRef`.
- Add `Issue`, `RenderedEntityRef`, `RenderedFixOption`, `IssueRenderer`, and
  per-code templates in `application/issues/`.
- Add `ApiIssueItemBase`, `ApiPlainIssueItem`, the per-code variant registry,
  and the OpenAPI discriminated union (§8.4).
- Add the deprecated `LegacyIssue` path in `Result<T>` and the API mapper
  (§13.1).
- Convert the producers used by routing to facts (`RoutingIssueFactory` and
  the `IssueFactory` methods routing calls). The other producers listed in
  §8.3 move in Phase 6.
- Apply the wire changes in §8.4 and the data-loss storage in §8.5.
- Preserve existing issue code, severity, fix, blocking, and transaction
  semantics.

### Phase 5: Routing reference adoption

- Add batched DataLink and ControlLink identity reads to the query services.
- Add `findSpfModuleIdentities` to `SpfModuleQueryService` and
  `findSubsystemIdentities` to `SubsystemQueryService` (§5.2).
- Build the routing-local immutable identity map.
- Convert every `RoutingIssueFactory` method per the §5.3 table, and delete the
  unused `selectedScopeIncomplete`.
- Migrate routing errors, warnings, and post-commit audit descriptions.
- Verify partial enrichment does not alter routing outcomes.

### Phase 6: Incremental migration

- Audit remaining project log/error messages for decimal or bare system IDs and
  replace them with natural identity, or with the §4.2 fallback when natural
  identity is missing.
- Migrate features using the identity reads and `IdentityFormatter`. Add each
  remaining entity type's `EntityIdentityMap` entry and formatter case with
  its first producer (§4.4).
- Each PR migrates one feature area's issue producers (`LegacyIssue` to
  facts), adds `IssueContextMap` entries and API variants for codes that gain
  context, and adds the area to the `no-deprecated` `error` override (§13.1).
- Rename event names to the §6.3 convention, and add each renamed area to the
  event-name rule's `error` override (§13.1). This can happen after the other
  phases.
- Do not introduce feature-specific formatters or hidden lookup services.

### Phase 7: Remove compatibility

The logger has no compatibility code to remove (§13.1). Done when
`no-deprecated` reports no `LegacyIssue` use. In one PR:

- delete `LegacyIssue`, its branch in `Result<T>`, and the legacy path and
  `impactedUsecases` fallback in the API mapper;
- remove the `LegacyIssue` `files` override and any fallback
  `no-restricted-syntax` rule; and
- confirm the build, lint, and test suites pass with no deprecated usage.

When the event-name rule reports no warnings, make it `error` everywhere and
remove its `files` override. This does not block Phase 7.

Phase 7 does not touch the client-log endpoint (§7); its future is owned by
the OpenTelemetry LLD.

## 14. Verification

### Core

- log descriptions and user-facing messages identify known entities using the
  same canonical natural identity, without a persistence system ID;
- when natural identity is missing, both use the labelled fallback
  `<Entity type> with systemId: 0x...`, including scoped not-found messages;
- composite identities are deterministic;
- issue code and context types cannot be mismatched, and an `EntityRef` can
  only carry the identity of its own entity type;
- a UseCase with an alias renders the alias followed by its GKV pairs;
- `Result<T>` rejects unrendered issue facts at compile time (during migration
  it also accepts `LegacyIssue`);
- data-loss facts without `identity` on every reference fail to compile;
- command-side identity reads through a unit-of-work repository see writes
  already applied to the same transaction;
- each §5.4 in-scope repository is assignable to its query service, and the
  routing handlers read key and value names only through
  `getKeyValueDefinitionRepository()`;
- no in-scope repository declares a read method that duplicates an inherited
  query-service method;
- in-scope read methods follow the §5.4 `get`/`find` naming and parameter
  rules;
- facts about entities created or changed by the current command carry
  `identity`, so rendering never depends on the pending change cache;
- every use case created by import has a derived `type`, which overrides any
  type in UI metadata;
- layer-boundary lint passes with no allowlist; and
- core `LogData` accepts only `Error` for `error`, uses `eventName`, and has
  no `msg`, `source`, `projectId`, trace, or resource fields;
- a record logged without `timestamp` gets the time of the log call, and a
  passed `timestamp` is kept;
- the event-name lint rule fails lint for a non-conforming `eventName` in
  renamed areas;
- `no-deprecated` fails lint for `LegacyIssue` in migrated areas; and
- after Phase 7, no `LegacyIssue` symbol remains.

### Persistence

- link identity resolution is batched and scope-isolated;
- active-session additions and deletions are respected;
- partial endpoint data returns bounded fallback results;
- the regenerated single migration creates `use_cases.type` as `NOT NULL`;
- stored data-loss issues round-trip unchanged through
  `findStoredDataLossIssues`; and
- the regenerated logging migration creates `log_entries` with `event_name`,
  `service_name`, `service_instance_id`, `client_name`,
  `client_instance_id`, and no `source`;
- every server-written record has the process `service_name` and
  `service_instance_id`; records written inside a request with a valid
  `X-ARC-Client-Instance-Id` have that `client_instance_id`, and concurrent
  requests never share a value;
- worker task errors logged by the parent keep the submitting request's
  `client_instance_id`; and
- `searchProjectLogs` by `clientName` or `clientInstanceId` returns both the
  client's own records and the server records written for it, in
  `(timestamp, systemId)` order (descending by default, ascending on
  request), with bounded keyset cursor pagination that neither skips nor
  repeats rows across pages; and
- `listClientInstances` returns only launches with project records, newest
  `lastTimestamp` first, with the same cursor guarantees.

### API

- typed issue context is returned without requiring message parsing;
- an entity reference has exactly `entityType`, `systemId`, and `displayName`;
- `systemId` in entity references is a decimal string, and `impactedUsecases`
  is `ApiEntityRef[]` and omitted when empty;
- the OpenAPI document describes `issues` as a `oneOf` discriminated on
  `code`, every `IssueCode` appears in the mapping exactly once, and each
  variant's context matches `ContextFor<C>`;
- `commandPayload` is unchanged;
- a `LegacyIssue` maps to `ApiPlainIssueItem` without `relatedEntities` or
  `params`, and its `impactedUsecases` use the fallback `displayName`;
- port names and module aliases without a value are sent as `null`, never
  `''`;
- known-entity messages contain natural identity and omit persistence system
  IDs;
- registration requires a `clientName` of at most 256 characters other than
  `audioreach-creator-api`, the token carries it, and a token without it is
  rejected with 401;
- the client-log endpoint requires `eventName` and a UUID
  `X-ARC-Client-Instance-Id` header, rejects `msg`, `serviceName`,
  `serviceInstanceId`, `clientName`, `clientInstanceId`, and identifier fields
  over 256 characters, and stores the token's client name and the header's
  launch;
- on other endpoints, a missing or invalid `X-ARC-Client-Instance-Id` does
  not fail the request and is not stored;
- server records written inside a request after routing carry the route's
  project ID, those written after authentication also the verified client
  name, and a request whose token fails verification has records with no
  name;
- the project-log endpoint filters by project and optional `clientName`,
  `clientInstanceId`, and `origin`, not by the JWT `clientId`;
- `GET /client-instances` lists launches with project records, optionally by
  `clientName`, one row per (`clientName`, `clientInstanceId`), so two clients
  that send the same launch ID are listed separately;
- `GET /diagnostics/logs` returns 404;
- both read endpoints accept `limit` (1–1000, default 200) and `cursor`, the
  project endpoint also `order` (`desc` default, `asc`); they return
  `{items, nextCursor?}`, plus `totalCount` on the first page only, and
  reject out-of-range limits and malformed or mismatched cursors with 400;
  and
- log responses contain `eventName`, `origin`, `clientName`,
  `clientInstanceId`, and `serverInstanceId`, and never `msg`, `source`,
  `serviceName`, or `serviceInstanceId`.

### Regression

- logging/enrichment failure does not alter the primary result;
- failed or rolled-back mutations do not emit successful audit events;
- one primary failure is not logged at multiple layers; and
- core, logger infrastructure, persistence, API, lint, and build suites pass.

## 15. Planned File Impact

| Area | Expected impact |
|---|---|
| Core logger types | Use `eventName`, separate write data from persisted/read fields, and remove `source` from writes |
| Log call sites | Every `log*()` call moved to `LogData` in one commit; event-name lint rule (§13.1) |
| Migration compatibility (temporary) | Deprecated `LegacyIssue` path and its `no-deprecated` lint override; removed in Phase 7 (§13.1) |
| Core identity | Add `EntityRef`, identity types for the routing entities, and `IdentityFormatter` |
| Core import | Derive `UseCase.type` with the routing classifier |
| Lint and layering | Add `no-restricted-imports` boundaries; move types out of three violating files |
| Core issues | Replace `shared/issues/` with `domain/issues/` facts; add `application/issues/` renderer, templates, and formatter; convert producers |
| Core read side | Repositories extend query services; add `XxxRecord` types and `application/read-models/` |
| Core routing | Consume an explicitly built identity map; emit facts |
| Persistence | Delegate repository reads to overlay fetchers for the six §5.4 repositories; add `KeyValueDefinitionRepository` and its unit-of-work getter; add batched link, SPF module, and subsystem identity reads; non-null `use_cases.type`; regenerate the single migration; new `data_loss_issues` format |
| API issues | `ApiEntityRef`, `relatedEntities`, `params`, `impactedUsecases` as `ApiEntityRef[]`; `ApiIssueItemBase`, per-code variants, `ApiPlainIssueItem`, variant registry, and the OpenAPI discriminated union on `code` |
| API node/module DTOs | Port names and module aliases sent as `null` instead of `''` |
| Logger infrastructure | `LogProducerIdentity`, `ActiveLogContextProvider` (`AsyncLocalStorage`), resource and client-instance enrichment in `PinoLogService`, `PinoClientLogWriter`, `description` as the Pino message |
| API authentication | Required `clientName` at registration, signed into the token; `JwtStrategy` rejects tokens without it |
| API client logs | New request DTO (`eventName`, `clientInstanceId`); client name from the token; `ClientLogWriter` instead of the core `Logger` |
| API log reads | Controller calls the `@arc/logger` `LogQueryService` directly (no core query); project-log filters; new `GET /client-instances`; new response DTOs; uppercase `LogLevel`/`LogOrigin` |
| API request log context | Middleware runs the request in the log context with the launch from `X-ARC-Client-Instance-Id`; `ProjectLogContextGuard` (`APP_GUARD`) adds the route's project; `JwtStrategy` adds the verified client name |
| Worker pool | Bind result and error callbacks to the submitting async context |
| API errors | Map typed expected issues; defer unexpected-error response hardening |
| Logging schema | Drop `source`, rename `msg` to `event_name`, add `service_name`, `service_instance_id`, `client_name`, `client_instance_id`; regenerate the single logging migration |
| UI (outside this repository) | Client name at registration, per-launch UUID, request header, new log DTOs |
| Workers | No change in this phase |
| Repository guidance | Update the logging convention from `msg`/`action` to the phase 1 `eventName` contract |

## 16. Compatibility with Distributed Observability

The later OpenTelemetry implementation may add infrastructure-enriched fields
such as:

```text
traceId
spanId
serviceVersion
observedTimestamp
attributes
```

`service_name`, `service_instance_id`, `client_name`, and
`client_instance_id` already exist from this phase (§6.2) and keep their
meaning; `ActiveLogContextProvider` switches to
the OpenTelemetry context.

None belongs in the core logger write contract. The `@arc/logger` read models
may later expose them as plain strings when required by trace-oriented APIs.

Removing `source` and adding the resource columns now means the OpenTelemetry
work only adds fields; it does not migrate existing ones.

## 17. Final Decisions

1. Human-readable identity work proceeds without waiting for OpenTelemetry.
2. Logs and user-facing messages share one identity scheme and one
   `IdentityFormatter.format` method.
3. Known entities are identified by natural identity only, never by system ID.
   The labelled `systemId: 0x...` fallback is used only when natural identity
   is missing, usually for a caller-supplied ID that is not found.
4. Formatters are pure and never query persistence.
5. Composite link identity is resolved explicitly and in batches.
6. `eventName` is the stable event name; `action` is not added in this phase.
7. `source` is removed from core and from storage. Producer identity uses the
   OpenTelemetry resource fields `service_name` and `service_instance_id`;
   every record also stores the client and launch it belongs to in
   `client_name` and `client_instance_id`. Infrastructure sets all four.
   `producer_kind` is not added; `origin` is derived (§6.2).
8. Client-submitted logs carry the client's own resource identity through a
   new DTO and an infrastructure-only `ClientLogWriter`, not the core
   `Logger`. Client trace context is deferred to the OpenTelemetry LLD.
9. Logs are read per project with `LogQueryService.searchProjectLogs`,
   filtered by client name, launch, origin, and minimum level;
   `listClientInstances` lists the launches. The client name comes from the access token, the launch from a
   header. The JWT `clientId` is not a log-ownership key.
10. HTTP lifecycle logging otherwise keeps its current behavior; metadata-only
    logging and unexpected-error response mapping are deferred to later
    API/observability work.
11. No per-request correlation ID is introduced; trace IDs replace that need
    later. The client instance header is session-level, as in HLD §8.4.
12. Traces, spans, worker telemetry, `service_version`, observed time, and
    diagnostic trace APIs are delegated to the approved observability HLD and
    LLD. Core gets no span or profiler port.
13. CQRS stays. Repositories extend their query services so command handlers
    read writes already applied to their transaction; no extra read port is
    added. Batched link identity reads are query-service methods. Log reads
    are the one exception (decision 26).
14. The pending change cache is single-command and not readable. Facts about
    entities the command created or changed carry their identity; failed
    commands use caller input and the `systemId` fallback.
15. Issue creators produce typed facts; an application-layer renderer produces
    the messages. `Result<T>` carries only rendered issues. There is one
    entity-reference type per layer: `EntityRef`, `RenderedEntityRef`,
    `ApiEntityRef`. Field names are the same in every layer, and context is
    typed per code through `IssueContextMap`.
16. `systemId` stays decimal on the wire; hexadecimal is used only in text.
    An API entity reference is `{entityType, systemId, displayName}`; the alias
    and natural IDs appear only inside `displayName`.
17. Data-loss issues are rendered at upload from the parsed file and stored
    complete; they are never re-rendered. The old stored format is dropped.
    Blocked edits will return `FILE_DATA_LOSS_UNACKNOWLEDGED` first.
18. `UseCase.type` is required and always derived at import; the derived value
    wins. The single migration is regenerated.
19. Fields follow the null-versus-optional rule in §5.6; missing names are
    `null`, never `''`.
20. Layer boundaries are enforced by `no-restricted-imports`, with existing
    violations fixed rather than allowlisted.
21. Nodes always resolve to their concrete type (`SpfModule` or `Subsystem`),
    read through `findSpfModuleIdentities` and `findSubsystemIdentities`; there
    is no Node or generic Module identity. Driver modules will get their own
    repository and identity read. The system-ID fallback is used only for
    entities that are missing; existing entities whose identity is not yet
    loaded are read in batches on the failure path (§5.3).
22. The logger contract changes in one step: one commit moves every log call
    to `LogData`, with no legacy shape. Event names are renamed later, tracked
    by a lint rule. The issue contract changes by parallel change: the
    deprecated `LegacyIssue` keeps unmigrated code working, lint blocks it in
    migrated areas, and Phase 7 removes it in one PR (§13.1).
23. A reader can find every project log of one client launch, its own and the
    server's, with one `clientInstanceId` filter, because both sides store
    `client_instance_id` (§10). The request context is an infrastructure `AsyncLocalStorage` port that the
    OpenTelemetry context replaces later.
24. The issue wire contract is an OpenAPI discriminated union on `code`.
    Codes with context have their own variant; the rest share
    `ApiPlainIssueItem`. Clients treat unknown codes as plain issues.
25. Identity types are plain data in `domain/identity/`, keyed by entity type
    in `EntityIdentityMap`. `EntityRef` lives there too, so Phase 2 can add
    the formatter before the Phase 4 issue facts. Phase 2 covers only the
    eight routing types; the rest arrive with their first producer. There
    are no entity-to-identity adapters: identity comes from batched identity
    reads, or inline when the producer already holds the fields (§4.4).
26. Log reads are the one exception to CQRS. Logs are operational data, so the
    read contract lives in `@arc/logger` and the API calls `LogQueryService`
    directly, as it calls `ClientLogWriter` for writes. Core keeps only the
    write contract (`Logger`, `LogData`, `LogLevel`). Agreed with the lead;
    recorded in `.ai/context/CLAUDE.md` (§10).
27. `LogLevel` and `LogOrigin` values are UPPER_SNAKE (`WARN`, `CLIENT`), as
    in the rest of the codebase; `LogSortOrder` stays `desc`/`asc` (§10).
28. A launch is identified by the verified client name together with the
    self-reported launch ID, not by the launch ID alone, and the launch ID is
    not put in the token. Client records take the launch from the
    `X-ARC-Client-Instance-Id` header, which `POST /logs` requires; there is
    no body field (§7). When registration authenticates users, the verified
    user joins the key and reads are scoped to the caller (§10 "Access").
29. Request stages fill in one request log context rather than nesting
    contexts: the middleware opens it with the launch ID, and the global
    `ProjectLogContextGuard` and `JwtStrategy` add the route's project and
    the verified client name with `ActiveLogContextProvider.enrich`. A
    nested context opened in an interceptor would miss the guard rejections,
    the exception filters, and the response log. Nothing decodes the token
    or parses the URL for logging (§6.2, §10 "Access").
30. Log reads keep keyset paging; the first page of each read endpoint
    returns `totalCount` for download progress, counted once with the page's
    filters. It is an estimate; the end of a listing is the absent
    `nextCursor`. Offset paging and a count on every page were rejected:
    offsets shift as records arrive, and repeated counts cost a query per
    page for a number that is only needed once (§10).

## 18. Implementation Checks

These are verification steps for implementation, not open design questions:

- Before planning Phase 3 for a repository, list the read methods of the
  repository and its query service with their parameters, return shapes,
  error style, and callers. Record the decision for each overlap (§5.4 "one
  method per read") in the plan before writing code.
- At the start of Phase 4, confirm `@typescript-eslint/no-deprecated` reports
  uses of a deprecated type. If it does not, use the `no-restricted-syntax`
  fallback in §13.1.
- Confirm `AsyncLocalStorage.run(ctx, next)` in the Nest middleware keeps the
  context through guards, pipes, controllers, and the CQRS buses, that
  concurrent requests stay isolated, and that values added with `enrich` in
  a guard or in `JwtStrategy` reach the exception filters and the response
  log.
- Confirm every place `NodeWorkerPoolAdapter` logs on behalf of a task runs in
  the bound context.

- Confirm the inputs of `usecase-type-classifier.ts` (subgraph pairs, EC data
  links, control links) are available in the import builder.
- Find every place a port is created and confirm empty names are stored as
  `null`.
- Find every consumer of the node read model and the module/port DTOs that
  relies on `''` names, including the UI.
