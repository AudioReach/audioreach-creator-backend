<!--
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
-->

# Module Manager Data Integration — Design

## Status

Proposed — ready for review and approval.

## Context

The AudioReach Creator Backend currently parses and persists most ACDB file data during the upload-file workflow, but two important chunks are not yet handled:

1. **Module Manager Data Chunk (MODM)** - Contains AMDB registration data that specifies how modules are registered on different processors, including module type, interface type/version, file names, and tags.

2. **Boot-Up Loading Modules Chunk (BTUP)** - Contains lists of modules that should be loaded at boot time for each processor.

This data is critical for:
- Understanding module deployment configuration across processors
- Identifying which modules are loaded at system boot
- Providing complete module metadata to the UI/API consumers

Currently, the `module_manager_data` table schema exists but is not populated, and the `isLoadedAtBootup` field in the API response DTO is not backed by persisted data.

---

## Decision

Implement end-to-end parsing and persistence for both Module Manager and Boot-Up Loading chunks, following the existing upload-file architecture patterns.

### High-Level Approach

1. **Parse both chunks** during ACDB file parsing phase
2. **Set `isLoadedAtBootup` flag** during SpfModuleDefinition build phase (not as a separate update)
3. **Insert ModuleManagerData** after definitions are persisted (to resolve foreign keys)
4. **Follow bulk inserter pattern** with continue-on-error semantics
5. **Handle optional chunks gracefully** (both chunks may be missing or empty)

### Alternatives Considered

**Alternative 1: Update `isLoadedAtBootup` after insertion**
- Rejected: Requires separate UPDATE queries, less efficient
- Chosen approach: Set flag during build phase (cleaner, more efficient)

**Alternative 2: Store boot-up data in separate table**
- Rejected: Adds unnecessary complexity, boot-up is a boolean property of module definitions
- Chosen approach: Add `isLoadedAtBootup` column to `spf_module_definitions`

**Alternative 3: Store natural keys (procId, moduleId) in module_manager_data**
- Rejected: Violates existing pattern of using systemId foreign keys
- Chosen approach: Use foreign keys to `processor_definitions` and `spf_module_definitions`

---

## Design

### 1. Database Schema Changes

#### 1.1 Update `module_manager_data` Table

**File:** `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/module-manager/module-manager-data.ts`

**Current Schema:**
```typescript
export interface ModuleManagerDataRow extends EntityBaseRow {
  moduleType: ModuleTypeValue;
  interfaceType: InterfaceTypeValue;
  interfaceVersion: InterfaceVersionValue;
  fileName: string;
  tag: string;
}
```

**Updated Schema:**
```typescript
export interface ModuleManagerDataRow extends EntityBaseRow {
  // Foreign Keys
  processorDefinitionSystemId: number;  // FK to processor_definitions.system_id
  moduleDefinitionSystemId: number;     // FK to spf_module_definitions.system_id
  fileSystemId: number;                 // FK to file_system.system_id

  // CAPI Registration Data
  moduleType: ModuleTypeValue;          // 2|3|4|5|6|7
  interfaceType: InterfaceTypeValue;    // 2 (Capi)
  interfaceVersion: InterfaceVersionValue; // 3 (CapiV3)
  fileName: string;                     // Module file name (e.g., "libA.so")
  tag: string;                          // Module tag

  // Relations (optional, for TypeORM)
  processorDefinition?: ProcessorDefinitionRow;
  moduleDefinition?: SpfModuleDefinitionRow;
  file?: ArcDbFileRow;
}

export const ModuleManagerDataSchema = new EntitySchema<ModuleManagerDataRow>({
  name: 'ModuleManagerData',
  tableName: 'module_manager_data',
  columns: {
    ...BaseColumnSchemaPart,
    processorDefinitionSystemId: {
      name: 'processor_definition_system_id',
      type: 'integer',
    },
    moduleDefinitionSystemId: {
      name: 'module_definition_system_id',
      type: 'integer',
    },
    fileSystemId: {
      name: 'file_system_id',
      type: 'integer',
    },
    moduleType: {
      name: 'module_type',
      type: 'integer',
      transformer: ModuleTypeTransformer,
    },
    interfaceType: {
      name: 'interface_type',
      type: 'integer',
      transformer: InterfaceTypeTransformer,
    },
    interfaceVersion: {
      name: 'interface_version',
      type: 'integer',
      transformer: InterfaceVersionTransformer,
    },
    fileName: {
      name: 'file_name',
      type: 'varchar',
      length: 255,
    },
    tag: {
      name: 'tag',
      type: 'varchar',
      length: 100,
    },
  },
  relations: {
    processorDefinition: {
      type: 'many-to-one',
      target: 'ProcessorDefinition',
      joinColumn: {
        name: 'processor_definition_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
    moduleDefinition: {
      type: 'many-to-one',
      target: 'SpfModuleDefinition',
      joinColumn: {
        name: 'module_definition_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
    file: {
      type: 'many-to-one',
      target: 'ArcDbFile',
      joinColumn: {
        name: 'file_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
  },
});
```

**Rationale:**
- `processorDefinitionSystemId` + `moduleDefinitionSystemId` form a composite business key (one registration per processor-module pair per file)
- Follows existing pattern of using systemId foreign keys instead of natural keys
- Enables referential integrity and JOIN queries
- `fileSystemId` scopes data to specific uploaded file

#### 1.2 Add `isLoadedAtBootup` to `spf_module_definitions` Table

**File:** `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/definitions/module/spf/spf-module-definition.schema.ts`

**Add Column:**
```typescript
export interface SpfModuleDefinitionRow extends EntityBaseRow {
  // ... existing fields ...
  isLoadedAtBootup: boolean;  // NEW: Indicates if module is loaded at boot
}

export const SpfModuleDefinitionSchema = new EntitySchema<SpfModuleDefinitionRow>({
  // ... existing config ...
  columns: {
    // ... existing columns ...
    isLoadedAtBootup: {
      name: 'is_loaded_at_bootup',
      type: 'boolean',
      default: false,
    },
  },
});
```

**Rationale:**
- Boot-up loading is a property of the module definition, not instance-specific
- Already exposed in API (`SpfModuleDefinitionResponseDto.isLoadedAtBootup`)
- Default `false` ensures backward compatibility

---

### 2. Domain Model Changes

#### 2.1 Create `ModuleManagerData` Entity

**File:** `packages/core/src/domain/entities/module-manager/module-manager-data.ts`

```typescript
export interface ModuleManagerDataInit {
  systemId: number;
  processorDefinitionSystemId: number;
  moduleDefinitionSystemId: number;
  moduleType: ModuleTypeValue;
  interfaceType: InterfaceTypeValue;
  interfaceVersion: InterfaceVersionValue;
  fileName: string;
  tag: string;
  fileSystemId: number;
}

export class ModuleManagerData {
  constructor(
    public readonly systemId: number,
    public readonly processorDefinitionSystemId: number,
    public readonly moduleDefinitionSystemId: number,
    public readonly moduleType: ModuleTypeValue,
    public readonly interfaceType: InterfaceTypeValue,
    public readonly interfaceVersion: InterfaceVersionValue,
    public readonly fileName: string,
    public readonly tag: string,
    public readonly fileSystemId: number,
  ) {}

  static create(init: ModuleManagerDataInit): ModuleManagerData {
    return new ModuleManagerData(
      init.systemId,
      init.processorDefinitionSystemId,
      init.moduleDefinitionSystemId,
      init.moduleType,
      init.interfaceType,
      init.interfaceVersion,
      init.fileName,
      init.tag,
      init.fileSystemId,
    );
  }
}
```

**Export from index:**
```typescript
// packages/core/src/domain/entities/module-manager/index.ts
export * from './module-manager-data.js';
```

#### 2.2 Update `SpfModuleDefinition` Entity

**File:** `packages/core/src/domain/entities/definitions/spf-module/spf-module-definition.ts`

**Add Field:**
```typescript
export interface SpfModuleDefinitionInit extends ModuleDefinitionInit {
  // ... existing fields ...
  isLoadedAtBootup?: boolean;  // NEW: default false
}

export class SpfModuleDefinition extends ModuleDefinition {
  // ... existing fields ...
  readonly isLoadedAtBootup: boolean;

  constructor(initParam: SpfModuleDefinitionInit) {
    super(initParam);
    // ... existing initialization ...
    this.isLoadedAtBootup = initParam.isLoadedAtBootup ?? false;
  }
}
```

---

### 3. ACDB Parsing

#### 3.1 Chunk ID Constants

**File:** `packages/core/src/application/file-operations/upload-file/services/acdb-file-orchestrator.ts`

**Add Constants:**
```typescript
// Chunk IDs (ASCII to uint32)
const MODULE_MANAGER_CHUNK_ID = 0x4D4F444D; // 'MODM'
const BOOTUP_LOADING_CHUNK_ID = 0x42545550; // 'BTUP'
```

#### 3.2 Module Manager Chunk Parser

**File:** `packages/core/src/application/file-operations/upload-file/services/parsers/module-manager-chunk-parser.ts`

**Data Structures:**
```typescript
export interface ModuleManagerCapi {
  moduleType: number;
  moduleId: number;
  fileNameLen: number;
  tagLen: number;
  errorCode: number;
  fileName: string;
  tag: string;
}

export interface ModuleManagerRegistration {
  interfaceType: number;
  interfaceVersion: number;
  capi: ModuleManagerCapi;
}

export interface ParsedModuleManagerChunk {
  // Map: procId -> (moduleId -> registration data)
  registrations: Map<number, Map<number, ModuleManagerRegistration>>;
}
```

**Parser Implementation:**
```typescript
export class ModuleManagerChunkParser {
  parse(buffer: Buffer, offset: number, length: number): ParsedModuleManagerChunk {
    const registrations = new Map<number, Map<number, ModuleManagerRegistration>>();

    if (length === 0) {
      return { registrations }; // Empty chunk
    }

    let pos = offset;

    // NumProcIDs
    const numProcIds = buffer.readUInt32LE(pos);
    pos += 4;

    // ProcIDModRegDataEntry+
    for (let i = 0; i < numProcIds; i++) {
      // ProcIDModRegDataSize
      const procIDModRegDataSize = buffer.readUInt32LE(pos);
      pos += 4;

      // ProcID
      const procId = buffer.readUInt32LE(pos);
      pos += 4;

      // NumMIDs
      const numMIds = buffer.readUInt32LE(pos);
      pos += 4;

      // Structure Version
      const structVersion = buffer.readUInt32LE(pos);
      pos += 4;

      const moduleRegistrations = new Map<number, ModuleManagerRegistration>();

      // ModRegDataEntry+
      for (let j = 0; j < numMIds; j++) {
        // ModeRegDataSize
        const modeRegDataSize = buffer.readUInt32LE(pos);
        pos += 4;

        const regDataPosStart = pos;

        // Interface Type (2 bytes)
        const interfaceType = buffer.readUInt16LE(pos);
        pos += 2;

        // Interface Version (2 bytes)
        const interfaceVersion = buffer.readUInt16LE(pos);
        pos += 2;

        // Module Type (4 bytes, but read as UInt16 then skip 2)
        const moduleType = buffer.readUInt16LE(pos);
        pos += 4;

        // Module ID
        const moduleId = buffer.readUInt32LE(pos);
        pos += 4;

        // File Name Length (2 bytes, but read as UInt8 then skip 1)
        const fileNameLen = buffer.readUInt8(pos);
        pos += 2;

        // Tag Length
        const tagLen = buffer.readUInt16LE(pos);
        pos += 2;

        // Error Code
        const errorCode = buffer.readUInt32LE(pos);
        pos += 4;

        // File Name
        const fileName = buffer.toString('utf8', pos, pos + fileNameLen);
        pos += fileNameLen;

        // Tag
        const tag = buffer.toString('utf8', pos, pos + tagLen);
        pos += tagLen;

        // Skip alignment/padding bytes
        pos = regDataPosStart + modeRegDataSize;

        const registration: ModuleManagerRegistration = {
          interfaceType,
          interfaceVersion,
          capi: {
            moduleType,
            moduleId,
            fileNameLen,
            tagLen,
            errorCode,
            fileName,
            tag,
          },
        };

        moduleRegistrations.set(moduleId, registration);
      }

      registrations.set(procId, moduleRegistrations);
    }

    return { registrations };
  }
}
```

#### 3.3 Boot-Up Loading Chunk Parser

**File:** `packages/core/src/application/file-operations/upload-file/services/parsers/bootup-loading-chunk-parser.ts`

**Data Structures:**
```typescript
export interface ParsedBootUpLoadingChunk {
  // Map: procId -> Set of moduleIds to load at boot
  bootUpModules: Map<number, Set<number>>;
}
```

**Parser Implementation:**
```typescript
export class BootUpLoadingChunkParser {
  parse(buffer: Buffer, offset: number, length: number): ParsedBootUpLoadingChunk {
    const bootUpModules = new Map<number, Set<number>>();

    if (length === 0) {
      return { bootUpModules }; // Empty chunk
    }

    let pos = offset;

    // NumProcIDs
    const numProcIds = buffer.readUInt32LE(pos);
    pos += 4;

    // ProcIDBootUpLoadingModEntry+
    for (let i = 0; i < numProcIds; i++) {
      // ProcID
      const procId = buffer.readUInt32LE(pos);
      pos += 4;

      // NumMIDs
      const numMIds = buffer.readUInt32LE(pos);
      pos += 4;

      const moduleIds = new Set<number>();

      // ModuleID+
      for (let j = 0; j < numMIds; j++) {
        const moduleId = buffer.readUInt32LE(pos);
        pos += 4;
        moduleIds.add(moduleId);
      }

      bootUpModules.set(procId, moduleIds);
    }

    return { bootUpModules };
  }
}
```

#### 3.4 Integration into AcdbFileOrchestrator

**File:** `packages/core/src/application/file-operations/upload-file/services/acdb-file-orchestrator.ts`

**Add to ParsedAcdb:**
```typescript
export class ParsedAcdb {
  private chunks = new Map<string, unknown>();

  // Add new chunk types
  static readonly MODULE_MANAGER_CHUNK = 'MODULE_MANAGER';
  static readonly BOOTUP_LOADING_CHUNK = 'BOOTUP_LOADING';

  // ... existing methods ...
}
```

**Update parseACDB Method:**
```typescript
async parseACDB(acdbPath: PathRef): Promise<ParsedAcdb> {
  // ... existing parsing logic ...

  // Parse Module Manager chunk (optional)
  const moduleManagerChunk = this.findChunk(MODULE_MANAGER_CHUNK_ID);
  if (moduleManagerChunk) {
    const parsed = new ModuleManagerChunkParser().parse(
      buffer,
      moduleManagerChunk.offset,
      moduleManagerChunk.length
    );
    parsedAcdb.addChunk(ParsedAcdb.MODULE_MANAGER_CHUNK, parsed);
  }

  // Parse Boot-Up Loading chunk (optional)
  const bootUpChunk = this.findChunk(BOOTUP_LOADING_CHUNK_ID);
  if (bootUpChunk) {
    const parsed = new BootUpLoadingChunkParser().parse(
      buffer,
      bootUpChunk.offset,
      bootUpChunk.length
    );
    parsedAcdb.addChunk(ParsedAcdb.BOOTUP_LOADING_CHUNK, parsed);
  }

  return parsedAcdb;
}
```

---

### 4. Entity Building

#### 4.1 Update EntityBuilderService

**File:** `packages/core/src/application/file-operations/upload-file/services/entity-builder-service.ts`

**Add Method to Extract Boot-Up Module IDs:**
```typescript
private extractBootUpModuleIds(parsedAcdb: ParsedAcdb): Set<number> {
  const bootUpChunk = parsedAcdb.getChunk<ParsedBootUpLoadingChunk>(
    ParsedAcdb.BOOTUP_LOADING_CHUNK
  );

  if (!bootUpChunk) {
    return new Set<number>();
  }

  const bootUpModuleIds = new Set<number>();

  // Collect all module IDs from all processors
  for (const moduleIds of bootUpChunk.bootUpModules.values()) {
    for (const moduleId of moduleIds) {
      bootUpModuleIds.add(moduleId);
    }
  }

  return bootUpModuleIds;
}
```

**Update buildSpfModuleDefinitions Method:**
```typescript
async buildSpfModuleDefinitions(
  parsedAwsp: ParsedAwsp,
  parsedAcdb: ParsedAcdb,  // NEW: need ACDB for boot-up data
  fileId: number
): Promise<SpfModuleDefinition[]> {
  // Extract boot-up module IDs
  const bootUpModuleIds = this.extractBootUpModuleIds(parsedAcdb);

  const awspModuleDefs = parsedAwsp.getSpfModuleDefinitions();
  const definitions: SpfModuleDefinition[] = [];

  for (const awspDef of awspModuleDefs) {
    // Check if this module should be loaded at boot
    const isLoadedAtBootup = bootUpModuleIds.has(awspDef.moduleDefinitionId);

    const definition = new SpfModuleDefinition({
      systemId: 0, // Will be assigned by ID generation service
      moduleDefinitionId: awspDef.moduleDefinitionId,
      name: awspDef.name,
      displayName: awspDef.displayName,
      description: awspDef.description,
      groupName: awspDef.groupName,
      modSearchKeys: awspDef.modSearchKeys,
      stackSize: awspDef.stackSize,
      fileSystemId: fileId,
      parameters: awspDef.parameters,
      dataPortGroups: awspDef.dataPortGroups,
      staticControlPorts: awspDef.staticControlPorts,
      dynamicIntents: awspDef.dynamicIntents,
      processorSystemIds: [], // Will be resolved later
      containerTypesSystemIds: [], // Will be resolved later
      metaData: awspDef.metaData,
      isLoadedAtBootup,  // NEW: Set during build
    });

    definitions.push(definition);
  }

  return definitions;
}
```

#### 4.2 Add Method to Build ModuleManagerData

**Add to EntityBuilderService:**
```typescript
buildModuleManagerData(
  parsedAcdb: ParsedAcdb,
  fileId: number
): ModuleManagerData[] {
  const moduleManagerChunk = parsedAcdb.getChunk<ParsedModuleManagerChunk>(
    ParsedAcdb.MODULE_MANAGER_CHUNK
  );

  if (!moduleManagerChunk) {
    return []; // Chunk not present
  }

  const entities: ModuleManagerData[] = [];

  // Iterate through all processors and their module registrations
  for (const [procId, moduleRegistrations] of moduleManagerChunk.registrations) {
    // Resolve processor systemId
    const processorSystemId = this.foreignKeyMapper.getProcessorSystemId(procId);
    if (!processorSystemId) {
      this.logger?.logWarning({
        msg: `Processor ${procId} not found, skipping module manager data`,
        procId,
      });
      continue;
    }

    for (const [moduleId, registration] of moduleRegistrations) {
      // Resolve module definition systemId
      const moduleDefSystemId = this.foreignKeyMapper.getModuleDefinitionSystemId(moduleId);
      if (!moduleDefSystemId) {
        this.logger?.logWarning({
          msg: `Module definition ${moduleId} not found, skipping module manager data`,
          moduleId,
        });
        continue;
      }

      const entity = new ModuleManagerData(
        0, // systemId - will be assigned by ID generation service
        processorSystemId,
        moduleDefSystemId,
        registration.capi.moduleType,
        registration.interfaceType,
        registration.interfaceVersion,
        registration.capi.fileName,
        registration.capi.tag,
        fileId
      );

      entities.push(entity);
    }
  }

  return entities;
}
```

---

### 5. Persistence Layer

#### 5.1 Create ModuleManagerDataInserter

**File:** `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/bulk-import/module-manager-data/module-manager-data.inserter.ts`

```typescript
import type {EntityManager} from 'typeorm';
import type {
  ModuleManagerData,
  BulkInsertResult,
} from '@arc/core';
import {errBulkInsert, okBulkInsert} from '@arc/core';
import {
  BatchInserter,
  type RawFailure,
} from '../batch-inserter.js';
import {
  ModuleManagerDataSchema,
  type ModuleManagerDataRow,
} from '../../../entity-schema/module-manager/module-manager-data.js';

/**
 * Inserts ModuleManagerData domain entities into the database
 * using ordered bulk batch inserts.
 *
 * All insert steps are always attempted regardless of prior failures.
 */
export class ModuleManagerDataInserter {
  constructor(private readonly manager: EntityManager) {}

  /**
   * Inserts all ModuleManagerData entities.
   * Failures are collected and returned as BulkInsertError[].
   * @returns BulkInsertResult — ok if all inserts succeeded, err otherwise.
   */
  public async insert(
    entities: ModuleManagerData[]
  ): Promise<BulkInsertResult> {
    if (entities.length === 0) return okBulkInsert();

    const rawFailures: RawFailure[] = await this.insertModuleManagerData(entities);

    if (rawFailures.length === 0) {
      return okBulkInsert();
    }

    // Group failures by systemId
    const errors = this.groupRawFailures(rawFailures, entities);
    return errBulkInsert(errors);
  }

  private async insertModuleManagerData(
    entities: ModuleManagerData[]
  ): Promise<RawFailure[]> {
    const rows: ModuleManagerDataRow[] = entities.map(e => ({
      systemId: e.systemId,
      processorDefinitionSystemId: e.processorDefinitionSystemId,
      moduleDefinitionSystemId: e.moduleDefinitionSystemId,
      moduleType: e.moduleType,
      interfaceType: e.interfaceType,
      interfaceVersion: e.interfaceVersion,
      fileName: e.fileName,
      tag: e.tag,
      fileSystemId: e.fileSystemId,
    }));

    return BatchInserter.insert(
      this.manager,
      ModuleManagerDataSchema,
      rows,
      row => row.systemId
    );
  }

  private groupRawFailures(
    rawFailures: RawFailure[],
    entities: ModuleManagerData[]
  ) {
    const entityBySystemId = new Map(
      entities.map(e => [e.systemId, e])
    );

    return rawFailures.map(rf => {
      const entity = entityBySystemId.get(rf.naturalId as number);
      return {
        entity: 'ModuleManagerData',
        naturalId: String(rf.naturalId),
        code: 'INSERT_FAILED',
        message: rf.message,
        entityData: entity
          ? `procSysId=${entity.processorDefinitionSystemId}, modSysId=${entity.moduleDefinitionSystemId}`
          : undefined,
      };
    });
  }
}
```

#### 5.2 Update BulkImportRepository Interface

**File:** `packages/core/src/application/ports/persistence/repositories/bulk-import/bulk-import.repository.ts`

**Add Method:**
```typescript
export interface BulkImportRepository {
  // ... existing methods ...

  /**
   * Inserts module manager data rows in bulk.
   *
   * @param items - Module manager data with pre-assigned systemIds
   * @returns Promise resolving to the bulk insert result indicating success and any failed entities
   */
  insertModuleManagerData(
    items: readonly ModuleManagerData[]
  ): Promise<BulkInsertResult>;
}
```

#### 5.3 Update TypeOrmBulkImportRepository

**File:** `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/bulk-import/typeorm-bulk-import.repository.ts`

**Add Import:**
```typescript
import {ModuleManagerDataInserter} from './module-manager-data/module-manager-data.inserter.js';
import type {ModuleManagerData} from '@arc/core';
```

**Add Method:**
```typescript
export class TypeOrmBulkImportRepository implements BulkImportRepository {
  // ... existing methods ...

  insertModuleManagerData(
    items: readonly ModuleManagerData[]
  ): Promise<BulkInsertResult> {
    return new ModuleManagerDataInserter(this.manager).insert([...items]);
  }
}
```

---

### 6. Upload Flow Integration

#### 6.1 Update UploadFileOrchestrator

**File:** `packages/core/src/application/file-operations/upload-file/services/upload-file-orchestrator.ts`

**Update persistEntitiesInHierarchicalOrder Method:**
```typescript
private async persistEntitiesInHierarchicalOrder(): Promise<void> {
  const bulkRepo = this.uow.getBulkImportRepository();

  // Phase 1: Insert KeyDefinitions (no dependencies)
  await this.buildAndInsertKeyDefinitions(bulkRepo);

  // Phase 2: Insert ProcessorDefinitions (no dependencies)
  await this.buildAndInsertProcessorDefinitions(bulkRepo);

  // Phase 3: Insert SpfModuleDefinitions (with isLoadedAtBootup already set)
  await this.buildAndInsertSpfModuleDefinitions(bulkRepo);

  // Phase 4: Insert ModuleManagerData (depends on processors + module definitions)
  await this.buildAndInsertModuleManagerData(bulkRepo);

  // Phase 5: Insert Subgraphs (no dependencies)
  await this.buildAndInsertSubgraphs(bulkRepo);

  // Phase 6: Insert Containers (no dependencies)
  await this.buildAndInsertContainers(bulkRepo);

  // Phase 7: Insert SpfModules (depends on definitions, subgraphs, containers)
  await this.buildAndInsertSpfModules(bulkRepo);

  // Phase 8: Insert DataLinks (depends on modules)
  await this.buildAndInsertDataLinks(bulkRepo);

  // Phase 9: Insert Usecases (depends on value definitions)
  await this.buildAndInsertUsecases(bulkRepo);
}
```

**Update buildAndInsertSpfModuleDefinitions Method:**
```typescript
private async buildAndInsertSpfModuleDefinitions(
  bulkRepo: BulkImportRepository
): Promise<void> {
  this.profiler?.start('SPF_MODULE_DEFINITION_BUILDING');

  // Pass parsedAcdb to get boot-up data
  const definitions = await this.builderService.buildSpfModuleDefinitions(
    this.parsedAwsp,
    this.parsedAcdb,  // NEW: pass ACDB for boot-up data
    this.currentFileId
  );

  this.profiler?.end('SPF_MODULE_DEFINITION_BUILDING', {
    entityCount: definitions.length,
  });

  // Assign systemIds
  await this.entitySystemIdService.assignSystemIdsToSpfModuleDefinitions(
    definitions,
    this.currentFileId
  );

  this.profiler?.start('SPF_MODULE_DEFINITION_INSERT');

  const result = await bulkRepo.insertSpfModuleDefinitions(definitions);

  this.profiler?.end('SPF_MODULE_DEFINITION_INSERT', {
    entityCount: definitions.length,
    successCount: result.isOk ? definitions.length : 0,
  });

  // Store mappings for foreign key resolution
  this.foreignKeyMapper.setModuleDefinitionMappings(result);
}
```

**Add New Method for ModuleManagerData:**
```typescript
private async buildAndInsertModuleManagerData(
  bulkRepo: BulkImportRepository
): Promise<void> {
  this.profiler?.start('MODULE_MANAGER_DATA_BUILDING');

  const entities = this.builderService.buildModuleManagerData(
    this.parsedAcdb,
    this.currentFileId
  );

  this.profiler?.end('MODULE_MANAGER_DATA_BUILDING', {
    entityCount: entities.length,
  });

  if (entities.length === 0) {
    this.logger?.logInfo({
      msg: 'No module manager data to insert (chunk not present or empty)',
      fileId: this.currentFileId,
    });
    return;
  }

  // Assign systemIds
  await this.entitySystemIdService.assignSystemIdsToModuleManagerData(
    entities,
    this.currentFileId
  );

  this.profiler?.start('MODULE_MANAGER_DATA_INSERT');

  const result = await bulkRepo.insertModuleManagerData(entities);

  this.profiler?.end('MODULE_MANAGER_DATA_INSERT', {
    entityCount: entities.length,
    successCount: result.isOk ? entities.length : 0,
  });

  if (result.isErr) {
    this.logger?.logWarning({
      msg: 'Some module manager data failed to insert',
      fileId: this.currentFileId,
      errorCount: result.error.length,
    });
  }
}
```

#### 6.2 Update ForeignKeyMapper

**File:** `packages/core/src/application/file-operations/upload-file/services/foreign-key-mapper.ts`

**Add Mappings:**
```typescript
export class ForeignKeyMapper {
  // ... existing mappings ...

  private processorMappings = new Map<number, number>();
  private moduleDefinitionMappings = new Map<number, number>();

  // ... existing methods ...

  setProcessorMappings(result: BulkInsertResult): void {
    if (result.isErr) return;

    for (const item of result.value) {
      if (item.success && item.idMapping) {
        this.processorMappings.set(
          item.idMapping.naturalId,
          item.idMapping.systemId
        );
      }
    }
  }

  getProcessorSystemId(processorId: number): number | undefined {
    return this.processorMappings.get(processorId);
  }

  setModuleDefinitionMappings(result: BulkInsertResult): void {
    if (result.isErr) return;

    for (const item of result.value) {
      if (item.success && item.idMapping) {
        this.moduleDefinitionMappings.set(
          item.idMapping.naturalId,
          item.idMapping.systemId
        );
      }
    }
  }

  getModuleDefinitionSystemId(moduleId: number): number | undefined {
    return this.moduleDefinitionMappings.get(moduleId);
  }
}
```

#### 6.3 Update EntitySystemIdService

**File:** `packages/core/src/application/file-operations/upload-file/services/entity-system-id-service.ts`

**Add Method:**
```typescript
export class EntitySystemIdService {
  // ... existing methods ...

  async assignSystemIdsToModuleManagerData(
    entities: ModuleManagerData[],
    fileId: number
  ): Promise<void> {
    for (const entity of entities) {
      const systemId = await this.idGeneration.generateId(fileId);
      (entity as any).systemId = systemId;
    }
  }
}
```

---

### 7. Error Handling

#### 7.1 Continue-on-Error Semantics

Module manager data insertion follows the same continue-on-error pattern as other bulk operations:

- **Missing chunks**: Gracefully handled, no error logged (chunks are optional)
- **Empty chunks**: Gracefully handled, info logged
- **Parse failures**: Logged as warnings, upload continues
- **Insert failures**: Individual failures collected, logged as warnings, upload continues
- **Foreign key resolution failures**: Logged as warnings, affected entities skipped

#### 7.2 Logging Strategy

**Info Logs:**
- Chunk not present or empty
- Successful insertion counts

**Warning Logs:**
- Processor not found during foreign key resolution
- Module definition not found during foreign key resolution
- Individual entity insertion failures

**Error Logs:**
- None (failures are non-fatal)

---

### 8. Testing Strategy

#### 8.1 Unit Tests

**Chunk Parsers:**
- Parse valid MODM chunk with multiple processors and modules
- Parse valid BTUP chunk with multiple processors and modules
- Handle empty chunks gracefully
- Handle missing chunks gracefully
- Validate data structure correctness

**Entity Builders:**
- Build ModuleManagerData with valid foreign keys
- Handle missing processor definitions
- Handle missing module definitions
- Set isLoadedAtBootup correctly based on BTUP data
- Handle modules in BTUP but not in MODM

**Inserters:**
- Batch insert success
- Individual insert fallback on batch failure
- Collect and group failures correctly
- Handle empty entity lists

#### 8.2 Integration Tests

**Upload Flow:**
- Upload file with both MODM and BTUP chunks
- Upload file with only MODM chunk
- Upload file with only BTUP chunk
- Upload file with neither chunk
- Verify module_manager_data rows created correctly
- Verify isLoadedAtBootup flags set correctly
- Verify foreign key relationships

**Foreign Key Resolution:**
- Verify processor systemIds resolved correctly
- Verify module definition systemIds resolved correctly
- Verify orphaned data handled gracefully

---

### 9. Migration Considerations

#### 9.1 Database Migration

**Add Migration Script:**
```sql
-- Add columns to module_manager_data
ALTER TABLE module_manager_data
  ADD COLUMN processor_definition_system_id INTEGER NOT NULL,
  ADD COLUMN module_definition_system_id INTEGER NOT NULL,
  ADD COLUMN file_system_id INTEGER NOT NULL;

-- Add foreign key constraints
ALTER TABLE module_manager_data
  ADD CONSTRAINT fk_module_manager_processor
    FOREIGN KEY (processor_definition_system_id)
    REFERENCES processor_definitions(system_id)
    ON DELETE CASCADE;

ALTER TABLE module_manager_data
  ADD CONSTRAINT fk_module_manager_module_def
    FOREIGN KEY (module_definition_system_id)
    REFERENCES spf_module_definitions(system_id)
    ON DELETE CASCADE;

ALTER TABLE module_manager_data
  ADD CONSTRAINT fk_module_manager_file
    FOREIGN KEY (file_system_id)
    REFERENCES file_system(system_id)
    ON DELETE CASCADE;

-- Add column to spf_module_definitions
ALTER TABLE spf_module_definitions
  ADD COLUMN is_loaded_at_bootup BOOLEAN NOT NULL DEFAULT 0;
```

#### 9.2 Backward Compatibility

- New columns have sensible defaults
- Existing files without these chunks continue to work
- API response DTO already has `isLoadedAtBootup` field (currently hardcoded)
- No breaking changes to existing APIs

---

### 10. Performance Considerations

#### 10.1 Parsing Performance

- Both chunks are parsed in a single pass during ACDB parsing
- No additional file I/O required
- Memory footprint: O(P × M) where P = processors, M = modules per processor

#### 10.2 Insertion Performance

- Batch insertion used for module_manager_data (fast path)
- Individual fallback only on batch failure (rare)
- Foreign key lookups are O(1) via Map-based ForeignKeyMapper
- No separate UPDATE queries needed (isLoadedAtBootup set during build)

#### 10.3 Query Performance

- Foreign key indexes enable efficient JOINs
- Composite index on (processor_definition_system_id, module_definition_system_id) recommended for lookups

---

### 11. API Layer Updates

#### 11.1 SpfModuleDefinitionResponseDto

**File:** `packages/api/src/presentation/rest/modules/definition/module-definition/dto/spf-module-definition-response.dto.ts`

**Current State:**
```typescript
@ApiProperty({description: 'Indicates if the module is loaded at bootup'})
isLoadedAtBootup!: boolean;
```

**No changes needed** - field already exists, just needs to be populated from persisted data instead of hardcoded value.

#### 11.2 Query Service Updates

Update the query service that populates `SpfModuleDefinitionResponseDto` to read `isLoadedAtBootup` from the database instead of hardcoding it.

---

### 12. Summary

This design implements end-to-end parsing and persistence for Module Manager and Boot-Up Loading data:

**Key Features:**
- ✅ Parses MODM and BTUP chunks from ACDB files
- ✅ Stores processor-module registration metadata in `module_manager_data` table
- ✅ Sets `isLoadedAtBootup` flag on module definitions during build phase
- ✅ Follows existing bulk inserter pattern with continue-on-error semantics
- ✅ Uses foreign keys for referential integrity
- ✅ Handles optional/missing chunks gracefully
- ✅ Maintains backward compatibility

**Processing Flow:**
1. Parse ACDB → extract MODM + BTUP chunks
2. Parse AWSP → extract module definitions
3. Build SpfModuleDefinitions with `isLoadedAtBootup` set from BTUP data
4. Insert definitions
5. Build ModuleManagerData with foreign keys resolved
6. Insert module manager data
7. Continue with remaining entities

**Benefits:**
- Complete module metadata available for UI/API
- Processor-specific registration data preserved
- Boot-up loading information persisted
- Production-ready with proper error handling and logging

---

## Document Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-06-01 | Architecture Team | Initial design document for module manager data integration |

---

**End of Document**