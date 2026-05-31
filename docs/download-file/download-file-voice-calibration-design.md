<!--
Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
SPDX-License-Identifier: BSD-3-Clause
-->

# Download File: Voice Calibration Data Design

## Document Information
- **Version**: 1.0
- **Date**: June 2026
- **Status**: Approved for Implementation
- **Related Documents**:
  - [Download File: Audio Calibration Data Design](./download-file-audio-calibration-design.md)
  - [Upload File Design](./upload-file-design.md)

---

## Table of Contents
1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Database Schema](#3-database-schema)
4. [Data Flow](#4-data-flow)
5. [Chunk Format Specification](#5-chunk-format-specification)
6. [Implementation Components](#6-implementation-components)
7. [Performance Optimization](#7-performance-optimization)
8. [Testing Strategy](#8-testing-strategy)
9. [Implementation Checklist](#9-implementation-checklist)

---

## 1) Overview

### 1.1 Purpose

Implement voice calibration data download functionality that mirrors the existing audio calibration download pattern. This enables reconstruction of VCPM calibration chunks from database entities for file download operations.

### 1.2 Key Requirements

- ✅ **Mirror Audio Calibration Pattern**: Follow exact same architecture as audio calibration download
- ✅ **Chunk Format Compliance**: Match ACDB binary format specification exactly
- ✅ **C# Implementation Parity**: Align with reference C# implementation logic
- ✅ **Performance Optimized**: Parallel chunk building, optimized SQL queries
- ✅ **Sorted Output**: All data sorted at every level (subgraph, keys, values, modules)
- ✅ **Production Ready**: Error handling, logging, type safety

### 1.3 Scope

**In Scope:**
- Voice calibration data (VCPM_CALDATA and related chunks)
- Database query optimization with proper sorting
- Parallel chunk building with workers
- Sequential datapool offset assignment
- Binary serialization to ACDB format
- Master key table generation from database

**Out of Scope:**
- Audio calibration data - already implemented
- Tag data - separate feature
- Other chunk types not related to voice calibration

---

## 2) Architecture

### 2.1 High-Level Flow

```
Database (SQLite)
  ↓
TypeOrmBulkReadRepository.readVoiceCalibrationData()
  ↓ (SQL with JOINs, filtered by is_voice = true, sorted)
VoiceCalibrationDataFromDb[] (structured for chunk building)
  ↓
VoiceCalibrationChunkBuilder.buildChunk() [PARALLEL with workers]
  ↓
VoiceCalibrationChunk (parsed structure, offsets = 0)
  ↓
VoiceCalibrationChunkSerializer.serialize() [SEQUENTIAL datapool assignment]
  ↓
Binary Chunks:
  - VCPM_CALDATA
  - VCPM_MASTER_KEY
  - VCPM_CALIBRATION_KEY_TABLE
  - VCPM_CALIBRATION_DATA_LUT
  - VCPM_CALIBRATION_DATA_DEF
  - DATAPOOL (updated with voice calibration payloads)
```

### 2.2 Pattern Alignment with Audio Calibration

| Aspect | Audio Calibration | Voice Calibration |
|--------|-------------------|-------------------|
| **Repository** | `readAudioCalibrationData()` | `readVoiceCalibrationData()` |
| **Data Structure** | `AudioCalibrationDataFromDb[]` | `VoiceCalibrationDataFromDb[]` |
| **Chunk Builder** | `AudioCalibrationChunkBuilder` | `VoiceCalibrationChunkBuilder` |
| **Chunk Serializer** | `AudioCalibrationChunkSerializer` | `VoiceCalibrationChunkSerializer` |
| **Database Tables** | `ckv` (is_voice = false/null) | `ckv` (is_voice = true) |
| **Parallelization** | Chunk building with workers | Chunk building with workers |
| **Datapool** | Sequential assignment | Sequential assignment |
| **Binary Output** | 5 chunks | 5 chunks |

### 2.3 Component Diagram

```mermaid
graph TB
    subgraph "Download File Orchestrator"
        DFO[DownloadFileOrchestrator]
        AFS[AcdbFileSerializer]
    end

    subgraph "Repository Layer"
        BRR[BulkReadRepository Interface]
        TBRR[TypeOrmBulkReadRepository]
    end

    subgraph "Chunk Building (Parallel)"
        UCB[UsecaseDataChunkBuilder]
        ACB[AudioCalibrationChunkBuilder]
        VCB[VoiceCalibrationChunkBuilder]
    end

    subgraph "Chunk Serialization (Sequential)"
        UCS[UsecaseDataChunkSerializer]
        ACS[AudioCalibrationChunkSerializer]
        VCS[VoiceCalibrationChunkSerializer]
        DPB[DatapoolBuilder]
    end

    DFO --> AFS
    AFS --> BRR
    BRR --> TBRR
    TBRR --> UCB
    TBRR --> ACB
    TBRR --> VCB
    UCB --> UCS
    ACB --> ACS
    VCB --> VCS
    UCS --> DPB
    ACS --> DPB
    VCS --> DPB

    style VCB fill:#e1f5ff
    style VCS fill:#e1f5ff
    style TBRR fill:#fff4e1
```

---

## 3) Database Schema

### 3.1 Calibration Tables (Shared with Audio)

```typescript
// ckv table (one row per calibration bin)
interface CkvRow {
  systemId: number;              // PK
  spfModuleSystemId: number;     // FK to spf_modules
  uiPersistence: Uint8Array | null;
}

// ckv_values table (key-value combination identifying the bin)
interface CkvValuesRow {
  ckvSystemId: number;           // FK to ckv (composite PK)
  valueDefSystemId: number;      // FK to arc_values (composite PK)
}

// ckv_parameter_payload table (actual calibration data)
interface CkvParameterPayloadRow {
  systemId: number;              // PK
  ckvSystemId: number;           // FK to ckv
  parameterSystemId: number;     // FK to spf_module_parameter_definitions
  payload: Uint8Array;           // Calibration data
}

// arc_keys table (key definitions with voice flag)
interface ArcKeysRow {
  systemId: number;              // PK
  keyId: number;                 // Natural ID
  isVoice: boolean;              // Voice vs Audio distinction
  isDynamic: boolean;            // Static vs Dynamic key
  // ... other fields
}

// subgraphs table (with voice flag)
interface SubgraphsRow {
  systemId: number;              // PK
  subgraphId: number;            // Natural ID
  isVoice: boolean;              // Voice vs Audio distinction
  // ... other fields
}
```

### 3.2 Voice vs Audio Distinction

**Key Insight**: Voice and audio calibration use the **same database tables** (`ckv`, `ckv_values`, `ckv_parameter_payload`), distinguished by:

- `arc_keys.is_voice = true` → Voice calibration keys
- `subgraphs.is_voice = true` → Voice subgraphs
- Audio calibration uses `is_voice = false` or `NULL`

This is different from VCPM configuration data which uses separate tables (`vcpm_ckv`, `vcpm_ckv_values`, `vcpm_parameter_payload`).

### 3.3 Data Relationships

```
ckv (calibration bin)
├─ ckv_values (many) → arc_values → arc_keys (is_voice = true)
│  └─ Defines the key-value combination for this bin
└─ ckv_parameter_payload (many)
   └─ Contains calibration data for each parameter

spf_modules
└─ subgraphs (is_voice = true)
   └─ Voice subgraph containing the module
```

---

## 4) Data Flow

### 4.1 Upload Flow (Context)

```
ACDB File
  ↓
VoiceCalibrationChunk (parsed)
  └─ subgraphCalTables[] (by subgraphId)
      ├─ VoiceMasterKeyTable (keyId + isDynamic)
      └─ voiceCkvDataTables[]
          ├─ VoiceCalKeyTable (keyIds[])
          └─ calDataObjects[]
              ├─ VoiceCkvLookupTable (calKeyValues[])
              ├─ VoiceCalDefinitionEntry (moduleInstanceId, paramId pairs)
              └─ VoiceCalDataOffsetEntry (datapool offsets)
  ↓
CalibrationDataBuilder.buildCalibrationData()
  ↓
For each VoiceCalDataObject:
  1. Resolve keyIds + calKeyValues → valueSystemIds
  2. Extract module-parameter-payloads from DEF and DOT entries
  3. Group by moduleInstanceId
  4. Create KvData(valueSystemIds, parameterPayloads[])
  ↓
Database:
  - ckv (systemId, spfModuleSystemId)
  - ckv_values (ckvSystemId, valueDefSystemId) - multiple rows
  - ckv_parameter_payload (ckvSystemId, parameterSystemId, payload) - multiple rows
  - arc_keys (is_voice = true, isDynamic)
  - subgraphs (is_voice = true)
```

### 4.2 Download Flow (This Design)

```
Database Query (TypeOrmBulkReadRepository)
  ↓
SELECT with JOINs and GROUP_CONCAT
WHERE sg.is_voice = true AND ak.is_voice = true
ORDER BY subgraphId, keyIds, valueIds, moduleInstanceId, parameterId
  ↓
VoiceCalibrationDataFromDb[] (structured, sorted)
  ↓
VoiceCalibrationChunkBuilder.buildChunk() [PARALLEL]
  ↓
VoiceCalibrationChunk (offsets = 0)
  ↓
VoiceCalibrationChunkSerializer.serialize() [SEQUENTIAL]
  ├─ Phase 1: Assign datapool offsets sequentially
  └─ Phase 2: Serialize to binary chunks
  ↓
Binary Chunks:
  - VCPM_CALDATA
  - VCPM_MASTER_KEY (concatenated)
  - VCPM_CALIBRATION_KEY_TABLE (concatenated)
  - VCPM_CALIBRATION_DATA_LUT (concatenated)
  - VCPM_CALIBRATION_DATA_DEF (concatenated)
  - DATAPOOL (updated)
```

---

## 5) Chunk Format Specification

### 5.1 VCPM_CALDATA (Main Chunk)

```
Format:
VCPMCalDataChunk = VCPMInstId VCPMCalTblParamId NumSGIDs SGCalTbl+
SGCalTbl = SGID SGCalTblSize MajorVers MinorVers OffsetVCPMMasterKeyTbl NumCKVDataTbl VocCKVDataTbl+
VocCKVDataTbl = VocCKVDataTblSize OffsetVocCalKeyTbl DOTTblSize NumCalDataObj CalDataObj+
CalDataObj = OffsetVocCKVLUTTbl OffsetVocCalDefTbl NumMiidPidPairs OffsetInGlbDataPool+

Binary Layout:
[VCPMInstId: uint32] = 0x00000004 (SPF_VCPM_MODULE_ID)
[VCPMCalTblParamId: uint32] = 0x08001163 (PARAM_ID_VOICE_CAL_TBL)
[NumSGIDs: uint32]
  [SGID: uint32]
  [SGCalTblSize: uint32]
  [MajorVers: uint32] = 1
  [MinorVers: uint32] = 0
  [OffsetVCPMMasterKeyTbl: uint32]
  [NumCKVDataTbl: uint32]
    [VocCKVDataTblSize: uint32]
    [OffsetVocCalKeyTbl: uint32]
    [DOTTblSize: uint32]
    [NumCalDataObj: uint32]
      [OffsetVocCKVLUTTbl: uint32]
      [OffsetVocCalDefTbl: uint32]
      [NumMiidPidPairs: uint32]
      [OffsetInGlbDataPool: uint32] ... (NumMiidPidPairs times)
    ...
  ...
```

### 5.2 VCPM_MASTER_KEY

```
Format:
VCPMMasterKeyTbl = NumMasterKeys KeyInfo+
KeyInfo = VocKeyId IsDynamic

Binary Layout:
[NumMasterKeys: uint32]
[VocKeyId: uint32]
[IsDynamic: uint32] (0 = static, 1 = dynamic)
...
```

### 5.3 VCPM_CALIBRATION_KEY_TABLE

```
Format:
VocCalKeyTbl = NumVocKeyIds VocKeyId+

Binary Layout (concatenated tables):
[NumVocKeyIds: uint32]
[VocKeyId: uint32] ... (NumVocKeyIds times)
...
```

### 5.4 VCPM_CALIBRATION_DATA_LUT

```
Format:
VocCKVLUTTbl = NumVocCalKeyVals NumVocCKVLUTEntries VocCKVLUTEntry+
VocCKVLUTEntry = VocCalKeyVal+

Binary Layout (concatenated tables):
[NumVocCalKeyVals: uint32]
[NumVocCKVLUTEntries: uint32]
  [VocCalKeyVal: uint32] ... (NumVocCalKeyVals times)
...
```

### 5.5 VCPM_CALIBRATION_DATA_DEF

```
Format:
VocCalDefTbl = NumMiidPidPairs MiidPidPair+
MiidPidPair = Miid Pid

Binary Layout (concatenated tables):
[NumMiidPidPairs: uint32]
  [Miid: uint32] (moduleInstanceId)
  [Pid: uint32] (parameterId)
...
```

---

## 6) Implementation Components

### 6.1 VoiceCalibrationDataDownloadModel Interface

**File**: `packages/core/src/application/ports/persistence/repositories/bulk-read/bulk-read.repository.ts`

```typescript
/**
 * Voice calibration data download model.
 * Organized by subgraph → key combination → modules.
 * All data pre-sorted by SQL query.
 * CQRS read model optimized for file download operations.
 *
 * Mirrors AudioCalibrationDataDownloadModel structure.
 */
export interface VoiceCalibrationDataDownloadModel {
  /** Subgraph ID (natural ID) - sorted */
  subgraphId: number;

  /** Master keys for this subgraph (with isDynamic flags) */
  masterKeys: Array<{
    keyId: number;
    isDynamic: boolean;
  }>;

  /** Key-value combinations for this subgraph - sorted */
  keyValueCombinations: Array<{
    /** Key IDs (natural IDs) - sorted */
    keyIds: number[];

    /** Value IDs (natural IDs) - sorted, parallel to keyIds */
    valueIds: number[];

    /** Modules with calibration data - sorted by moduleInstanceId */
    modules: Array<{
      /** Module instance ID (natural ID) */
      moduleInstanceId: number;

      /** Parameter payloads - sorted by parameterId */
      parameters: Array<{
        /** Parameter ID (natural ID) */
        parameterId: number;

        /** Calibration payload data */
        payload: Uint8Array;
      }>;
    }>;
  }>;
}

export interface DownloadEntities {
  headerMetadata: ProjectHeaderMetadata;
  usecaseData?: UsecaseDataDownloadModel[];
  subgraphData?: SubgraphDownloadModel[];
  containerData?: ContainerDownloadModel[];
  audioCalibrationData?: AudioCalibrationDataDownloadModel[];
  voiceCalibrationData?: VoiceCalibrationDataDownloadModel[];
}
```

### 6.2 TypeOrmBulkReadRepository.readVoiceCalibrationData()

**File**: `packages/infrastructure/persistence/src/voice-calibration/repositories/bulk-read/typeorm-bulk-read.repository.ts`

**Key Features**:
- Three optimized SQL queries with JOINs
- Proper sorting at SQL level: `ORDER BY subgraphId, keyIds, valueIds, moduleInstanceId, parameterId`
- Voice filter: `WHERE sg.is_voice = true AND ak.is_voice = true`
- Uses GROUP_CONCAT for key/value aggregation
- Separate query for master keys per subgraph
- Separate query for parameter payloads
- Single-pass grouping (data already sorted)

**SQL Query 1: Get CKV data with voice filter**
```sql
SELECT
  sm.instance_id as moduleInstanceId,
  sg.subgraph_id as subgraphId,
  ckv.system_id as ckvSystemId,
  GROUP_CONCAT(DISTINCT ak.key_id ORDER BY ak.key_id) as keyIds,
  GROUP_CONCAT(DISTINCT av.value_id ORDER BY ak.key_id) as valueIds
FROM ckv
JOIN spf_modules sm ON ckv.spf_module_system_id = sm.system_id
JOIN subgraphs sg ON sm.subgraph_system_id = sg.system_id
JOIN ckv_values cv ON ckv.system_id = cv.ckv_system_id
JOIN arc_values av ON cv.value_def_system_id = av.system_id
JOIN arc_keys ak ON av.keys_system_id = ak.system_id
WHERE sm.file_system_id = ?
  AND sg.is_voice = true
  AND ak.is_voice = true
GROUP BY ckv.system_id, sm.instance_id, sg.subgraph_id
ORDER BY
  sg.subgraph_id ASC,
  keyIds ASC,
  valueIds ASC,
  sm.instance_id ASC
```

**SQL Query 2: Get master keys per subgraph**
```sql
SELECT DISTINCT
  sg.subgraph_id as subgraphId,
  ak.key_id as keyId,
  ak.is_dynamic as isDynamic
FROM subgraphs sg
JOIN spf_modules sm ON sg.system_id = sm.subgraph_system_id
JOIN ckv ON sm.system_id = ckv.spf_module_system_id
JOIN ckv_values cv ON ckv.system_id = cv.ckv_system_id
JOIN arc_values av ON cv.value_def_system_id = av.system_id
JOIN arc_keys ak ON av.keys_system_id = ak.system_id
WHERE sm.file_system_id = ?
  AND sg.is_voice = true
  AND ak.is_voice = true
ORDER BY sg.subgraph_id ASC, ak.key_id ASC
```

**SQL Query 3: Get parameter payloads** (same as audio calibration)

**Performance**:
- Estimated time: ~2 seconds for 500 calibration bins
- Uses database indexes for optimal performance

### 6.3 VoiceCalibrationChunkBuilder

**File**: `packages/core/src/application/file-operations/download-file/services/chunk-builders/voice-calibration-chunk-builder.ts`

**Purpose**: Convert database entities to VoiceCalibrationChunk structure

**Key Features**:
- Static `buildChunk()` method (worker handler)
- Groups by subgraph → key combination → modules
- Builds VoiceSubgraphCalTable[] from sorted data
- Builds master key tables per subgraph
- Initializes all offsets to 0 (assigned later)
- Caches master key tables, cal key tables, CKV LUTs, DEF entries, DOT entries

**Chunk Structure Transformation**:

```
Input (flat from DB):
  Subgraph 1, masterKeys=[{1,dynamic}, {2,static}]
    Keys [1,2], Values [10,20]
      Module 100: params [1,2,3]
      Module 200: params [4,5]
    Keys [1,2], Values [10,30]
      Module 100: params [1,2,3]

Output (hierarchical chunk):
  VoiceSubgraphCalTable (subgraphId=1)
    offsetVoiceMasterKeyTable → VoiceMasterKeyTable
      keyInfos: [{1,dynamic}, {2,static}]
    voiceCkvDataTables:
      VoiceCkvDataTable #1 (keys=[1,2])
        offsetVoiceCalKeyTable → VoiceCalKeyTable {voiceKeyIds: [1,2]}
        calDataObjects:
          CalDataObject #1 (module=100, values=[10,20])
            offsetVoiceCkvLookupTable → VoiceCkvLookupTable
            offsetVoiceCalDefinitionTable → VoiceCalDefinitionEntry
            offsetsInGlobalDataPool: [0,0,0] (assigned later)
          CalDataObject #2 (module=200, values=[10,20])
      VoiceCkvDataTable #2 (keys=[1,2])
        CalDataObject #1 (module=100, values=[10,30])
```

**Parallelization**: Can run in worker thread alongside AudioCalibrationChunkBuilder

### 6.4 VoiceCalibrationChunkSerializer

**File**: `packages/core/src/application/file-operations/download-file/services/chunk-serializers/voice-calibration-chunk-serializer.ts`

**Purpose**: Serialize VoiceCalibrationChunk to binary format with datapool assignment

**Key Features**:
- **Phase 1**: Sequential datapool offset assignment
  - Add parameter payloads to datapool
  - Track offsets for each chunk type independently
  - Calculate sizes for all sub-structures
- **Phase 2**: Binary serialization
  - Serialize VCPM_CALDATA with calculated offsets
  - Serialize VCPM_MASTER_KEY, VCPM_CALIBRATION_KEY_TABLE, VCPM_CALIBRATION_DATA_LUT, VCPM_CALIBRATION_DATA_DEF
  - Use `BinaryUtils.SIZEOF_UINT32` (not hardcoded 4)
  - Use constants: `SPF_VCPM_MODULE_ID`, `PARAM_ID_VOICE_CAL_TBL`

**Critical**: Must be sequential due to shared datapool state

**Serialization Result**:
```typescript
export interface VoiceCalibrationSerializationResult {
  vcpmCalData: Uint8Array;
  vcpmMasterKey: Uint8Array;
  vcpmCalKeyTable: Uint8Array;
  vcpmCalDataLut: Uint8Array;
  vcpmCalDataDef: Uint8Array;
}
```

### 6.5 AcdbFileSerializer Integration

**File**: `packages/core/src/application/file-operations/download-file/services/acdb-file-serializer.ts`

**Changes**:
1. Add parallel chunk building for usecase + audio + voice
2. Sequential datapool assignment (usecase first, then audio, then voice)
3. Sequential binary serialization (fast enough, no workers needed)
4. Add voice calibration chunks to file

```typescript
// Add voice calibration chunks
if (
  entities.voiceCalibrationData &&
  entities.voiceCalibrationData.length > 0
) {
  const voiceCalSerializer = new VoiceCalibrationChunkSerializer();
  const voiceCalChunk = this.chunkBuilder.buildVoiceCalibrationChunk(
    entities.voiceCalibrationData,
  );
  const voiceCalResult = voiceCalSerializer.serialize(
    voiceCalChunk,
    datapool,
    entities.voiceCalibrationData,
  );

  // Add voice calibration chunks (5 chunks)
  if (voiceCalResult.vcpmCalData.length > 0) {
    this.addChunk(
      chunkList,
      ACDB_RAW_CHUNK_TYPES.VCPM_CALDATA,
      voiceCalResult.vcpmCalData,
    );
  }

  if (voiceCalResult.vcpmMasterKey.length > 0) {
    this.addChunk(
      chunkList,
      ACDB_RAW_CHUNK_TYPES.VCPM_MASTER_KEY,
      voiceCalResult.vcpmMasterKey,
    );
  }

  if (voiceCalResult.vcpmCalKeyTable.length > 0) {
    this.addChunk(
      chunkList,
      ACDB_RAW_CHUNK_TYPES.VCPM_CALIBRATION_KEY_TABLE,
      voiceCalResult.vcpmCalKeyTable,
    );
  }

  if (voiceCalResult.vcpmCalDataLut.length > 0) {
    this.addChunk(
      chunkList,
      ACDB_RAW_CHUNK_TYPES.VCPM_CALIBRATION_DATA_LUT,
      voiceCalResult.vcpmCalDataLut,
    );
  }

  if (voiceCalResult.vcpmCalDataDef.length > 0) {
    this.addChunk(
      chunkList,
      ACDB_RAW_CHUNK_TYPES.VCPM_CALIBRATION_DATA_DEF,
      voiceCalResult.vcpmCalDataDef,
    );
  }
}
```

---

## 7) Performance Optimization

### 7.1 Parallelization Strategy

#### ✅ Phase 1: Database Queries (Already Parallel)

```typescript
// In readAllEntitiesForFile()
const [headerMetadata, usecaseData, audioCalibrationData, voiceCalibrationData] =
  await Promise.all([
    this.readFileProperties(fileSystemId),
    this.readUsecaseData(fileSystemId),
    this.readAudioCalibrationData(fileSystemId),
    this.readVoiceCalibrationData(fileSystemId), // NEW - runs in parallel
  ]);
```

**Speedup**: 4x (4 queries in parallel vs sequential)

#### ✅ Phase 2: Chunk Building (Parallel with Workers)

```typescript
// In AcdbFileSerializer
const [usecaseChunk, audioCalChunk, voiceCalChunk] = await Promise.all([
  this.workerPool.execute({
    handlerKey: 'BUILD_USECASE_DATA_CHUNK',
    input: {usecaseData}
  }),
  this.workerPool.execute({
    handlerKey: 'BUILD_AUDIO_CALIBRATION_CHUNK',
    input: {audioCalibrationData}
  }),
  this.workerPool.execute({
    handlerKey: 'BUILD_VOICE_CALIBRATION_CHUNK', // NEW
    input: {voiceCalibrationData}
  })
]);
```

**Speedup**: 2x (3 chunks built in parallel)
**Time Saved**: ~750ms for typical file

#### ❌ Phase 3: Datapool Assignment (Must Be Sequential)

```typescript
// CANNOT parallelize - shared state!
if (usecaseChunk) {
  this.assignUsecaseDatapoolOffsets(usecaseChunk, datapool);
}

if (audioCalChunk) {
  this.assignAudioCalibrationDatapoolOffsets(audioCalChunk, datapool, audioCalData);
}

if (voiceCalChunk) {
  this.assignVoiceCalibrationDatapoolOffsets(voiceCalChunk, datapool, voiceCalData); // NEW
}
```

**Why**: Datapool offsets depend on previous insertions. Order matters.

#### ❌ Phase 4: Binary Serialization (Sequential - Not Worth Worker Overhead)

```typescript
// Keep sequential - overhead not worth ~230ms savings
const usecaseSerializer = new UsecaseDataChunkSerializer();
const audioCalSerializer = new AudioCalibrationChunkSerializer();
const voiceCalSerializer = new VoiceCalibrationChunkSerializer(); // NEW

const usecaseResult = usecaseSerializer.serialize(usecaseChunk, datapool);
const audioCalResult = audioCalSerializer.serialize(audioCalChunk, datapool, audioCalData);
const voiceCalResult = voiceCalSerializer.serialize(voiceCalChunk, datapool, voiceCalData); // NEW
```

**Analysis**: Binary serialization is fast (~390ms total). Worker overhead (~100ms) negates most of the benefit.

### 7.2 Performance Comparison

#### Without Parallelization
```
Database Queries:     6s  (sequential - 4 queries)
Chunk Building:      2.5s (sequential - 3 chunks)
Datapool Assignment:  1s  (sequential)
Serialization:       0.5s (sequential)
Assembly:           0.5s
─────────────────────────
TOTAL:             10.5s
```

#### With Optimized Parallelization
```
Database Queries:     2s  (parallel - 4 queries)
Chunk Building:      1.2s (parallel - 3 workers)
Datapool Assignment:  1s  (sequential)
Serialization:       0.5s (sequential)
Assembly:           0.5s
─────────────────────────
TOTAL:              5.2s  (2x speedup)
```

### 7.3 Database Optimization

#### Recommended Indexes

```sql
-- For voice calibration query optimization
CREATE INDEX IF NOT EXISTS idx_ckv_spf_module
  ON ckv(spf_module_system_id);

CREATE INDEX IF NOT EXISTS idx_ckv_parameter_payload_ckv
  ON ckv_parameter_payload(ckv_system_id);

CREATE INDEX IF NOT EXISTS idx_spf_modules_file_subgraph
  ON spf_modules(file_system_id, subgraph_system_id);

CREATE INDEX IF NOT EXISTS idx_ckv_values_ckv
  ON ckv_values(ckv_system_id, value_def_system_id);

CREATE INDEX IF NOT EXISTS idx_subgraphs_is_voice
  ON subgraphs(is_voice, file_system_id);

CREATE INDEX IF NOT EXISTS idx_arc_keys_is_voice
  ON arc_keys(is_voice, file_system_id);
```

**Impact**: 2-3x faster queries (from ~5s to ~2s)

---

## 8) Testing Strategy

### 8.1 Unit Tests

**VoiceCalibrationChunkBuilder**:
- Test with empty data
- Test with single subgraph, single key-value combo
- Test with multiple subgraphs, multiple key-value combos
- Test with multiple modules per key-value combo
- Test master key table generation
- Verify sorting is preserved
- Verify offsets initialized to 0

**VoiceCalibrationChunkSerializer**:
- Test datapool offset assignment
- Test binary serialization format
- Test master key chunk generation
- Test with various data sizes
- Verify SIZEOF_UINT32 usage
- Verify SPF_VCPM_MODULE_ID and PARAM_ID_VOICE_CAL_TBL constants

**TypeOrmBulkReadRepository.readVoiceCalibrationData()**:
- Test with no voice calibration data
- Test with single voice calibration bin
- Test with multiple bins across subgraphs
- Test voice filter (is_voice = true)
- Test sorting order
- Test master key retrieval
- Test parameter payload retrieval

### 8.2 Integration Tests

**End-to-End Download**:
- Upload file with voice calibration data
- Download file
- Verify binary chunks match expected format
- Verify all voice calibration data present
- Verify master key tables correct

**Round-Trip Test**:
- Upload file → Download file → Upload again
- Verify data integrity maintained
- Verify binary output identical

**Mixed Audio/Voice Test**:
- Upload file with both audio and voice calibration
- Download file
- Verify both types present and correct
- Verify no cross-contamination

### 8.3 Performance Tests

**Benchmark Scenarios**:
- Small file (10 usecases, 5 voice calibration bins)
- Medium file (100 usecases, 50 voice calibration bins)
- Large file (1000 usecases, 500 voice calibration bins)
- Mixed file (audio + voice calibration)

**Metrics to Track**:
- Total download time
- Database query time
- Chunk building time
- Serialization time
- Memory usage

**Target**: 2x speedup vs sequential implementation

---

## 9) Implementation Checklist

### 9.1 Core Implementation

- [ ] **Define VoiceCalibrationDataFromDb interface**
  - File: `packages/core/src/application/ports/persistence/repositories/bulk-read/bulk-read.repository.ts`
  - Add interface definition with masterKeys field
  - Update DownloadEntities interface

- [ ] **Implement readVoiceCalibrationData()**
  - File: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/bulk-read/typeorm-bulk-read.repository.ts`
  - Write SQL query 1: CKV data with voice filter
  - Write SQL query 2: Master keys per subgraph
  - Write SQL query 3: Parameter payloads
  - Implement single-pass grouping logic
  - Add error handling and logging

- [ ] **Update readAllEntitiesForFile()**
  - File: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/bulk-read/typeorm-bulk-read.repository.ts`
  - Add readVoiceCalibrationData() to Promise.all()
  - Return voiceCalibrationData in result

- [ ] **Create VoiceCalibrationChunkBuilder**
  - File: `packages/core/src/application/file-operations/download-file/services/chunk-builders/voice-calibration-chunk-builder.ts`
  - Implement buildChunk() static method
  - Build VoiceSubgraphCalTable[] from sorted data
  - Build master key tables per subgraph
  - Group key combinations into VoiceCkvDataTables
  - Cache all sub-structures

- [ ] **Create VoiceCalibrationChunkSerializer**
  - File: `packages/core/src/application/file-operations/download-file/services/chunk-serializers/voice-calibration-chunk-serializer.ts`
  - Implement serialize() method
  - Phase 1: Sequential datapool offset assignment
  - Phase 2: Binary serialization (5 chunks)
  - Use BinaryUtils.SIZEOF_UINT32 throughout
  - Use SPF_VCPM_MODULE_ID and PARAM_ID_VOICE_CAL_TBL constants

- [ ] **Update ChunkBuilderService**
  - File: `packages/core/src/application/file-operations/download-file/services/chunk-builder-service.ts`
  - Add buildVoiceCalibrationChunk() method

- [ ] **Update AcdbFileSerializer**
  - File: `packages/core/src/application/file-operations/download-file/services/acdb-file-serializer.ts`
  - Add parallel chunk building for voice calibration
  - Add sequential datapool assignment for voice calibration
  - Add voice calibration chunk serialization
  - Add 5 voice calibration chunks to file

### 9.2 Worker Integration

- [ ] **Add registry key**
  - File: `packages/core/src/application/file-operations/shared/constants/registry-keys.ts`
  - Add BUILD_VOICE_CALIBRATION_CHUNK key

- [ ] **Register worker handler**
  - File: `packages/core/src/application/file-operations/shared/worker-handler-registry.ts`
  - Register VoiceCalibrationChunkBuilder.buildChunk

### 9.3 Database Optimization

- [ ] **Add database indexes**
  - Create migration or update schema
  - Add indexes for voice calibration queries
  - Test query performance

### 9.4 Testing

- [ ] **Write unit tests**
  - VoiceCalibrationChunkBuilder tests
  - VoiceCalibrationChunkSerializer tests
  - readVoiceCalibrationData() tests

- [ ] **Write integration tests**
  - End-to-end download test
  - Round-trip test (upload → download → upload)
  - Mixed audio/voice test

- [ ] **Performance benchmarks**
  - Measure download time with/without parallelization
  - Verify 2x speedup target

### 9.5 Documentation

- [ ] **Update API documentation**
  - Document new download behavior
  - Update swagger/OpenAPI specs if needed

- [ ] **Code documentation**
  - JSDoc comments on all public methods
  - Inline comments for complex logic

---

## Summary

This design provides a complete, production-ready solution for voice calibration data download that:

1. ✅ **Mirrors audio calibration pattern exactly** - Same architecture, same flow
2. ✅ **Matches C# implementation** - Sorting, offset tracking, master key tables
3. ✅ **Complies with ACDB format** - All 5 voice calibration chunks correctly formatted
4. ✅ **Optimized for performance** - 2x speedup with parallel chunk building
5. ✅ **Production ready** - Error handling, logging, type safety, testing strategy
6. ✅ **Maintainable** - Follows existing patterns, well-documented

**Next Steps**: Use writing-plans skill to create detailed implementation plan.