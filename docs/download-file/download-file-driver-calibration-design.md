# Driver Calibration Download — Design Spec

## Requirements

**FR-1.** Query `DriverModule`, `DriverModuleDefinition`, `Dkv`, `DkvValues`, `ValueDefinition`, `KeyDefinition`, `DkvParameterPayload`, and `DriverModuleParameterDefinition` from DB for a given `fileSystemId`.

**FR-2.** Build `DriverCalibrationDownloadModel` — grouped by `(moduleDefinitionId, keyIds)` → CKV combinations → parameter payloads (for GCLU/GCKT/GCDT/GCDE/GCDO chunks).

**FR-3.** Build GCLU/GCKT/GCDT/GCDE/GCDO binary chunks. Outer sort: `moduleDefinitionId ASC`. Middle sort: key-set `keyIds` lexicographic ASC. Inner sort: value-vector `valueIds` lexicographic ASC. Parameter payloads land in shared datapool.

**FR-4.** Extend `DownloadEntities` with `driverCalibrationData?`. Extend `readAllEntitiesForFile()` to fetch it in parallel alongside the existing queries.

**FR-5.** Wire all five driver calibration chunks into `AcdbFileSerializer.serialize()` following the existing calibration chunk pattern.

---

## Binary Formats

> Derived from existing `DriverCalibrationChunkParser`.

### GCLU (DRIVER_CALIBRATION_LUT) — chunk ID `'GCLU'`
```
numEntries: uint32   ← total (MID, keySet) pairs across all modules
                       NOTE: one MID can appear multiple times if it has multiple key sets
Entry[moduleDefinitionId ASC, keyIds lex ASC]:
  mid:            uint32   ← moduleDefinitionId (natural)
  keyTblOffset:   uint32   ← byte offset into GCKT raw buffer
  dataLutOffset:  uint32   ← byte offset into GCDT raw buffer
```

### GCKT (DRIVER_CALIBRATION_KEY_TABLE) — chunk ID `'GCKT'`, raw bytes
```
CalKeyTbl per GCLU entry (at keyTblOffset):
  numKeyIds: uint32
  keyId[numKeyIds]: uint32   ← sorted ASC
```

### GCDT (DRIVER_CALIBRATION_DATA_TABLE) — chunk ID `'GCDT'`, raw bytes
```
GSLKVLUTTbl per GCLU entry (at dataLutOffset):
  numCalKeyVals:    uint32   ← = keyIds.length for this group
  numKVLUTEntries:  uint32   ← = number of CKVs in this group
  KVLUTEntry[valueIds lex ASC]:
    calKeyVal[numCalKeyVals]: uint32   ← VALUE IDs for this CKV, one per key slot
    offsetCalDEF: uint32   ← byte offset into GCDE raw buffer
    offsetCalDOT: uint32   ← byte offset into GCDO raw buffer
```

### GCDE (DRIVER_CALIBRATION_DATA_DEF) — chunk ID `'GCDE'`, raw bytes
```
CalDEFEntry per KVLUTEntry (at offsetCalDEF):
  numPids: uint32
  pId[numPids]: uint32   ← natural parameterId, sorted ASC
```

### GCDO (DRIVER_CALIBRATION_DATA_DOT) — chunk ID `'GCDO'`, raw bytes
```
CalDOTEntry per KVLUTEntry (at offsetCalDOT):
  numCalDataOffsets: uint32
  dataPoolOffset[numCalDataOffsets]: uint32   ← offsets into shared POOL chunk,
                                                one per pId (parallel to GCDE)
```

---

## Data Models

File: `packages/core/src/application/ports/persistence/query-services/bulk-read/bulk-read-query-service.ts`

```ts
/**
 * Per-(moduleDefinitionId, keyIds) group of driver calibration CKV data.
 * Used to build GCLU, GCKT, GCDT, GCDE, GCDO chunks.
 *
 * Sorting contract (must be upheld by the query layer):
 *   outer: moduleDefinitionId ASC
 *   middle: keyIds lexicographic ASC (determines GCKT/GCLU ordering)
 *   inner: valueIds lexicographic ASC (determines GCDT KVLUTEntry ordering)
 *   params: parameterId ASC (determines GCDE/GCDO entry ordering)
 */
export interface DriverCalibrationDownloadModel {
  /** Natural module definition ID (MID) */
  moduleDefinitionId: number;
  /** Sorted key IDs for this group — written to GCKT */
  keyIds: number[];
  /** CKV combinations for this (MID, keySet) group */
  ckvs: Array<{
    /** VALUE IDs parallel to keyIds, sorted by keyId ASC — written to GCDT */
    valueIds: number[];
    /** Parameter payloads sorted by parameterId ASC — written to GCDE/GCDO */
    parameters: Array<{
      parameterId: number;
      payload: Uint8Array;
    }>;
  }>;
}
```

Extend `DownloadEntities`:
```ts
driverCalibrationData?: DriverCalibrationDownloadModel[];
```

Add port method to `BulkReadQueryService`:
```ts
readDriverCalibrationData(fileSystemId: number): Promise<DriverCalibrationDownloadModel[]>;
```

---

## DB Query Layer

File: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/bulk-read/typeorm-bulk-read-query-service.ts`

### Query A — base DKV rows

```
Dkv (dkv)
  → LEFT JOIN DriverModule (dm)   ON dm.systemId = dkv.driverModuleSystemId
    → LEFT JOIN DriverModuleDefinition (dmd)   ON dmd.systemId = dm.definitionSystemId
  → LEFT JOIN DkvValues (dv)   ON dv.dkvSystemId = dkv.systemId
    → LEFT JOIN ValueDefinition (vd)   ON vd.systemId = dv.valueDefSystemId
      → LEFT JOIN KeyDefinition (k)   ON k.systemId = vd.keySystemId
WHERE dm.fileSystemId = :fileSystemId
ORDER BY dmd.moduleDefinitionId ASC, dkv.systemId ASC
```

Produces `DkvRow[]` with nested `values → valueDef → keys` hydrated.

### Query B — parameter payloads (chunked IN-clause)

```
DkvParameterPayload (dpp)
  → LEFT JOIN DriverModuleParameterDefinition (dmpd)   ON dmpd.systemId = dpp.parameterSystemId
WHERE dpp.dkvSystemId IN (:...ids)
ORDER BY dpp.dkvSystemId ASC, dmpd.parameterId ASC
```

Uses existing `queryInChunks()` helper (same as `fetchParametersForCkvs`).

### App-layer grouping — `buildDriverCalibrationModels`

Group `DkvRow[]` by `(moduleDefinitionId, keyIds-signature)`:

1. For each `DkvRow`, extract `keyIds` (sorted by `keyId ASC`) and `valueIds` (parallel to keyIds) from `dkv.values`.
2. Group by `(moduleDefinitionId, keyIds.join(','))` using a `Map<string, DriverCalibrationDownloadModel>`.
3. Within each group, push a `ckv` entry from `{valueIds, parameters}` using the param map from Query B.
4. After all rows: sort outer groups by `moduleDefinitionId ASC` then by `keyIds` lex ASC; sort inner `ckvs` by `valueIds` lex ASC.

### `readAllEntitiesForFile` update

```ts
const [
  headerMetadata, usecaseData, subgraphData, containerData, calibrationData,
  tagKeys, tagData, taggedModules, driverCalibrationData,
] = await Promise.all([
  this.readFileProperties(fileSystemId),
  this.readUsecaseData(fileSystemId),
  this.readSubgraphData(fileSystemId),
  this.readContainerData(fileSystemId),
  this.readCalibrationData(fileSystemId),
  this.readTagKeys(fileSystemId),
  this.readTagData(fileSystemId),
  this.readTaggedModuleData(fileSystemId),
  this.readDriverCalibrationData(fileSystemId),
]);
```

---

## Chunk Builder

New file: `packages/core/src/application/file-operations/download-file/services/chunk-builders/driver-calibration-chunk-builder.ts`

### Return type

```ts
export interface DriverCalibrationChunkBuildResult {
  gclu: Uint8Array;
  gckt: Uint8Array;
  gcdt: Uint8Array;
  gcde: Uint8Array;
  gcdo: Uint8Array;
}
```

### RawByteAccumulator (local, same pattern as tag-data-chunk-builder)

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

### Algorithm

Four local `RawByteAccumulator`s: `gcktBuf`, `gcdtBuf`, `gcdeBuf`, `gcdoBuf`.
One `Uint8Array[]` for GCLU entries (assembled last with count prefix).

Input `data` arrives pre-sorted by query layer. Builder re-sorts defensively:
- `data` sorted by `moduleDefinitionId ASC`, then by `keyIds` lex ASC
- `ckvs` within each entry sorted by `valueIds` lex ASC

For each `(moduleDefinitionId, keyIds)` group:

1. **GCKT entry**: `[numKeyIds, keyId, ...]` → `keyTblOffset = gcktBuf.add(bytes)`

2. **GCDT entry** — accumulate into temporary buffer then add to `gcdtBuf`:
   - Write header `[numCalKeyVals, numKVLUTEntries]`
   - For each CKV:
     - Build GCDE bytes: `[numPids, pId, ...]` → `gcdeOffset = gcdeBuf.add(bytes)`
     - For each param: `poolOffset = datapool.addOrReuse(payload)` → collect offsets
     - Build GCDO bytes: `[numOffsets, poolOffset, ...]` → `gcdoOffset = gcdoBuf.add(bytes)`
     - Append KVLUTEntry into entry buffer: `[valueId..., gcdeOffset, gcdoOffset]`
   - `dataLutOffset = gcdtBuf.add(entryBytes)`

3. **GCLU entry**: `[mid, keyTblOffset, dataLutOffset]` → push into `gcluEntries[]`

Final assembly:
```ts
const numEntriesBytes = new Uint8Array(BinaryUtils.SIZEOF_UINT32);
new DataView(numEntriesBytes.buffer).setUint32(0, gcluEntries.length, true);
const gclu = BinaryUtils.concatenate([numEntriesBytes, ...gcluEntries]);
```

### Export

```ts
export const DriverCalibrationChunkBuilder = {
  buildChunk(
    data: DriverCalibrationDownloadModel[],
    datapool: DatapoolChunk,
  ): DriverCalibrationChunkBuildResult
};
```

---

## Wiring — AcdbFileSerializer

File: `packages/core/src/application/file-operations/download-file/services/acdb-file-serializer.ts`

Chunk type constants already exist in `packages/core/src/application/file-operations/shared/constants/chunk-types.ts`:
```ts
DRIVER_CALIBRATION_LUT: 'GCLU',
DRIVER_CALIBRATION_KEY_TABLE: 'GCKT',
DRIVER_CALIBRATION_DATA_TABLE: 'GCDT',
DRIVER_CALIBRATION_DATA_DEF: 'GCDE',
DRIVER_CALIBRATION_DATA_DOT: 'GCDO',
```

Insertion point in `serialize()` — after voice calibration chunks, before tag-keys:
```ts
this.serializeAudioCalibrationChunks(audio, chunkList, datapool);
this.serializeVoiceCalibrationChunks(voice, chunkList, datapool);
this.serializeDriverCalibrationChunks(entities.driverCalibrationData ?? [], chunkList, datapool);  // NEW
this.serializeTagKeysChunks(entities.tagKeys ?? [], chunkList, datapool);
```

New private method pattern (mirrors `serializeAudioCalibrationChunks`):
```ts
private serializeDriverCalibrationChunks(
  data: DriverCalibrationDownloadModel[],
  chunkList: Array<{id: string; data: Uint8Array}>,
  datapool: DatapoolChunk,
): void {
  if (data.length === 0) return;
  const result = this.chunkBuilder.buildDriverCalibrationChunks(data, datapool);
  if (result.gclu.length > 0) this.addChunk(chunkList, ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_LUT, result.gclu);
  if (result.gckt.length > 0) this.addChunk(chunkList, ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_KEY_TABLE, result.gckt);
  if (result.gcdt.length > 0) this.addChunk(chunkList, ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_DATA_TABLE, result.gcdt);
  if (result.gcde.length > 0) this.addChunk(chunkList, ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_DATA_DEF, result.gcde);
  if (result.gcdo.length > 0) this.addChunk(chunkList, ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_DATA_DOT, result.gcdo);
}
```

`ChunkBuilderService` gets one new delegating method:
```ts
buildDriverCalibrationChunks(
  data: DriverCalibrationDownloadModel[],
  datapool: DatapoolChunk,
): DriverCalibrationChunkBuildResult {
  return DriverCalibrationChunkBuilder.buildChunk(data, datapool);
}
```

---

## Error Handling

- Empty/undefined `driverCalibrationData` → `serializeDriverCalibrationChunks` returns early, no chunks emitted.
- DB query failures → propagate as thrown errors through `readAllEntitiesForFile`.
- Builder failures → propagate through `AcdbFileSerializer.serialize()` existing try/catch.

---

## Testing

### Unit test

`packages/core/tests/unit/application/file-operations/download-file/services/chunk-builders/driver-calibration-chunk-builder.spec.ts`

- Empty input → all five chunks are empty `Uint8Array`
- Single module, single CKV, single parameter:
  - GCLU has `numEntries = 1`, correct `mid`, `keyTblOffset = 0`, `dataLutOffset = 0`
  - GCKT at offset 0: `numKeyIds`, then keyId values
  - GCDT at offset 0: `numCalKeyVals`, `numKVLUTEntries = 1`, then value IDs + GCDE/GCDO offsets
  - GCDE at offset 0: `numPids = 1`, then parameterId
  - GCDO at offset 0: `numOffsets = 1`, then datapool offset
- Multiple modules — verify GCLU `numEntries` counts all `(MID, keySet)` pairs, not distinct MIDs
- Multiple CKVs — verify GCDT `numKVLUTEntries` and that GCDE/GCDO offsets advance correctly
- Sort correctness — out-of-order input produces same binary as pre-sorted input

### Integration test

`packages/core/tests/integration/application/file-operations/download-file/driver-calibration-download.integration.spec.ts`

1. Insert into in-memory SQLite: driver module definitions, driver modules, DKV rows with `dkv_values` and `dkv_parameter_payload`.
2. Call `readDriverCalibrationData(fileSystemId)` — assert returned models match inserted data with correct sorting.
3. Call `DriverCalibrationChunkBuilder.buildChunk(models, datapool)`.
4. Parse the five output buffers using the existing `DriverCalibrationChunkParser`.
5. Assert round-trip fidelity: `moduleDefinitionId`, `keyIds`, `valueIds`, `parameterId` values all match.
