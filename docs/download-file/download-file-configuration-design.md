<!--
Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
SPDX-License-Identifier: BSD-3-Clause
-->

# Download File: Configuration Data Design

## Document Information
- **Version**: 1.0
- **Date**: July 2026
- **Status**: Approved for Implementation
- **Related Documents**:
  - [Configuration Data Upload Design](../upload-file/configuration-data-design.md)
  - [Download File Design](./download-file-design.md)
  - [Download File: Key Definitions Design](./download-file-key-definitions-design.md)

---

## Table of Contents
1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Database Schema](#3-database-schema)
4. [Data Flow](#4-data-flow)
5. [Field Mapping Specification](#5-field-mapping-specification)
6. [Implementation Components](#6-implementation-components)
7. [Testing Strategy](#7-testing-strategy)
8. [Implementation Checklist](#8-implementation-checklist)

---

## 1) Overview

### 1.1 Purpose

Replace the `'{}'` placeholder in `configuration.json` (inside the downloaded `.awsp` ZIP) with the actual configuration data persisted during upload. Without this fix, re-uploading a downloaded `.awsp` fails with Zod validation errors on all four required fields of `ConfigurationSchema`.

### 1.2 Key Requirements

- ✅ **Round-Trip Fidelity**: The emitted `configuration.json` must pass the same `ConfigurationSchema` Zod validation used during upload
- ✅ **Wire Format Preservation**: `portStrategy` must be re-wrapped as `{strategy: value}` and `defaultProcessorDomain` as `{id: "0x..."}` — these are the wire shapes that `PortStrategySchema` and `ProcessorDomainIdSchema` expect
- ✅ **No New Zod/Class Machinery**: `rtc_config` and `alsa_lib_config` are stored as `toJSON()` output (the wire format); they are `JSON.parse()`-d and embedded directly — no new serializer classes needed
- ✅ **Follow Established Patterns**: Mirrors the DB query + read model + serializer pattern used by `readKeyDefinitions()` and other read methods
- ✅ **No New Tables**: The `configuration` table is extended by the upload-side design; this design only reads from it

### 1.3 Scope

**In Scope:**
- `ConfigurationDownloadModel` read model interface in `BulkReadQueryService` port
- `readConfiguration(fileSystemId)` method on `BulkReadQueryService` port and `TypeOrmBulkReadQueryService` implementation
- Wiring into `readAllEntitiesForFile()` via the existing `Promise.all`
- Updated `AwspFileSerializer.buildConfigurationJson()` to serialize proper `configuration.json`

**Out of Scope:**
- `persistence.json`, `fileinfo.json` — separate features
- `definitions.json` — covered by key definitions and module definitions designs

---

## 2) Architecture

### 2.1 High-Level Flow

```
┌─────────────────────────────────────────────────────────────┐
│  GET /arc-api/v1/projects/:projectId/download-files         │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│           DownloadFileOrchestrator                           │
│  • readAllEntitiesForFile(fileSystemId)                      │
│    → runs all DB queries in parallel (Promise.all)           │
│  • Calls AwspFileSerializer.serialize(entities)              │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│           TypeOrmBulkReadQueryService                        │
│                                                              │
│  readConfiguration(fileSystemId)                             │
│    SELECT port_strategy, default_processor_domain,           │
│           rtc_config, alsa_lib_config                        │
│    FROM configuration WHERE file_system_id = ?               │
│    → ConfigurationDownloadModel | null                       │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│           AwspFileSerializer.serialize(entities)             │
│                                                              │
│  buildConfigurationJson(entities):                           │
│    portStrategy        → {strategy: portStrategy}            │
│    defaultProcessorDomain → {id: "0x00000002"}               │
│    rtc                 → JSON.parse(rtcConfig)               │
│    alsaLib             → JSON.parse(alsaLibConfig)           │
│    fallback: '{}'  when configurationData is absent          │
│                                                              │
│  FILES.set(CONFIGURATION_JSON, buildConfigurationJson(...))  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Pattern Alignment with Other Download Features

| Aspect | Key Definitions | Configuration |
|--------|-----------------|---------------|
| **Repository method** | `readKeyDefinitions()` | `readConfiguration()` |
| **Read model** | `KeyDefinitionDownloadModel` | `ConfigurationDownloadModel` |
| **Transform layer** | `AwspDefinitionsMapper` | `buildConfigurationJson()` inline in serializer (trivial) |
| **Output** | JSON in `definitions.json` | JSON in `configuration.json` |
| **Parallel** | Yes (in `Promise.all`) | Yes (added to `Promise.all`) |

No separate mapper class is needed — the configuration transform is a single object literal with two field rewrites and two JSON.parse calls.

---

## 3) Database Schema

```typescript
// configuration table (post-migration)
interface ConfigurationRow extends EntityBaseRow {
  fileSystemId: number;                  // UNIQUE FK → files.system_id  CASCADE
  portStrategy: ModulePortStrategy;      // simple-enum
  defaultProcessorDomain: number;        // integer
  rtcConfig: string;                     // text — JSON.stringify(RtcConfig.toJSON())
  alsaLibConfig: string;                 // text — JSON.stringify(AlsaLibConfig.toJSON())
}
```

---

## 4) Data Flow

### 4.1 Upload Flow (Context)

```
configuration.json (from .awsp ZIP)
  ↓
Configuration.fromJSON() → ConfigurationSchema.parse()
  • portStrategy unwrapped from {strategy: value}
  • defaultProcessorDomain unwrapped from {id: hex}
  • rtc + alsaLib hydrated to class instances
  ↓
ConfigurationData (in-memory)
  ↓
UploadFileOrchestrator Phase 8 → bulkRepo.insertConfiguration()
  INSERT INTO configuration (
    system_id, file_system_id, port_strategy,
    default_processor_domain,
    rtc_config,       -- JSON.stringify(configData.rtc.toJSON())
    alsa_lib_config   -- JSON.stringify(configData.alsaLib.toJSON())
  )
```

### 4.2 Download Flow (This Design)

```
TypeOrmBulkReadQueryService.readConfiguration(fileSystemId)
  SELECT port_strategy, default_processor_domain, rtc_config, alsa_lib_config
  FROM configuration WHERE file_system_id = ?
  → ConfigurationDownloadModel (or null)
  ↓
AwspFileSerializer.buildConfigurationJson(entities)
  configJson = {
    portStrategy:           {strategy: config.portStrategy},
    defaultProcessorDomain: {id: "0x" + hex(config.defaultProcessorDomain)},
    rtc:                    JSON.parse(config.rtcConfig),
    alsaLib:                JSON.parse(config.alsaLibConfig),
  }
  ↓
configuration.json = JSON.stringify(configJson)  →  .awsp ZIP
```

---

## 5) Field Mapping Specification

### 5.1 DB → Read Model → Wire JSON

| DB Column | `ConfigurationDownloadModel` field | Wire JSON field | Notes |
|---|---|---|---|
| `port_strategy` | `portStrategy: ModulePortStrategy` | `{strategy: portStrategy}` | Re-wrap for `PortStrategySchema` |
| `default_processor_domain` | `defaultProcessorDomain: number` | `{id: "0x00000002"}` | Re-wrap with hex string for `ProcessorDomainIdSchema` |
| `rtc_config` | `rtcConfig: string` | `JSON.parse(rtcConfig)` | Already wire-format from `RtcConfig.toJSON()` |
| `alsa_lib_config` | `alsaLibConfig: string` | `JSON.parse(alsaLibConfig)` | Already wire-format from `AlsaLibConfig.toJSON()` |

### 5.2 Hex Encoding for defaultProcessorDomain

`ProcessorDomainIdSchema` expects `{id: HexIdSchema}` where `HexIdSchema` is a hex string like `"0x00000002"`:

```typescript
const hexId = `0x${config.defaultProcessorDomain.toString(16).toUpperCase().padStart(8, '0')}`;
```

---

## 6) Implementation Components

### 6.1 ConfigurationDownloadModel Interface

**File**: `packages/core/src/application/ports/persistence/query-services/bulk-read/bulk-read-query-service.ts`

```typescript
export interface ConfigurationDownloadModel {
  portStrategy: ModulePortStrategy;
  defaultProcessorDomain: number;
  rtcConfig: string;      // raw JSON string — RtcConfig wire format
  alsaLibConfig: string;  // raw JSON string — AlsaLibConfig wire format
}
```

`DownloadEntities` extended with:
```typescript
configurationData?: ConfigurationDownloadModel;
```

`BulkReadQueryService` interface extended with:
```typescript
readConfiguration(fileSystemId: number): Promise<ConfigurationDownloadModel | null>;
```

### 6.2 TypeOrmBulkReadQueryService — readConfiguration()

**File**: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/bulk-read/typeorm-bulk-read-query-service.ts`

```typescript
async readConfiguration(fileSystemId: number): Promise<ConfigurationDownloadModel | null> {
  const row = await this.dataSource
    .getRepository(ENTITY_NAMES.Configuration)
    .createQueryBuilder('c')
    .select(['c.portStrategy', 'c.defaultProcessorDomain', 'c.rtcConfig', 'c.alsaLibConfig'])
    .where('c.fileSystemId = :fileSystemId', {fileSystemId})
    .getOne();

  if (!row) return null;
  return {
    portStrategy: row.portStrategy,
    defaultProcessorDomain: row.defaultProcessorDomain,
    rtcConfig: row.rtcConfig,
    alsaLibConfig: row.alsaLibConfig,
  };
}
```

Wired into `readAllEntitiesForFile()` via the existing `Promise.all`, returning `configurationData: configurationData ?? undefined`.

### 6.3 AwspFileSerializer — buildConfigurationJson()

**File**: `packages/core/src/application/file-operations/download-file/services/awsp-file-serializer.ts`

Private method added:
```typescript
private buildConfigurationJson(entities: DownloadEntities): string {
  const config = entities.configurationData;
  if (!config) return '{}';

  const hexId = `0x${config.defaultProcessorDomain.toString(16).toUpperCase().padStart(8, '0')}`;
  return JSON.stringify({
    portStrategy: {strategy: config.portStrategy},
    defaultProcessorDomain: {id: hexId},
    rtc: JSON.parse(config.rtcConfig) as unknown,
    alsaLib: JSON.parse(config.alsaLibConfig) as unknown,
  });
}
```

`FILES.set(CONFIGURATION_JSON, '{}')` replaced with `FILES.set(CONFIGURATION_JSON, this.buildConfigurationJson(entities))`.

---

## 7) Testing Strategy

### 7.1 Unit Tests

**AwspFileSerializer** (`packages/core/tests/unit/`):
- When `entities.configurationData` is populated, assert the output `configuration.json` parses successfully through `ConfigurationSchema` (round-trip fidelity)
- Assert `portStrategy` is re-wrapped as `{strategy: value}`
- Assert `defaultProcessorDomain` is emitted as `{id: "0x..."}` hex string
- When `entities.configurationData` is `undefined`, assert output is `'{}'`

### 7.2 Integration Tests

**readConfiguration** (`packages/infrastructure/persistence/tests/integration/`):
- Seed a `configuration` row; assert `readConfiguration()` returns correct model
- Seed two files with different configurations; assert each query returns only its own data
- No `configuration` row for fileSystemId → returns `null`

### 7.3 E2E Round-Trip

**download-file.e2e-spec.ts** (existing):
- The existing test uploads, downloads (saving both `.acdb` and `.awsp`), re-uploads the downloaded `.awsp`, and compares file headers
- After this fix the re-upload must no longer throw Zod validation errors on `configuration.json`
- Run: `pnpm test:e2e --filter=api -- download-file`

---

## 8) Implementation Checklist

- [x] `ConfigurationDownloadModel` interface added to `bulk-read-query-service.ts`
- [x] `configurationData?` field added to `DownloadEntities`
- [x] `readConfiguration()` signature added to `BulkReadQueryService` interface
- [x] `readConfiguration()` implemented in `TypeOrmBulkReadQueryService`
- [x] `readConfiguration()` wired into `readAllEntitiesForFile()` Promise.all
- [x] `buildConfigurationJson()` private method added to `AwspFileSerializer`
- [x] `CONFIGURATION_JSON` file content replaced in `AwspFileSerializer.serialize()`
