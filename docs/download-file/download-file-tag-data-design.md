# Tag Data Download — Design Spec

## Requirements

**FR-1.** Query `TagDefinition`, `TagKeyDefLink`, `KeyDefinition`, `ModuleTagIdMap`, `Tkv`, `TkvValues`, `TkvParameterPayload`, `SpfModule`, `Subgraph`, `SpfModuleDefinition`, and `TagDefinition` from DB for a given `fileSystemId`.

**FR-2a.** Build `TagKeysDownloadModel` — global per-file map of `tagId → sorted keyIds` (for MTKL chunk).

**FR-2b.** Build `TagDataDownloadModel` — grouped by `(subgraphId, tagId)` → TKV combinations → modules/params (for MTKT/MTLU/MTDE/MTDO chunks).

**FR-2c.** Build `TaggedModuleDownloadModel` — grouped by `(subgraphId, tagId)` → sorted `(moduleId, instanceId)` pairs (for TMLU/TMDE chunks).

**FR-3.** Build MTKL binary chunk. KeyIds written to shared datapool sorted ASC; table stores `[tagId, datapoolOffset]` pairs sorted by `tagId ASC`.

**FR-4.** Build MTKT/MTLU/MTDE/MTDO binary chunks. Tag key values in MTLU vector entries sorted ASC by keyId. MTLU/MTDE/MTDO use raw byte-offset addressing (no datapool size-prefix, no alignment). Parameter payloads land in shared datapool.

**FR-5.** Build TMLU/TMDE binary chunks. Sorted by `(subgraphId, tagId)` outer, `(moduleId, instanceId)` inner. TMDE uses raw byte concatenation. Voice tags (`isVoice=true`) excluded in the application layer — DB returns all entries including `isVoice` field.

**FR-6.** Extend `DownloadEntities` with `tagKeys?`, `tagData?`, `taggedModules?`. Extend `readAllEntitiesForFile()` to fetch all three in parallel.

**FR-7.** Wire all three chunk groups into `AcdbFileSerializer.serialize()` following the calibration chunk pattern.

---

## Binary Formats

### MTKL (MOD_TAG_KEYIDS_TABLE) — chunk ID `'MTKL'`
```
numEntries: uint32
Entry[tagId ASC]:
  tagId:        uint32
  poolOffset:   uint32  ← offset into POOL chunk

Datapool entry at poolOffset:
  numKeys: uint32
  keyId[]: uint32 * numKeys  ← sorted ASC
```

### MTKT (MODULE_TAG_KEY_TABLE) — chunk ID `'MTKT'`
```
numEntries: uint32
Entry[subgraphId ASC, tagId ASC]:
  subgraphId:    uint32
  tagId:         uint32
  mtluOffset:    uint32  ← byte offset into MTLU raw buffer
```

### MTLU (MODULE_TAG_DATA_LUT) — chunk ID `'MTLU'`, raw bytes (no size prefix, no alignment)
```
TagLutDataTbl per MTKT entry (at mtluOffset):
  numTagKeyValues:       uint32  ← number of key slots
  numTagKeyVectorEntries: uint32
  TagKeyVectorEntry[]:
    tagKeyValue[numTagKeyValues]: uint32  ← VALUE IDs sorted by keyId ASC
    mtdeOffset: uint32  ← byte offset into MTDE raw buffer
    mtdoOffset: uint32  ← byte offset into MTDO raw buffer
```

### MTDE (MODULE_TAG_DATA_DEF) — chunk ID `'MTDE'`, raw bytes
```
TagDataDEFEntry per vector entry (at mtdeOffset):
  numTaggedIdEntries: uint32
  TaggedIdEntry[]:
    iId: uint32  (moduleInstanceId)
    pId: uint32  (parameterId)
```

### MTDO (MODULE_TAG_DATA_DOT) — chunk ID `'MTDO'`, raw bytes
```
TagDataDOTEntry per vector entry (at mtdoOffset):
  numOffsets: uint32
  datapoolOffset[]: uint32  ← offsets into POOL chunk
```

### TMLU (TAGGED_MODULES_LUT) — chunk ID `'TMLU'`
```
numEntries: uint32
TaggedModuleEntry[subgraphId ASC, tagId ASC]:
  subgraphId:           uint32
  tagId:                uint32
  tmdeOffset:           uint32  ← byte offset into TMDE raw buffer
```

### TMDE (TAGGED_MODULES_DEF) — chunk ID `'TMDE'`, raw bytes
```
TaggedModDEFEntry per TMLU entry (at tmdeOffset):
  numPairs: uint32
  MidIidPair[moduleId ASC, instanceId ASC]:
    mId: uint32
    iId: uint32
```

---

## Data Models

File: `packages/core/src/application/ports/persistence/query-services/bulk-read/bulk-read-query-service.ts`

```ts
// Model 1: MTKL — global tag-to-keyIds (from TagDefinition records)
export interface TagKeysDownloadModel {
  tagId: number;
  keyIds: number[];    // sorted ASC
}

// Model 2: MTKT/MTLU/MTDE/MTDO — per-(subgraphId, tagId) TKV data
export interface TagDataDownloadModel {
  subgraphId: number;
  tagId: number;
  numTagKeyValues: number;    // count of key slots → MTLU header
  tkvs: Array<{
    tagKeyValues: number[];   // VALUE IDs sorted by keyId ASC → MTLU vector
    modules: Array<{
      moduleInstanceId: number;
      parameters: Array<{ parameterId: number; payload: Uint8Array }>;
    }>;
  }>;
}

// Model 3: TMLU/TMDE — per-(subgraphId, tagId) module instances
export interface TaggedModuleDownloadModel {
  subgraphId: number;
  tagId: number;
  isVoice: boolean;    // app layer filters isVoice=true before building chunks
  moduleInstances: Array<{ moduleId: number; instanceId: number }>;
}
```

Extend `DownloadEntities`:
```ts
tagKeys?: TagKeysDownloadModel[];
tagData?: TagDataDownloadModel[];
taggedModules?: TaggedModuleDownloadModel[];
```

Add port methods to `BulkReadQueryService`:
```ts
readTagKeys(fileSystemId: number): Promise<TagKeysDownloadModel[]>;
readTagData(fileSystemId: number): Promise<TagDataDownloadModel[]>;
readTaggedModuleData(fileSystemId: number): Promise<TaggedModuleDownloadModel[]>;
```

---

## DB Query Layer

File: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/bulk-read/typeorm-bulk-read-query-service.ts`

### Schema change

File: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/definitions/tag-key-value/tag-key-def-link.schema.ts`

Add `keyDefinition?: KeyDefinitionRow` to `TagKeyDefLinkRow` and add relation:
```ts
keyDefinition: {
  type: 'many-to-one',
  target: 'KeyDefinition',
  joinColumn: { name: 'key_reference_system_id', referencedColumnName: 'systemId' },
  onDelete: 'CASCADE',
}
```

### Query 1 — `readTagKeys(fileSystemId)`

Single query:
```
TagDefinition (td)
  → LEFT JOIN TagKeyDefLink (link)
    → LEFT JOIN KeyDefinition (kd)
WHERE td.fileSystemId = :fileSystemId
ORDER BY td.tagId ASC, kd.keyId ASC
```

App layer: group by `tagId`, collect `keyIds[]`, drop entries with zero keys.

### Query 2 — `readTagData(fileSystemId)`

Two parallel sub-queries (same pattern as `readCalibrationData`):

**Sub-query A** — base TKV rows:
```
ModuleTagIdMap (mtim)
  → LEFT JOIN SpfModule (sm)
    → LEFT JOIN Subgraph (sg)
  → LEFT JOIN TagDefinition (td)
  → LEFT JOIN Tkv (tkv)
    → LEFT JOIN TkvValues (tv)
      → LEFT JOIN ValueDefinition (vd)
        → LEFT JOIN KeyDefinition (k)
WHERE sm.fileSystemId = :fileSystemId
ORDER BY sg.subgraphId ASC, td.tagId ASC, k.keyId ASC
```

**Sub-query B** — TKV parameter payloads (chunked IN-clause, same as CKV):
```
TkvParameterPayload (tpp)
  → LEFT JOIN SpfModuleParameterDefinition (param)
WHERE tpp.tkvSystemId IN (:...ids)
ORDER BY tpp.tkvSystemId ASC, param.paramId ASC
```

App layer: group by `(subgraphId, tagId)` → TKV rows, collect `tagKeyValues` (valueIds ordered by keyId ASC), join parameter payloads via tkvSystemId map.

### Query 3 — `readTaggedModuleData(fileSystemId)`

Single flat query:
```
ModuleTagIdMap (mtim)
  → LEFT JOIN SpfModule (sm)
    → LEFT JOIN Subgraph (sg)
    → LEFT JOIN SpfModuleDefinition (def)
  → LEFT JOIN TagDefinition (td)
WHERE sm.fileSystemId = :fileSystemId
ORDER BY sg.subgraphId ASC, td.tagId ASC, def.moduleDefinitionId ASC, sm.instanceId ASC
```

App layer: group by `(subgraphId, tagId)`, set `isVoice` from `td.isVoice`, collect `moduleInstances` in already-sorted order.

### `readAllEntitiesForFile` update

All three added to the existing `Promise.all`:
```ts
const [
  headerMetadata, usecaseData, subgraphData, containerData, calibrationData,
  tagKeys, tagData, taggedModules,
] = await Promise.all([
  this.readFileProperties(fileSystemId),
  this.readUsecaseData(fileSystemId),
  this.readSubgraphData(fileSystemId),
  this.readContainerData(fileSystemId),
  this.readCalibrationData(fileSystemId),
  this.readTagKeys(fileSystemId),
  this.readTagData(fileSystemId),
  this.readTaggedModuleData(fileSystemId),
]);
```

---

## Chunk Builders

### RawByteAccumulator (local utility, not shared)

Used inside each builder to track running byte offsets in raw buffers:
```ts
class RawByteAccumulator {
  private parts: Uint8Array[] = [];
  private _offset = 0;

  add(bytes: Uint8Array): number {  // returns offset BEFORE adding
    const offset = this._offset;
    this.parts.push(bytes);
    this._offset += bytes.length;
    return offset;
  }

  build(): Uint8Array { return BinaryUtils.concatenate(this.parts); }
  get currentOffset(): number { return this._offset; }
}
```

### Builder 1 — `tag-keys-chunk-builder.ts` (MTKL)

New file: `packages/core/src/application/file-operations/download-file/services/chunk-builders/tag-keys-chunk-builder.ts`

Input: `TagKeysDownloadModel[]` (sorted tagId ASC), shared `DatapoolChunk`

For each model:
1. Serialize datapool payload: `[numKeys, keyId, keyId, ...]` → `poolOffset = datapool.addOrReuse(payload)`
2. Write table entry: `[tagId, poolOffset]`

Output: single `Uint8Array` (MTKL table bytes).

### Builder 2 — `tag-data-chunk-builder.ts` (MTKT + MTLU + MTDE + MTDO)

New file: `packages/core/src/application/file-operations/download-file/services/chunk-builders/tag-data-chunk-builder.ts`

Input: `TagDataDownloadModel[]` (sorted subgraphId ASC, tagId ASC), shared `DatapoolChunk`

Three local `RawByteAccumulator`s: `mtluBuf`, `mtdeBuf`, `mtdoBuf`. One `Uint8Array[]` for MTKT entries.

For each `(subgraphId, tagId)` entry:
1. `mtluOffset = mtluBuf.currentOffset` → MTKT entry records this
2. Write MTLU block header into `mtluBuf`: `[numTagKeyValues, numTkvEntries]`
3. For each TKV row:
   - Build MTDE bytes: `[numPairs, iId, pId, ...]` → `mtdeOffset = mtdeBuf.add(bytes)`
   - For each param: `poolOffset = datapool.addOrReuse(payload)` → collect offsets
   - Build MTDO bytes: `[numOffsets, poolOffset, ...]` → `mtdoOffset = mtdoBuf.add(bytes)`
   - Append MTLU vector into `mtluBuf`: `[tagKeyValues..., mtdeOffset, mtdoOffset]`
4. Write MTKT entry: `[subgraphId, tagId, mtluOffset]`

Output: `{ mtkt: Uint8Array, mtlu: Uint8Array, mtde: Uint8Array, mtdo: Uint8Array }`

### Builder 3 — `tagged-module-map-chunk-builder.ts` (TMLU + TMDE)

New file: `packages/core/src/application/file-operations/download-file/services/chunk-builders/tagged-module-map-chunk-builder.ts`

Input: `TaggedModuleDownloadModel[]`

One local `RawByteAccumulator`: `tmdeBuf`. One `Uint8Array[]` for TMLU entries.

Filter: drop entries where `isVoice = true` before iterating.

For each non-voice `(subgraphId, tagId)` entry:
1. Build TMDE bytes: `[numPairs, mId, iId, ...]` → `tmdeOffset = tmdeBuf.add(bytes)`
2. Write TMLU entry: `[subgraphId, tagId, tmdeOffset]`

Output: `{ tmlu: Uint8Array, tmde: Uint8Array }`

---

## Wiring — AcdbFileSerializer

File: `packages/core/src/application/file-operations/download-file/services/acdb-file-serializer.ts`

Add constant to `chunk-types.ts`:
```ts
MODULE_TAG_KEYIDS_TABLE: 'MTKL',
```

Insertion point in `serialize()` — after voice calibration, before datapool:
```ts
this.serializeTagKeysChunks(entities.tagKeys ?? [], chunkList, datapool);
this.serializeTagDataChunks(entities.tagData ?? [], chunkList, datapool);
this.serializeTaggedModuleMapChunks(entities.taggedModules ?? [], chunkList);
this.serializeDatapoolChunk(chunkList, datapool);
```

Each method follows the exact `serializeAudioCalibrationChunks` pattern:
- Guard on empty input → return early
- Call builder → get binary output
- Call `addChunk()` for each non-empty output buffer

`ChunkBuilderService` gets three new delegating methods:
- `buildTagKeysChunk(tagKeys, datapool)`
- `buildTagDataChunks(tagData, datapool)`
- `buildTaggedModuleMapChunks(taggedModules)`

---

## Error Handling

- Empty/undefined `tagKeys/tagData/taggedModules` → serialize methods return early, no chunks emitted
- DB query failures → propagate as thrown errors through `readAllEntitiesForFile`
- Builder failures → propagate through `AcdbFileSerializer.serialize()` try/catch

---

## Testing

### Unit tests

`packages/core/tests/unit/application/file-operations/download-file/services/chunk-builders/`

- `tag-keys-chunk-builder.spec.ts` — verify MTKL table bytes and datapool payloads; verify tagId ASC order; verify keyId ASC within payload
- `tag-data-chunk-builder.spec.ts` — verify MTKT/MTLU/MTDE/MTDO output for small fixture; verify sorted `tagKeyValues`; verify MTLU byte offsets point to correct MTDE/MTDO positions
- `tagged-module-map-chunk-builder.spec.ts` — verify TMLU/TMDE output; verify `isVoice=true` entries excluded; verify `[moduleId, instanceId]` sort order in TMDE bytes

### Integration test

`packages/core/tests/integration/application/file-operations/download-file/tag-data-download.integration.spec.ts`

1. Build `DownloadEntities` fixture with all three tag models populated
2. Call `AcdbFileSerializer.serialize()`
3. Parse resulting binary using existing `TagDataChunkParser` and `TaggedModuleMapChunkParser`
4. Assert round-trip fidelity — parsed entries match input fixture
