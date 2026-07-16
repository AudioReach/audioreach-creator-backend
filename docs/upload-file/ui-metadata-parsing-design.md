<!--
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
-->

# `ui-metadata.json` Upload Parsing — Design

## Status

Implemented.

---

## Requirements

### Background

The AWSP (AudioReach Workspace Package) ZIP archive produced by the AudioReach Studio
(SGKV/workspace tooling) contains a mandatory `ui-metadata.json` file alongside the
`definitions.json` and `configuration.json` files. This JSON file carries
display-oriented metadata that the binary ACDB data alone cannot express: human-readable
names, use-case type strings, calibration view persistence blobs, subgraph-to-graph-key
associations (SGKVs), datalink EC flags, and subsystem hierarchy.

Prior to this feature, six data stubs were hardcoded in the upload pipeline:

| Stub location | Hardcoded value | Should be |
|---|---|---|
| `SubgraphBuilder` — subgraph name | `"Subgraph_<id>"` | Real name from `ui-metadata.subgraphs[].name` |
| `SubgraphBuilder` — SGKVs | Empty | `ui-metadata.subgraphs[].supportedKeyValues` |
| `DataLinkBuilder` — `isEc` | `false` | `ui-metadata.dataLinks[].isEcLink` |
| `CalibrationDataBuilder` — CKV `uiPersistence` | `null` | Base64 payload from `ui-metadata.payloadMap` |
| `UsecaseBuilder` — usecase `type` | `undefined` | `ui-metadata.usecases[].type` |
| `UploadFileOrchestrator` — Subsystem nodes | Not built at all | Built from `ui-metadata.subsystems` |

### Goals

1. Parse `ui-metadata.json` from the AWSP ZIP during upload and store it on `ParsedAwsp`.
2. Resolve all six stubs listed above by threading the parsed metadata through the
   existing entity-builder pipeline.
3. Introduce a new **Phase 2b** that creates `Subsystem` node rows from the subsystem
   hierarchy declared in the metadata.
4. Add the `use_cases.type` column and `subsystems.subsystem_id` column to the database,
   along with the `subsystem_filtered_keys_key_definition` join table.
5. Treat `ui-metadata.json` as a mandatory AWSP file: uploads from AWSP archives that
   are missing the file must fail with a clear error, the same way uploads fail when
   `definitions.json` or `configuration.json` are missing.

### Non-Goals

- Parsing `ui-metadata.json` produced by tooling versions other than the SGKV/AWSP
  workspace format. The schema is versioned; only format version `{major:1}` is handled.
- Updating `ui-metadata.json` during download.

---

## Data Sources

| `ui-metadata.json` field | Used by | Persisted to |
|---|---|---|
| `usecases[].type` | `UsecaseBuilder` | `use_cases.type` |
| `usecases[].keyValue` | `UsecaseBuilder` | _(lookup key, not stored)_ |
| `subgraphs[].name` | `SubgraphBuilder` | `subgraphs.name` |
| `subgraphs[].supportedKeyValues` | `SubgraphBuilder` | `sgkv` + `sgkv_value_definitions` |
| `subsystems[].id` | `SubsystemBuilder` | `subsystems.subsystem_id` |
| `subsystems[].name` | `SubsystemBuilder` | `subsystems.name` |
| `subsystems[].filteredGraphKeys` | `SubsystemBuilder` | `subsystem_filtered_keys_key_definition` |
| `subsystems[].children` | `SubsystemBuilder` | `nodes.parent_id` |
| `dataLinks[].isEcLink` | `DataLinkBuilder` | `data_links.is_ec` |
| `dataLinks[].sourcePortId` | `DataLinkBuilder` | _(lookup key)_ |
| `dataLinks[].destinationPortId` | `DataLinkBuilder` | _(lookup key)_ |
| `modules[].instanceId` | `CalibrationDataBuilder` | _(lookup key)_ |
| `modules[].calViewUiPersistences[].payloadId` | `CalibrationDataBuilder` | `ckv.ui_persistence` |
| `modules[].calViewUiPersistences[].calKeyValue` | `CalibrationDataBuilder` | _(CKV match key)_ |
| `payloadMap[].id` | `CalibrationDataBuilder` | _(lookup key)_ |
| `payloadMap[].data` | `CalibrationDataBuilder` | `ckv.ui_persistence` (decoded from base64) |

---

## `ui-metadata.json` Wire Format

```json
{
  "version": { "major": 1, "minor": 0 },
  "payloadMap": [
    { "id": "<uuid>", "data": "<base64-encoded-bytes>" }
  ],
  "usecases": [
    { "type": "Routed", "keyValue": "[0xA2000000: 0xA3000000]" }
  ],
  "subsystems": [
    {
      "id": "0xF0100001",
      "name": "StreamRx",
      "filteredGraphKeys": "0xAB000000,0xA1000000",
      "children": [
        { "id": "0xB00000C6", "type": "Subgraph" },
        { "id": "0xF0100002", "type": "Subsystem" }
      ]
    }
  ],
  "subgraphs": [
    {
      "id": "0xB00000C6",
      "name": "Speaker",
      "supportedKeyValues": [
        { "keyValue": "[0xA2000000: 0xA2000001]" }
      ]
    }
  ],
  "modules": [
    {
      "definitionId": "0x07001017",
      "instanceId": "0x00004046",
      "calViewUiPersistences": [
        { "payloadId": "<uuid>", "calKeyValue": "[0xA2000000: 0xA3000000]" },
        { "payloadId": "<uuid2>" }
      ]
    }
  ],
  "dataLinks": [
    {
      "isEcLink": true,
      "sourceId": "0x0000418E",
      "sourcePortId": "0x0000000D",
      "destinationId": "0x00004160",
      "destinationPortId": "0x00000002"
    }
  ]
}
```

Hex string IDs (`"0xF0100001"`) are coerced to integers by the Zod schema. All array
fields default to `[]` when absent.

### `keyValue` and `calKeyValue` string format

Key-value pair strings use the format `[<keyId>: <valueId>]`, optionally space-separated
for multi-pair lists:

```
[0xA1000000: 0xA2000001] [0xA3000000: 0xA4000002]
```

Both bare hex (no `0x` prefix) and `0x`-prefixed forms are accepted. The shared
`parseKeyValueString()` helper handles both.

---

## Schema

### Zod schema — `UiMetadataSchema`

**File:** `packages/core/src/application/file-operations/shared/awsp-serializers/v1/ui-metadata/ui-metadata.schema.ts`

Validates the raw JSON and coerces hex strings to integers. All top-level array fields
use `.optional().default([])` so that the schema always produces fully-typed output even
when a field is absent.

```typescript
export const UiMetadataSchema = z.object({
  version: z.object({ major: z.number(), minor: z.number() }),
  payloadMap: z.array(z.object({ id: z.string(), data: z.string() })).optional().default([]),
  usecases: z.array(z.object({
    type: z.string(),
    keyValue: z.string(),
    aliasId: z.string().optional(),
    aliasName: z.string().optional(),
  })).optional().default([]),
  subsystems: z.array(z.object({
    id: HexIdSchema,
    name: z.string(),
    filteredGraphKeys: z.string().optional(),
    children: z.array(z.object({
      id: HexIdSchema,
      type: z.enum(['Subgraph', 'Subsystem']),
    })).optional().default([]),
  })).optional().default([]),
  subgraphs: z.array(z.object({
    id: HexIdSchema,
    name: z.string().optional(),
    supportedKeyValues: z.array(z.object({ keyValue: z.string() })).optional().default([]),
  })).optional().default([]),
  modules: z.array(z.object({
    definitionId: HexIdSchema,
    instanceId: HexIdSchema,
    calViewUiPersistences: z.array(z.object({
      payloadId: z.string(),
      calKeyValue: z.string().optional(),
    })).optional().default([]),
  })).optional().default([]),
  dataLinks: z.array(z.object({
    isEcLink: z.boolean(),
    sourceId: HexIdSchema,
    sourcePortId: HexIdSchema,
    destinationId: HexIdSchema,
    destinationPortId: HexIdSchema,
  })).optional().default([]),
});
export type UiMetadata = z.infer<typeof UiMetadataSchema>;
```

### `parseKeyValueString` helper

Shared by `SubgraphBuilder`, `CalibrationDataBuilder`, and `UsecaseBuilder`. Parses one
or more `[keyId: valueId]` bracket-pairs from a string and returns
`{ keyId: number, valueId: number }[]`.

---

## Database Changes

### New migration — `1783827135927-add-ui-metadata-columns.ts`

| Table | Change | Column type |
|---|---|---|
| `use_cases` | Add `type` column | `varchar(64)` NULL |
| `subsystems` | Add `subsystem_id` column | `integer` NULL |
| _(new table)_ | `subsystem_filtered_keys_key_definition` | join table |

**Join table schema:**

```sql
CREATE TABLE subsystem_filtered_keys_key_definition (
  subsystems_system_id       INTEGER NOT NULL,
  key_definition_system_id   INTEGER NOT NULL,
  PRIMARY KEY (subsystems_system_id, key_definition_system_id)
);
```

### TypeORM entity schema changes

- `UseCaseRow` — add `type?: string`; `UseCaseSchema` — add nullable `varchar(64)` column
- `SubsystemRow` — add `subsystemId?: number`; `SubsystemSchema` — add nullable `integer`
  column and explicit `joinTable` configuration naming
  `subsystem_filtered_keys_key_definition`

---

## Architecture Changes

### 1. `ParsedAwsp` — store `UiMetadata`

**File:** `packages/core/src/application/file-operations/upload-file/models/parsed-awsp.ts`

Added fields and methods:
```typescript
private uiMetadata?: UiMetadata;
setUiMetadata(metadata: UiMetadata): void { ... }
getUiMetadata(): UiMetadata | undefined { ... }
```

### 2. `FILE_NAMES` constant

**File:** `packages/core/src/application/file-operations/shared/constants/definition-block-names.ts`

```typescript
export const FILE_NAMES = {
  // ... existing entries ...
  UI_METADATA_JSON: 'ui-metadata.json',  // NEW
} as const;
```

### 3. `AwspFileOrchestrator` — mandatory parse

**File:** `packages/core/src/application/file-operations/upload-file/services/awsp-file-orchestrator.ts`

After `parsedAwsp.setConfiguration(configurationData)`, calls the private
`parseUiMetadata(unzippedFolderPath, parsedAwsp)` method. The method:

1. Checks whether `ui-metadata.json` exists in the unzipped folder.
2. If absent, throws `Error: "ui-metadata.json file not found in the unzipped folder"` —
   the outer `parseAWSP` catch block wraps this and aborts the upload.
3. If present, reads, JSON-parses, and validates it through `UiMetadataSchema.parse()`.
4. On success, calls `parsedAwsp.setUiMetadata(uiMetadata)` and logs at INFO level.
5. Validation or parse errors propagate up and abort the upload (same behavior as
   `definitions.json` and `configuration.json` errors).

### 4. `ForeignKeyMapper` — subsystem ID mappings

**File:** `packages/core/src/application/file-operations/upload-file/services/foreign-key-mapper.ts`

Two new methods alongside the SPF module mapping section:
```typescript
addSubsystemMapping(subsystemId: NaturalId, systemId: SystemId): void
getSubsystemSystemId(subsystemId: NaturalId): SystemId | undefined
```

Throws if the same subsystem natural ID is registered twice (consistent with existing
mapping methods).

### 5. `UseCase` domain entity — `type` field

**File:** `packages/core/src/domain/entities/usecase-data/usecase/usecase.ts`

```typescript
interface UseCaseInit { ..., type?: string }
class UseCase { ..., type?: string }
```

### 6. `KvData` domain entity — mutable `uiPersistence`

**File:** `packages/core/src/domain/entities/common/entities/kv-data.ts`

`uiPersistence` changed from `readonly Uint8Array | null` to `uiPersistence: Uint8Array | null`
to allow post-build enrichment by `applyUiMetadataToCkvs`.

---

## New Entity Builder — `SubsystemBuilder`

**File:** `packages/core/src/application/file-operations/upload-file/services/entity-builders/subsystem-builder.ts`

Builds `Node` (type: `subsystem`) entities from the `ui-metadata.subsystems` array.

### Algorithm

1. **Build `childToParent` map** — for each subsystem entry, record which subsystem IDs
   appear as `Subsystem`-typed children. This maps `childId → parentId` for FK resolution.
2. **Topological sort** (Kahn's algorithm, roots first) — ensures parents are inserted
   before children so `nodes.parent_id` FK constraints are satisfied.
3. **For each entry (in topological order):**
   - Allocate a new `systemId` via `idGenerator.getNextId(fileSystemId)`.
   - Resolve `parentId` from `foreignKeyMapper.getSubsystemSystemId(parentNaturalId)`.
     Logs a warning if the parent is not yet registered (cycle-like situation).
   - Create `new Node({ systemId, type: NodeType.Subsystem, fileSystemId, parentId, ... })`.
   - Register the new mapping: `foreignKeyMapper.addSubsystemMapping(naturalId, systemId)`.
   - Resolve `filteredGraphKeys`: split the comma-separated hex string, look up each key
     via `foreignKeyMapper.getKeySystemId(hex)`, collect resolved system IDs. Logs a
     warning for any unresolved key.
4. Return `SubsystemBuildResult`:
   - `nodes: Node[]`
   - `namesByNodeId: Map<systemId, name>`
   - `subsystemIdByNodeId: Map<systemId, naturalId>`
   - `filteredKeySystemIdsByNodeId: Map<systemId, keySystemId[]>`

### Cycle detection

If the topological sort produces fewer entries than the input, a warning is logged and
the unprocessed subsystems are silently skipped.

---

## Modified Entity Builders

### `SubgraphBuilder`

**File:** `packages/core/src/application/file-operations/upload-file/services/entity-builders/subgraph-builder.ts`

`buildSubgraphs()` accepts a new optional `uiMetadata?: UiMetadata` parameter.

Before the main loop, builds:
```typescript
const uiSubgraphMap = new Map(
  (uiMetadata?.subgraphs ?? []).map(s => [s.id, s]),
);
```

Inside `convertAcdbSubgraphPropertyData`:
- **Name**: `uiEntry?.name ?? \`Subgraph_${subgraphId}\``
- **SGKVs**: for each `supportedKeyValues[].keyValue`, calls `parseKeyValueString` then
  resolves each `(keyId, valueId)` pair via `foreignKeyMapper.getValueSystemId`. Skips
  unresolvable pairs (logs warn). Creates `Sgkv` entities with `valueDefinitionSystemIds`
  populated from the resolved values.

`assignSystemIds` also assigns a `systemId` to each `Sgkv` via `idGenerator.getNextId`.

### `DataLinkBuilder`

**File:** `packages/core/src/application/file-operations/upload-file/services/entity-builders/data-link-builder.ts`

`buildDataLinks()` accepts a new optional `uiMetadata?: UiMetadata` parameter.

Before deduplication, builds an EC lookup keyed by `"sourcePortId:destinationPortId"`:
```typescript
const ecLookup = new Map<string, boolean>();
for (const dl of uiMetadata?.dataLinks ?? []) {
  ecLookup.set(`${dl.sourcePortId}:${dl.destinationPortId}`, dl.isEcLink);
}
```

In `convertDataLinkProperty`, the `isEc` field for `IntraUsecase` links changes from
the hardcoded `false` to:
```typescript
ecLookup.get(`${property.sourcePortId}:${property.destinationPortId}`) ?? false
```

### `CalibrationDataBuilder`

**File:** `packages/core/src/application/file-operations/upload-file/services/entity-builders/calibration-data-builder.ts`

New public method `applyUiMetadataToCkvs(ckvList, instanceId, uiMetadata, foreignKeyMapper)`:

1. Finds the matching `modules[]` entry by `instanceId`.
2. Builds a `payloadByUuid: Map<string, Uint8Array>` from `payloadMap`, decoding each
   `data` field from base64.
3. For each `calViewUiPersistences` entry:
   - Looks up the payload bytes by `payloadId`. Logs error and skips if not found.
   - Resolves `targetValueSystemIds`: if `calKeyValue` is present, parses key-value
     pairs and resolves each through `foreignKeyMapper.getValueSystemId`, then sorts.
     If absent, treats as zero-CKV (`[]`).
   - Finds the matching `KvData` in `ckvList` by comparing sorted `valueDefinitionSystemIds`
     sets. Logs error and skips if no match.
   - Sets `match.uiPersistence = payload`.

Called from `EntityBuilderService.buildSpfModules()` after the SPF module array is built,
only when `parsedAwsp?.getUiMetadata()` is non-null.

### `UsecaseBuilder`

**File:** `packages/core/src/application/file-operations/upload-file/services/entity-builders/usecase-builder.ts`

`buildUsecases()` accepts a new optional `uiMetadata?: UiMetadata` parameter.

Before the entry loop, pre-resolves each ui-metadata usecase into a canonical sorted
valueSystemId set string:
```typescript
const resolvedUiUsecases = uiMetadata?.usecases.map(uiUc => {
  const pairs = parseKeyValueString(uiUc.keyValue);
  const ids = pairs
    .map(({ keyId, valueId }) => foreignKeyMapper.getValueSystemId(...))
    .filter(id => id !== undefined)
    .sort((a, b) => a - b);
  return { type: uiUc.type, valueSystemIdSet: ids.join(',') };
}) ?? [];
```

In `convertUsecaseEntry`, after computing `keyVector.valueSystemIds`:
```typescript
const sortedSet = [...keyVector.valueSystemIds].sort((a, b) => a - b).join(',');
const type = resolvedUiUsecases.find(u => u.valueSystemIdSet === sortedSet)?.type;
```

`new UseCase({ ..., type })` — `type` is `undefined` when no match.

---

## `EntityBuilderService` Changes

**File:** `packages/core/src/application/file-operations/upload-file/services/entity-builder-service.ts`

- Added `private readonly subsystemBuilder: SubsystemBuilder` field, initialized in
  the constructor alongside other builders.
- `buildSubgraphs(parsedAcdb, fileSystemId)` → `buildSubgraphs(parsedAcdb, fileSystemId, parsedAwsp?)` — passes `parsedAwsp?.getUiMetadata()` to `subgraphBuilder.buildSubgraphs`.
- `buildDataLinks(parsedAcdb, fileSystemId)` → `buildDataLinks(parsedAcdb, fileSystemId, parsedAwsp?)` — passes `parsedAwsp?.getUiMetadata()` to `dataLinkBuilder.buildDataLinks`.
- `buildUsecases(parsedAcdb, fileSystemId)` → `buildUsecases(parsedAcdb, fileSystemId, parsedAwsp?)` — passes `parsedAwsp?.getUiMetadata()` to `usecaseBuilder.buildUsecases`.
- New method `buildSubsystems(fileSystemId, uiMetadata)` — delegates to
  `subsystemBuilder.build(uiMetadata.subsystems, fileSystemId)`.

---

## `UploadFileOrchestrator` Changes

**File:** `packages/core/src/application/file-operations/upload-file/services/upload-file-orchestrator.ts`

Phase 2b inserted immediately after Phase 2 (Subgraphs):

```
Phase 2:  Build and Insert Subgraphs
Phase 2b: Build and Insert Subsystems from ui-metadata   ← NEW
Phase 3:  Build and Insert Containers
```

The new `buildAndInsertSubsystems(bulkRepo)` private method:
1. Checks `this.parsedAwsp?.getUiMetadata()?.subsystems?.length`. If absent or empty,
   logs an info message and returns early.
2. Calls `this.builderService.buildSubsystems(this.currentFileId, uiMetadata)`.
3. Calls `bulkRepo.insertSubsystems(result.nodes, { namesByNodeId, subsystemIdByNodeId, filteredKeySystemIdsByNodeId })`.
4. Calls `this.collectInsertionErrors(insertResult, 'Subsystem')` and logs the result.

`buildAndInsertSubgraphs`, `buildAndInsertDataLinks`, and `buildAndInsertUsecases` all
pass `this.parsedAwsp ?? undefined` to their respective `EntityBuilderService` methods.

---

## `SubsystemInserter` and `BulkImportRepository` Changes

### `SubsystemInserter`

**File:** `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/bulk-import/subsystem/subsystem.inserter.ts`

Exported interface:
```typescript
export interface SubsystemInsertMetadata {
  namesByNodeId: Map<number, string>;
  subsystemIdByNodeId: Map<number, number>;
  filteredKeySystemIdsByNodeId: Map<number, number[]>;
}
```

`insert(nodes, metadata?)` signature change — `metadata` is optional for backward
compatibility (callers that insert subsystems without ui-metadata data still work).

`insertSubsystems` now uses `metadata?.namesByNodeId.get(n.systemId) ?? ''` and
`metadata?.subsystemIdByNodeId.get(n.systemId) ?? undefined` when building row data.

New private `insertFilteredKeys(nodes, metadata, failedSubsystemIds)` method:
- Builds the `(subsystems_system_id, key_definition_system_id)` row list.
- Skips nodes whose IDs are in `failedSubsystemIds`.
- Executes a single bulk `INSERT OR IGNORE INTO subsystem_filtered_keys_key_definition`.

### `BulkImportRepository` interface

**File:** `packages/core/src/application/ports/persistence/repositories/bulk-import/bulk-import.repository.ts`

```typescript
insertSubsystems(
  items: readonly Node[],
  metadata?: {
    namesByNodeId: Map<number, string>;
    subsystemIdByNodeId: Map<number, number>;
    filteredKeySystemIdsByNodeId: Map<number, number[]>;
  },
): Promise<BulkInsertResult>;
```

### `UseCaseInserter`

**File:** `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/bulk-import/use-case/use-case.inserter.ts`

Row mapping updated:
```typescript
const rows = items.map(item => ({
  ...existing fields...,
  type: item.type ?? undefined,   // NULL when absent
}));
```

---

## Data Flow

```
AwspFileOrchestrator.parseAWSP()
  │  reads ui-metadata.json from AWSP ZIP (optional)
  │  validates with UiMetadataSchema.parse()
  │  parsedAwsp.setUiMetadata(uiMetadata)
  ▼
UploadFileOrchestrator.buildAndInsert*()
  │
  ├─ buildAndInsertSubgraphs()
  │    └─ EntityBuilderService.buildSubgraphs(parsedAcdb, fileSystemId, parsedAwsp)
  │         └─ SubgraphBuilder.buildSubgraphs(props, fileSystemId, uiMetadata?)
  │              • name: uiSubgraphMap.get(id)?.name ?? "Subgraph_<id>"
  │              • sgkvs: parseKeyValueString(kv) → getValueSystemId() → Sgkv[]
  │
  ├─ buildAndInsertSubsystems()          ← Phase 2b (NEW)
  │    └─ EntityBuilderService.buildSubsystems(fileSystemId, uiMetadata)
  │         └─ SubsystemBuilder.build(subsystems, fileSystemId)
  │              • topological sort (parents before children)
  │              • Node{type=subsystem} per entry
  │              • filteredKeys → getKeySystemId() → join table rows
  │         └─ bulkRepo.insertSubsystems(nodes, { names, subsystemIds, filteredKeys })
  │              • SubsystemInserter: nodes + subsystems + filteredKeys join rows
  │
  ├─ buildAndInsertSpfModules()
  │    └─ EntityBuilderService.buildSpfModules(parsedAcdb, fileSystemId, parsedAwsp)
  │         └─ ... existing module build ...
  │         └─ CalibrationDataBuilder.applyUiMetadataToCkvs(ckvs, instanceId, uiMetadata, fkMapper)
  │              • payloadMap lookup → base64 decode
  │              • calKeyValue → getValueSystemId() → sorted set match
  │              • ckv.uiPersistence = payload bytes
  │
  ├─ buildAndInsertDataLinks()
  │    └─ EntityBuilderService.buildDataLinks(parsedAcdb, fileSystemId, parsedAwsp)
  │         └─ DataLinkBuilder.buildDataLinks(props, fileSystemId, uiMetadata?)
  │              • ecLookup: Map<"srcPortId:dstPortId", isEcLink>
  │              • isEc = ecLookup.get(key) ?? false  (IntraUsecase only)
  │
  └─ buildAndInsertUsecases()
       └─ EntityBuilderService.buildUsecases(parsedAcdb, fileSystemId, parsedAwsp)
            └─ UsecaseBuilder.buildUsecases(entries, fileSystemId, gkvAliasChunk, uiMetadata?)
                 • resolvedUiUsecases: pre-resolved sorted valueSystemId sets
                 • type = match?.type  (GKV set comparison)
                 └─ UseCase{ ..., type }
                      └─ UseCaseInserter → use_cases.type
```

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| `ui-metadata.json` absent from AWSP ZIP | Throws — upload aborts with `"ui-metadata.json file not found"` |
| `ui-metadata.json` contains invalid JSON | Throws — upload aborts with parse error message |
| `ui-metadata.json` fails Zod schema validation | Throws — upload aborts with validation error message |
| Subgraph not found in `ui-metadata.subgraphs` | Falls back to `"Subgraph_<id>"` name; no SGKVs |
| SGKV value ID not in ForeignKeyMapper | Logged at WARN; SGKV entry skipped |
| Subsystem parent not yet in ForeignKeyMapper | Logged at WARN; `parentId` left undefined |
| Filtered key not in ForeignKeyMapper | Logged at WARN; key skipped from join table |
| Cycle in subsystem hierarchy | Logged at WARN; cyclic entries skipped |
| DataLink port not in EC lookup | `isEc = false` (no log; safe default) |
| `payloadId` not found in `payloadMap` | Logged at ERROR; CKV `uiPersistence` stays `null` |
| No CKV matches `calKeyValue` | Logged at ERROR; CKV `uiPersistence` stays `null` |
| Usecase GKV set has no ui-metadata match | `type` stays `undefined`; not an error |

---

## Testing Strategy

### Unit Tests

#### `UiMetadataSchema` (`ui-metadata.schema.spec.ts`)
- Minimal payload parses; all optional arrays default to `[]`
- Hex string IDs coerced to integers
- `filteredGraphKeys` and `children` parsed
- `calViewUiPersistences` with and without `calKeyValue`
- `dataLinks.isEcLink`, port IDs coerced
- Invalid version structure throws
- Unknown child type (`type: 'Unknown'`) throws

#### `parseKeyValueString`
- Single pair with `0x` prefix; without prefix; multiple pairs; empty/whitespace

#### `ParsedAwsp.uiMetadata` (`parsed-awsp.spec.ts`)
- `getUiMetadata()` returns `undefined` before `setUiMetadata()`
- Round-trip: `setUiMetadata(meta)` → `getUiMetadata()` returns same reference

#### `ForeignKeyMapper` — subsystem mappings
- `addSubsystemMapping` + `getSubsystemSystemId` round-trip
- Returns `undefined` for unmapped ID
- Throws on duplicate registration

#### `SubsystemBuilder` (`subsystem-builder.spec.ts`)
- Empty input returns empty result
- Single root node: `parentId` undefined, name and subsystemId maps populated
- Child node: `parentId` resolved via FK mapper
- `addSubsystemMapping` called for each entry
- `filteredGraphKeys`: resolved IDs collected; unknown key skipped + warn logged

#### `SubgraphBuilder` — with ui-metadata (`subgraph-builder.spec.ts`)
- Name from `ui-metadata.subgraphs` when present
- Falls back to `Subgraph_<id>` when absent or not found
- SGKVs built from `supportedKeyValues`; unresolved values skipped + warn

#### `DataLinkBuilder` — isEc (`data-link-builder.spec.ts`)
- `isEc = true` for `IntraUsecase` link matching `isEcLink: true` in ui-metadata
- `isEc = false` when not in EC lookup

#### `CalibrationDataBuilder.applyUiMetadataToCkvs` (`calibration-data-builder.spec.ts`)
- Base64 payload decoded and set on matching zero-CKV
- No matching CKV → `logError` called, `uiPersistence` stays `null`

#### `UsecaseBuilder` — type from ui-metadata (`usecase-builder.spec.ts`)
- `type` assigned when GKV valueSystemId set matches ui-metadata usecase
- `type` undefined when no match

#### `EntityBuilderService` — `buildSubsystems`
- Method exists; delegates to `SubsystemBuilder`

### Integration Tests

#### `AwspFileOrchestrator` (`awsp-file-orchestrator.spec.ts`)
- `ui-metadata.json` present → `parsedAwsp.getUiMetadata()` is defined, `version.major === 1`
- `ui-metadata.json` absent → throws with message containing `"ui-metadata.json"`
- `ui-metadata.json` contains invalid JSON → throws

#### DB schema (`ui-metadata-columns.spec.ts`)
- `use_cases` table has `type` column
- `subsystems` table has `subsystem_id` column
- `subsystem_filtered_keys_key_definition` table exists

#### `SubsystemInserter` (`subsystem.inserter.spec.ts`)
- Inserts subsystem with real name and subsystemId
- Inserts `subsystem_filtered_keys_key_definition` join rows
- Child subsystem has `parent_id` set in `nodes` table
- Falls back to empty name and `NULL` subsystemId when metadata absent

#### `UseCaseInserter` — type field (`use-case.inserter.spec.ts`)
- `type = 'Routed'` persisted to `use_cases.type`
- `type = undefined` → `NULL` in DB

---

## Document Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-07-15 | Architecture Team | Initial design document |
