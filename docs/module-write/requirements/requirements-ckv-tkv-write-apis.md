# Requirements: Module CKV/TKV Write APIs

## Scope

These requirements cover the 10 write endpoints in `SpfModuleController` that are currently `NotImplementedException` placeholders:

1. `POST  /arc-api/v1/projects/:projectId/spf-modules/:spfModuleSystemId/ckvs`
2. `DELETE /arc-api/v1/projects/:projectId/spf-modules/:spfModuleSystemId/ckvs`
3. `POST  /arc-api/v1/projects/:projectId/spf-modules/:spfModuleSystemId/tags`
4. `DELETE /arc-api/v1/projects/:projectId/spf-modules/:spfModuleSystemId/tags`
5. `POST  /arc-api/v1/projects/:projectId/spf-modules/:spfModuleSystemId/tags/:tagSystemId/tkvs`
6. `DELETE /arc-api/v1/projects/:projectId/spf-modules/:spfModuleSystemId/tags/:tagSystemId/tkvs`
7. `POST  /arc-api/v1/projects/:projectId/spf-modules/:spfModuleSystemId/ckv-parameters`
8. `DELETE /arc-api/v1/projects/:projectId/spf-modules/:spfModuleSystemId/ckv-parameters`
9. `POST  /arc-api/v1/projects/:projectId/spf-modules/:spfModuleSystemId/tkv-parameters`
10. `DELETE /arc-api/v1/projects/:projectId/spf-modules/:spfModuleSystemId/tkv-parameters`

**Reference source:** `docs/module-write/requirements/requirements-module-ckv-tkv.md` (C# QACT extraction).

**API mapping to C# reference:**

| Our REST API | C# API |
|---|---|
| POST /ckvs | AddCkvForModule (batch) |
| DELETE /ckvs | RemoveCkvForModule (batch by ckvSystemId) |
| POST /tags | AddTagForModule (batch) |
| DELETE /tags | RemoveTagForModule (batch by tagSystemId) |
| POST /tags/:tagSystemId/tkvs | AddTkvForModule (batch under one tag) |
| DELETE /tags/:tagSystemId/tkvs | RemoveTkvForModule (batch by tkvSystemId under one tag) |
| POST /ckv-parameters | UpdatePidCkvPolicy(supportCkv=true) over a list of parameterSystemIds |
| DELETE /ckv-parameters | UpdatePidCkvPolicy(supportCkv=false) over a list of parameterSystemIds |
| POST /tkv-parameters | UpdatePidTkvPolicy(supportTkv=true) per TKV, over a list of parameterSystemIds |
| DELETE /tkv-parameters | UpdatePidTkvPolicy(supportTkv=false) per TKV, over a list of parameterSystemIds |

---

## Prerequisite: serializeDefaultParameterData()

All new CKV/TKV entries must be seeded with default payloads derived from the module definition's `elementsStructure` JSON. A function `serializeDefaultParameterData(elementsStructure: string)` does not yet exist — it must be implemented as part of this work.

### REQ-DEFAULT-01
`serializeDefaultParameterData(elementsStructure: string): SerializeResult` must be added to `packages/core/src/application/usecase-designer/shared/serialize-elements.ts` (shared location, reused by all new write APIs and referenced by existing TODOs).

### REQ-DEFAULT-02
The implementation reuses the existing `serializeParameterData()` pipeline. It does so by:
1. Calling `convertParamDefinition(elementsStructure)` to parse the schema into `DefinitionElement[]`.
2. Converting the `DefinitionElement[]` into `ElementData[]` using each element's `defaultValue` field (populating `value` on `ConfigElementData` from `ConfigElement.defaultValue`). If no `defaultValue` is present, use `"0"` for numeric types.
3. Calling `serializeParameterData(definition, derivedElements)` to serialize the result.

This avoids duplicating serialization logic — the new function only introduces the schema-to-default-ElementData mapping step.

### REQ-DEFAULT-03
Must handle all element types: `ConfigElement` → `ConfigElementData`, `Struct` → `StructData`, `ElementArray` → `ElementArrayData`, `StructArray` (mapped as `ElementArrayData`).

### REQ-DEFAULT-04
On schema parse error, returns `{ok: false, error: string}` matching the `SerializeResult` type.

---

## Prerequisite: createCkv() infrastructure adapter

`ModuleRepository.createCkv()` is declared on the port interface but the infrastructure implementation throws `not yet implemented`. It must be implemented as part of this work.

### REQ-CREATECKV-01
The infrastructure adapter for `createCkv(kvData: KvData, moduleSystemId: number, options?: EditOptions)` must stage a `CREATE` row for the CKV entity and one `CREATE` row per `CkvParameterPayload` child in a single grouped edit action (same `groupId`).

### REQ-CREATECKV-02
For the zero CKV, `kvData.valueDefinitionSystemIds` is empty (`[]`). The write pattern must allow this.

---

## Prerequisite: Parameter list deduction

When creating a CKV or TKV, the handler must determine which parameters to seed. The following strategy applies:

### REQ-PARAMLIST-01
If the module already has at least one non-zero CKV: read the parameter list from any existing CKV's `CkvParameterPayload` rows (all CKVs share the same parameter set for a given module).

### REQ-PARAMLIST-02
If the module has no non-zero CKVs (only a zero CKV or no CKVs at all): fetch all parameter definitions for the module definition (`getParameterDefinitions(definitionSystemId)`) and filter to those with `toolPolicy` containing `CALIBRATION` (`TOOL_POLICY.Calibration`).

### REQ-PARAMLIST-03
For TKV creation, the same deduction applies but scoped to the specific tag: if the tag already has at least one TKV, read its parameter list from the first TKV's `TkvParameterPayload` rows. Otherwise fall back to REQ-PARAMLIST-02.

---

## 1. POST /ckvs — Add CKVs to a module

### REQ-ACK-01: Module validation
Validate the SpfModule exists in the session's file. Throw `ResourceNotFoundException` (404) if not found.

### REQ-ACK-02: Batch semantics — best-effort
Process each `CreateCkvRequestItem` independently. If one item fails, continue processing the remaining items. Return partial success if any items fail.

### REQ-ACK-03: CKV creation
For each `valueSystemIds` array in the request, allocate a new `systemId` (via `IdGenerationPort`) and stage a new CKV row and its parameter payloads via `createCkv()`.

### REQ-ACK-04: Parameter seeding
Each new CKV is seeded with all parameters deduced per REQ-PARAMLIST-01/REQ-PARAMLIST-02. Each parameter payload is initialized using `serializeDefaultParameterData(param.elementsStructure)`.

### REQ-ACK-05: Zero-CKV removal
When a non-zero CKV is successfully created and a zero CKV exists on the module, the zero CKV and all its parameter payloads must be removed (staged DELETE) in the same transaction.

### REQ-ACK-06: Transaction atomicity per CKV
Each CKV's creation (CKV row + parameter payloads + zero-CKV removal) is within the same unit-of-work transaction. All-or-nothing per CKV.

### REQ-ACK-07: Response
Return `AddCkvsResponseDto` containing:
- `addedCkvs`: array of `CkvDto` (systemId, keyValuePairs, supportedParameters) for all successfully created CKVs.
- `removedCkvSystemIds`: system IDs of any zero CKVs removed as side effects.

### REQ-ACK-08: Duplicate CKV check
If a CKV with the same `valueDefinitionSystemIds` already exists on the module, skip that item (treat as no-op or return as a per-item error in the result). Do not create a duplicate.

---

## 2. DELETE /ckvs — Remove CKVs from a module

### REQ-RCK-01: Module validation
Validate the SpfModule exists. Throw 404 if not found.

### REQ-RCK-02: Batch semantics — best-effort
Process each `ckvSystemId` independently. Skip (return error for that entry) if a CKV is not found, continue processing the rest.

### REQ-RCK-03: CKV removal
Stage DELETE rows for the CKV and all its `CkvParameterPayload` children.

### REQ-RCK-04: Zero-CKV restoration
After removing all requested CKVs, check if any non-zero CKVs remain. If none remain, create a zero CKV and seed it with all CALIBRATION parameters (REQ-PARAMLIST-02).

### REQ-RCK-05: Response
Return the list of `CkvDto` for all successfully removed CKVs.

---

## 3. POST /tags — Add (bare) tags to a module

### REQ-ATG-01: Module validation
Validate SpfModule exists. Throw 404 if not found.

### REQ-ATG-02: Tag definition validation
Each `tagDefinitionSystemId` in the request must exist. Throw a per-item error if a tag definition is not found.

### REQ-ATG-03: Duplicate check
If the module already has a tag for the given `tagDefinitionSystemId`, skip that item (no-op or per-item error). Do not create duplicate tag associations.

### REQ-ATG-04: Tag association creation
Stage CREATE rows for `ModuleTagIdMap` (spfModuleSystemId + tagDefinitionSystemId + allocated systemId).

### REQ-ATG-05: No TKV data created
This endpoint creates a bare tag association only — no TKVs, no parameter payloads.

### REQ-ATG-06: Response
Return `TagInfoResponseDto[]` for all successfully added tags (systemId, tagId, tagName, tkvs=[]).

---

## 4. DELETE /tags — Remove tags from a module

### REQ-RTG-01: Module validation
Validate SpfModule exists. Throw 404 if not found.

### REQ-RTG-02: Tag existence check
Each `tagSystemId` must be a valid `ModuleTagIdMap.systemId` for this module. Return per-item error if not found.

### REQ-RTG-03: Cascade to TKVs
When removing a tag, also remove all TKVs (and their `TkvParameterPayload` rows) associated with that tag. The DB has `ON DELETE CASCADE` on `ModuleTagIdMap → Tkv`, but the handler must explicitly stage these deletions in `edit_actions` so within-session reads see the changes immediately.

### REQ-RTG-04: Response
Return `TagInfoResponseDto[]` for all successfully removed tags.

---

## 5. POST /tags/:tagSystemId/tkvs — Add TKVs to a tag

### REQ-ATV-01: Module + tag validation
Validate SpfModule exists (404) and the `tagSystemId` refers to a valid `ModuleTagIdMap` entry on this module (404 if not found).

### REQ-ATV-02: Batch semantics — best-effort
Process each `CreateTkvRequestItem` independently.

### REQ-ATV-03: TKV creation
For each item, allocate a new `systemId` and stage CREATE rows for the TKV (`Tkv`) and its parameter payloads (`TkvParameterPayload`).

### REQ-ATV-04: Parameter seeding
Each new TKV is seeded with all parameters deduced per REQ-PARAMLIST-03 (TKV-scoped deduction). Each parameter payload is initialized using `serializeDefaultParameterData(param.elementsStructure)`.

### REQ-ATV-05: Duplicate TKV check
If a TKV with the same `valueDefinitionSystemIds` already exists under this tag, skip that item.

### REQ-ATV-06: Response
Return `TkvDto[]` for all successfully created TKVs (systemId, keyValuePairs, supportedParameters).

---

## 6. DELETE /tags/:tagSystemId/tkvs — Remove TKVs from a tag

### REQ-RTV-01: Module + tag validation
Validate SpfModule and `tagSystemId`. Throw 404 if either is not found.

### REQ-RTV-02: TKV existence check
Each `tkvSystemId` must belong to the given tag. Return per-item error if not found.

### REQ-RTV-03: TKV removal
Stage DELETE rows for the TKV and all its `TkvParameterPayload` children.

### REQ-RTV-04: Bare-tag retention
Removing TKVs does NOT remove the bare tag association from `ModuleTagIdMap`.

### REQ-RTV-05: Response
Return `TkvDto[]` for all successfully removed TKVs.

---

## 7. POST /ckv-parameters — Add parameters to all CKVs

Maps to `UpdatePidCkvPolicy(supportCkv=true)` applied to a list of `parameterSystemIds`.

### REQ-ACP-01: Module validation
Validate SpfModule exists. Throw 404 if not found.

### REQ-ACP-02: Parameter validation
For each `parameterSystemId`, verify it exists in the module definition's parameter list. Per-item error if not found.

### REQ-ACP-03: Add to existing CKVs
For each validated parameter, iterate all non-zero CKVs on the module. For any CKV that does not already have a payload for this parameter, stage CREATE of `CkvParameterPayload` seeded with `serializeDefaultParameterData(param.elementsStructure)`.

### REQ-ACP-04: Zero-CKV fallback
If no non-zero CKVs exist, add the parameter to the zero CKV instead (or create the zero CKV if absent). This matches C# UCP-F-04 behavior.

### REQ-ACP-05: Idempotency per CKV
If a CKV already has a payload for the given parameter, skip it (no-op for that CKV).

### REQ-ACP-06: Response
Return `CkvParametersResponseDto` containing the updated list of all parameters supported across all CKVs.

---

## 8. DELETE /ckv-parameters — Remove parameters from all CKVs

Maps to `UpdatePidCkvPolicy(supportCkv=false)` applied to a list of `parameterSystemIds`.

### REQ-DCP-01: Module validation
Validate SpfModule exists. Throw 404 if not found.

### REQ-DCP-02: Remove from all CKVs
For each `parameterSystemId`, iterate all non-zero CKVs and stage DELETE for the `CkvParameterPayload` row where it exists.

### REQ-DCP-03: Empty CKV collapse
If removing a parameter leaves a CKV with zero remaining parameter payloads, delete the CKV itself (and restore zero-CKV if it was the last non-zero CKV, per the zero-CKV invariant — same as REQ-RCK-04).

### REQ-DCP-04: Response
Return `CkvParameterRemovalResponseDto` containing:
- `removedParameterSystemIds`: parameters that were actually removed.
- `removedCkvSystemIds`: CKVs deleted because they became empty.
- `affectedCkvSystemIds`: CKVs that had the parameter removed but still exist.

---

## 9. POST /tkv-parameters — Add parameters to specific TKVs

Maps to `UpdatePidTkvPolicy(supportTkv=true)` per TKV, for a list of parameterSystemIds.

### REQ-ATP-01: Module validation
Validate SpfModule exists. Throw 404 if not found.

### REQ-ATP-02: TKV + parameter validation
For each `TkvParameterUpdateItem`, validate the `tkvSystemId` exists on the module. For each `parameterSystemId`, validate it exists in the module definition.

### REQ-ATP-03: Add to specified TKVs
For each (tkv, param) pair where the TKV does not already have a payload for that parameter, stage CREATE of `TkvParameterPayload` seeded with `serializeDefaultParameterData(param.elementsStructure)`.

### REQ-ATP-04: Idempotency
If a TKV already has a payload for the given parameter, skip it.

### REQ-ATP-05: Response
Return `TkvParametersResponseDto` listing each TKV with its updated supported parameters.

---

## 10. DELETE /tkv-parameters — Remove parameters from specific TKVs

Maps to `UpdatePidTkvPolicy(supportTkv=false)` per TKV, for a list of parameterSystemIds.

### REQ-DTP-01: Module validation
Validate SpfModule exists. Throw 404 if not found.

### REQ-DTP-02: TKV existence check
For each `TkvParameterUpdateItem`, validate the `tkvSystemId` exists on the module.

### REQ-DTP-03: Remove from specified TKVs
For each (tkv, param) pair, stage DELETE for the `TkvParameterPayload` row if it exists.

### REQ-DTP-04: Response
Return `TkvParameterRemovalResponseDto` listing per-TKV which parameters were removed.

---

## Cross-Cutting Requirements

### REQ-XC-01: Session context
All write operations run within the active edit session. IDs and overlays are scoped to `fileSystemId` from `UnitOfWork.getWriteContext().session`.

### REQ-XC-02: Atomic transactions
All write operations (CREATE/DELETE stages) for a single request use `UnitOfWork.startTransaction()` → `commit()` with rollback on failure.

### REQ-XC-03: GroupId in response
All write operations return a `groupId` in the response for undo/redo support.

### REQ-XC-04: System ID allocation
New entity system IDs are allocated via `IdGenerationPort.getNextId(fileSystemId)`.

### REQ-XC-05: Tool policy filter for CALIBRATION params
When fetching parameter definitions for seeding, only parameters with `toolPolicy` containing `CALIBRATION` (`TOOL_POLICY.Calibration`) are eligible.

### REQ-XC-06: ParameterDefinitionBase extension
The `ParameterDefinitionBase` interface (used by `getParameterDefinitions()`) must be extended to include `toolPolicy: string` so handlers can filter to CALIBRATION-capable params.

### REQ-XC-07: No ReadModel changes for request validation
All validation reads use existing port methods (e.g., `getSpfModuleForValidation`, `ckvExists`). New read methods on the port must be added only where strictly necessary.

---

## Out of Scope

- GET /ckv-parameters and GET /tkv-parameters — read-only endpoints not covered here.
- GET /tag-data/:tagSystemId/:tkvSystemId and PUT /tag-data — TKV cal-data read/write, separate feature.
- DELETE /spf-modules/:spfModuleSystemId — module deletion, separate feature.
- PidType-based CKV support filtering (the C# `CKVViewModel.SupportKVs` client-side filter). Our REST API accepts explicit parameterSystemIds; the client is responsible for pre-filtering.
- The commented-out PidPolicy first-class field from C# (D-09 in reference doc) — not implemented in C# either.
