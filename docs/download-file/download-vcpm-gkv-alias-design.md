<!--
Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
SPDX-License-Identifier: BSD-3-Clause
-->

# Plan: Download VCPM Calibration Data + GKV Alias

## Context

The upload-file path already parses two pieces of data from an ACDB file that the download-file path does not yet reconstruct:

1. **VCPM calibration data** — stored in `vcpm_instances` / `vcpm_ckv` / `vcpm_ckv_values` / `vcpm_parameter_payload` tables. The existing voice calibration download reads the `ckv` tables (SPF modules with `is_voice=true`) but never touches the VCPM-specific tables. The result: `VCPM_CALDATA` chunk family (`VCCD`, `VCMK`, `VCKT`, `VCLU`, `VCDE`) in the output is missing the VCPM module's calibration entries.

2. **GKV alias** — stored in `use_cases.alias_id` / `use_cases.alias`. The download path already fetches every usecase row but drops these columns. The `GALS` chunk is never emitted.

Both are reverse-of-upload operations. The goal is to complete the round-trip: upload → download → upload produces identical files.

---

## Feature folder

`docs/download-file/` — existing home for all download-file design docs.

---

## Approach

### A. VCPM Calibration Data Download

**Key insight:** `VoiceCalibrationChunk` and `VoiceCalibrationChunkBuilder` already express the correct binary structure. The builder takes `CalibrationDataDownloadModel[]` — the same model shape that VCPM data naturally maps to. The serializer (`VoiceCalibrationChunkSerializer`) is already correct. No new chunk class or serializer needed.

**What's missing:** a DB query that reads `vcpm_ckv → vcpm_ckv_values → value_definitions → arc_keys` + `vcpm_parameter_payload → vcpm_module_parameter_definitions` and returns `CalibrationDataDownloadModel[]`.

**How VCPM merges with voice-CKV:** A single `VCPM_CALDATA` binary chunk exists in the output. After splitting calibration data into `audio` and `voice` arrays, VCPM data is merged into the `voice` array — specifically, for each voice subgraph that has a VCPM instance, the VCPM key-value combinations are appended to that subgraph's entry (or a new entry is created if no voice-CKV existed for that subgraph). The serializer then writes one combined `VCPM_CALDATA` chunk.

**Sorting contract:** VCPM data must be sorted the same way as voice-CKV data: by subgraphId → keyIds → valueIds → moduleInstanceId → parameterId. This can be done at the application layer alongside the existing `sortCkvEntries()` logic.

**What modules appear in the VCPM data:** During upload, `SPF_VCPM_MODULE_ID = 4` entries are **excluded** from the CKV path and stored in `vcpm_ckv` instead. The `moduleInstanceId` in the download model comes from `vcpm_module_definitions.module_definition_id` (the natural ID), not from SPF instance IDs. We set it to `SPF_VCPM_MODULE_ID` (= 4) during the query build.

### B. GKV Alias Download

**Key insight:** `GkvAliasChunk` already exists. The upload parser (`GkvAliasChunkParser`) shows the exact binary format. The download needs a new `GkvAliasChunkSerializer` that is the mirror.

**Data source:** `use_cases.alias_id` and `use_cases.alias` — already fetched by `readUsecaseData()`. Add two optional fields to `UsecaseDataDownloadModel`.

**Binary format (from parser):**
```
GALS body:
  NumKeyTables: uint32
  For each key table (grouped by numKeys):
    NumKeys: uint32
    NumGkvs: uint32
    For each GKV:
      numKeys × [keyId uint32, keyVal uint32]
      DatapoolOffset: uint32

Datapool payload:
  [uint32 innerStringLen][ASCII: "<aliasId>" or "<aliasId> | <aliasName>\0"]
```

Usecases are already sorted by numKeys → keyIds → valueIds by `readUsecaseData()`. The serializer groups them by numKeys to produce one `GkvAliasTable` per group.

---

## Components to Create / Modify

### 1. `BulkReadQueryService` interface (core)
**File:** `packages/core/src/application/ports/persistence/query-services/bulk-read/bulk-read-query-service.ts`
- Add `vcpmCalibrationData?: CalibrationDataDownloadModel[]` to `DownloadEntities`
- Add `aliasId?: number` and `alias?: string` to `UsecaseDataDownloadModel`
- Add `readVcpmCalibrationData(fileSystemId: number): Promise<CalibrationDataDownloadModel[]>` to `BulkReadQueryService` interface

### 2. `TypeOrmBulkReadQueryService` — new query method (infrastructure)
**File:** `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/bulk-read/typeorm-bulk-read-query-service.ts`

**`readVcpmCalibrationData(fileSystemId)`:**
- Fetch all VcpmCkv entries joined through VcpmInstance → Subgraph (filtered by `fileSystemId`)
- Fetch VcpmCkvValues for those IDs → join ValueDefinition → ArcKey (for `keyId`, `valueId`, `isDynamic`)
- Fetch VcpmParameterPayload for those IDs → join VcpmModuleParameterDefinition (for `paramId`, `payload`)
- Build `CalibrationDataDownloadModel[]` with the same grouping logic as `buildCalibrationModels()`:
  - `moduleInstanceId` = `SPF_VCPM_MODULE_ID` (4) for all entries (VCPM module)
  - `parameterId` from `VcpmModuleParameterDefinition.paramId`
  - `payload` from `VcpmParameterPayload.payload`
  - `pidType` = `''` (not used by voice builder; field required by type)
  - Sort: subgraphId → keyIds → valueIds → parameterId

**`readAllEntitiesForFile()` update:**
- Add `timed('readVcpmCalibrationData', this.readVcpmCalibrationData(fileSystemId))` to the `Promise.all()` call
- Include `vcpmCalibrationData` in the returned `DownloadEntities`

**`readUsecaseData()` update:**
- Include `aliasId` and `alias` from `UseCaseRow` in the mapped model

### 3. `GkvAliasChunkSerializer` (new, core)
**File:** `packages/core/src/application/file-operations/download-file/services/chunk-serializers/gkv-alias-chunk-serializer.ts`

**`serialize(usecaseData: UsecaseDataDownloadModel[]): Uint8Array`:**
- Filter usecases to only those with `aliasId !== undefined`
- Group by `numKeys` (= `keyIds.length`) — one `GkvAliasTable` per group
- For each usecase in a group: build alias string `"${aliasId}"` or `"${aliasId} | ${alias}"`
- Write alias string to datapool: `[uint32 innerStringLen][ASCII bytes]`
- Write binary: numKeyTables → for each group: numKeys, numGkvs → for each GKV: keyId/keyVal pairs + datapoolOffset
- Uses shared `DatapoolChunk` passed in as parameter

**Reuses:** `GkvAliasChunk` (data class), `DatapoolChunk.addOrReuse()`, `BinaryUtils`

### 4. `AcdbFileSerializer` (modify, core)
**File:** `packages/core/src/application/file-operations/download-file/services/acdb-file-serializer.ts`

**VCPM merge into voice calibration:**
- After the `splitCalibrationData()` call, merge `entities.vcpmCalibrationData` into the `voice` array
- Merge strategy: for each VCPM entry by `subgraphId`, if a voice entry already exists for that subgraph, append its `keyValueCombinations`; otherwise push the VCPM entry as-is
- Re-sort the merged `voice` array by subgraphId → keyIds → valueIds before passing to builder

**GKV alias serialization:**
- After `serializeUsecaseChunks()`, add a call to `serializeGkvAliasChunk(entities.usecaseData ?? [], chunkList, datapool)`
- New private method `serializeGkvAliasChunk()` creates a `GkvAliasChunkSerializer` and calls serialize
- Only emits the `GALS` chunk if at least one entry has `aliasId !== undefined`

**Chunk order in file:** `GALS` chunk is emitted immediately after `GKV_TABLE` / `GKV_LUT` (the usecase chunks), before audio calibration. This matches the natural grouping of usecase-related chunks.

### 5. Tests

**Unit tests (new):**
- `packages/core/tests/unit/application/file-operations/download-file/services/chunk-serializers/gkv-alias-chunk-serializer.spec.ts`
  - Empty data → no output
  - Single entry with aliasId, no name
  - Multiple entries same numKeys → single table
  - Multiple entries different numKeys → multiple tables
  - Alias string format: with and without usecaseName

**Integration tests (extend):**
- `packages/core/tests/integration/application/file-operations/download-file/voice-calibration-download.integration.spec.ts`
  - Add test: entities with `vcpmCalibrationData` → verify VCPM_CALDATA contains merged data
- New file: `packages/core/tests/integration/application/file-operations/download-file/gkv-alias-download.integration.spec.ts`
  - Upload file with GKV alias data → download → verify GALS chunk present and parses correctly

**Infrastructure integration tests (new):**
- `packages/infrastructure/persistence/tests/integration/bulk-read/vcpm-calibration-download.spec.ts`
  - Insert vcpm_instances/vcpm_ckv/vcpm_ckv_values/vcpm_parameter_payload rows
  - Call `readVcpmCalibrationData()` → verify model shape and values

---

## Data Flow Summary

```
DB (vcpm_ckv + vcpm_ckv_values + vcpm_parameter_payload)
  ↓ readVcpmCalibrationData()
CalibrationDataDownloadModel[] (vcpmCalibrationData)
  ↓ merge into voice[] in AcdbFileSerializer
voice[] (voice-CKV + VCPM combined)
  ↓ VoiceCalibrationChunkBuilder.buildChunk()
VoiceCalibrationChunk (offsets in datapool)
  ↓ VoiceCalibrationChunkSerializer.serialize()
VCPM_CALDATA + VCMK + VCKT + VCLU + VCDE binary chunks

DB (use_cases.alias_id, use_cases.alias)
  ↓ readUsecaseData() (extended to include aliasId/alias)
UsecaseDataDownloadModel[] (with aliasId/alias)
  ↓ GkvAliasChunkSerializer.serialize()
GALS binary chunk
```

---

## Verification

1. Run existing tests: `nx test core` and `nx test infrastructure` — must pass
2. E2E round-trip test: upload a file containing VCPM data and GKV alias → download → parse the downloaded ACDB → verify `VCPM_CALDATA` and `GALS` chunks match the originals byte-for-byte
3. The fixture file `packages/api/tests/e2e/fixtures/acdb_cal.acdb` contains VCPM and GKV alias data — use this for the round-trip test

---

## Files Changed Summary

| File | Change |
|------|--------|
| `packages/core/src/application/ports/persistence/query-services/bulk-read/bulk-read-query-service.ts` | Add `vcpmCalibrationData` to `DownloadEntities`; add `aliasId`/`alias` to `UsecaseDataDownloadModel`; add `readVcpmCalibrationData` to interface |
| `packages/infrastructure/persistence/src/.../typeorm-bulk-read-query-service.ts` | Add `readVcpmCalibrationData()`; extend `readUsecaseData()` to include `aliasId`/`alias`; add to `readAllEntitiesForFile()` |
| `packages/core/src/application/file-operations/download-file/services/chunk-serializers/gkv-alias-chunk-serializer.ts` | **New** — GKV alias binary serializer |
| `packages/core/src/application/file-operations/download-file/services/acdb-file-serializer.ts` | Merge VCPM into voice array; emit GALS chunk after usecase chunks |
| `packages/core/tests/unit/.../gkv-alias-chunk-serializer.spec.ts` | **New** — unit tests |
| `packages/core/tests/integration/.../voice-calibration-download.integration.spec.ts` | Extend with VCPM merge test |
| `packages/core/tests/integration/.../gkv-alias-download.integration.spec.ts` | **New** — integration test |
| `packages/infrastructure/persistence/tests/.../vcpm-calibration-download.spec.ts` | **New** — DB integration test |
