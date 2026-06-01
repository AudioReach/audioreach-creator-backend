<!--
Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
SPDX-License-Identifier: BSD-3-Clause
-->

# GSL Calibration Data (Driver Data) Upload Design

## Document Information
- **Version**: 1.0
- **Date**: May 31, 2026
- **Last Updated**: May 31, 2026

---

## Table of Contents
1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Component Design](#3-component-design)
4. [Integration](#4-integration)
5. [Error Handling](#5-error-handling)
6. [Testing Strategy](#6-testing-strategy)
7. [Implementation Checklist](#7-implementation-checklist)
8. [References](#8-references)

---

## 1) Overview

### 1.1 Purpose

This design extends the file upload workflow to support parsing and persisting **GSL Calibration Data** (driver data) from ACDB files. GSL calibration data contains key-value pairs for driver modules, similar to how audio calibration data (CKV) works for SPF modules.

### 1.2 Scope

**In Scope**:
- Parse GSL calibration chunks from ACDB files (GCLU, GCKT, GCDT, GCDE, GCDO)
- Build and insert driver module definitions from AWSP files
- Build and insert driver module instances with DKV (Driver Key-Value) calibration data
- Integrate into existing upload workflow following established patterns

**Out of Scope**:
- Modifications to existing audio calibration (CKV) logic
- Changes to SPF module processing
- UI changes for displaying driver module data

### 1.3 Key Characteristics

- **Pattern Consistency**: Follows the exact same pattern as SPF modules and audio calibration
- **Hierarchical Processing**: Driver modules processed after their definitions
- **Continue-on-Error**: Collects errors during building and insertion, allows partial success
- **KeyVector Deduplication**: Reuses existing KeyVector deduplication logic for DKV data
- **One-to-One Relationship**: Driver modules have a one-to-one relationship with their definitions (no separate instance IDs)

---

## 2) Architecture

### 2.1 High-Level Flow

```
ACDB File Upload
    ↓
Parse ACDB Chunks
    ├─> Audio Calibration (existing - CKV for SPF modules)
    └─> GSL Calibration (NEW - DKV for driver modules)
    ↓
Parse AWSP Definitions
    ├─> SPF Module Definitions (existing)
    └─> Driver Module Definitions (NEW)
    ↓
Build & Insert Entities (Hierarchical Order)
    1. Key Definitions
    2. SPF Module Definitions
    3. Driver Module Definitions ← NEW
    4. Subgraphs
    5. Containers
    6. SPF Modules (with CKV data)
    7. Driver Modules (with DKV data) ← NEW
    8. Data Links
    9. Usecases
```

### 2.2 Component Diagram

```
┌─────────────────────────────────────────────────────────┐
│           UploadFileOrchestrator                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Parse Phase                                      │  │
│  │  • AcdbFileOrchestrator                          │  │
│  │    - AudioCalibrationChunkParser (existing)      │  │
│  │    - DriverCalibrationChunkParser (NEW)          │  │
│  │  • AwspFileOrchestrator                          │  │
│  │    - Driver Module Definitions (already parsed)  │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Build Phase                                      │  │
│  │  • EntityBuilderService                          │  │
│  │    - DriverModuleDefinitionBuilder (NEW)         │  │
│  │    - DriverModuleBuilder (NEW)                   │  │
│  │  • DriverCalibrationDataBuilder (NEW)            │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Insert Phase                                     │  │
│  │  • BulkImportRepository                          │  │
│  │    - DriverModuleDefinitionInserter (NEW)        │  │
│  │    - DriverModuleInserter (NEW)                  │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 2.3 Data Flow

```
ACDB File
    ↓
[DriverCalibrationChunkParser]
    ↓
DriverCalibrationChunk {
  moduleLookupEntries: [
    {
      moduleDefinitionId: 123,
      calKeyTableEntries: [...]
    }
  ]
}
    ↓
[DriverModuleBuilder]
    ↓
DriverModule[] (with natural keys)
    ↓
[DriverCalibrationDataBuilder]
    ↓
DkvData[] (grouped by module systemId)
    ↓
[DriverModuleInserter]
    ↓
Database (driver_modules, dkv, dkv_values, dkv_parameter_payload)
```

### 2.4 Comparison: SPF Modules vs Driver Modules

| Aspect | SPF Modules | Driver Modules |
|--------|-------------|----------------|
| **Definition Source** | AWSP file | AWSP file |
| **Instance Source** | ACDB file | ACDB file |
| **Natural Key** | `moduleId` (def) + `instanceId` (instance) | `moduleDefinitionId` only |
| **Relationship** | One-to-many (multiple instances per definition) | One-to-one (single instance per definition) |
| **Calibration Data** | CKV (Calibration Key-Value) | DKV (Driver Key-Value) |
| **Calibration Chunks** | CALIBRATION_SUBGRAPH_LUT, etc. | DRIVER_CALIBRATION_LUT, etc. |
| **Association** | Associated with subgraphs | Associated with module definitions |
| **Database Tables** | `spf_modules`, `ckv`, `ckv_values` | `driver_modules`, `dkv`, `dkv_values` |

---

## 3) Component Design

### 3.1 DriverCalibrationChunkParser

**Location**: `packages/core/src/application/file-operations/upload-file/services/acdb-chunk-parsers/driver-calibration-chunk-parser.ts`

**Purpose**: Parse driver calibration chunks from ACDB file

#### 3.1.1 Chunk IDs

Chunk IDs are derived from ASCII strings using `BitConverter.ToUInt32()`:

```typescript
// In chunk-types.ts
export const ACDB_RAW_CHUNK_TYPES = {
  // ... existing chunks
  DRIVER_CALIBRATION_LUT: 0x554C4347,        // "GCLU"
  DRIVER_CALIBRATION_KEY_TABLE: 0x544B4347,  // "GCKT"
  DRIVER_CALIBRATION_DATA_TABLE: 0x54444347, // "GCDT"
  DRIVER_CALIBRATION_DATA_DEF: 0x45444347,   // "GCDE"
  DRIVER_CALIBRATION_DATA_DOT: 0x4F444347,   // "GCDO"
};

export const PARSED_CHUNK_TYPES = {
  // ... existing chunks
  DRIVER_CALIBRATION_DATA: 'DRIVER_CALIBRATION_DATA',
};
```

#### 3.1.2 ABNF Format

Based on the provided specification:

```abnf
; GSL Cal Data
GSLCalLUTChunk = GSLCalUTChunkId GSLCalLUTChunkSize GSLCalLUTChunkPayload
GSLCalLUTChunkPayload = NumMIDs GSLCalLUTEntry+
GSLCalLUTEntry = MId OffsetCalKeyTbl OffsetGSLKVLUTTbl

GSLCalKeyTBLChunk = GSLCalKeyTblChunkId GSLCalKeyTblChunkSize GSLCalKeyTblChunkPayload
GSLCalKeyTblChunkPayload = GSLCalKeyTbl+
GSLCalKeyTbl = NumKeyIds KeyId+

GSLCalDataLUTChunk = GSLCalDataLUTChunkId GSLCalDataLUTChunkSize GSLCalDataLUTChunkPayload
GSLCalDataLUTChunkPayload = GSLKVLUTTbl+
GSLKVLUTTbl = NumCalKeyVals NumKVLUTEntries KVLUTEntry+
KVLUTEntry = CalKeyVal+ OffsetCalDEF OffsetCalDOT

GSLCalDEFChunk = GSLCalDEFChunkId GSLCalDEFChunkSize GSLCalDEFChunkPayload
GSLCalDEFChunkPayload = GSLCalDEFEntry+
GSLCalDEFEntry = NumPids pId+

GSLCalDOTChunk = GSLCalDOTChunkId GSLCalDOTChunkSize GSLCalDOTChunkPayload
GSLCalDOTChunkPayload = GSLCalDOTEntry+
GSLCalDOTEntry = NumCalDataOffsets GSLCalDataOffset+
```

#### 3.1.3 Output Structure

```typescript
class DriverCalibrationChunk {
  moduleLookupEntries: ModuleLookupEntry[] = [];

  // Cached lookup tables (same structure as audio calibration)
  private calKeyTableCache = new Map<number, number[]>();
  private ckvLookupTableCache = new Map<number, CkvLookupTable>();
  private calDefinitionEntryCache = new Map<number, CalDefinitionEntry>();
  private calDataOffsetEntryCache = new Map<number, CalDataOffsetEntry>();

  // Cache accessors
  getCalKeyTable(offset: number): number[] | undefined;
  setCalKeyTable(offset: number, keyIds: number[]): void;
  getCkvLookupTable(offset: number): CkvLookupTable | undefined;
  setCkvLookupTable(offset: number, table: CkvLookupTable): void;
  getCalDefinitionEntry(offset: number): CalDefinitionEntry | undefined;
  setCalDefinitionEntry(offset: number, entry: CalDefinitionEntry): void;
  getCalDataOffsetEntry(offset: number): CalDataOffsetEntry | undefined;
  setCalDataOffsetEntry(offset: number, entry: CalDataOffsetEntry): void;
}

interface ModuleLookupEntry {
  moduleDefinitionId: number;  // MId from ABNF
  calKeyTableEntries: CalKeyTableEntry[];
}

interface CalKeyTableEntry {
  offsetCalKeyTable: number;
  offsetCalLookupTable: number;
}

interface CkvLookupTable {
  numCalKeyValues: number;
  ckvLookupEntries: CkvLookupEntry[];
}

interface CkvLookupEntry {
  calKeyValues: number[];
  offsetCalDefinition: number;
  offsetCalDataOffset: number;
  offsetDOT2: number;
}

interface CalDefinitionEntry {
  calIdEntries: Array<{
    moduleInstanceId: number;  // Note: For driver modules, this is moduleDefinitionId
    paramId: number;
  }>;
}

interface CalDataOffsetEntry {
  calDataOffsets: number[];
}
```

#### 3.1.4 Implementation Strategy

**Pattern**: Copy `AudioCalibrationChunkParser` and adapt:

1. **Replace chunk type constants**:
   - `CALIBRATION_SUBGRAPH_LUT` → `DRIVER_CALIBRATION_LUT`
   - `CALIBRATION_KEY_TABLE` → `DRIVER_CALIBRATION_KEY_TABLE`
   - `CALIBRATION_DATA_LUT` → `DRIVER_CALIBRATION_DATA_TABLE`
   - `CALIBRATION_DATA_DEF` → `DRIVER_CALIBRATION_DATA_DEF`
   - `CALIBRATION_DATA_DOT` → `DRIVER_CALIBRATION_DATA_DOT`

2. **Replace terminology**:
   - "subgraph" → "module"
   - `SGId` → `MId` (module definition ID)
   - `SubgraphLookupEntry` → `ModuleLookupEntry`

3. **Keep identical**:
   - Parsing logic for key tables, CKV lookup tables, DEF entries, DOT entries
   - Caching mechanism
   - Error handling

#### 3.1.5 Key Methods

```typescript
class DriverCalibrationChunkParser extends BaseChunkParser<DriverCalibrationChunk> {
  readonly chunkType = PARSED_CHUNK_TYPES.DRIVER_CALIBRATION_DATA;

  parse(context: ChunkParseContext): DriverCalibrationChunk;

  private parseModuleLookupEntry(
    lutView: DataView,
    offset: number,
    chunk: DriverCalibrationChunk,
    keyTableData: Uint8Array,
    dataLutData: Uint8Array,
    dataDefData: Uint8Array,
    dataDotData: Uint8Array
  ): {entry: ModuleLookupEntry; newOffset: number};

  private parseCalKeyTableEntry(...): {entry: CalKeyTableEntry; newOffset: number};
  private extractCalKeyTable(...): number[];
  private extractCkvLookupTable(...): CkvLookupTable;
  private extractCalDefinitionEntry(...): CalDefinitionEntry;
  private extractCalDataOffsetEntry(...): CalDataOffsetEntry;
}
```

---

### 3.2 DriverModuleDefinitionBuilder

**Location**: `packages/core/src/application/file-operations/upload-file/services/entity-builders/driver-module-definition-builder.ts`

**Purpose**: Build `DriverModuleDefinition` domain entities from parsed AWSP data

#### 3.2.1 Input/Output

**Input**:
- `ParsedAwsp.getDriverModuleDefinitions()` - Already parsed by AWSP parser
- `fileId` - File system ID for association

**Output**:
```typescript
BuildResult<DriverModuleDefinition> {
  entities: DriverModuleDefinition[];
  issues: EntityBuildIssue[];
  successCount: number;
  errorCount: number;
  warningCount: number;
}
```

#### 3.2.2 Entity Structure

```typescript
class DriverModuleDefinition {
  systemId: number;  // Database-assigned, 0 during build
  moduleDefinitionId: number;  // Natural key from AWSP
  name: string;
  description?: string;
  groupName?: string;
  fileSystemId: number;
  parameters: DriverModuleParameterDefinition[];  // Child entities
}

class DriverModuleParameterDefinition {
  systemId: number;  // Database-assigned, 0 during build
  parameterId: number;  // Natural key
  name?: string;
  description?: string;
  maxSize: number;
  paramStructure: string;  // JSON string
  defaultData: Buffer;
  driverModuleDefinitionSystemId: number;  // FK (0 during build, assigned after parent insert)
}
```

#### 3.2.3 Build Logic

```typescript
class DriverModuleDefinitionBuilder {
  constructor(
    private readonly foreignKeyMapper: ForeignKeyMapper,
    private readonly logger?: Logger
  ) {}

  async buildDriverModuleDefinitions(
    parsedAwsp: ParsedAwsp,
    fileId: number
  ): Promise<BuildResult<DriverModuleDefinition>> {
    const entities: DriverModuleDefinition[] = [];
    const issues: EntityBuildIssue[] = [];

    const awspDefinitions = parsedAwsp.getDriverModuleDefinitions();

    if (!awspDefinitions || awspDefinitions.length === 0) {
      return {
        entities: [],
        issues: [],
        successCount: 0,
        errorCount: 0,
        warningCount: 0
      };
    }

    for (const awspDef of awspDefinitions) {
      try {
        // Build driver module definition
        const definition = new DriverModuleDefinition(
          0,  // systemId assigned later
          awspDef.id,  // moduleDefinitionId (natural key)
          awspDef.name,
          awspDef.description,
          awspDef.groupName,
          fileId,
          []  // parameters built below
        );

        // Build parameter definitions
        if (awspDef.paramDefinitions) {
          for (const awspParam of awspDef.paramDefinitions) {
            const param = new DriverModuleParameterDefinition(
              0,  // systemId assigned later
              awspParam.id,  // parameterId (natural key)
              awspParam.name,
              awspParam.description,
              awspParam.maxSize,
              JSON.stringify(awspParam.paramStructure),
              Buffer.from(awspParam.defaultData),
              0  // driverModuleDefinitionSystemId assigned after parent insert
            );
            definition.parameters.push(param);
          }
        }

        entities.push(definition);
      } catch (error) {
        issues.push({
          severity: 'error',
          code: 'DRIVER_MODULE_DEF_BUILD_FAILED',
          message: `Failed to build driver module definition ${awspDef.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          entityType: 'DriverModuleDefinition',
          entityIdentifier: awspDef.id.toString(),
          phase: 'building'
        });
      }
    }

    return {
      entities,
      issues,
      successCount: entities.length,
      errorCount: issues.filter(i => i.severity === 'error').length,
      warningCount: issues.filter(i => i.severity === 'warning').length
    };
  }
}
```

---

### 3.3 DriverModuleDefinitionInserter

**Location**: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/bulk-import/driver-module-definition/driver-module-definition.inserter.ts`

**Purpose**: Insert driver module definitions and their parameter definitions into the database

#### 3.3.1 Insert Order (FK-safe, leaf-first)

1. **Driver Module Definitions** → `driver_module_definitions` table
2. **Driver Module Parameter Definitions** → `driver_module_parameter_definitions` table (children)

#### 3.3.2 Implementation

```typescript
export class DriverModuleDefinitionInserter implements BulkInserter<DriverModuleDefinition> {
  private readonly manager: EntityManager;

  constructor(manager: EntityManager) {
    this.manager = manager;
  }

  async insert(definitions: DriverModuleDefinition[]): Promise<BulkInsertResult> {
    if (definitions.length === 0) return okBulkInsert();

    const definitionBySystemId = new Map(
      definitions.map(d => [d.systemId, d])
    );

    // Collect all raw failures from all insert steps
    const rawFailures: RawFailure[] = [
      ...(await this.insertDriverModuleDefinitions(definitions)),
      ...(await this.insertDriverModuleParameterDefinitions(definitions))
    ];

    if (rawFailures.length === 0) return okBulkInsert();

    // Group raw failures by driver module definition systemId
    const grouped = new Map<number, string[]>();
    for (const f of rawFailures) {
      if (!grouped.has(f.systemId)) grouped.set(f.systemId, []);
      grouped.get(f.systemId)!.push(
        `${f.entityLabel}: Failed to insert\n${f.failedRowJson}\nerror: ${f.dbError}`
      );
    }

    // Build one BulkInsertError per failing definition
    const errors: BulkInsertError[] = [...grouped.entries()].map(
      ([systemId, lines]) => {
        const definition = definitionBySystemId.get(systemId)!;
        return {
          message: `Failed to insert some or all data belonging to Driver Module Definition {moduleDefId=${definition.moduleDefinitionId}, systemId=${definition.systemId}}`,
          details: lines.join('\n')
        };
      }
    );

    return errBulkInsert(errors);
  }

  private async insertDriverModuleDefinitions(
    definitions: DriverModuleDefinition[]
  ): Promise<RawFailure[]> {
    const rows: InsertRow<DriverModuleDefinitionRow>[] = definitions.map(d => ({
      systemId: d.systemId,
      moduleDefinitionId: d.moduleDefinitionId,
      name: d.name,
      description: d.description,
      groupName: d.groupName,
      fileSystemId: d.fileSystemId
    }));

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      DriverModuleDefinitionSchema,
      rows
    );

    return failedEntities.map(error => {
      const definition = definitions.find(d => d.systemId === error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: definition.systemId,
        entityLabel: 'DriverModuleDefinition',
        failedRowJson: JSON.stringify(failedRow, null, 2),
        dbError: error.message
      };
    });
  }

  private async insertDriverModuleParameterDefinitions(
    definitions: DriverModuleDefinition[]
  ): Promise<RawFailure[]> {
    const allParams = definitions.flatMap(d =>
      d.parameters.map(p => ({param: p, parentSystemId: d.systemId}))
    );

    if (allParams.length === 0) return [];

    const rows: InsertRow<DriverModuleParameterDefinitionRow>[] = allParams.map(
      ({param, parentSystemId}) => ({
        systemId: param.systemId,
        parameterId: param.parameterId,
        name: param.name,
        description: param.description,
        maxSize: param.maxSize,
        paramStructure: param.paramStructure,
        defaultData: param.defaultData,
        driverModuleDefinitionSystemId: parentSystemId
      })
    );

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      DriverModuleParameterDefinitionSchema,
      rows
    );

    return failedEntities.map(error => {
      const {param, parentSystemId} = allParams.find(
        ap => ap.param.systemId === error.systemId
      )!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: parentSystemId,  // Group by parent definition
        entityLabel: 'DriverModuleParameterDefinition',
        failedRowJson: JSON.stringify(failedRow, null, 2),
        dbError: error.message
      };
    });
  }
}
```

---

### 3.4 DriverModuleBuilder

**Location**: `packages/core/src/application/file-operations/upload-file/services/entity-builders/driver-module-builder.ts`

**Purpose**: Build `DriverModule` domain entities from parsed ACDB GSL calibration data

#### 3.4.1 Input/Output

**Input**:
- `ParsedAcdb` - Contains `GslCalibrationChunk`
- `ParsedAwsp` - For definition lookups
- `ForeignKeyMapper` - For resolving definition systemIds
- `fileId` - File system ID

**Output**:
```typescript
BuildResult<DriverModule> {
  entities: DriverModule[];
  issues: EntityBuildIssue[];
  successCount: number;
  errorCount: number;
  warningCount: number;
}
```

#### 3.4.2 Entity Structure

```typescript
class DriverModule {
  systemId: number;  // Database-assigned, 0 during build
  definitionSystemId: number;  // FK to DriverModuleDefinition
  dkvData: DkvData[];  // Calibration data (attached later)
}
```

**Key Point**: Driver modules use `moduleDefinitionId` as their natural key. Unlike SPF modules which have separate `moduleId` (definition) and `instanceId` (instance), driver modules have a one-to-one relationship with their definitions.

#### 3.4.3 Build Process

```typescript
class DriverModuleBuilder {
  constructor(
    private readonly foreignKeyMapper: ForeignKeyMapper,
    private readonly idGenerator: IdGenerationPort,
    private readonly logger?: Logger
  ) {}

  async buildDriverModules(
    parsedAcdb: ParsedAcdb,
    fileId: number,
    parsedAwsp: ParsedAwsp
  ): Promise<BuildResult<DriverModule>> {
    const entities: DriverModule[] = [];
    const issues: EntityBuildIssue[] = [];

    // Get driver calibration chunk
    const driverCalChunk = parsedAcdb.getChunk<DriverCalibrationChunk>(
      PARSED_CHUNK_TYPES.DRIVER_CALIBRATION_DATA
    );

    if (!driverCalChunk || driverCalChunk.moduleLookupEntries.length === 0) {
      this.logger?.logInfo({
        msg: 'No driver calibration data found in ACDB',
        action: 'build_driver_modules_skip',
        component: 'DriverModuleBuilder',
        timestamp: new Date()
      });
      return {
        entities: [],
        issues: [],
        successCount: 0,
        errorCount: 0,
        warningCount: 0
      };
    }

    // Build driver modules
    for (const moduleLookupEntry of driverCalChunk.moduleLookupEntries) {
      try {
        const moduleDefinitionId = moduleLookupEntry.moduleDefinitionId;

        // Resolve definition systemId
        const definitionSystemId = this.foreignKeyMapper
          .getDriverModuleDefinitionSystemId(moduleDefinitionId);

        if (!definitionSystemId) {
          issues.push({
            severity: 'error',
            code: 'DRIVER_MODULE_DEF_NOT_FOUND',
            message: `Driver module definition ${moduleDefinitionId} not found`,
            entityType: 'DriverModule',
            entityIdentifier: moduleDefinitionId.toString(),
            phase: 'building'
          });
          continue;
        }

        // Create driver module
        const driverModule = new DriverModule(
          0,  // systemId assigned later
          definitionSystemId
        );

        entities.push(driverModule);
      } catch (error) {
        issues.push({
          severity: 'error',
          code: 'DRIVER_MODULE_BUILD_FAILED',
          message: `Failed to build driver module: ${error instanceof Error ? error.message : 'Unknown error'}`,
          entityType: 'DriverModule',
          entityIdentifier: moduleLookupEntry.moduleDefinitionId.toString(),
          phase: 'building'
        });
      }
    }

    // Attach DKV calibration data
    if (entities.length > 0) {
      await this.attachDkvCalibrationData(entities, parsedAcdb, fileId);
    }

    return {
      entities,
      issues,
      successCount: entities.length,
      errorCount: issues.filter(i => i.severity === 'error').length,
      warningCount: issues.filter(i => i.severity === 'warning').length
    };
  }

  private async attachDkvCalibrationData(
    driverModules: DriverModule[],
    parsedAcdb: ParsedAcdb,
    fileId: number
  ): Promise<void> {
    const calibrationBuilder = new DriverCalibrationDataBuilder(
      this.idGenerator,
      this.foreignKeyMapper,
      this.logger
    );

    try {
      // Build DKV data grouped by module systemId
      const dkvByModule = await calibrationBuilder.buildDkvDataByModule(
        parsedAcdb,
        this.foreignKeyMapper,
        fileId
      );

      // Attach DKV data to each driver module
      for (const module of driverModules) {
        const dkvData = dkvByModule.get(module.systemId) || [];
        module.dkvData = dkvData;
      }

      this.logger?.logInfo({
        msg: `Attached DKV calibration data to ${driverModules.length} driver modules`,
        action: 'dkv_attachment_success',
        component: 'DriverModuleBuilder',
        timestamp: new Date()
      });
    } catch (error) {
      this.logger?.logWarn({
        msg: `Failed to attach DKV calibration data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        action: 'dkv_attachment_failed',
        component: 'DriverModuleBuilder',
        error: error as Error,
        timestamp: new Date()
      });
    }
  }
}
```

---

### 3.5 DriverCalibrationDataBuilder

**Location**: `packages/core/src/application/file-operations/upload-file/services/entity-builders/driver-calibration-data-builder.ts`

**Purpose**: Build DKV (Driver Key-Value) calibration data with KeyVector deduplication

#### 3.5.1 Input/Output

**Input**:
- `ParsedAcdb` - Contains `GslCalibrationChunk` and `DatapoolChunk`
- `ForeignKeyMapper` - For resolving key/value systemIds
- `IdGenerationPort` - For assigning systemIds to KeyVectors
- `fileId` - File system ID

**Output**:
```typescript
Map<number, DkvData[]>  // moduleSystemId → DkvData[]
```

#### 3.5.2 Entity Structure

```typescript
class DkvData {
  systemId: number;  // Database-assigned, 0 during build
  driverModuleId: number;  // FK to DriverModule
  keyVectorSystemId: number;  // FK to KeyVector (deduplicated)
  parameterPayloads: DkvParameterPayload[];  // Child entities
}

class DkvParameterPayload {
  systemId: number;  // Database-assigned, 0 during build
  parameterSystemId: number;  // FK to DriverModuleParameterDefinition
  dkvSystemId: number;  // FK to DkvData (0 during build)
  payload: Buffer;  // Binary data from DATAPOOL
}
```

#### 3.5.3 Build Process

The build process mirrors `CalibrationDataBuilder` but processes GSL calibration data instead of audio calibration data:

```typescript
class DriverCalibrationDataBuilder {
  constructor(
    private readonly idGenerator: IdGenerationPort,
    private readonly foreignKeyMapper: ForeignKeyMapper,
    private readonly logger?: Logger
  ) {}

  async buildDkvDataByModule(
    parsedAcdb: ParsedAcdb,
    foreignKeyMapper: ForeignKeyMapper,
    fileId: number
  ): Promise<Map<number, DkvData[]>> {
    // Step 1: Build raw DKV data with module associations
    const rawResult = this.buildDkvData(parsedAcdb, foreignKeyMapper);

    // Step 2: Deduplicate KeyVectors and assign systemIds
    const keyVectorCache = new Map<string, number>();
    const dkvDataWithKeyVectors: Array<{
      dkvData: DkvData;
      moduleSystemId: number;
    }> = [];

    for (const {dkvData, moduleSystemId} of rawResult) {
      // Create KeyVector signature from key-value systemIds
      const keyVectorSignature = dkvData.keyValueSystemIds.join(',');

      let keyVectorSystemId = keyVectorCache.get(keyVectorSignature);

      if (!keyVectorSystemId) {
        // New KeyVector - assign systemId and cache
        keyVectorSystemId = await this.idGenerator.generateId(fileId);
        keyVectorCache.set(keyVectorSignature, keyVectorSystemId);

        // Insert KeyVector into database
        await this.insertKeyVector(keyVectorSystemId, dkvData.keyValueSystemIds);
      }

      dkvData.keyVectorSystemId = keyVectorSystemId;
      dkvDataWithKeyVectors.push({dkvData, moduleSystemId});
    }

    // Step 3: Group by module systemId
    const dkvByModule = new Map<number, DkvData[]>();
    for (const {dkvData, moduleSystemId} of dkvDataWithKeyVectors) {
      if (!dkvByModule.has(moduleSystemId)) {
        dkvByModule.set(moduleSystemId, []);
      }
      dkvByModule.get(moduleSystemId)!.push(dkvData);
    }

    this.logger?.logInfo({
      msg: `Built DKV data: ${dkvDataWithKeyVectors.length} DKV entries for ${dkvByModule.size} driver modules`,
      action: 'dkv_data_built',
      component: 'DriverCalibrationDataBuilder',
      timestamp: new Date()
    });

    return dkvByModule;
  }

  private buildDkvData(
    parsedAcdb: ParsedAcdb,
    foreignKeyMapper: ForeignKeyMapper
  ): Array<{dkvData: DkvData; moduleSystemId: number}> {
    const result: Array<{dkvData: DkvData; moduleSystemId: number}> = [];

    // Get driver calibration chunk
    const driverCalChunk = parsedAcdb.getChunk<DriverCalibrationChunk>(
      PARSED_CHUNK_TYPES.DRIVER_CALIBRATION_DATA
    );

    if (!driverCalChunk) {
      return result;
    }

    // Get DATAPOOL chunk for parameter payloads
    const datapoolChunk = parsedAcdb.getChunk<DatapoolChunk>(
      PARSED_CHUNK_TYPES.DATAPOOL
    );

    if (!datapoolChunk) {
      this.logger?.logWarn({
        msg: 'Datapool chunk not found for driver calibration',
        action: 'missing_datapool_chunk',
        component: 'DriverCalibrationDataBuilder',
        timestamp: new Date()
      });
      return result;
    }

    // Process each module lookup entry
    for (const moduleLutEntry of driverCalChunk.moduleLookupEntries) {
      const moduleDefinitionId = moduleLutEntry.moduleDefinitionId;

      // Get module systemId
      const moduleSystemId = foreignKeyMapper.getDriverModuleSystemId(
        moduleDefinitionId
      );

      if (!moduleSystemId) {
        this.logger?.logWarn({
          msg: `Driver module systemId not found for definition ${moduleDefinitionId}`,
          action: 'module_resolution_failed',
          component: 'DriverCalibrationDataBuilder',
          timestamp: new Date()
        });
        continue;
      }

      // Process each calibration key table entry
      for (const calKeyTblEntry of moduleLutEntry.calKeyTableEntries) {
        // Get key table
        const keyIds = driverCalChunk.getCalKeyTable(
          calKeyTblEntry.offsetCalKeyTable
        );

        if (!keyIds) {
          this.logger?.logWarn({
            msg: 'Key table not found',
            action: 'missing_key_table',
            component: 'DriverCalibrationDataBuilder',
            timestamp: new Date()
          });
          continue;
        }

        // Get CKV lookup table
        const ckvLutTable = driverCalChunk.getCkvLookupTable(
          calKeyTblEntry.offsetCalLookupTable
        );

        if (!ckvLutTable) {
          this.logger?.logWarn({
            msg: 'CKV lookup table not found',
            action: 'missing_ckv_lut_table',
            component: 'DriverCalibrationDataBuilder',
            timestamp: new Date()
          });
          continue;
        }

        // Process each CKV lookup entry
        for (const ckvLutEntry of ckvLutTable.ckvLookupEntries) {
          try {
            const dkvData = this.processCkvLookupEntry(
              ckvLutEntry,
              keyIds,
              driverCalChunk,
              datapoolChunk,
              foreignKeyMapper,
              moduleDefinitionId
            );

            if (dkvData) {
              result.push({dkvData, moduleSystemId});
            }
          } catch (error) {
            this.logger?.logWarn({
              msg: `Failed to process CKV lookup entry: ${error instanceof Error ? error.message : 'Unknown error'}`,
              action: 'ckv_entry_processing_failed',
              component: 'DriverCalibrationDataBuilder',
              timestamp: new Date()
            });
          }
        }
      }
    }

    return result;
  }

  private processCkvLookupEntry(
    ckvLutEntry: CkvLookupEntry,
    keyIds: number[],
    driverCalChunk: DriverCalibrationChunk,
    datapoolChunk: DatapoolChunk,
    foreignKeyMapper: ForeignKeyMapper,
    moduleDefinitionId: number
  ): DkvData | null {
    // Resolve key-value systemIds
    const keyValueSystemIds: number[] = [];
    for (let i = 0; i < keyIds.length; i++) {
      const keyId = keyIds[i];
      const valueId = ckvLutEntry.calKeyValues[i];

      const keySystemId = foreignKeyMapper.getKeySystemId(keyId);
      const valueSystemId = foreignKeyMapper.getValueSystemId(keyId, valueId);

      if (!keySystemId || !valueSystemId) {
        this.logger?.logWarn({
          msg: 'Failed to resolve key-value system IDs',
          action: 'value_resolution_failed',
          component: 'DriverCalibrationDataBuilder',
          timestamp: new Date()
        });
        return null;
      }

      keyValueSystemIds.push(valueSystemId);
    }

    // Get DEF entry (module-parameter pairs)
    const defEntry = gslCalChunk.getCalDefinitionEntry(
      ckvLutEntry.offsetCalDefinition
    );

    // Get DOT entry (data offsets)
    const dotEntry = gslCalChunk.getCalDataOffsetEntry(
      ckvLutEntry.offsetCalDataOffset
    );

    if (!defEntry || !dotEntry) {
      this.logger?.logWarn({
        msg: 'Missing DEF or DOT entry',
        action: 'missing_def_or_dot_entry',
        component: 'DriverCalibrationDataBuilder',
        timestamp: new Date()
      });
      return null;
    }

    // Extract parameter payloads
    const parameterPayloads: DkvParameterPayload[] = [];

    for (let i = 0; i < defEntry.calIdEntries.length; i++) {
      const calIdEntry = defEntry.calIdEntries[i];
      const dataOffset = dotEntry.calDataOffsets[i];

      // Get parameter systemId
      const paramSystemId = foreignKeyMapper.getDriverModuleParameterSystemId(
        moduleDefinitionId,
        calIdEntry.paramId
      );

      if (!paramSystemId) {
        this.logger?.logWarn({
          msg: `Parameter systemId not found for param ${calIdEntry.paramId}`,
          action: 'param_resolution_failed',
          component: 'DriverCalibrationDataBuilder',
          timestamp: new Date()
        });
        continue;
      }

      // Extract payload from DATAPOOL
      const payload = datapoolChunk.getDataAtOffset(dataOffset);

      if (!payload) {
        this.logger?.logWarn({
          msg: `Payload not found at offset ${dataOffset}`,
          action: 'datapool_offset_not_found',
          component: 'DriverCalibrationDataBuilder',
          timestamp: new Date()
        });
        continue;
      }

      const paramPayload = new DkvParameterPayload(
        0,  // systemId assigned later
        paramSystemId,
        0,  // dkvSystemId assigned after parent insert
        payload
      );

      parameterPayloads.push(paramPayload);
    }

    // Create DKV data
    const dkvData = new DkvData(
      0,  // systemId assigned later
      0,  // driverModuleId assigned later
      0,  // keyVectorSystemId assigned during deduplication
      parameterPayloads
    );

    // Store key-value systemIds for KeyVector deduplication
    (dkvData as any).keyValueSystemIds = keyValueSystemIds;

    return dkvData;
  }

  private async insertKeyVector(
    keyVectorSystemId: number,
    keyValueSystemIds: number[]
  ): Promise<void> {
    // Insert KeyVector and KeyVectorValues
    // Implementation similar to CalibrationDataBuilder
  }
}
```

---

### 3.6 DriverModuleInserter

**Location**: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/bulk-import/driver-module/driver-module.inserter.ts`

**Purpose**: Insert driver module instances and their DKV calibration data into the database

#### 3.6.1 Insert Order (FK-safe, leaf-first)

1. **Driver Modules** → `driver_modules` table
2. **DKV entries** → `dkv` table
3. **DKV Values** → `dkv_values` table (KeyVector references)
4. **DKV Parameter Payloads** → `dkv_parameter_payload` table

#### 3.6.2 Implementation

```typescript
export class DriverModuleInserter implements BulkInserter<DriverModule> {
  private readonly manager: EntityManager;

  constructor(manager: EntityManager) {
    this.manager = manager;
  }

  async insert(modules: DriverModule[]): Promise<BulkInsertResult> {
    if (modules.length === 0) return okBulkInsert();

    const moduleBySystemId = new Map(modules.map(m => [m.systemId, m]));

    // Collect all raw failures from all insert steps
    const rawFailures: RawFailure[] = [
      ...(await this.insertDriverModules(modules)),
      ...(await this.insertDkvs(modules)),
      ...(await this.insertDkvValues(modules)),
      ...(await this.insertDkvParameterPayloads(modules))
    ];

    if (rawFailures.length === 0) return okBulkInsert();

    // Group raw failures by driver module systemId
    const grouped = new Map<number, string[]>();
    for (const f of rawFailures) {
      if (!grouped.has(f.systemId)) grouped.set(f.systemId, []);
      grouped.get(f.systemId)!.push(
        `${f.entityLabel}: Failed to insert\n${f.failedRowJson}\nerror: ${f.dbError}`
      );
    }

    // Build one BulkInsertError per failing module
    const errors: BulkInsertError[] = [...grouped.entries()].map(
      ([systemId, lines]) => {
        const module = moduleBySystemId.get(systemId)!;
        return {
          message: `Failed to insert some or all data belonging to Driver Module {definitionSystemId=${module.definitionSystemId}, systemId=${module.systemId}}`,
          details: lines.join('\n')
        };
      }
    );

    return errBulkInsert(errors);
  }

  private async insertDriverModules(
    modules: DriverModule[]
  ): Promise<RawFailure[]> {
    const rows: InsertRow<DriverModuleRow>[] = modules.map(m => ({
      systemId: m.systemId,
      definitionSystemId: m.definitionSystemId
    }));

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      DriverModuleSchema,
      rows
    );

    return failedEntities.map(error => {
      const module = modules.find(m => m.systemId === error.systemId)!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: module.systemId,
        entityLabel: 'DriverModule',
        failedRowJson: JSON.stringify(failedRow, null, 2),
        dbError: error.message
      };
    });
  }

  private async insertDkvs(modules: DriverModule[]): Promise<RawFailure[]> {
    const allDkvs = modules.flatMap(m =>
      m.dkvData.map(dkv => ({dkv, parentSystemId: m.systemId}))
    );

    if (allDkvs.length === 0) return [];

    const rows: InsertRow<DkvRow>[] = allDkvs.map(({dkv, parentSystemId}) => ({
      systemId: dkv.systemId,
      driverModuleId: parentSystemId,
      keyVectorSystemId: dkv.keyVectorSystemId
    }));

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      DkvSchema,
      rows
    );

    return failedEntities.map(error => {
      const {parentSystemId} = allDkvs.find(
        ad => ad.dkv.systemId === error.systemId
      )!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: parentSystemId,
        entityLabel: 'Dkv',
        failedRowJson: JSON.stringify(failedRow, null, 2),
        dbError: error.message
      };
    });
  }

  private async insertDkvValues(modules: DriverModule[]): Promise<RawFailure[]> {
    const allDkvValues = modules.flatMap(m =>
      m.dkvData.flatMap(dkv =>
        dkv.keyValueSystemIds.map((kvSystemId, index) => ({
          dkvSystemId: dkv.systemId,
          keyValueSystemId: kvSystemId,
          ordinal: index,
          parentSystemId: m.systemId
        }))
      )
    );

    if (allDkvValues.length === 0) return [];

    const rows: InsertRow<DkvValuesRow>[] = allDkvValues.map(dv => ({
      dkvSystemId: dv.dkvSystemId,
      keyValueSystemId: dv.keyValueSystemId,
      ordinal: dv.ordinal
    }));

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      DkvValuesSchema,
      rows
    );

    return failedEntities.map(error => {
      const dkvValue = allDkvValues.find(
        dv => dv.dkvSystemId === error.systemId
      )!;
      const failedRow = rows.find(
        r => r.dkvSystemId === error.systemId && r.ordinal === dkvValue.ordinal
      );
      return {
        systemId: dkvValue.parentSystemId,
        entityLabel: 'DkvValues',
        failedRowJson: JSON.stringify(failedRow, null, 2),
        dbError: error.message
      };
    });
  }

  private async insertDkvParameterPayloads(
    modules: DriverModule[]
  ): Promise<RawFailure[]> {
    const allPayloads = modules.flatMap(m =>
      m.dkvData.flatMap(dkv =>
        dkv.parameterPayloads.map(payload => ({
          payload,
          dkvSystemId: dkv.systemId,
          parentSystemId: m.systemId
        }))
      )
    );

    if (allPayloads.length === 0) return [];

    const rows: InsertRow<DkvParameterPayloadRow>[] = allPayloads.map(
      ({payload, dkvSystemId}) => ({
        systemId: payload.systemId,
        parameterSystemId: payload.parameterSystemId,
        dkvSystemId: dkvSystemId,
        payload: payload.payload
      })
    );

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      DkvParameterPayloadSchema,
      rows
    );

    return failedEntities.map(error => {
      const {parentSystemId} = allPayloads.find(
        ap => ap.payload.systemId === error.systemId
      )!;
      const failedRow = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: parentSystemId,
        entityLabel: 'DkvParameterPayload',
        failedRowJson: JSON.stringify(failedRow, null, 2),
        dbError: error.message
      };
    });
  }
}
```

---

## 4) Integration

### 4.1 UploadFileOrchestrator Changes

**Location**: `packages/core/src/application/file-operations/upload-file/services/upload-file-orchestrator.ts`

#### 4.1.1 Updated Entity Processing Order

```typescript
private async persistEntitiesInHierarchicalOrder(): Promise<void> {
  const bulkRepo = this.uow.getBulkImportRepository();

  // Level 1: Definitions (No Dependencies) - From AWSP
  await this.buildAndInsertKeyDefinitions(bulkRepo);
  await this.buildAndInsertSpfModuleDefinitions(bulkRepo);
  await this.buildAndInsertDriverModuleDefinitions(bulkRepo);  // ← NEW

  // Level 2: Structure (No Dependencies) - From ACDB
  await this.buildAndInsertSubgraphs(bulkRepo);
  await this.buildAndInsertContainers(bulkRepo);

  // Level 3: Modules (Depend on Level 1 & 2) - From ACDB
  await this.buildAndInsertSpfModules(bulkRepo);
  await this.buildAndInsertDriverModules(bulkRepo);  // ← NEW

  // Level 4: Links (Depend on Level 3) - From ACDB
  await this.buildAndInsertDataLinks(bulkRepo);

  // Level 5: Usecases (Depend on Level 1) - From ACDB
  await this.buildAndInsertUsecases(bulkRepo);
}
```

#### 4.1.2 New Processing Methods

**Driver Module Definition Processing**:

```typescript
private async buildAndInsertDriverModuleDefinitions(
  bulkRepo: BulkImportRepository
): Promise<void> {
  this.logger?.logInfo({
    msg: 'Building driver module definitions from AWSP',
    action: 'build_driver_module_definitions_start',
    component: 'UploadFileOrchestrator',
    timestamp: new Date()
  });

  // Build
  const result = await this.builderService.buildDriverModuleDefinitions(
    this.parsedAwsp,
    this.currentFileId
  );

  // Collect issues
  this.issueCollector.addIssues(result.issues);

  if (result.entities.length === 0) {
    this.logger?.logInfo({
      msg: 'No driver module definitions to insert',
      action: 'build_driver_module_definitions_skip',
      component: 'UploadFileOrchestrator',
      timestamp: new Date()
    });
    return;
  }

  // Assign system IDs
  await this.entitySystemIdService.assignSystemIdsToDriverModuleDefinitions(
    result.entities,
    this.currentFileId
  );

  // Insert
  const insertResult = await bulkRepo.insertDriverModuleDefinitions(
    result.entities as readonly Omit<DriverModuleDefinition, 'systemId'>[]
  );

  // Store mappings for foreign key resolution
  this.foreignKeyMapper.setDriverModuleDefinitionMappings(insertResult);

  this.logger?.logInfo({
    msg: `Successfully built and inserted ${result.entities.length} driver module definitions`,
    action: 'build_driver_module_definitions_complete',
    component: 'UploadFileOrchestrator',
    successCount: result.successCount,
    errorCount: result.errorCount,
    timestamp: new Date()
  });
}
```

**Driver Module Instance Processing**:

```typescript
private async buildAndInsertDriverModules(
  bulkRepo: BulkImportRepository
): Promise<void> {
  this.logger?.logInfo({
    msg: 'Building driver modules from ACDB with DKV calibration data',
    action: 'build_driver_modules_start',
    component: 'UploadFileOrchestrator',
    timestamp: new Date()
  });

  // Build driver modules with DKV data
  const result = await this.builderService.buildDriverModules(
    this.parsedAcdb,
    this.currentFileId,
    this.parsedAwsp
  );

  // Collect issues
  this.issueCollector.addIssues(result.issues);

  if (result.entities.length === 0) {
    this.logger?.logInfo({
      msg: 'No driver modules to insert',
      action: 'build_driver_modules_skip',
      component: 'UploadFileOrchestrator',
      timestamp: new Date()
    });
    return;
  }

  // Assign system IDs
  await this.entitySystemIdService.assignSystemIdsToDriverModules(
    result.entities,
    this.currentFileId
  );

  // Insert
  const insertResult = await bulkRepo.insertDriverModules(
    result.entities as readonly Omit<DriverModule, 'systemId'>[]
  );

  // Store mappings (if needed by other entities)
  this.foreignKeyMapper.setDriverModuleMappings(insertResult);

  this.logger?.logInfo({
    msg: `Successfully built and inserted ${result.entities.length} driver modules with DKV data`,
    action: 'build_driver_modules_complete',
    component: 'UploadFileOrchestrator',
    successCount: result.successCount,
    errorCount: result.errorCount,
    timestamp: new Date()
  });
}
```

### 4.2 AcdbParser Integration

**Location**: `packages/core/src/application/file-operations/upload-file/services/acdb-parser.ts`

**Changes**:

1. Import GSL parser:
```typescript
import {GslCalibrationChunkParser} from './acdb-chunk-parsers/gsl-calibration-chunk-parser.js';
```

2. Add parser instance:
```typescript
class AcdbParser {
  private readonly gslCalibrationParser: GslCalibrationChunkParser;

  constructor(logger?: Logger) {
    // ... existing parsers
    this.gslCalibrationParser = new GslCalibrationChunkParser(logger);
  }
}
```

3. Add parse method:
```typescript
private parseGslCalibrationChunk(
  context: ChunkParseContext
): GslCalibrationChunk {
  return this.gslCalibrationParser.parse(context);
}
```

4. Register in chunk type switch:
```typescript
switch (chunkType) {
  // ... existing cases
  case PARSED_CHUNK_TYPES.GSL_CALIBRATION_DATA:
    return this.parseGslCalibrationChunk(context);
  // ...
}
```

### 4.3 EntityBuilderService Integration

**Location**: `packages/core/src/application/file-operations/upload-file/services/entity-builder-service.ts`

**Add new methods**:

```typescript
class EntityBuilderService {
  /**
   * Build driver module definitions from AWSP
   */
  async buildDriverModuleDefinitions(
    parsedAwsp: ParsedAwsp,
    fileId: number
  ): Promise<BuildResult<DriverModuleDefinition>> {
    const builder = new DriverModuleDefinitionBuilder(
      this.foreignKeyMapper,
      this.logger
    );
    return builder.buildDriverModuleDefinitions(parsedAwsp, fileId);
  }

  /**
   * Build driver modules with DKV calibration data from ACDB
   */
  async buildDriverModules(
    parsedAcdb: ParsedAcdb,
    fileId: number,
    parsedAwsp: ParsedAwsp
  ): Promise<BuildResult<DriverModule>> {
    const builder = new DriverModuleBuilder(
      this.foreignKeyMapper,
      this.idGenerator,
      this.logger
    );
    return builder.buildDriverModules(parsedAcdb, fileId, parsedAwsp);
  }
}
```

### 4.4 ForeignKeyMapper Updates

**Location**: `packages/core/src/application/file-operations/upload-file/services/foreign-key-mapper.ts`

**Add new mappings**:

```typescript
class ForeignKeyMapper {
  // Existing mappings...

  // Driver module definition mappings: moduleDefinitionId → systemId
  private driverModuleDefinitionMappings = new Map<number, number>();

  // Driver module instance mappings: moduleDefinitionId → systemId
  // Note: Driver modules use moduleDefinitionId as their natural key
  private driverModuleMappings = new Map<number, number>();

  // Driver module parameter mappings: moduleDefinitionId → Map<parameterId, systemId>
  private driverModuleParameterMappings = new Map<number, Map<number, number>>();

  /**
   * Store driver module definition mappings
   */
  setDriverModuleDefinitionMappings(result: InsertResult): void {
    result.results
      .filter(r => r.success && r.idMapping)
      .forEach(r => {
        this.driverModuleDefinitionMappings.set(
          r.idMapping!.naturalId,  // moduleDefinitionId
          r.idMapping!.systemId
        );
      });
  }

  /**
   * Get driver module definition system ID by module definition ID
   */
  getDriverModuleDefinitionSystemId(
    moduleDefinitionId: number
  ): number | undefined {
    return this.driverModuleDefinitionMappings.get(moduleDefinitionId);
  }

  /**
   * Store driver module instance mappings
   * Natural key is moduleDefinitionId (not instanceId)
   */
  setDriverModuleMappings(result: InsertResult): void {
    result.results
      .filter(r => r.success && r.idMapping)
      .forEach(r => {
        this.driverModuleMappings.set(
          r.idMapping!.naturalId,  // moduleDefinitionId
          r.idMapping!.systemId
        );
      });
  }

  /**
   * Get driver module instance system ID by module definition ID
   */
  getDriverModuleSystemId(
    moduleDefinitionId: number
  ): number | undefined {
    return this.driverModuleMappings.get(moduleDefinitionId);
  }

  /**
   * Store driver module parameter mappings
   */
  setDriverModuleParameterMappings(
    moduleDefinitionId: number,
    result: InsertResult
  ): void {
    const paramMap = new Map<number, number>();

    result.results
      .filter(r => r.success && r.idMapping)
      .forEach(r => {
        paramMap.set(
          r.idMapping!.naturalId,  // parameterId
          r.idMapping!.systemId
        );
      });

    this.driverModuleParameterMappings.set(moduleDefinitionId, paramMap);
  }

  /**
   * Get driver module parameter system ID
   */
  getDriverModuleParameterSystemId(
    moduleDefinitionId: number,
    parameterId: number
  ): number | undefined {
    const paramMap = this.driverModuleParameterMappings.get(moduleDefinitionId);
    return paramMap?.get(parameterId);
  }
}
```

### 4.5 BulkImportRepository Updates

**Location**: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/bulk-import/typeorm-bulk-import.repository.ts`

**Add new methods**:

```typescript
class TypeOrmBulkImportRepository implements BulkImportRepository {
  /**
   * Insert driver module definitions
   */
  async insertDriverModuleDefinitions(
    definitions: readonly Omit<DriverModuleDefinition, 'systemId'>[]
  ): Promise<BulkInsertResult> {
    const inserter = new DriverModuleDefinitionInserter(this.manager);
    return inserter.insert(definitions as DriverModuleDefinition[]);
  }

  /**
   * Insert driver modules
   */
  async insertDriverModules(
    modules: readonly Omit<DriverModule, 'systemId'>[]
  ): Promise<BulkInsertResult> {
    const inserter = new DriverModuleInserter(this.manager);
    return inserter.insert(modules as DriverModule[]);
  }
}
```

---

## 5) Error Handling

### 5.1 Continue-on-Error Semantics

Following the existing pattern, all driver module operations use **continue-on-error** semantics:

**Build Phase**:
- Collect errors/warnings during entity building
- Continue processing remaining entities
- Return `BuildResult` with both successful entities and issues

**Insert Phase**:
- Attempt batch insert (fast path)
- On batch failure, fallback to individual row insertion
- Continue inserting remaining entities even if some fail
- Group failures by driver module aggregate

**Example Error Flow**:
```typescript
// Building driver modules
const result = await builderService.buildDriverModules(...);
// result.entities = [module1, module2, module3]
// result.issues = [
//   { severity: 'error', message: 'Definition not found for module 999' }
// ]

// Inserting driver modules
const insertResult = await bulkRepo.insertDriverModules(result.entities);
// insertResult = {
//   success: false,
//   errors: [
//     {
//       message: 'Failed to insert Driver Module {moduleDefId=123}',
//       details: 'DKV: Foreign key constraint violation'
//     }
//   ]
// }
```

### 5.2 Error Categories

**Parsing Errors**:
- Missing GSL calibration chunks → Log warning, skip driver module processing
- Malformed chunk data → Throw error, fail upload

**Build Errors**:
- Driver module definition not found → Collect error, skip module
- Invalid calibration data → Collect warning, skip calibration for that module
- Missing parameter definition → Collect error, skip parameter payload

**Insert Errors**:
- Foreign key constraint violation → Collect error, continue with next entity
- Duplicate key violation → Collect error, continue with next entity
- Database connection error → Throw error, fail upload

### 5.3 Error Messages

**User-Facing Errors** (returned in API response):
```typescript
{
  errors: [
    "Failed to insert Driver Module {moduleDefId=123, systemId=5001}: Foreign key constraint violation on definitionSystemId"
  ],
  warnings: [
    "Driver module definition 999 not found in AWSP file, skipping calibration data"
  ]
}
```

**Log Messages** (for debugging):
```typescript
{
  msg: 'Failed to process GSL calibration for module 123',
  action: 'gsl_calibration_processing_failed',
  component: 'DriverCalibrationDataBuilder',
  moduleDefinitionId: 123,
  error: Error,
  timestamp: new Date()
}
```

---

## 6) Testing Strategy

### 6.1 Unit Tests

**GslCalibrationChunkParser**:
- ✅ Parse valid GSL calibration chunks
- ✅ Handle missing dependent chunks (GCKT, GCDT, GCDE, GCDO)
- ✅ Handle malformed chunk data
- ✅ Verify caching behavior

**DriverModuleDefinitionBuilder**:
- ✅ Build valid driver module definitions
- ✅ Build parameter definitions
- ✅ Handle missing AWSP data
- ✅ Collect build errors/warnings

**DriverModuleBuilder**:
- ✅ Build driver modules from GSL data
- ✅ Resolve foreign keys correctly
- ✅ Handle missing definitions
- ✅ Attach DKV calibration data

**DriverCalibrationDataBuilder**:
- ✅ Build DKV data with KeyVector deduplication
- ✅ Extract parameter payloads from DATAPOOL
- ✅ Handle missing key/value definitions
- ✅ Group DKV data by module systemId

### 6.2 Integration Tests

**DriverModuleDefinitionInserter**:
- ✅ Insert driver module definitions successfully
- ✅ Insert parameter definitions as children
- ✅ Handle batch insert failures with fallback
- ✅ Group errors by driver module definition
- ✅ Verify foreign key constraints

**DriverModuleInserter**:
- ✅ Insert driver modules successfully
- ✅ Insert DKV data with KeyVector references
- ✅ Insert DKV parameter payloads
- ✅ Handle batch insert failures with fallback
- ✅ Group errors by driver module
- ✅ Verify foreign key constraints

**End-to-End Upload Test**:
- ✅ Upload ACDB file with GSL calibration data
- ✅ Upload AWSP file with driver module definitions
- ✅ Verify driver modules inserted correctly
- ✅ Verify DKV data inserted correctly
- ✅ Verify KeyVector deduplication works
- ✅ Verify error collection and reporting

### 6.3 Test Data Requirements

**ACDB Test File** must contain:
- GSL_CALIBRATION_LUT chunk (GCLU)
- GSL_CALIBRATION_KEY_TABLE chunk (GCKT)
- GSL_CALIBRATION_DATA_TABLE chunk (GCDT)
- GSL_CALIBRATION_DATA_DEF chunk (GCDE)
- GSL_CALIBRATION_DATA_DOT chunk (GCDO)
- DATAPOOL chunk (for parameter payloads)

**AWSP Test File** must contain:
- Driver module definitions with parameters
- Key-value definitions (for calibration data)

---

## 7) Implementation Checklist

### 7.1 Core Components

#### Parsing Layer
- [ ] Add GSL chunk type constants to `chunk-types.ts`
- [ ] Create `GslCalibrationChunk` class
- [ ] Create `GslCalibrationChunkParser` class
- [ ] Register parser in `AcdbParser`
- [ ] Add chunk metadata to `ChunkMetadataRegistry`

#### Domain Layer
- [ ] Create `DriverModuleDefinition` domain entity (if not exists)
- [ ] Create `DriverModule` domain entity (if not exists)
- [ ] Create `DkvData` domain entity (if not exists)
- [ ] Create `DriverModuleDefinitionBuilder`
- [ ] Create `DriverModuleBuilder`
- [ ] Create `DriverCalibrationDataBuilder`

#### Persistence Layer
- [ ] Create `DriverModuleDefinitionInserter`
- [ ] Create `DriverModuleInserter`
- [ ] Add `insertDriverModuleDefinitions()` to `BulkImportRepository`
- [ ] Add `insertDriverModules()` to `BulkImportRepository`

#### Integration Layer
- [ ] Add methods to `EntityBuilderService`
- [ ] Add methods to `EntitySystemIdService`
- [ ] Add mappings to `ForeignKeyMapper`
- [ ] Add processing methods to `UploadFileOrchestrator`
- [ ] Update entity processing order

### 7.2 Testing
- [ ] Unit tests for `GslCalibrationChunkParser`
- [ ] Unit tests for `DriverModuleDefinitionBuilder`
- [ ] Unit tests for `DriverModuleBuilder`
- [ ] Unit tests for `DriverCalibrationDataBuilder`
- [ ] Integration tests for `DriverModuleDefinitionInserter`
- [ ] Integration tests for `DriverModuleInserter`
- [ ] End-to-end upload test with GSL data

### 7.3 Documentation
- [ ] Update `upload-file-design.md` with driver module section
- [ ] Add GSL calibration parsing documentation
- [ ] Update API documentation (if needed)

---

## 8) References

### 8.1 Related Documents
- `docs/upload-file-design.md` - Main upload workflow design
- `docs/definitions-bulk-inserters-design.md` - Bulk inserter pattern reference

### 8.2 Related Code
- `AudioCalibrationChunkParser` - Reference implementation for GSL parser
- `CalibrationDataBuilder` - Reference implementation for DKV builder
- `SpfModuleInserter` - Reference implementation for driver module inserter
- `SpfModuleDefinitionInserter` - Reference implementation for definition inserter

### 8.3 Key Patterns
- **Build-Insert-Build Pattern**: Build entities → Insert → Use systemIds to build dependent entities
- **Continue-on-Error**: Collect errors during building/insertion, allow partial success
- **KeyVector Deduplication**: Reuse existing KeyVectors across calibration data
- **Hierarchical Processing**: Process entities in dependency order

---

## Document Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-05-31 | Architecture Team | Initial GSL calibration data design document |

---

**End of Document**
