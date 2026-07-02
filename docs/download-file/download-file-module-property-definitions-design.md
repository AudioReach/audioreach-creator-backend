<!--
Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
SPDX-License-Identifier: BSD-3-Clause
-->

# Download File: Module and Property Definitions JSON Design

## Document Information
- **Version**: 1.0
- **Date**: June 2026
- **Status**: Draft
- **Related Documents**:
  - [Download File: Key Definitions Design](./download-file-key-definitions-design.md)
  - [Download File: Usecase Data Design](./download-file-usecase-data-design.md)
  - [Definitions Bulk Inserters Design](../definitions-bulk-inserters-design.md)

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

Populate the `spfModuleDefinitions`, `driverModuleDefinitions`, `spfPropertyDefinitions`, and `driverPropertyDefinitions` blocks in `definitions.json` inside the downloaded `.awsp` ZIP file. These blocks currently return empty arrays (`[]`). This design replaces those placeholders with data queried from the database and serialized using the **existing** awsp-serializer classes.

### 1.2 Key Requirements

- ✅ **Reuse Serializers**: Use existing `AwspSpfModuleDefinition`, `DriverModuleDefinition`, `SpfPropertyDefinition`, and `DriverPropertyDefinition` classes — no changes to the serializer layer
- ✅ **Round-Trip Fidelity**: Data written to `definitions.json` must pass the same Zod schemas used during upload (`AwspSpfModuleDefinitionSchema`, `AwspDriverModuleDefinitionSchema`, `SpfPropertyDefinitionSchema`, `DriverPropertyDefinitionSchema`)
- ✅ **Natural IDs**: Use natural IDs (`module_definition_id`, `param_id`, `property_id`) not system IDs
- ✅ **Follow Established Patterns**: Mirror the DB query + read model + serializer pattern used by `readKeyDefinitions()` and `readTagDefinitions()`
- ✅ **No Schema Changes**: No new TypeORM entity schemas or DB migrations required
- ✅ **React Native Compatible**: No new worker threads introduced — serialization is lightweight JSON

### 1.3 Scope

**In Scope:**
- `spfModuleDefinitions` block — SPF module definitions with parameters, ports, intents, processor/container-type links
- `driverModuleDefinitions` block — driver module definitions with parameters
- `spfPropertyDefinitions` block — subgraph and container property definitions (SG_CFG and CONTAINTER_CFG categories)
- `driverPropertyDefinitions` block — driver module property structures (from `module_property_definitions`)
- Four new read methods on `BulkReadRepository` and `TypeOrmBulkReadRepository`
- Extended `AwspDefinitionsMapper` with four new mapper methods
- Updated `AwspFileSerializer` to write real JSON instead of `[]`

**Out of Scope:**
- `supportedProcessors`, `supportedContainerTypes` — still empty arrays (separate feature)
- `configuration.json`, `persistence.json`, `fileinfo.json` — separate features

### 1.4 Data Fidelity Notes

Several AWSP fields are **not persisted during upload** and therefore cannot be round-tripped. These fields will be omitted (left `undefined`) or defaulted during download:

**SPF Module Definition** — fields not in DB (all are `.optional()` in Zod schema):
- `vocoderModuleType`, `directionType`, `mdfModuleType`, `majorModuleType`, `buildType`, `islandFriendly`, `rtmLogCode`, `hasNeuralNetParam`, `isOffloadable`, `builtIn`, `replacedBy`, `deprecated`, `stackSize` (stored as 0), `customModuleInfo`

**SPF Param Definition** — fields not in DB (all are `.optional()` in Zod schema):
- `isNeuralNet`, `isOffloaded`, `isHwAccel`, `isHwAccelEnable`, `isHidden`

**Driver Module Definition** — fully round-trippable: `id`, `name`, `description`, `groupName`, `paramDefinitions`

**Driver Param Definition** — `toolPolicies` and `pidType` not stored (defaulted to `[]` / `'None'`)

**SPF Property Definitions** — `categoryId` and `apmModuleInstanceId` are NOT stored in the DB (the upload path discards them when building `SubgraphPropertyDefinition`). These fields are **required positive integers** in `SpfPropertyDefinitionSchema` — a default of `0` would **fail Zod validation**. This is a known round-trip fidelity gap.

> **SPF Property Definition Limitation**: The `spfPropertyDefinitions` block output from download will NOT pass `SpfPropertyDefinitionSchema` validation due to missing `categoryId` and `apmModuleInstanceId`. A future DB migration is needed to add these columns to `subgraph_property_definitions` and `container_property_definitions`. For now, the download will output `categoryId: 1` and `apmModuleInstanceId: 1` as sentinel values that satisfy the `z.number().int().positive()` constraint, but these are not the original values.

**Driver Property Definitions** — fully round-trippable using `module_property_definitions` elements

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
│              DownloadFileHandler                             │
│  • Resolves fileSystemId from projectId                      │
│  • Delegates to DownloadFileOrchestrator                     │
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
│           TypeOrmBulkReadRepository                          │
│                                                              │
│  NEW: readSpfModuleDefinitions(fileSystemId)                 │
│    Query 1: spf_module_definitions WHERE file_system_id = ? │
│    Query 2: spf_module_parameter_definitions JOIN ...        │
│    Query 3: data_port_groups JOIN ...                        │
│    Query 4: data_port_definitions JOIN ...                   │
│    Query 5: static_control_port_definitions JOIN ...         │
│    Query 6: static_intent_definitions JOIN ...               │
│    Query 7: dynamic_intent_definitions JOIN ...              │
│    Query 8: module_definition_processor_definitions JOIN ... │
│    Query 9: module_definition_container_types JOIN ...       │
│    → SpfModuleDefinitionDownloadModel[]                      │
│                                                              │
│  NEW: readDriverModuleDefinitions(fileSystemId)              │
│    Query 1: driver_module_definitions WHERE file_system_id  │
│    Query 2: driver_module_parameter_definitions JOIN ...     │
│    → DriverModuleDefinitionDownloadModel[]                   │
│                                                              │
│  NEW: readSpfPropertyDefinitions(fileSystemId)               │
│    Query 1: subgraph_property_definitions (SG_CFG)           │
│    Query 2: container_property_definitions (CONTAINTER_CFG) │
│    → SpfPropertyDefinitionDownloadModel[]                    │
│                                                              │
│  NEW: readDriverPropertyDefinitions(fileSystemId)            │
│    Query 1: module_property_definitions JOIN ...             │
│    → DriverPropertyDefinitionDownloadModel[]                 │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│           AwspFileSerializer.serialize(entities)             │
│                                                              │
│  EXTENDED: AwspDefinitionsMapper                             │
│    toAwspSpfModuleDefinitions(models) → AwspSpfModDef[]     │
│    toDriverModuleDefinitions(models) → DriverModDef[]        │
│    toSpfPropertyDefinitions(models) → SpfPropertyDef[]       │
│    toDriverPropertyDefinitions(models) → DriverPropertyDef[] │
│                                                              │
│  EXISTING toJSON() on each instance produces the JSON shape  │
│  ZIP: { "definitions.json": JSON.stringify(definitions) }   │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Pattern Alignment with Key Definitions

| Aspect | Key / Tag Definitions | Module / Property Definitions |
|--------|-----------------------|-------------------------------|
| **Repository method** | `readKeyDefinitions()` | `readSpfModuleDefinitions()` etc. |
| **Read model interface** | `KeyDefinitionDownloadModel` | `SpfModuleDefinitionDownloadModel` etc. |
| **Transform layer** | `AwspDefinitionsMapper` (extended) | Same `AwspDefinitionsMapper` |
| **Output format** | JSON in `definitions.json` | JSON in `definitions.json` |
| **Parallelization** | Parallel DB queries via `Promise.all` | Same — all 9+2+2+2 queries run in parallel |
| **Serializer classes** | `AwspKeyDefinition.toJSON()` (existing, reused) | `AwspSpfModuleDefinition.toJSON()` (existing, reused) |

---

## 3) Database Schema

### 3.1 SPF Module Definition Tables

```typescript
// spf_module_definitions table
interface SpfModuleDefRow {
  systemId: number;              // PK (used to join child tables)
  moduleDefinitionId: number;    // Natural ID → AwspSpfModuleDefinition.id
  fileSystemId: number;          // FK to arc_db_file (scope filter)
  name: string;                  // → AwspSpfModuleDefinition.name
  displayName?: string;          // → AwspSpfModuleDefinition.displayName
  description?: string;          // → AwspSpfModuleDefinition.description
  groupName?: string;            // → AwspSpfModuleDefinition.groupName
  modSearchKeys?: string;        // → AwspSpfModuleDefinition.searchKeys
  stackSize: number;             // → AwspSpfModuleDefinition.stackSize
  metadata?: string;             // Not exposed in AWSP output
  isLoadedAtBootup: boolean;     // Not in AWSP output (internal)
}

// spf_module_parameter_definitions table
interface SpfModuleParamDefRow {
  systemId: number;
  paramId: number;               // Natural ID → AwspParamDefinition.id
  name?: string;                 // → AwspParamDefinition.name
  description?: string;          // → AwspParamDefinition.description
  maxSize: number;               // → AwspParamDefinition.maxSize
  pidType: string;               // → AwspParamDefinition.pidType
  isPersistent: boolean;         // Not in AWSP output (internal)
  elementsStructure: string;     // JSON → AwspParamDefinition.elements (parsed)
  isReadOnly: boolean;           // → AwspParamDefinition.isReadOnly
  toolPolicies?: string;         // JSON array → AwspParamDefinition.toolPolicies

  spfModuleDefinitionSystemId: number; // FK to spf_module_definitions.system_id
}

// data_port_groups table
interface DataPortGroupRow {
  systemId: number;
  maxAllowedPortCount: number;   // → AwspDataPortsInfo.maxPortCount
  portIoType: 'Input' | 'Output'; // Determines inputPortsInfo vs outputPortsInfo

  moduleDefinitionSystemId: number; // FK to spf_module_definitions.system_id
}

// data_port_definitions table
interface DataPortDefRow {
  systemId: number;
  dataPortId: number;            // Natural ID → AwspPort.id
  name?: string;                 // → AwspPort.name

  dataPortGroupSystemId: number; // FK to data_port_groups.system_id
}

// static_control_port_definitions table
interface StaticControlPortDefRow {
  systemId: number;
  portId: number;                // → AwspStaticControlPort.id
  portName: string;              // → AwspStaticControlPort.name

  moduleDefinitionSystemId: number; // FK to spf_module_definitions.system_id
}

// static_intent_definitions table
interface StaticIntentDefRow {
  systemId: number;
  intentId: number;              // → AwspIntent.id
  name: string;                  // → AwspIntent.name

  staticControlPortDefinitionSystemId: number; // FK to static_control_port_definitions
}

// dynamic_intent_definitions table
interface DynamicIntentDefRow {
  systemId: number;
  intentId: number;              // → AwspIntent.id
  name: string;                  // → AwspIntent.name
  maxPort: number;               // → AwspIntent.maxPort

  moduleDefinitionSystemId: number; // FK to spf_module_definitions.system_id
}

// module_definition_processor_definitions table (join table)
interface ModuleDefProcessorLinkRow {
  moduleDefinitionSystemId: number; // FK to spf_module_definitions.system_id
  processorDefinitionSystemId: number; // FK to processor_definitions.system_id
}

// processor_definitions table
interface ProcessorDefRow {
  systemId: number;
  processorDefinitionId: number; // Natural ID → AwspSpfModuleDefinition.supportedProcessorIds[]
}

// module_definition_container_types table (join table)
interface ModuleDefContainerTypeLinkRow {
  moduleDefinitionSystemId: number; // FK to spf_module_definitions.system_id
  containerTypeSystemId: number;    // FK to container_type_definitions.system_id
}

// container_types table
interface ContainerTypeRow {
  systemId: number;
  value: number;                 // Natural ID → AwspSpfModuleDefinition.supportedContainerTypes[]
}
```

### 3.2 Driver Module Definition Tables

```typescript
// driver_module_definitions table
interface DriverModuleDefRow {
  systemId: number;              // PK (used to join child tables)
  moduleDefinitionId: number;    // Natural ID → DriverModuleDefinition.id
  fileSystemId: number;          // FK to arc_db_file (scope filter)
  name: string;                  // → DriverModuleDefinition.name
  description?: string;          // → DriverModuleDefinition.description
  groupName?: string;            // → DriverModuleDefinition.groupName
}

// driver_module_parameter_definitions table
interface DriverModuleParamDefRow {
  systemId: number;
  parameterId: number;           // Natural ID → AwspParamDefinition.id
  name?: string;                 // → AwspParamDefinition.name
  description?: string;          // → AwspParamDefinition.description
  maxSize: number;               // → AwspParamDefinition.maxSize
  paramStructure: string;        // JSON → AwspParamDefinition.elements (parsed)

  driverModuleDefinitionSystemId: number; // FK to driver_module_definitions.system_id
}
```

### 3.3 Property Definition Tables

```typescript
// subgraph_property_definitions table (stores SPF SG_CFG properties)
interface SubgraphPropertyRow {
  systemId: number;
  propertyId: number;            // Natural ID → SpfPropertyDefinition.id
  name: string;                  // → SpfPropertyDefinition.name
  description?: string;          // → SpfPropertyDefinition.description
  maxSize: number;               // → SpfPropertyDefinition.maxSize
  elementsStructure: string;     // JSON → SpfPropertyDefinition.elements (parsed)
  isVoice: boolean;              // → SpfPropertyDefinition.isVoice
  // propertyType = 'spf' (all rows) → categoryName = 'SG_CFG'
  // apmModuleInstanceId: NOT stored → use 0 as placeholder
}

// container_property_definitions table (stores SPF CONTAINTER_CFG properties)
interface ContainerPropertyRow {
  systemId: number;
  propertyId: number;            // Natural ID → SpfPropertyDefinition.id
  name: string;                  // → SpfPropertyDefinition.name
  description?: string;          // → SpfPropertyDefinition.description
  maxSize: number;               // → SpfPropertyDefinition.maxSize
  elementsStructure: string;     // JSON → SpfPropertyDefinition.elements (parsed)
  // propertyType = 'spf' → categoryName = 'CONTAINTER_CFG'
  // apmModuleInstanceId: NOT stored → use 0 as placeholder
}

// module_property_definitions table (stores driver property structures)
// Note: These are referenced by spf_modules via spf_module_properties_data, but the
// definitions themselves represent reusable property schemas (elements + structure).
// They are NOT scoped by file_system_id — they are global catalogue entries.
interface ModulePropertyDefRow {
  systemId: number;
  propertyId: number;            // Natural ID → DriverPropertyDefinition.id
  name: string;                  // → DriverPropertyDefinition.name
  description?: string;          // → DriverPropertyDefinition.description
  maxSize: number;               // → DriverPropertyDefinition.maxSize
  propertyCategoryType?: string; // Category (not used in DriverPropertyDefinition output)
  propertyStructure: string;     // JSON → DriverPropertyDefinition.elements (parsed)
}
```

### 3.4 Data Relationships

```
spf_module_definitions (scoped by file_system_id)
├─ spf_module_parameter_definitions (many) → parameters
├─ data_port_groups (many, 0-2: one Input, one Output)
│   └─ data_port_definitions (many) → ports in each group
├─ static_control_port_definitions (many)
│   └─ static_intent_definitions (many) → intents per static port
├─ dynamic_intent_definitions (many) → dynamic intents
├─ module_definition_processor_definitions (join)
│   └─ processor_definitions → processorDefinitionId → supportedProcessorIds
└─ module_definition_container_types (join)
    └─ container_types → value → supportedContainerTypes

driver_module_definitions (scoped by file_system_id)
└─ driver_module_parameter_definitions (many) → parameters

SPF property definitions:
  subgraph_property_definitions (NOT scoped — global catalogue)
  container_property_definitions (NOT scoped — global catalogue)

Driver property definitions:
  module_property_definitions (NOT scoped — global catalogue)
```

> **Note on property definition scoping**: Unlike key/tag definitions, property definitions (subgraph, container, module) are **not scoped by `file_system_id`**. They are a global catalogue shared across files. The download should return ALL property definitions from these tables (with no `WHERE file_system_id` filter).

---

## 4) Data Flow

### 4.1 Upload Flow (Context)

```
.awsp ZIP
  ↓
definitions.json (parsed)
  ↓
AwspParser.parseDefinitions()
  ├─ AwspSpfModuleDefinition[] (spfModuleDefinitions block)
  │   └─ AwspParamDefinition[] (paramDefinitions)
  │   └─ AwspDataPortsInfo (inputPortsInfo / outputPortsInfo)
  │   └─ AwspControlPortsInfo (controlPortsInfo)
  └─ DriverModuleDefinition[] (driverModuleDefinitions block)
      └─ AwspParamDefinition[] (paramDefinitions, stored as paramStructure JSON)
  └─ SpfPropertyDefinition[] (spfPropertyDefinitions block)
      ├─ SG_CFG category → INSERT INTO subgraph_property_definitions
      └─ CONTAINTER_CFG category → INSERT INTO container_property_definitions
  └─ DriverPropertyDefinition[] (driverPropertyDefinitions block)
      → NOT currently persisted during upload
```

> **Important**: `driverPropertyDefinitions` are parsed but not persisted to the DB during upload. The `module_property_definitions` table holds **module-level property schemas** referenced by `spf_module_properties_data`, not the driver property definitions from AWSP. The `readDriverPropertyDefinitions()` method reads from `module_property_definitions`.

### 4.2 Download Flow (This Design)

```
TypeOrmBulkReadRepository
  ↓
readSpfModuleDefinitions(fileSystemId):
  9 parallel queries → SpfModuleDefinitionDownloadModel[]

readDriverModuleDefinitions(fileSystemId):
  2 parallel queries → DriverModuleDefinitionDownloadModel[]

readSpfPropertyDefinitions(fileSystemId):
  2 parallel queries (no file scope filter) → SpfPropertyDefinitionDownloadModel[]

readDriverPropertyDefinitions(fileSystemId):
  1 query (no file scope filter) → DriverPropertyDefinitionDownloadModel[]
  ↓
AwspFileSerializer.serialize(entities)
  ↓
AwspDefinitionsMapper (extended)
  toAwspSpfModuleDefinitions(models) → AwspSpfModuleDefinition[]
  toDriverModuleDefinitions(models) → DriverModuleDefinition[]
  toSpfPropertyDefinitions(models) → SpfPropertyDefinition[]
  toDriverPropertyDefinitions(models) → DriverPropertyDefinition[]
  ↓
Each instance calls toJSON() → raw JSON object
  ↓
definitions = {
  keyDefinitions:  [...],           // existing
  tagDefinitions:  [...],           // existing
  spfModuleDefinitions:  [...],     // NEW
  driverModuleDefinitions:  [...],  // NEW
  spfPropertyDefinitions:  [...],   // NEW
  driverPropertyDefinitions:  [...],// NEW
  supportedProcessors: [],          // still empty
  supportedContainerTypes: [],      // still empty
}
ZIP → definitions.json = JSON.stringify(definitions)
```

---

## 5) Field Mapping Specification

### 5.1 SPF Module Definition: DB → Read Model → AwspSpfModuleDefinition

| DB Column (`spf_module_definitions`) | Read Model Field | `AwspSpfModuleDefinition` Field |
|---|---|---|
| `module_definition_id` | `moduleDefinitionId` | `id` |
| `name` | `name` | `name` |
| `display_name` | `displayName` | `displayName` |
| `description` | `description` | `description` |
| `group_name` | `groupName` | `groupName` |
| `mod_search_keys` | `searchKeys` | `searchKeys` |
| `stack_size` | `stackSize` | `stackSize` |
| *(one-to-many `spf_module_parameter_definitions`)* | `params: SpfParamDefDownloadModel[]` | `paramDefinitions: AwspParamDefinition[]` |
| *(via `data_port_groups` + `data_port_definitions`)* | `inputPorts / outputPorts` | `inputPortsInfo / outputPortsInfo` |
| *(via `static_control_port_definitions` + intents)* | `staticControlPorts` | `controlPortsInfo.staticControlPorts` |
| *(via `dynamic_intent_definitions`)* | `dynamicIntents` | `controlPortsInfo.dynamicIntents` |
| *(via `module_def_processor_defs` → processor_definitions)* | `supportedProcessorIds: number[]` | `supportedProcessorIds` |
| *(via `module_def_container_types` → container_type_defs)* | `supportedContainerTypes: number[]` | `supportedContainerTypes` |

### 5.2 SPF Param Definition: DB → Read Model → AwspParamDefinition

| DB Column (`spf_module_parameter_definitions`) | Read Model Field | `AwspParamDefinition` Field |
|---|---|---|
| `param_id` | `paramId` | `id` |
| `name` | `name` | `name` |
| `description` | `description` | `description` |
| `max_size` | `maxSize` | `maxSize` |
| `pid_type` | `pidType` | `pidType` |
| `elements_structure` | `elementsStructure` (raw JSON) | `elements` (parsed array) |
| `is_read_only` | `isReadOnly` | `isReadOnly` |
| `tool_policies` | `toolPolicies` (raw JSON) | `toolPolicies` (parsed array) |
| *(not in DB: `isNeuralNet`, `isOffloaded`, etc.)* | — | *(omitted — optional fields)* |

### 5.3 Data Port Group: DB → Read Model → AwspDataPortsInfo

| DB Source | Read Model Field | `AwspDataPortsInfo` Field |
|---|---|---|
| `data_port_groups.max_allowed_port_count` | `maxPortCount` | `maxPortCount` |
| `data_port_groups.port_io_type` | `portIoType` | *(determines inputPortsInfo vs outputPortsInfo)* |
| `data_port_definitions.data_port_id` | `portId` | `ports[].id` |
| `data_port_definitions.name` | `portName` | `ports[].name` |

### 5.4 Static Control Port: DB → Read Model → AwspControlPortsInfo.staticPorts

| DB Source | Read Model Field | AWSP Field |
|---|---|---|
| `static_control_port_definitions.port_id` | `portId` | `AwspStaticControlPort.id` |
| `static_control_port_definitions.port_name` | `portName` | `AwspStaticControlPort.name` |
| `static_intent_definitions.intent_id` | `intentId` | `AwspStaticControlPort.supportedIntents[].id` |
| `static_intent_definitions.name` | `intentName` | `AwspStaticControlPort.supportedIntents[].name` |
| *(not stored)* | — | `AwspIntent.maxports = 0` (placeholder) |

### 5.5 Dynamic Intents: DB → Read Model → AwspControlPortsInfo.dynamicIntents

| DB Source | Read Model Field | AWSP Field |
|---|---|---|
| `dynamic_intent_definitions.intent_id` | `intentId` | `AwspIntent.id` |
| `dynamic_intent_definitions.name` | `name` | `AwspIntent.name` |
| `dynamic_intent_definitions.max_port` | `maxPort` | `AwspIntent.maxports` |

### 5.6 Driver Module Definition: DB → Read Model → DriverModuleDefinition

| DB Column (`driver_module_definitions`) | Read Model Field | `DriverModuleDefinition` Field |
|---|---|---|
| `module_definition_id` | `moduleDefinitionId` | `id` |
| `name` | `name` | `name` |
| `description` | `description` | `description` |
| `group_name` | `groupName` | `groupName` |
| *(one-to-many `driver_module_parameter_definitions`)* | `params: DriverParamDefDownloadModel[]` | `paramDefinitions: AwspParamDefinition[]` |

### 5.7 Driver Param Definition: DB → Read Model → AwspParamDefinition

| DB Column (`driver_module_parameter_definitions`) | Read Model Field | `AwspParamDefinition` Field |
|---|---|---|
| `parameter_id` | `parameterId` | `id` |
| `name` | `name` | `name` |
| `description` | `description` | `description` |
| `max_size` | `maxSize` | `maxSize` |
| `param_structure` | `paramStructure` (raw JSON) | `elements` (parsed array) |
| *(not stored: `toolPolicies`, `pidType`)* | — | `toolPolicies: []`, `pidType: 'None'` (defaults) |

> **Note on driver param defaults**: `toolPolicies` and `pidType` are required by `AwspParamDefinitionSchema` but are not stored in `driver_module_parameter_definitions`. Use `toolPolicies: []` and `pidType: 'None'` as defaults. These will not cause Zod validation failures since `toolPolicies` is `z.array(...)` (empty is valid) and `pidType: 'None'` is a valid enum value.

### 5.8 SPF Property Definition: DB → Read Model → SpfPropertyDefinition

Both `subgraph_property_definitions` and `container_property_definitions` map to `SpfPropertyDefinition`:

| DB Column | Read Model Field | `SpfPropertyDefinition` Field | Source Table |
|---|---|---|---|
| `property_id` | `propertyId` | `id` | both |
| `name` | `name` | `name` | both |
| `description` | `description` | `description` | both |
| `max_size` | `maxSize` | `maxSize` | both |
| `elements_structure` | `elementsStructure` (raw JSON) | `elements` (parsed) | both |
| `is_voice` | `isVoice` | `isVoice` | subgraph_property_definitions only |
| *(derived)* | `categoryName` = `'SG_CFG'` | `categoryName` | subgraph |
| *(derived)* | `categoryName` = `'CONTAINTER_CFG'` | `categoryName` | container |
| *(not stored — see §1.4)* | `categoryId` = `1` (sentinel) | `categoryId` | both |
| *(not stored — see §1.4)* | `apmModuleInstanceId` = `1` (sentinel) | `apmModuleInstanceId` | both |

> **Note on missing fields**: `categoryId` and `apmModuleInstanceId` are required positive integers in `SpfPropertyDefinitionSchema` but are not stored in the DB. Use `1` as sentinel value (minimum positive int). See §1.4 for full implications — a future DB migration should add these columns to preserve round-trip fidelity.

### 5.9 Driver Property Definition: DB → Read Model → DriverPropertyDefinition

`module_property_definitions` maps to `DriverPropertyDefinition`:

| DB Column (`module_property_definitions`) | Read Model Field | `DriverPropertyDefinition` Field |
|---|---|---|
| `property_id` | `propertyId` | `id` |
| `name` | `name` | `name` |
| `description` | `description` | `description` |
| `max_size` | `maxSize` | `maxSize` |
| `property_structure` | `propertyStructure` (raw JSON) | `elements` (parsed) |

---

## 6) Implementation Components

### 6.1 New Read Model Interfaces

**File**: `packages/core/src/application/ports/persistence/repositories/bulk-read/bulk-read.repository.ts`

```typescript
// SPF module parameter definition download model
export interface SpfParamDefDownloadModel {
  paramId: number;
  name?: string;
  description?: string;
  maxSize: number;
  pidType: string;
  elementsStructure: string; // raw JSON
  isReadOnly: boolean;
  toolPolicies?: string; // raw JSON array
}

// Data port download model (used for input/output port groups)
export interface DataPortDownloadModel {
  portId: number;
  name?: string;
}

// Data port group download model
export interface DataPortGroupDownloadModel {
  maxPortCount: number;
  portIoType: 'Input' | 'Output';
  ports: DataPortDownloadModel[];
}

// Static intent download model
export interface StaticIntentDownloadModel {
  intentId: number;
  name: string;
}

// Static control port download model
export interface StaticControlPortDownloadModel {
  portId: number;
  portName: string;
  intents: StaticIntentDownloadModel[];
}

// Dynamic intent download model
export interface DynamicIntentDownloadModel {
  intentId: number;
  name: string;
  maxPort: number;
}

// SPF module definition download model
export interface SpfModuleDefinitionDownloadModel {
  moduleDefinitionId: number;
  name: string;
  displayName?: string;
  description?: string;
  groupName?: string;
  searchKeys?: string;
  stackSize: number;
  params: SpfParamDefDownloadModel[];
  portGroups: DataPortGroupDownloadModel[];
  staticControlPorts: StaticControlPortDownloadModel[];
  dynamicIntents: DynamicIntentDownloadModel[];
  supportedProcessorIds: number[];
  supportedContainerTypes: number[];
}

// Driver module parameter definition download model
export interface DriverParamDefDownloadModel {
  parameterId: number;
  name?: string;
  description?: string;
  maxSize: number;
  paramStructure: string; // raw JSON (elements array)
}

// Driver module definition download model
export interface DriverModuleDefinitionDownloadModel {
  moduleDefinitionId: number;
  name: string;
  description?: string;
  groupName?: string;
  params: DriverParamDefDownloadModel[];
}

// SPF property definition download model
export interface SpfPropertyDefinitionDownloadModel {
  propertyId: number;
  name: string;
  description?: string;
  maxSize: number;
  elementsStructure: string; // raw JSON
  categoryName: string;      // 'SG_CFG' or 'CONTAINTER_CFG'
  isVoice?: boolean;         // only from subgraph_property_definitions
}

// Driver property definition download model
export interface DriverPropertyDefinitionDownloadModel {
  propertyId: number;
  name: string;
  description?: string;
  maxSize: number;
  propertyStructure: string; // raw JSON (elements)
}
```

Extend `DownloadEntities`:
```typescript
export interface DownloadEntities {
  // ... existing fields ...
  keyDefinitions?: KeyDefinitionDownloadModel[];
  tagDefinitions?: TagDefinitionDownloadModel[];
  spfModuleDefinitions?: SpfModuleDefinitionDownloadModel[];          // NEW
  driverModuleDefinitions?: DriverModuleDefinitionDownloadModel[];    // NEW
  spfPropertyDefinitions?: SpfPropertyDefinitionDownloadModel[];      // NEW
  driverPropertyDefinitions?: DriverPropertyDefinitionDownloadModel[]; // NEW
}
```

Extend `BulkReadRepository` interface:
```typescript
readSpfModuleDefinitions(fileSystemId: number): Promise<SpfModuleDefinitionDownloadModel[]>;
readDriverModuleDefinitions(fileSystemId: number): Promise<DriverModuleDefinitionDownloadModel[]>;
readSpfPropertyDefinitions(fileSystemId: number): Promise<SpfPropertyDefinitionDownloadModel[]>;
readDriverPropertyDefinitions(fileSystemId: number): Promise<DriverPropertyDefinitionDownloadModel[]>;
```

### 6.2 TypeOrmBulkReadRepository — readSpfModuleDefinitions()

**File**: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/bulk-read/typeorm-bulk-read.repository.ts`

Run 9 queries in parallel via `Promise.all`:

**Query 1 — Module definitions:**
```sql
SELECT
  system_id                AS systemId,
  module_definition_id     AS moduleDefinitionId,
  name,
  display_name             AS displayName,
  description,
  group_name               AS groupName,
  mod_search_keys          AS searchKeys,
  stack_size               AS stackSize
FROM spf_module_definitions
WHERE file_system_id = ?
ORDER BY module_definition_id ASC
```

**Query 2 — Parameters:**
```sql
SELECT
  spf_module_definition_system_id AS moduleSystemId,
  param_id                        AS paramId,
  name,
  description,
  max_size                        AS maxSize,
  pid_type                        AS pidType,
  elements_structure              AS elementsStructure,
  is_read_only                    AS isReadOnly,
  tool_policies                   AS toolPolicies
FROM spf_module_parameter_definitions
WHERE spf_module_definition_system_id IN (
  SELECT system_id FROM spf_module_definitions WHERE file_system_id = ?
)
ORDER BY spf_module_definition_system_id ASC, param_id ASC
```

**Query 3 — Data port groups:**
```sql
SELECT
  system_id                     AS systemId,
  module_definition_system_id   AS moduleSystemId,
  max_allowed_port_count        AS maxPortCount,
  port_io_type                  AS portIoType
FROM data_port_groups
WHERE module_definition_system_id IN (
  SELECT system_id FROM spf_module_definitions WHERE file_system_id = ?
)
ORDER BY module_definition_system_id ASC
```

**Query 4 — Data port definitions:**
```sql
SELECT
  data_port_group_system_id  AS groupSystemId,
  data_port_id               AS portId,
  name
FROM data_port_definitions
WHERE data_port_group_system_id IN (
  SELECT dpg.system_id
  FROM data_port_groups dpg
  JOIN spf_module_definitions smd ON dpg.module_definition_system_id = smd.system_id
  WHERE smd.file_system_id = ?
)
ORDER BY data_port_group_system_id ASC, data_port_id ASC
```

**Query 5 — Static control ports:**
```sql
SELECT
  system_id                     AS systemId,
  module_definition_system_id   AS moduleSystemId,
  port_id                       AS portId,
  port_name                     AS portName
FROM static_control_port_definitions
WHERE module_definition_system_id IN (
  SELECT system_id FROM spf_module_definitions WHERE file_system_id = ?
)
ORDER BY module_definition_system_id ASC, port_id ASC
```

**Query 6 — Static intents:**
```sql
SELECT
  static_control_port_definition_system_id  AS portSystemId,
  intent_id                                 AS intentId,
  name
FROM static_intent_definitions
WHERE static_control_port_definition_system_id IN (
  SELECT scpd.system_id
  FROM static_control_port_definitions scpd
  JOIN spf_module_definitions smd ON scpd.module_definition_system_id = smd.system_id
  WHERE smd.file_system_id = ?
)
ORDER BY static_control_port_definition_system_id ASC, intent_id ASC
```

**Query 7 — Dynamic intents:**
```sql
SELECT
  module_definition_system_id  AS moduleSystemId,
  intent_id                    AS intentId,
  name,
  max_port                     AS maxPort
FROM dynamic_intent_definitions
WHERE module_definition_system_id IN (
  SELECT system_id FROM spf_module_definitions WHERE file_system_id = ?
)
ORDER BY module_definition_system_id ASC, intent_id ASC
```

**Query 8 — Supported processor IDs:**
```sql
SELECT
  mdpd.module_definition_system_id  AS moduleSystemId,
  pd.processor_definition_id        AS processorId
FROM module_definition_processor_definitions mdpd
JOIN processor_definitions pd ON mdpd.processor_definition_system_id = pd.system_id
WHERE mdpd.module_definition_system_id IN (
  SELECT system_id FROM spf_module_definitions WHERE file_system_id = ?
)
ORDER BY mdpd.module_definition_system_id ASC
```

**Query 9 — Supported container type IDs:**
```sql
SELECT
  mdct.module_definition_system_id  AS moduleSystemId,
  ct.value                          AS containerTypeId
FROM module_definition_container_types mdct
JOIN container_types ct ON mdct.container_type_system_id = ct.system_id
WHERE mdct.module_definition_system_id IN (
  SELECT system_id FROM spf_module_definitions WHERE file_system_id = ?
)
ORDER BY mdct.module_definition_system_id ASC
```

**Grouping/assembly** (in-memory after queries complete):
1. Group params by `moduleSystemId` → `paramsMap`
2. Group port groups by `moduleSystemId` → `portGroupsMap`
3. Group data ports by `groupSystemId` → `dataPortsMap`; attach to port groups
4. Group static ports by `moduleSystemId` → `staticPortsMap`
5. Group static intents by `portSystemId` → `staticIntentsMap`; attach to static ports
6. Group dynamic intents by `moduleSystemId` → `dynamicIntentsMap`
7. Group processor IDs by `moduleSystemId` → `processorIdsMap`
8. Group container type IDs by `moduleSystemId` → `containerTypeIdsMap`
9. Map each module row to `SpfModuleDefinitionDownloadModel`

### 6.3 TypeOrmBulkReadRepository — readDriverModuleDefinitions()

**Query 1 — Module definitions:**
```sql
SELECT
  system_id               AS systemId,
  module_definition_id    AS moduleDefinitionId,
  name,
  description,
  group_name              AS groupName
FROM driver_module_definitions
WHERE file_system_id = ?
ORDER BY module_definition_id ASC
```

**Query 2 — Parameters:**
```sql
SELECT
  driver_module_definition_system_id  AS moduleSystemId,
  parameter_id                        AS parameterId,
  name,
  description,
  max_size                            AS maxSize,
  param_structure                     AS paramStructure
FROM driver_module_parameter_definitions
WHERE driver_module_definition_system_id IN (
  SELECT system_id FROM driver_module_definitions WHERE file_system_id = ?
)
ORDER BY driver_module_definition_system_id ASC, parameter_id ASC
```

### 6.4 TypeOrmBulkReadRepository — readSpfPropertyDefinitions()

**Query 1 — Subgraph property definitions (SG_CFG):**
```sql
SELECT
  property_id         AS propertyId,
  name,
  description,
  max_size            AS maxSize,
  elements_structure  AS elementsStructure,
  is_voice            AS isVoice
FROM subgraph_property_definitions
ORDER BY property_id ASC
```

**Query 2 — Container property definitions (CONTAINTER_CFG):**
```sql
SELECT
  property_id         AS propertyId,
  name,
  description,
  max_size            AS maxSize,
  elements_structure  AS elementsStructure
FROM container_property_definitions
ORDER BY property_id ASC
```

No `file_system_id` filter — these are global catalogue tables. Combine both result sets with `categoryName` derived from the source table:
- Subgraph rows → `categoryName: 'SG_CFG'`
- Container rows → `categoryName: 'CONTAINTER_CFG'`

### 6.5 TypeOrmBulkReadRepository — readDriverPropertyDefinitions()

**Query 1 — Module property definitions:**
```sql
SELECT
  property_id         AS propertyId,
  name,
  description,
  max_size            AS maxSize,
  property_structure  AS propertyStructure
FROM module_property_definitions
ORDER BY property_id ASC
```

No `file_system_id` filter — global catalogue table.

### 6.6 Wire into readAllEntitiesForFile()

```typescript
const [
  headerMetadata,
  usecaseData,
  subgraphData,
  containerData,
  audioCalibrationData,
  voiceCalibrationData,
  keyDefinitions,
  tagDefinitions,
  spfModuleDefinitions,         // NEW
  driverModuleDefinitions,      // NEW
  spfPropertyDefinitions,       // NEW
  driverPropertyDefinitions,    // NEW
] = await Promise.all([
  this.readFileProperties(fileSystemId),
  this.readUsecaseData(fileSystemId),
  this.readSubgraphData(fileSystemId),
  this.readContainerData(fileSystemId),
  this.readAudioCalibrationData(fileSystemId),
  this.readVoiceCalibrationData(fileSystemId),
  this.readKeyDefinitions(fileSystemId),
  this.readTagDefinitions(fileSystemId),
  this.readSpfModuleDefinitions(fileSystemId),    // NEW
  this.readDriverModuleDefinitions(fileSystemId), // NEW
  this.readSpfPropertyDefinitions(fileSystemId),  // NEW
  this.readDriverPropertyDefinitions(fileSystemId), // NEW
]);
```

### 6.7 AwspDefinitionsMapper Extensions

**File**: `packages/core/src/application/file-operations/download-file/services/awsp-definitions-mapper.ts`

Add four new methods to the existing `AwspDefinitionsMapper` class.

**toAwspSpfModuleDefinitions logic:**
```typescript
toAwspSpfModuleDefinitions(models: SpfModuleDefinitionDownloadModel[]): AwspSpfModuleDefinition[] {
  return models.map(model => {
    const instance = new AwspSpfModuleDefinition();
    instance.id = model.moduleDefinitionId;
    instance.name = model.name;
    instance.displayName = model.displayName;
    instance.description = model.description;
    instance.groupName = model.groupName;
    instance.searchKeys = model.searchKeys;
    instance.stackSize = model.stackSize;
    instance.supportedProcessorIds = model.supportedProcessorIds;
    instance.supportedContainerTypes = model.supportedContainerTypes;

    // Map parameters
    instance.paramDefinitions = model.params.map(p => {
      const param = new AwspParamDefinition();
      param.id = p.paramId;
      param.name = p.name ?? '';
      param.description = p.description;
      param.maxSize = p.maxSize;
      param.pidType = p.pidType as AwspPidType;
      param.elements = p.elementsStructure ? JSON.parse(p.elementsStructure) : [];
      param.isReadOnly = p.isReadOnly;
      param.toolPolicies = p.toolPolicies ? JSON.parse(p.toolPolicies) : [];
      return param;
    });

    // Map input/output ports
    const inputGroup = model.portGroups.find(g => g.portIoType === 'Input');
    const outputGroup = model.portGroups.find(g => g.portIoType === 'Output');
    if (inputGroup) {
      instance.inputPortsInfo = new AwspDataPortsInfo();
      instance.inputPortsInfo.maxPortCount = inputGroup.maxPortCount;
      instance.inputPortsInfo.ports = inputGroup.ports.map(p => {
        const port = new AwspPort(); port.id = p.portId; port.name = p.name ?? '';
        return port;
      });
    }
    if (outputGroup) {
      instance.outputPortsInfo = new AwspDataPortsInfo();
      instance.outputPortsInfo.maxPortCount = outputGroup.maxPortCount;
      instance.outputPortsInfo.ports = outputGroup.ports.map(p => {
        const port = new AwspPort(); port.id = p.portId; port.name = p.name ?? '';
        return port;
      });
    }

    // Map control ports info (static + dynamic)
    if (model.staticControlPorts.length > 0 || model.dynamicIntents.length > 0) {
      instance.controlPortsInfo = new AwspControlPortsInfo();
      instance.controlPortsInfo.staticPorts = model.staticControlPorts.map(sp => {
        const staticPort = new AwspStaticControlPort();
        staticPort.id = sp.portId;
        staticPort.name = sp.portName;
        staticPort.supportedIntents = sp.intents.map(i => {
          const intent = new AwspIntent(); intent.id = i.intentId; intent.name = i.name;
          intent.maxports = 0; // stored as 0 — not in static_intent_definitions
          return intent;
        });
        return staticPort;
      });
      instance.controlPortsInfo.dynamicIntents = model.dynamicIntents.map(di => {
        const intent = new AwspIntent();
        intent.id = di.intentId; intent.name = di.name; intent.maxports = di.maxPort;
        return intent;
      });
    }

    return instance;
  });
}
```

**toDriverModuleDefinitions logic:**
- For each model: create `DriverModuleDefinition` with id, name, description, groupName
- For each param: create `AwspParamDefinition` with id, name, description, maxSize, `elements = JSON.parse(paramStructure)`, `toolPolicies = []`, `pidType = 'None'`

**toSpfPropertyDefinitions logic:**
- For each model: create `SpfPropertyDefinition` with id, name, description, maxSize, `elements = JSON.parse(elementsStructure)`, categoryName, `categoryId = 1` (sentinel per §1.4), `apmModuleInstanceId = 1` (sentinel per §1.4), isVoice

**toDriverPropertyDefinitions logic:**
- For each model: create `DriverPropertyDefinition` with id, name, description, maxSize, `elements = JSON.parse(propertyStructure)`

### 6.8 AwspFileSerializer Update

**File**: `packages/core/src/application/file-operations/download-file/services/awsp-file-serializer.ts`

```typescript
const spfModDefs = entities.spfModuleDefinitions
  ? mapper.toAwspSpfModuleDefinitions(entities.spfModuleDefinitions)
  : [];
const driverModDefs = entities.driverModuleDefinitions
  ? mapper.toDriverModuleDefinitions(entities.driverModuleDefinitions)
  : [];
const spfPropDefs = entities.spfPropertyDefinitions
  ? mapper.toSpfPropertyDefinitions(entities.spfPropertyDefinitions)
  : [];
const driverPropDefs = entities.driverPropertyDefinitions
  ? mapper.toDriverPropertyDefinitions(entities.driverPropertyDefinitions)
  : [];

const definitions = {
  [DEFINITION_BLOCK_NAMES.KEY_DEFINITIONS]: keyDefs.map(k => k.toJSON()),
  [DEFINITION_BLOCK_NAMES.TAG_DEFINITIONS]: tagDefs.map(t => t.toJSON()),
  [DEFINITION_BLOCK_NAMES.SPF_MODULE_DEFINITIONS]: spfModDefs.map(m => m.toJSON()),
  [DEFINITION_BLOCK_NAMES.DRIVER_MODULE_DEFINITIONS]: driverModDefs.map(m => m.toJSON()),
  [DEFINITION_BLOCK_NAMES.SPF_PROPERTY_DEFINITIONS]: spfPropDefs.map(p => p.toJSON()),
  [DEFINITION_BLOCK_NAMES.DRIVER_PROPERTY_DEFINITIONS]: driverPropDefs.map(p => p.toJSON()),
  [DEFINITION_BLOCK_NAMES.SUPPORTED_PROCESSORS]: [],
  [DEFINITION_BLOCK_NAMES.SUPPORTED_CONTAINER_TYPES]: [],
};
```

---

## 7) Testing Strategy

### 7.1 Unit Tests

**AwspDefinitionsMapper extensions** (`packages/core/tests/unit/`):

- Map a `SpfModuleDefinitionDownloadModel` with all optional fields → assert `toJSON()` output passes `AwspSpfModuleDefinitionSchema` validation
- Map a model with params having `elementsStructure` JSON → assert `paramDefinitions[0].elements` is parsed array
- Map a model with port groups and static/dynamic ports → assert `inputPortsInfo.ports`, `controlPortsInfo.staticControlPorts`, `controlPortsInfo.dynamicIntents` are populated
- Map a model with processor and container type IDs → assert they appear in output
- Map a `DriverModuleDefinitionDownloadModel` → assert default `toolPolicies: []` and `pidType: 'None'`
- Map a `SpfPropertyDefinitionDownloadModel` with `categoryName: 'SG_CFG'` → assert `categoryName`, `categoryId`, `apmModuleInstanceId` in output
- Map empty arrays → assert empty arrays returned

### 7.2 Integration Tests

**readSpfModuleDefinitions** (`packages/infrastructure/persistence/tests/integration/`):
- Seed two `spf_module_definitions` with params, ports, intents; assert correct grouping
- Seed definitions scoped to two different `fileSystemId`; assert isolation
- Seed with processor and container type links; assert `supportedProcessorIds` contains natural IDs

**readDriverModuleDefinitions**:
- Seed one driver definition with two params; assert params are nested correctly
- Seed with two different `fileSystemId`; assert scoping

**readSpfPropertyDefinitions**:
- Seed rows in both `subgraph_property_definitions` and `container_property_definitions`; assert all rows returned with correct `categoryName`
- Assert no file scoping (returns same results regardless of `fileSystemId`)

**readDriverPropertyDefinitions**:
- Seed rows in `module_property_definitions`; assert all returned with `propertyStructure`

### 7.3 Round-Trip Tests

**End-to-End** (`packages/api/tests/e2e/`):
- Upload `.awsp` fixture with non-empty `spfModuleDefinitions` and `driverModuleDefinitions`
- Call `GET /:projectId/download-files`
- Unzip returned `.awsp`, parse `definitions.json`
- Feed through `AwspParser.parseDefinitions()` → assert no Zod validation errors
- Assert `spfModuleDefinitions[0].id` matches fixture
- Assert `driverModuleDefinitions[0].paramDefinitions` count matches fixture

---

## 8) Implementation Checklist

### 8.1 Core Port Layer

- [ ] **Add read model interfaces**
  - File: `packages/core/src/application/ports/persistence/repositories/bulk-read/bulk-read.repository.ts`
  - Add `SpfParamDefDownloadModel`, `DataPortDownloadModel`, `DataPortGroupDownloadModel`, `StaticIntentDownloadModel`, `StaticControlPortDownloadModel`, `DynamicIntentDownloadModel`, `SpfModuleDefinitionDownloadModel`
  - Add `DriverParamDefDownloadModel`, `DriverModuleDefinitionDownloadModel`
  - Add `SpfPropertyDefinitionDownloadModel`, `DriverPropertyDefinitionDownloadModel`
  - Extend `DownloadEntities` with four new optional fields
  - Add four new method signatures to `BulkReadRepository` interface

### 8.2 Infrastructure Layer

- [ ] **Implement readSpfModuleDefinitions()**
  - File: `typeorm-bulk-read.repository.ts`
  - 9 parallel queries via `Promise.all`
  - In-memory grouping of child rows by parent system ID

- [ ] **Implement readDriverModuleDefinitions()**
  - File: same
  - 2 parallel queries via `Promise.all`

- [ ] **Implement readSpfPropertyDefinitions()**
  - File: same
  - 2 parallel queries (no file scope), combine with derived `categoryName`

- [ ] **Implement readDriverPropertyDefinitions()**
  - File: same
  - 1 query (no file scope)

- [ ] **Update readAllEntitiesForFile()**
  - Add all four new methods to `Promise.all`
  - Return four new fields in result object

### 8.3 Core Application Layer

- [ ] **Extend AwspDefinitionsMapper**
  - File: `packages/core/src/application/file-operations/download-file/services/awsp-definitions-mapper.ts`
  - Add `toAwspSpfModuleDefinitions()` with JSON parsing for `elementsStructure` and `toolPolicies`
  - Add `toDriverModuleDefinitions()` with JSON parsing for `paramStructure`; default `toolPolicies: []`, `pidType: 'None'`
  - Add `toSpfPropertyDefinitions()` with JSON parsing for `elementsStructure`; default `categoryId: 0`, `apmModuleInstanceId: 0`
  - Add `toDriverPropertyDefinitions()` with JSON parsing for `propertyStructure`

- [ ] **Update AwspFileSerializer**
  - File: `packages/core/src/application/file-operations/download-file/services/awsp-file-serializer.ts`
  - Map all four new entities; replace `[]` with `toJSON()` output

### 8.4 Testing

- [ ] **Unit tests for AwspDefinitionsMapper extensions**
  - File: `packages/core/tests/unit/download-file/awsp-definitions-mapper.test.ts`

- [ ] **Integration tests for new read methods**
  - Files in: `packages/infrastructure/persistence/tests/integration/bulk-read/`

- [ ] **E2E round-trip test**
  - File: `packages/api/tests/e2e/`

---

## Summary

This design extends the key-definitions pattern to populate all four remaining definition blocks in `definitions.json`:

1. ✅ **Reuses existing serializer classes** — no changes to the serializer/schema layer
2. ✅ **Follows established DB query pattern** — parallel queries, read models, in-memory grouping
3. ✅ **No DB migrations** — reads only existing tables; property definitions are global, module definitions are file-scoped
4. ✅ **Partial round-trip fidelity** — SPF module fields not stored during upload will be `undefined` (allowed by Zod optional); driver params default `toolPolicies`/`pidType`
5. ✅ **Minimal blast radius** — four new mapper methods, four new query methods, one updated serializer method

**Key design decisions**:
- Property definitions (SPF/driver) query without `file_system_id` filter as they are global catalogue tables
- SPF module definition requires 9 parallel queries due to its deeply normalized schema
- Driver param `toolPolicies`/`pidType` default to `[]` / `'None'` to satisfy Zod required fields
- `categoryId` and `apmModuleInstanceId` default to `0` for SPF property definitions

**Next Steps**: Create implementation plan using `writing-plans` skill.
