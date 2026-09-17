# Design: Module CKV/TKV Write APIs

Requirements: [../requirements/requirements-ckv-tkv-write-apis.md](../requirements/requirements-ckv-tkv-write-apis.md)

---

## 1. Overview

This document describes the implementation design for 10 write endpoints on `SpfModuleController` and the infrastructure required to support them. The implementation follows the established CQRS + DDD + hexagonal architecture pattern exemplified by `PutCkvCalDataHandler`.

**Endpoints implemented:**

| Endpoint | Command |
|---|---|
| POST /ckvs | `AddCkvsCommand` |
| DELETE /ckvs | `RemoveCkvsCommand` |
| POST /tags | `AddTagsCommand` |
| DELETE /tags | `RemoveTagsCommand` |
| POST /tags/:tagSystemId/tkvs | `AddTkvsCommand` |
| DELETE /tags/:tagSystemId/tkvs | `RemoveTkvsCommand` |
| POST /ckv-parameters | `AddCkvParametersCommand` |
| DELETE /ckv-parameters | `RemoveCkvParametersCommand` |
| POST /tkv-parameters | `AddTkvParametersCommand` |
| DELETE /tkv-parameters | `RemoveTkvParametersCommand` |

---

## 2. Shared Infrastructure Changes

These changes are prerequisites for all 10 endpoints.

### 2.1 `serializeDefaultParameterData()` — new shared function

**File:** `packages/core/src/application/usecase-designer/shared/serialize-elements.ts`

This function generates a default `Uint8Array` payload from `elementsStructure` alone, by:
1. Calling `convertParamDefinition(elementsStructure)` → `DefinitionElement[]`
2. Mapping each `DefinitionElement` to `ElementData` using `defaultValue` from the schema
3. Calling the existing `serializeParameterData()` with the derived `ElementData[]`

This reuses 100% of the existing binary serialization pipeline. The only new code is the `DefinitionElement[] → ElementData[]` mapping using defaults.

```typescript
export function serializeDefaultParameterData(
  definition: ParameterDefinitionBase,
): SerializeResult {
  let schema: DefinitionElement[];
  try {
    schema = convertParamDefinition(definition.elementsStructure);
  } catch {
    return {ok: false, error: 'Failed to parse elementsStructure JSON'};
  }
  const defaultElements = buildDefaultElements(schema);
  return serializeParameterData(definition, defaultElements);
}

function buildDefaultElements(schema: DefinitionElement[]): ElementCalData[] {
  // Maps each DefinitionElement → ElementData using defaultValue or '0'
  // ConfigElement → ConfigElementData{value: el.defaultValue ?? '0'}
  // Struct → StructData{value: buildDefaultElements(el.elements)}
  // ElementArray → ElementArrayData{value: repeated template defaults}
  // StructArray → ElementArrayData with struct template defaults
}
```

**Why no new binary logic:** `serializeParameterData()` already handles all types and data sizes. `buildDefaultElements()` only maps schema fields to the data format `serializeParameterData()` already accepts.

### 2.2 `ParameterDefinitionBase` — add `toolPolicy` field

**File:** `packages/core/src/application/ports/persistence/repositories/module/module-definition.repository.ts`

Add `toolPolicy: string` to `ParameterDefinitionBase`:

```typescript
export interface ParameterDefinitionBase {
  systemId: number;
  isReadOnly: boolean;
  elementsStructure: string;
  toolPolicy: string;  // NEW — from spf_module_parameter_definition.tool_policies (first entry)
}
```

**File:** `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/module/module-definition.repository.ts`

Update `getParameterDefinitions()` to include `toolPolicy` in the returned rows.

**Note:** `toolPolicy` is stored as a JSON array in the DB column `tool_policies`. Extract the first entry (existing `parseFirstToolPolicy()` pattern from `spf-module-definition-dto.ts`).

### 2.3 `createCkv()` infrastructure adapter

**File:** `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/module/module.repository.ts`

Remove the `Promise.reject` stub and implement the adapter. The write order must respect FK constraints:

```
1. writeCreate(Ckv)  { systemId, spfModuleSystemId, uiPersistence: null, valueDefinitionSystemIds: number[] }
   — valueDefinitionSystemIds is embedded in the newValue payload of the Ckv CREATE action
2. For each parameterPayload: writeCreate(CkvParameterPayload) { ckvSystemId, parameterSystemId, payload }
```

All writes use `aggregateId = moduleSystemId`.

**Note on CkvValues:** The `ckv_values` table uses a composite PK (`ckvSystemId + valueDefSystemId`) and has no `systemId`, so it cannot be tracked as a separate `edit_actions` row. Instead, `valueDefinitionSystemIds` is embedded in the `Ckv` CREATE action's `newValue` payload. The `CkvOverlayFetcher.fetchForModule()` must be updated to reconstruct `OverlaidCkv.values` from the CREATE action payload when the CKV is pending (not yet in the base table). The `/commit-changes` handler (when implemented) will expand the Ckv payload and write the actual `ckv_values` rows.

**Parallel note for TkvValues:** Same pattern applies — `tkv_values` rows are embedded in the `Tkv` CREATE action payload.

**Updated `CkvOverlayFetcher.fetchForModule()`:** The method must check CREATE actions for Ckv — when it encounters a CREATE action, it reads `valueDefinitionSystemIds` from the action's `newValue` payload and populates `OverlaidCkv.values` from it instead of from the base table.

### 2.4 New repository methods on `ModuleRepository` port

**File:** `packages/core/src/application/ports/persistence/repositories/module/module.repository.ts`

```typescript
// Returns all overlaid Ckv rows for the module (systemId + valueDefinitionSystemIds + spfModuleSystemId)
getAllCkvsForModule(spfModuleSystemId: number, fileSystemId: number): Promise<CkvSummary[]>;

// Returns all CkvParameterPayload rows for a given CKV
getCkvParameterPayloads(ckvSystemId: number, spfModuleSystemId: number): Promise<ExistingPayloadRow[]>;

// Removes a CKV and all its CkvParameterPayload + CkvValues rows
removeCkv(ckvSystemId: number, moduleSystemId: number, options?: EditOptions): Promise<void>;

// Returns the zero CKV (valueDefinitionSystemIds empty) for a module, or null
getZeroCkv(spfModuleSystemId: number): Promise<CkvSummary | null>;

// Returns all overlaid ModuleTagIdMap rows for the module
getAllTagsForModule(spfModuleSystemId: number, fileSystemId: number): Promise<TagSummary[]>;

// Returns a single ModuleTagIdMap row by systemId
getTagBySystemId(tagSystemId: number, spfModuleSystemId: number): Promise<TagSummary | null>;

// Stages CREATE for ModuleTagIdMap
createTag(tagSystemId: number, spfModuleSystemId: number, tagDefinitionSystemId: number, options?: EditOptions): Promise<void>;

// Stages DELETE for ModuleTagIdMap
removeTag(tagSystemId: number, moduleSystemId: number, options?: EditOptions): Promise<void>;

// Returns all overlaid Tkv rows for a given tag
getAllTkvsForTag(tagSystemId: number, fileSystemId: number): Promise<TkvSummary[]>;

// Returns a single Tkv row by systemId
getTkvBySystemId(tkvSystemId: number, tagSystemId: number): Promise<TkvSummary | null>;

// Stages CREATE for Tkv + TkvParameterPayloads + TkvValues
createTkv(kvData: KvData, tagSystemId: number, moduleSystemId: number, options?: EditOptions): Promise<void>;

// Stages DELETE for Tkv + all children
removeTkv(tkvSystemId: number, moduleSystemId: number, options?: EditOptions): Promise<void>;

// Gets per-CKV parameter payloads for all CKVs (for POST/DELETE ckv-parameters)
getAllCkvParameterPayloads(spfModuleSystemId: number): Promise<Map<number, ExistingPayloadRow[]>>;

// Stages CREATE for CkvParameterPayload on a specific CKV
addParameterToCkv(ckvSystemId: number, moduleSystemId: number, parameterSystemId: number, payload: Uint8Array, options?: EditOptions): Promise<void>;

// Stages DELETE for CkvParameterPayload
removeParameterFromCkv(payloadSystemId: number, ckvSystemId: number, moduleSystemId: number, options?: EditOptions): Promise<void>;

// Stages CREATE for TkvParameterPayload
addParameterToTkv(tkvSystemId: number, moduleSystemId: number, parameterSystemId: number, payload: Uint8Array, options?: EditOptions): Promise<void>;

// Stages DELETE for TkvParameterPayload
removeParameterFromTkv(payloadSystemId: number, tkvSystemId: number, moduleSystemId: number, options?: EditOptions): Promise<void>;
```

New data shapes:

```typescript
export interface CkvSummary {
  systemId: number;
  spfModuleSystemId: number;
  valueDefinitionSystemIds: number[];  // empty = zero CKV
}

export interface TagSummary {
  systemId: number;           // ModuleTagIdMap.systemId
  spfModuleSystemId: number;
  tagDefinitionSystemId: number;
}

export interface TkvSummary {
  systemId: number;
  moduleTagIdMapSystemId: number;
  valueDefinitionSystemIds: number[];
}
```

---

## 3. Command + Handler Pattern

All handlers follow the same structure established by `PutCkvCalDataHandler`:

```
CommandClass
  ├── constructor parses string IDs → numbers (hex/decimal support)
  └── readonly fields

HandlerClass
  ├── constructor(private readonly uow: UnitOfWork, private readonly idGeneration: IdGenerationPort, private readonly logger?: Logger)
  ├── handle(command: T): Promise<Result<R>>
  │     ├── getWriteContext() → fileSystemId, groupId
  │     ├── validate SpfModule exists (throw 404)
  │     ├── per-entity validation
  │     ├── uow.startTransaction()
  │     ├── repo writes
  │     └── uow.commit() / rollback on error
  └── Result<R> carries groupId for undo/redo
```

**Folder structure:**

```
packages/core/src/application/usecase-designer/spf-module/
  add-ckvs/
    add-ckvs.command.ts
    add-ckvs.handler.ts
    add-ckvs-result.ts
  remove-ckvs/
    remove-ckvs.command.ts
    remove-ckvs.handler.ts
  add-tags/
    add-tags.command.ts
    add-tags.handler.ts
    add-tags-result.ts
  remove-tags/
    remove-tags.command.ts
    remove-tags.handler.ts
  add-tkvs/
    add-tkvs.command.ts
    add-tkvs.handler.ts
  remove-tkvs/
    remove-tkvs.command.ts
    remove-tkvs.handler.ts
  add-ckv-parameters/
    add-ckv-parameters.command.ts
    add-ckv-parameters.handler.ts
  remove-ckv-parameters/
    remove-ckv-parameters.command.ts
    remove-ckv-parameters.handler.ts
  add-tkv-parameters/
    add-tkv-parameters.command.ts
    add-tkv-parameters.handler.ts
  remove-tkv-parameters/
    remove-tkv-parameters.command.ts
    remove-tkv-parameters.handler.ts
```

---

## 4. Handler Designs

### 4.1 AddCkvsHandler

**Flow:**
1. Validate SpfModule (404 if missing).
2. Load all existing CKVs via `getAllCkvsForModule()`.
3. Determine parameter list (REQ-PARAMLIST-01/02):
   - If non-zero CKVs exist → read first CKV's `CkvParameterPayload` rows.
   - Else → `getParameterDefinitions(definitionSystemId)` filtered to `toolPolicy === CALIBRATION`.
4. Fetch `ParameterDefinitionBase[]` for those param systemIds.
5. For each `CreateCkvRequestItem`:
   a. Check duplicate (same `valueDefinitionSystemIds` exists → skip).
   b. Allocate `ckvSystemId = idGeneration.getNextId(fileSystemId)`.
   c. For each param: call `serializeDefaultParameterData(def)` to get `Uint8Array`.
   d. Build `KvData` with all parameter payloads.
   e. `repo.createCkv(kvData, moduleSystemId)`.
   f. If this was the first non-zero CKV AND a zero CKV existed → `repo.removeCkv(zeroCkvSystemId)`.
6. `uow.commit()`.
7. Return `AddCkvsResponseDto`: `{addedCkvs, removedCkvSystemIds, groupId}`.

**Error handling:** Per-CKV try/catch. Failed items collected as issues in `Result.partial()`.

### 4.2 RemoveCkvsHandler

**Flow:**
1. Validate SpfModule.
2. Load all CKVs.
3. For each `ckvSystemId`:
   a. Confirm it exists on this module → per-item error if not.
   b. `repo.removeCkv(ckvSystemId)`.
4. After all removals, check if any non-zero CKVs remain.
5. If none remain → create zero CKV (seed with all CALIBRATION params using `serializeDefaultParameterData`).
6. `uow.commit()`.
7. Return removed CKV data.

### 4.3 AddTagsHandler

**Flow:**
1. Validate SpfModule.
2. Load existing tags via `getAllTagsForModule()`.
3. For each `tagDefinitionSystemId`:
   a. Duplicate check (tag for this definition already exists → skip).
   b. Allocate `tagSystemId = idGeneration.getNextId(fileSystemId)`.
   c. `repo.createTag(tagSystemId, moduleSystemId, tagDefinitionSystemId)`.
4. `uow.commit()`.
5. Return `TagInfoResponseDto[]` (systemId, tagId, tagName, tkvs=[]).

**Note:** Requires fetching `TagDefinition` to get `tagId` and `tagName` for the response. A `TagDefinitionRepository.findBySystemId(tagDefinitionSystemId)` call is needed (or extend the existing port if not present).

### 4.4 RemoveTagsHandler

**Flow:**
1. Validate SpfModule.
2. For each `tagSystemId`:
   a. Confirm tag exists on this module → per-item error if not.
   b. Load all TKVs for this tag via `getAllTkvsForTag()`.
   c. For each TKV: stage DELETE for `TkvParameterPayload` children, then `removeTkv()`.
   d. Stage DELETE for the tag itself via `removeTag()`.
3. `uow.commit()`.
4. Return removed `TagInfoResponseDto[]`.

**Why explicit cascade:** The DB has `ON DELETE CASCADE` on `ModuleTagIdMap → Tkv`, but this only fires on hard-deletes against the base table. Since changes are staged in `edit_actions` (not written to base tables until `/commit-changes`), the handler must explicitly stage DELETE actions for all TKVs and their payloads. The `/commit-changes` flow will encounter an already-deleted ModuleTagIdMap row and the cascade will not need to fire.

### 4.5 AddTkvsHandler

**Flow:**
1. Validate SpfModule.
2. Validate `tagSystemId` exists on module via `getTagBySystemId()`.
3. Load existing TKVs for tag via `getAllTkvsForTag()`.
4. Determine parameter list (REQ-PARAMLIST-03):
   - If existing TKVs → read first TKV's parameter payload list.
   - Else → CALIBRATION params from module definition.
5. Fetch `ParameterDefinitionBase[]`.
6. For each `CreateTkvRequestItem`:
   a. Duplicate check.
   b. Allocate `tkvSystemId`.
   c. Build `KvData` with default payloads.
   d. `repo.createTkv(kvData, tagSystemId, moduleSystemId)`.
7. `uow.commit()`.
8. Return `TkvDto[]`.

### 4.6 RemoveTkvsHandler

**Flow:**
1. Validate SpfModule + `tagSystemId`.
2. For each `tkvSystemId`:
   a. Confirm TKV belongs to this tag → per-item error.
   b. `repo.removeTkv(tkvSystemId, moduleSystemId)`.
3. `uow.commit()`.
4. Return removed `TkvDto[]`.

### 4.7 AddCkvParametersHandler

**Flow:**
1. Validate SpfModule.
2. Load all non-zero CKVs via `getAllCkvsForModule()`.
3. Load per-CKV payload maps via `getAllCkvParameterPayloads()`.
4. For each `parameterSystemId`:
   a. Validate param exists in module definition.
   b. For each non-zero CKV: if param not already present → allocate `payloadSystemId`, call `serializeDefaultParameterData()`, `repo.addParameterToCkv(...)`.
   c. Fallback: if no non-zero CKVs exist (or no insertion occurred), add to zero CKV instead.
5. `uow.commit()`.
6. Return `CkvParametersResponseDto` with updated parameter list.

### 4.8 RemoveCkvParametersHandler

**Flow:**
1. Validate SpfModule.
2. Load all CKVs + payload maps.
3. For each `parameterSystemId`:
   a. For each non-zero CKV: find payload row → `repo.removeParameterFromCkv(...)`.
   b. Track which CKVs lost their last parameter.
4. For CKVs with zero remaining payloads: `repo.removeCkv(...)`.
5. If no non-zero CKVs remain after removals: restore zero CKV (seed with all remaining CALIBRATION params).
6. `uow.commit()`.
7. Return `CkvParameterRemovalResponseDto {removedParameterSystemIds, removedCkvSystemIds, affectedCkvSystemIds}`.

### 4.9 AddTkvParametersHandler

**Flow:**
1. Validate SpfModule.
2. For each `TkvParameterUpdateItem`:
   a. Validate `tkvSystemId` belongs to module.
   b. For each `parameterSystemId`: validate param in module definition, check not already present, allocate `payloadSystemId`, call `serializeDefaultParameterData()`, `repo.addParameterToTkv(...)`.
3. `uow.commit()`.
4. Return `TkvParametersResponseDto`.

### 4.10 RemoveTkvParametersHandler

**Flow:**
1. Validate SpfModule.
2. For each `TkvParameterUpdateItem`:
   a. Validate `tkvSystemId`.
   b. For each `parameterSystemId`: find payload row → `repo.removeParameterFromTkv(...)`.
3. `uow.commit()`.
4. Return `TkvParameterRemovalResponseDto`.

---

## 5. Controller Changes

**File:** `packages/api/src/presentation/rest/modules/spf-module/spf-module.controller.ts`

Replace each `NotImplementedException` placeholder with the command bus dispatch pattern. Follow the existing pattern from `addSpfModule()` / `updateCalibrationData()`:

```typescript
async addCkvs(...): Promise<ApiResult<AddCkvsResponseDto>> {
  const command = new AddCkvsCommand(spfModuleSystemId, request.ckvs, session);
  const result = await this.commandBus.execute(command);
  return buildApiResult(result, data => ({addedCkvs: ..., removedCkvSystemIds: ...}));
}
```

The `console.log` placeholders are removed; the `await Promise.resolve()` lint workaround is no longer needed once real async work exists.

---

## 6. Data Flow: POST /ckvs (representative example)

```
Controller.addCkvs(projectId, spfModuleSystemId, CreateCkvsRequestDto)
  → new AddCkvsCommand(spfModuleSystemId, ckvs[], session)
    → AddCkvsHandler.handle()
      → moduleRepo.getSpfModuleForValidation()          [read: module exists?]
      → moduleRepo.getAllCkvsForModule()                 [read: existing CKVs]
      → defRepo.getParameterDefinitions() [if needed]   [read: CALIBRATION params]
      → uow.startTransaction()
      → For each CreateCkvRequestItem:
          idGeneration.getNextId()                       [allocate ckvSystemId]
          For each param:
            serializeDefaultParameterData(def)           [derive default bytes]
            idGeneration.getNextId()                     [allocate payloadSystemId]
          moduleRepo.createCkv(kvData, moduleSystemId)  [write: Ckv + CkvValues + Payloads]
          [if first non-zero and zero-CKV existed]:
            moduleRepo.removeCkv(zeroCkvSystemId)        [write: delete zero CKV]
      → uow.commit()
      → return Result<AddCkvsResult>
  → buildApiResult() → AddCkvsResponseDto
```

---

## 7. Deduplication of `buildDefaultElements()` logic

The `buildDefaultElements()` helper (mapping `DefinitionElement[]` → `ElementData[]` using defaults) is shared between `serializeDefaultParameterData()` only. If future handlers need the derived `ElementData[]` array directly (e.g., to return to the client as GET output), the helper can be exported separately.

---

## 8. TagDefinition lookup for response

`AddTagsHandler` needs the `tagId` and `tagName` from `TagDefinition` to populate `TagInfoResponseDto`. This requires:

- A read method on `TagDefinitionRepository.findBySystemId(tagDefinitionSystemId)` — check if this already exists; if not, add it to the port and implementation.
- This is a query-only read, no write path needed.

---

## 9. Error handling and Result contract

All handlers return `Result<T>` following the project's established pattern:
- `Result.ok(data)` — full success
- `Result.partial(data, issues)` — some items failed, some succeeded (batch best-effort)
- Throw `ResourceNotFoundException` for 404 cases (SpfModule/tag/TKV not found)
- Throw `Error` for DB integrity violations (definition missing for a known param)

The controller converts `Result.partial` to HTTP 207 using the existing `buildApiResult()` pattern.

---

## 10. Verification

1. **Unit tests** (`packages/core/src/**/__test__/`) — each handler tested with mocked `UnitOfWork` + `IdGenerationPort`. Key cases:
   - Zero-CKV removal on first CKV add
   - Zero-CKV restoration on last CKV delete
   - Duplicate CKV/tag/TKV skipped
   - Per-item failure in batch does not affect other items
   - `serializeDefaultParameterData` returns correct bytes for a simple schema

2. **Integration tests** (`packages/infrastructure/persistence/src/**/__test__/`) — `createCkv()` adapter tested against real SQLite DB.

3. **E2E** — use `PATCH /spf-module` pattern: POST module → POST /ckvs → GET /spf-module?include=ckvs → verify CKV appears → DELETE /ckvs → verify zero-CKV restored.
