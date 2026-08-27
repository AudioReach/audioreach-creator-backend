<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Delete Module - Requirements

**Date:** 2026-08-27
**Status:** Frozen
**Amendment:** 2026-09-07 container update summary (Accepted)
**Amendment:** 2026-09-07 connected link deletion mode (Accepted)

**Parent:** `docs/edit-crud/overall-design.md`
**Foundation:** `docs/edit-crud/foundation.md`
**Write path:** `docs/edit-crud/module-write-path.md`
**Related requirements:** `docs/module-write/requirements/add-module-requirements.md`

---

## 1. Context and Scope

### 1.1 Problem statement

Implement `DELETE /arc-api/v1/projects/{projectId}/spf-modules/{spfModuleSystemId}` as a session-aware, undoable write operation. Deleting a module must remove its owned data and links, then remove its container and/or subgraph when either becomes empty. The operation must preserve a valid effective graph across committed data and all active session edit actions, including both `STAGED` and `UNSTAGED` rows.

### 1.2 Included behavior

- Delete an effective SPF module and all data owned by that module.
- Cascade-delete every canonical DataLink and ControlLink connected to the module.
- Delete subsystem route segments associated with deleted canonical links and unresolved subsystem-link chains reached from the deleted module.
- Clear routed-control intents from surviving subsystem ControlPorts when deleted routes no longer justify those intents.
- Delete the module's container when no effective modules remain in that container.
- Delete the module's subgraph when no effective modules remain in that subgraph.
- Remove relationships between a deleted subgraph and UseCases while retaining the UseCases.
- Recalculate stack size when the affected container survives.
- Return an ID-based summary of deleted entities, affected UseCases, and subsystem ControlPorts whose intents were cleared, plus the recalculated stack size of a surviving affected Container.
- Record every primary and cascading change under one `groupId`.

### 1.3 Key decisions

- Containers and subgraphs are evaluated independently. A container is file-scoped and is not owned by a subgraph.
- Connected links do not block module deletion merely because they exist; they are cascade-deleted.
- Empty UseCases are valid and remain present.
- A module created by an earlier edit-action group may be deleted in a new undoable group.
- Existing module-owned CKV/TKV rows are deleted as aggregate cleanup. This does not add independent calibration-data or tag-data editing behavior.
- Subsystem boundary ports are not deleted during edit-time module deletion merely because route segments were removed. Unused subsystem boundary ports may be removed later by commit-time subsystem normalization based on the final staged graph.
- Subsystem-specific response fields are emitted only for files whose effective state supports subsystems.
- The handler returns the operation `groupId` internally, but the HTTP response does not expose it in this scope.
- The initial implementation is enabled for `Designer` sessions. `DiffMerge` enablement is deferred until the general change-selection dependency mechanism is implemented; this is delivery sequencing, not an exception to the requirement that `DiffMerge` is a write-superset of `Designer`.

---

## 2. Definitions

| Term | Definition |
|------|------------|
| Active session | The project editing session supplied by `SessionGuard` and accepted by the command's allowed session modes. |
| Effective state | Committed database state overlaid with all active `edit_actions` rows visible to the session, including both `STAGED` and `UNSTAGED` changes. |
| Owned module data | The module's Node, DataPorts, ControlPorts, Intents, CKV tree, and tag/TKV tree. Shared definitions referenced by these rows are not owned. |
| Delete operation edits | The pending edit actions created by this manual DELETE request. Under the existing edit framework, manual writes are recorded with `changeStatus = STAGED`; this does not limit effective-state reads to staged rows. |
| Required change unit | A pending change unit that must be selected for another change unit to remain valid. If change unit A requires B, staging A stages B, while unstaging B unstages A. |
| Canonical link | A row in `data_links` or `control_links` representing the user-visible link. |
| Subsystem link segment | A row in `subsystem_data_links` or `subsystem_control_links`. Its canonical DataLink or ControlLink system ID may be null in effective state while its chain remains unresolved. |
| Resolved subsystem link | A subsystem link segment whose effective canonical DataLink or ControlLink system ID is non-null before this delete operation. |
| Unresolved subsystem link | A subsystem link segment whose effective canonical DataLink or ControlLink system ID is null before this delete operation, either because chain resolution has not run or because a prior edit detached it from its canonical link. |
| Subsystem-capable file | A file whose effective state contains at least one Subsystem. This matches the capability test used by existing subsystem-aware code. |
| Retained subsystem boundary port | A subsystem-node DataPort or ControlPort created for routing that remains present during edit-time module deletion, even if this operation removes its last effective link segment. |
| Intent-cleared subsystem ControlPort | A retained subsystem-node ControlPort whose propagated Intents are removed because deleted control-route segments no longer justify those Intents. |
| Affected subsystem | A retained Subsystem that owns at least one intent-cleared subsystem ControlPort. |
| Affected UseCase | A retained UseCase whose `use_case_subgraphs` membership or `use_case_subgraph_pairs` relationship changes because a subgraph is deleted. |
| Full link deletion | Delete a canonical link and every resolved subsystem segment in its route. For an unresolved chain that cannot be resolved, delete the complete reachable chain. |
| Segment-only deletion | Delete the route segments incident to the removed module and the canonical link, while retaining other resolved route segments as unresolved segments. |
| Detached subsystem segment | A retained subsystem link segment whose canonical DataLink or ControlLink FK is set to null in the effective-state overlay by segment-only deletion. Detached segments are not returned in the deletion summary. |

---

## 3. API and Session Requirements

### FR-DM-01: Endpoint

The API shall expose:

```http
DELETE /arc-api/v1/projects/{projectId}/spf-modules/{spfModuleSystemId}
```

The endpoint has no request body and returns HTTP 200 with an `ApiResult` containing the deletion summary on success.

### FR-DM-02: Path validation

`projectId` and `spfModuleSystemId` shall be accepted as decimal integer path parameters using the same parsing convention as the PATCH module endpoint. A malformed value returns HTTP 400 before command execution.

### FR-DM-03: Session requirement

The endpoint shall use `SessionGuard` and require an active session.

The initial implementation shall allow `Designer` mode. The command shall contain an explicit TODO to add `DiffMerge` to its allowed modes after the change-selection dependency requirements in `docs/edit-crud/requirements.md` are implemented. Once that prerequisite exists, the endpoint shall allow the same modes as the other structural module write operations: `Designer` and `DiffMerge`.

Existing session failures remain authoritative:

- no active session -> the existing session-not-open response;
- disallowed session mode -> the existing session-mode-not-allowed response.

### FR-DM-04: Project and file scope

The module lookup and every cascade lookup shall be scoped to the project/file associated with the active session. A module with the requested system ID in another project or file shall be treated as not found.

---

## 4. Validation Requirements

### FR-DM-05: Module existence

If the requested module does not exist in effective session state, the operation shall fail with HTTP 404 using `IssueFactory.notFound(ISSUE_ENTITY_TYPE.SpfModule, spfModuleSystemId)`.

This includes a module that exists in committed data but is already deleted in the active session.

### FR-DM-06: Session-created module

A module created by an earlier `STAGED` edit-action group in the active session is eligible for deletion. The delete shall be recorded as a separate group rather than cancelling or rewriting the earlier create group. Undoing the delete group therefore restores the session-created module and its related effective state.

The initial `Designer` implementation does not require special handling for `UNSTAGED` creates because all Designer changes are implicitly `STAGED`.

### FR-DM-06A: Deferred DiffMerge dependency selection

Before this endpoint is enabled in `DiffMerge`, it shall integrate with the general change-selection dependency mechanism. A manual module deletion shall not be rejected solely because its effective-state cascade depends on an active `UNSTAGED` change.

The module deletion change unit shall require every existing change unit that must be selected for the deletion and its cascades to remain valid. The handler shall register those dependencies and stage their forward dependency closure in the same transaction as the delete operation.

Existing dependent edit actions shall retain their original `groupId`. Edit actions newly produced by the DELETE request shall retain the DELETE request's `groupId`.

The initial implementation shall leave an explicit TODO at the handler integration point for dependency registration and automatic staging. Reverse-dependent unstaging belongs to the general Stage/Unstage mechanism and is not implemented by the Delete Module handler.

### FR-DM-07: Imported subgraph guard

If the module's effective subgraph is imported/read-only, deletion shall fail with HTTP 422 and issue code `ARC-MOD-SUBGRAPH-IMPORTED`. Structural removal from imported subgraphs is not permitted.

### FR-DM-08: Validate before recording edits

Module existence, project/file ownership, and the imported-subgraph guard shall be resolved before any delete-operation edit action is recorded. A validation failure shall leave the session unchanged.

---

## 5. Module Cascade Requirements

### FR-DM-09: Delete the module aggregate

The successful operation shall make the following module-owned records absent from effective state:

- the `spf_modules` row;
- its same-system-ID `nodes` row;
- all DataPorts owned by that Node;
- all ControlPorts owned by that Node;
- all Intents owned by those ControlPorts;
- all CKVs, CKV parameter payloads, and CKV value associations owned by the module;
- all module tag mappings, TKVs, TKV parameter payloads, and TKV value associations owned by the module.

Referenced shared definitions, including module, parameter, tag, key/value, property, and container-type definitions, shall not be deleted.

### FR-DM-10: Delete connected canonical links

For a successful operation using `linkDeletionMode=full`, every effective canonical DataLink or ControlLink whose endpoint is the deleted module or one of its ports shall be cascade-deleted. The presence or number of connected links alone shall not reject the operation.

Each canonical link shall appear only once in the response even if both endpoints or multiple route segments match the deletion set.

### FR-DM-10A: Link deletion mode

The endpoint shall accept an optional `linkDeletionMode` query parameter with these values:

- `full` - apply full link deletion to every connected route;
- `segmentOnly` - apply segment-only deletion to every connected resolved route.

The parameter applies uniformly to every connected DataLink and ControlLink route in one DELETE Module request; per-link or per-segment mode selection is out of scope. When omitted, the mode shall default to `full` to preserve existing client behavior. A value other than `full` or `segmentOnly` shall return HTTP 400 before command execution.

### FR-DM-10B: Segment-only deletion of resolved routes

For `linkDeletionMode=segmentOnly`, a canonical DataLink or ControlLink connected to the deleted module shall be deleted because it cannot retain an endpoint owned by the deleted module. The operation shall delete every resolved subsystem segment in that route whose endpoint is the deleted module.

Every other resolved subsystem segment belonging to that canonical link shall remain in effective state, but its canonical-link FK shall be set to null in the edit-action overlay. These retained segments become unresolved and remain available for later route resolution. A direct canonical link with no subsystem segments is deleted in full under either mode.

### FR-DM-11: Delete subsystem link segments

For full link deletion, when a deleted canonical link has effective subsystem route segments, all of its `subsystem_data_links` or `subsystem_control_links` rows shall also be deleted under the same operation group.

### FR-DM-11A: Delete unresolved subsystem link chains

Before deleting an unresolved subsystem link chain reached from the deleted module or one of its ports, the operation shall attempt to resolve the chain into a complete canonical link. If resolution succeeds, it shall apply the selected `linkDeletionMode` as it would to an already resolved route.

If the chain cannot be resolved into a complete canonical link, every reachable unresolved subsystem link segment shall be deleted under the same operation group, regardless of `linkDeletionMode`. Unresolved subsystem link segments unrelated to the deleted module shall remain unchanged.

### FR-DM-12: Retain subsystem boundary ports during edit-time deletion

After subsystem link segments are removed, subsystem-node boundary DataPorts and ControlPorts shall remain present during edit-time module deletion even when no surviving effective link segment references them.

The DELETE Module endpoint shall not delete subsystem boundary DataPorts or ControlPorts solely because they become unused. Cleanup of unused subsystem boundary ports is deferred to commit-time subsystem normalization and shall be based on the final staged graph at commit time, not only on the links touched by this DELETE request.

### FR-DM-13: Clear stale routed-control intents

Control-link route cleanup shall use the existing `ControlIntentPropagationService` behavior so that intents propagated along a deleted control route do not remain on surviving control ports. Only intents no longer justified by a surviving effective route shall be removed.

Every surviving subsystem ControlPort whose Intents are cleared by this operation shall be reported once under `updated.subsystems[].intentsClearedControlPorts`.

`ControlIntentPropagationService` currently exists under `packages/core/src/domain/services/subsystem-control-links/`. If it is absent on the implementation branch, replacing or recreating that service is out of scope; the implementation shall leave an explicit TODO at the integration point.

---

## 6. Container Requirements

### FR-DM-14: Determine effective container occupancy

After excluding the requested module and all other effective session deletions, the operation shall determine whether any effective modules remain in the module's container. Active module creates and container moves shall be included regardless of whether their edit actions are `STAGED` or `UNSTAGED`.

### FR-DM-15: Delete an empty container

If no effective module remains in the affected container, the container and all of its `container_property_data` rows shall be deleted.

Container deletion is independent of subgraph deletion. In particular:

- the container may be deleted while the subgraph remains;
- the subgraph may be deleted while the container remains because modules in other subgraphs still use it;
- both may be deleted when each independently becomes empty.

### FR-DM-16: Recalculate a surviving container's stack size

If the affected container remains, its stack-size property shall be recalculated from all effective modules remaining in that container, using the shared behavior defined by `REQ-CSS-04` in `add-module-requirements.md`. The resulting value is the maximum declared module-definition stack size, or `0` when no remaining definition supplies a positive value.

The stack-size update shall be recorded as part of the delete operation's edit-action group and share its `groupId`.

### FR-DM-16A: Report a surviving container update

When FR-DM-16 recalculates the affected Container's stack size, the success response shall include that Container once in `updated.containers`, with:

- its `systemId` as a decimal string;
- its resulting effective `stackSize` as a non-negative integer.

`updated.containers` shall be `[]` when FR-DM-15 deletes the affected Container. A Container shall never appear in both `deleted.containers` and `updated.containers` for one operation.

`updated.usecases` remains an ID-only summary. The operation reports its changed UseCase IDs, while `deleted.subgraphs`, `deleted.dataLinks`, and `deleted.controlLinks` report the relationship causes separately.

---

## 7. Subgraph and UseCase Requirements

### FR-DM-17: Determine effective subgraph occupancy

After excluding the requested module and all other effective session deletions, the operation shall determine whether any effective modules remain in the module's subgraph. Active module creates and subgraph moves shall be included regardless of whether their edit actions are `STAGED` or `UNSTAGED`.

### FR-DM-18: Delete an empty subgraph

If no effective module remains in the affected subgraph, the subgraph and all data owned by it shall be deleted, including:

- `subgraph_property_data`;
- SGKV records and their value associations;
- VCPM records and their dependent data.

The `subgraphId` values present on DataLinks and ControlLinks do not express ownership by the subgraph and shall not cause link deletion. Link deletion is determined only by FR-DM-10 from module or port endpoints.

Subgraph deletion is independent of container deletion as defined by FR-DM-15.

### FR-DM-19: Remove UseCase relationships

When a subgraph is deleted, all effective `use_case_subgraphs` rows referencing it shall be removed. All effective `use_case_subgraph_pairs` rows where it is either the source or destination subgraph shall also be removed.

### FR-DM-19A: UseCase relationship edit identity

`use_case_subgraphs` and `use_case_subgraph_pairs` shall be edit-addressable persistence rows. Each row shall have a persistence-only generated `system_id`, plus the existing natural uniqueness constraints on its relationship columns.

The generated relationship `system_id` is an internal persistence identity used for `edit_actions.targetSystemId`, base-version capture, and overlay processing. It shall not be exposed through the core UseCase domain model or public API response.

Bulk import shall assign these relationship `system_id` values through the existing file-scoped ID generation mechanism before Delete Module writes UseCase relationship delete actions.

### FR-DM-20: Preserve UseCases

UseCase rows shall not be deleted, including when the removed relationships leave a UseCase with no subgraphs or no subgraph pairs.

Every UseCase changed by FR-DM-19 shall be reported once in `updated.usecases`.

---

## 8. Effective-State and Atomicity Requirements

### FR-DM-21: Effective-state decisions

All existence, relationship, occupancy, route cleanup, and cascade decisions shall use effective session state rather than committed tables alone. The overlay shall include active `STAGED` and `UNSTAGED` edit actions for at least:

- module, container, subgraph, subsystem, port, link, and UseCase-relation creates/deletes;
- module container/subgraph/parent moves;
- link route and intent changes.

### FR-DM-22: One operation group

All edit actions produced by one DELETE request shall share one `groupId`, including module-owned data, links, subsystem route artifacts, routed-control intent cleanup, container/subgraph cascades, UseCase relationship changes, and a surviving container's stack-size update.

### FR-DM-23: Aggregate identity

Each aggregate root shall retain its own `aggregateId` in the delete operation's edit actions. Owned child rows shall use the aggregate ID dictated by the existing edit framework. Sharing a `groupId` shall not collapse distinct aggregates into one aggregate identity.

### FR-DM-24: Transactional outcome

Cascade discovery and edit-action recording shall occur within the command handler's transaction. Any failure shall roll back all changes from the request. A successful handler result shall not be returned until the transaction commits.

When `DiffMerge` support is enabled, dependency registration and forward dependency staging shall occur in that same transaction.

### FR-DM-25: Internal group ID result

The command handler shall return the generated `groupId` together with the data needed to form the deletion summary. The controller shall omit `groupId` from the HTTP response until the public API contract explicitly adds it.

---

## 9. Response Requirements

### FR-DM-26: Stable top-level summary fields

The success response data shall always contain these arrays, using `[]` when a category is unaffected:

```json
{
  "deleted": {
    "spfModules": [],
    "subgraphs": [],
    "containers": [],
    "dataLinks": [],
    "controlLinks": []
  },
  "updated": {
    "containers": [],
    "usecases": []
  }
}
```

All system IDs shall be serialized as decimal strings, consistent with the existing API DTO convention.

### FR-DM-27: Primary and structural entity reporting

- `deleted.spfModules` shall contain exactly the requested module system ID.
- `deleted.containers` shall contain the affected container ID only when FR-DM-15 deletes it.
- `deleted.subgraphs` shall contain the affected subgraph ID only when FR-DM-18 deletes it.
- `updated.containers` shall contain the affected Container only when it survives and its stack size is recalculated, as required by FR-DM-16A.
- `updated.usecases` shall contain the deduplicated IDs identified by FR-DM-20.

### FR-DM-28: Link reporting for non-subsystem files

For a non-subsystem-capable file, each deleted link entry shall contain only the canonical link system ID:

```json
{
  "systemId": "4001"
}
```

Subsystem-specific fields shall be omitted, not returned as empty arrays, so clients for files without subsystem concepts are not exposed to those concepts. This includes omitting `subsystemLinks` from canonical link entries, omitting `deleted.unresolvedSubsystemDataLinks` and `deleted.unresolvedSubsystemControlLinks`, and omitting `updated.subsystems`.

### FR-DM-29: Link reporting for subsystem-capable files

For a subsystem-capable file, each deleted canonical link shall group the subsystem link segments deleted with that canonical link under `subsystemLinks`:

```json
{
  "systemId": "4001",
  "subsystemLinks": [
    {"systemId": "4101"},
    {"systemId": "4102"}
  ]
}
```

`subsystemLinks` shall be present for every deleted canonical link in a subsystem-capable file and shall use `[]` when no subsystem segments are deleted with that link. In `segmentOnly` mode, retained siblings detached from the canonical link are not included in `subsystemLinks`.

The same entry shape applies independently to `deleted.dataLinks` and `deleted.controlLinks`.

Deleted unresolved subsystem link segments shall not be attached to a canonical link. They shall be reported once in separate arrays under `deleted`:

```json
{
  "deleted": {
    "unresolvedSubsystemDataLinks": [
      {"systemId": "4301"}
    ],
    "unresolvedSubsystemControlLinks": []
  }
}
```

For a subsystem-capable file, both unresolved-link arrays shall be present and shall use `[]` when unaffected. A subsystem link segment shall appear either under one canonical link's `subsystemLinks` or in one unresolved-link array, never both.

Each affected subsystem shall be reported under `updated.subsystems`, grouped by the subsystem that owns the ControlPorts whose Intents were cleared:

```json
{
  "updated": {
    "subsystems": [
      {
        "systemId": "3001",
        "intentsClearedControlPorts": [
          {"systemId": "4201"}
        ]
      }
    ]
  }
}
```

For a subsystem-capable file, `updated.subsystems` shall be present and shall use `[]` when no subsystem ControlPort Intents are cleared. Every subsystem entry shall contain `intentsClearedControlPorts`, using `[]` only if an entry is retained for deterministic grouping reasons. Cleared Intent IDs are not included in the HTTP response. Detached subsystem segments are not reported as updates or deletions.

### FR-DM-30: Deterministic, duplicate-free response

Every response array, including `updated.subsystems`, and every nested subsystem-link or control-port array shall be duplicate-free and deterministically ordered by numeric system ID ascending. This avoids response changes caused only by database query order.

---

## 10. Invariants

**I-DM-01 - No ownerless module data:** No effective module-owned row remains after its module is deleted.

**I-DM-02 - No dangling links:** No effective canonical or subsystem link references the deleted module or its ports after the operation. Subsystem boundary ports may remain without link references during editing.

**I-DM-03 - No empty structural owners:** After the operation, the affected container and subgraph exist if and only if each has at least one effective module.

**I-DM-04 - UseCase preservation:** Module or subgraph cascade deletion never deletes a UseCase.

**I-DM-05 - Shared definitions survive:** Definition data referenced by module-owned or subgraph-owned instance data is never deleted by this endpoint.

**I-DM-06 - Undo/redo and selection semantics:** The requested delete and every edit action created by the request form one API-call group for undo and redo. Stage and Unstage behavior follows atomic selection groups and directed change dependencies rather than implicit API-call grouping.

**I-DM-07 - Effective-state correctness:** For any accepted operation, applying any sequence of active `STAGED` and `UNSTAGED` create, patch, move, and delete groups yields the same cascade decision as evaluating the resulting effective graph directly.

**I-DM-08 - Surviving stack size correctness:** A surviving affected container's stack size equals the maximum declared stack size of its effective modules, and `updated.containers` reports that same resulting value.

**I-DM-09 - Edit-time subsystem port stability:** Delete Module shall not remove subsystem boundary ports merely because this operation removes their last route segment. Any cleanup of unused subsystem boundary ports occurs during commit-time subsystem normalization against the final staged graph.

**I-DM-10 - Segment-only route consistency:** A segment-only deletion never leaves a surviving subsystem segment associated with a deleted canonical link. Each retained sibling segment is explicitly detached in effective state.

---

## 11. Non-Functional Requirements

**NFR-DM-01 - Architectural boundaries:** The API layer shall only adapt HTTP input/output. Command orchestration and business decisions belong in `@arc/core`; TypeORM queries and edit persistence belong in `@arc/persistence`.

**NFR-DM-02 - CQRS compliance:** The endpoint shall execute a registered `BaseCommand` through `CommandBus`; it shall not write directly from the controller.

**NFR-DM-03 - Bounded cascade discovery:** Persistence operations shall retrieve related entities in sets by relationship category. The implementation shall avoid issuing one query per owned child, link segment, or UseCase relationship.

**NFR-DM-04 - Logging:** Operational logs shall follow the repository's structured logging convention. Entity IDs shall be logged in hexadecimal through `BinaryUtils.toHexString()` and paired with a readable identifier when one is available.

**NFR-DM-05 - Verification:** Unit tests shall cover command behavior and edge cases, including the returned stack size for a surviving Container; persistence integration tests shall cover effective-state relationship queries and recorded delete actions; and API e2e tests shall cover status codes and all conditional response shapes. When `DiffMerge` support is enabled, tests shall also cover forward dependency staging and reverse-dependent unstaging.

**NFR-DM-06 - Link-mode verification:** Tests shall cover `full`, omitted-mode defaulting, and `segmentOnly` behavior for DataLink and ControlLink routes. They shall cover resolved routes, resolvable unresolved chains, and unresolved chains that cannot resolve.

---

## 12. Out of Scope

- Deleting UseCases, Subsystems, shared definitions, files, or projects.
- Adding `groupId` to the public HTTP response.
- A bulk module-delete endpoint.
- Direct container-delete or subgraph-delete endpoints.
- Edit-time removal of subsystem boundary ports merely because they become unused after this delete.
- Implementing the general change-selection dependency mechanism as part of the initial Designer-only Delete Module delivery.
- Independently creating, updating, or deleting CKV/TKV calibration or tag data outside module aggregate cleanup.
- Repairing unrelated invalid pre-existing graph data outside the cascade set reached by this request.
- Returning all deleted module-owned child IDs, deleted Intent IDs, or full deleted entity objects.
- Selecting a different link-deletion mode for individual links or segments within one DELETE Module request.

---

## 13. Open Questions

There are no unresolved product-behavior questions. Repository interfaces, cascade orchestration boundaries, and exact internal result types remain design decisions and do not require additional product decisions.
