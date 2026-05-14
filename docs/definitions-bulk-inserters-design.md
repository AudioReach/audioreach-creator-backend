<!--
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
-->

# Definitions Bulk Inserters — Design

## Status

Approved — ready for implementation.

## Context

The `BulkImportRepository` port defines four methods for inserting definition entities that are currently stubs returning `okBulkInsert()` immediately:

- `insertSpfModuleDefinitions`
- `insertKeyDefinitions`
- `insertProcessorDefinitions`
- `insertContainerTypeDefinitions`

These definitions are parsed from `.acdb` / `.awsp` files during the upload-file flow and must be persisted before usecase-data entities (modules, containers, subgraphs) that reference them via foreign keys.

This document describes the design for implementing all four inserters, the domain model corrections required, the schema additions, and the migration strategy.

---

## Decision

**Approach: One inserter per definition type**, following the exact same pattern as the existing `SpfModuleInserter` and `SubsystemInserter`:

- Each inserter implements `BulkInserter<TDomain>`
- Uses `BatchInserter.insert()` for all table writes
- Collects `RawFailure[]` from each private insert step (continue-on-error)
- Groups failures by aggregate `systemId` into `BulkInsertError[]`
- Returns `errBulkInsert(errors)` on any failure, `okBulkInsert()` on full success

**Alternatives considered:**
- Abstract base class — rejected (adds abstraction not present in existing inserters)
- TypeORM cascade save — rejected (upsert semantics, inconsistent failure reporting)

---

## Domain Model Fixes

Three domain models have type errors or missing fields that must be corrected before inserter work begins.

### `ProcessorDefinition` — fix `systemId` type

**File:** `packages/core/src/domain/entities/definitions/processor/processor-definition.ts`

`systemId` is currently typed as `string`. The DB schema (`EntityBaseRow`) requires `number`. Change both the interface and class field to `number`.

### `ContainerType` — fix `systemId` type

**File:** `packages/core/src/domain/entities/definitions/container/container-type-definition.ts`

Same issue — `systemId: string` → `systemId: number`.

### `ParamDefinition` — add missing fields

**File:** `packages/core/src/domain/entities/definitions/common/entities/param-definition.ts`

The `SpfModuleParameterDefinitionRow` schema has three columns with no corresponding domain field. Add them:

| New field | Type | Maps to schema column |
|---|---|---|
| `isPersistent` | `boolean` | `is_persistent` |
| `defaultData` | `Uint8Array` | `default_data` |
| `isReadOnly` | `boolean` | `is_read_only` |

Additionally, `ParamDefinition.toolPolicies: ToolPolicy[]` has no schema column. A new `tool_policies` text column (JSON-serialized) is added to the schema (see Schema Changes below).

---

## Schema Changes

### `SpfModuleParameterDefinitionRow` — add `toolPolicies` column

**File:** `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/definitions/module/spf/spf-module-parameter-definition.schema.ts`

Add:
```typescript
toolPolicies: {
  type: 'text',
  nullable: true,
  name: 'tool_policies',
}
```

The inserter serializes `param.toolPolicies` with `JSON.stringify()` before writing.

### `KeyDefinitionRow` — add missing columns

**File:** `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/definitions/key-value/key-definition.schema.ts`

Add the following nullable columns:

| Column name | Type | Domain source |
|---|---|---|
| `is_voice` | `boolean` | `KeyDefinition.isVoice` |
| `is_dynamic` | `boolean` | `KeyDefinition.isDynamic` |
| `is_calibration_key` | `boolean` | `KeyDefinition.isCalibrationKey` |
| `is_graph_key` | `boolean` | `KeyDefinition.isGraphKey` |
| `speciality_key` | `varchar` | `KeyDefinition.specialityKeyValue?.key` |
| `speciality_value` | `text` | `KeyDefinition.specialityKeyValue?.value` |
| `calibration_enum_value` | `text` | `KeyDefinition.cHeaderAttributes?.calibrationEnumValue` |
| `graph_enum_value` | `text` | `KeyDefinition.cHeaderAttributes?.graphEnumValue` |

### `ValueDefinitionRow` — add `specialValue` column

**File:** `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/definitions/key-value/value-definition.schema.ts`

Add:
```typescript
specialValue: {
  type: 'text',
  nullable: true,
  name: 'special_value',
}
```

### Two new join-table `EntitySchema` objects

These cover the many-to-many relationships on `SpfModuleDefinition`. They are thin schemas with composite primary keys — no `systemId`, no `EntityBaseRow`.

**File:** `entity-schema/definitions/module/spf/module-definition-processor-link.schema.ts`

```typescript
export interface ModuleDefinitionProcessorLinkRow {
  moduleDefinitionSystemId: number;
  processorDefinitionSystemId: number;
}
export const ModuleDefinitionProcessorLinkSchema =
  new EntitySchema<ModuleDefinitionProcessorLinkRow>({
    name: 'ModuleDefinitionProcessorLink',
    tableName: 'module_definition_processor_definitions',
    columns: {
      moduleDefinitionSystemId: {
        type: 'integer',
        name: 'module_definition_system_id',
        primary: true,
      },
      processorDefinitionSystemId: {
        type: 'integer',
        name: 'processor_definition_system_id',
        primary: true,
      },
    },
  });
```

**File:** `entity-schema/definitions/module/spf/module-definition-container-type-link.schema.ts`

```typescript
export interface ModuleDefinitionContainerTypeLinkRow {
  moduleDefinitionSystemId: number;
  containerTypeSystemId: number;
}
export const ModuleDefinitionContainerTypeLinkSchema =
  new EntitySchema<ModuleDefinitionContainerTypeLinkRow>({
    name: 'ModuleDefinitionContainerTypeLink',
    tableName: 'module_definition_container_types',
    columns: {
      moduleDefinitionSystemId: {
        type: 'integer',
        name: 'module_definition_system_id',
        primary: true,
      },
      containerTypeSystemId: {
        type: 'integer',
        name: 'container_type_system_id',
        primary: true,
      },
    },
  });
```

Both schemas are exported from `entity-schema/index.ts` and registered in `getAllEntitySchemas()`.

---

## Migration

The existing single migration file (`1775463707568-initial-create.ts`) is deleted and regenerated to include all schema additions above.

**Steps:**
1. Delete `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migrations/1775463707568-initial-create.ts`
2. Build the API package first: `pnpm run build:api`
3. Run the TypeORM migration generate command: `pnpm run migration:gen -- ./packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migrations/<name>`
4. Rename the generated file to kebab-case: `<timestamp>-initial-create.ts`
5. Add Qualcomm copyright header to the new file
6. Use `import type` for any TypeORM type imports in the migration file
7. Update `migration-index.ts` to import and export the new migration class

---

## The Four Inserters

### `ProcessorDefinitionInserter`

**File:** `repositories/bulk-import/processor-definition/processor-definition.inserter.ts`
**Constructor:** `(manager: EntityManager)`
**Tables:** `processor_definitions` (single table, no children)

**Field mapping:**

| Domain | Row |
|---|---|
| `systemId` | `systemId` |
| `name` | `name` |
| `processorId` | `processorDefinitionId` |

**Error message format:**
```
Failed to insert Processor Definition {processorId=${item.processorId}, systemId=${item.systemId}}
```

---

### `ContainerTypeInserter`

**File:** `repositories/bulk-import/container-type/container-type.inserter.ts`
**Constructor:** `(manager: EntityManager)`
**Tables:** `container_types` (single table, no children)

**Field mapping:**

| Domain | Row |
|---|---|
| `systemId` | `systemId` |
| `name` | `name` |
| `value` | `value` |

**Error message format:**
```
Failed to insert Container Type {value=${item.value}, systemId=${item.systemId}}
```

---

### `KeyDefinitionInserter`

**File:** `repositories/bulk-import/key-definition/key-definition.inserter.ts`
**Constructor:** `(manager: EntityManager)`
**Insert order (FK-safe):**
```
KeyDefinition (arc_keys)
  → ValueDefinition (arc_values)
```

**`KeyDefinition` field mapping:**

| Domain | Row |
|---|---|
| `systemId` | `systemId` |
| `keyId` | `keyId` |
| `fileSystemId` | `fileSystemId` |
| `name` | `keyName` |
| `description` | `description` |
| `isVoice` | `isVoice` |
| `isDynamic` | `isDynamic` |
| `isCalibrationKey` | `isCalibrationKey` |
| `isGraphKey` | `isGraphKey` |
| `specialityKeyValue?.key` | `specialityKey` |
| `specialityKeyValue?.value` | `specialityValue` |
| `cHeaderAttributes?.keyEnumName` | `cEnumMemberName` |
| `cHeaderAttributes?.keyEnumValue` | `cEnumName` |
| `cHeaderAttributes?.calibrationEnumValue` | `calibrationEnumValue` |
| `cHeaderAttributes?.graphEnumValue` | `graphEnumValue` |

**`ValueDefinition` field mapping:**

| Domain | Row |
|---|---|
| `value.systemId` | `systemId` |
| `value.valueId` | `valueId` |
| `value.name` | `valueName` |
| `value.description` | `description` |
| `value.enumValue` | `cEnumMemberName` |
| `value.specialValue` | `specialValue` |
| `key.systemId` | `keySystemId` (FK) |

**Error message format:**
```
Failed to insert some or all data belonging to Key Definition {keyId=${BinaryUtils.toHexString(key.keyId)}, systemId=${key.systemId}}
```

---

### `SpfModuleDefinitionInserter`

**File:** `repositories/bulk-import/spf-module-definition/spf-module-definition.inserter.ts`
**Constructor:** `(manager: EntityManager, idGeneration: IdGenerationPort)`
**Insert order (FK-safe):**
```
SpfModuleDefinition (spf_module_definitions)
  → ModuleDefinitionMetaData (module_definition_meta_data)          [optional, 1:1]
  → DataPortGroup (data_port_groups)
      → DataPortDefinition (data_port_definitions)
  → StaticControlPortDefinition (static_control_port_definitions)
      → StaticIntentDefinition (static_intent_definitions)
  → DynamicIntentDefinition (dynamic_intent_definitions)
  → ModuleAttribute (module_attributes)
  → SpfModuleParameterDefinition (spf_module_parameter_definitions)
  → ModuleDefinitionProcessorLink (module_definition_processor_definitions)
  → ModuleDefinitionContainerTypeLink (module_definition_container_types)
```

**ID generation:** The following child entities are value objects in the domain (no `systemId` field). A fresh `systemId` is obtained from `IdGenerationPort.getNextId(def.fileSystemId)` for each:
- `DataPortGroup`
- `DataPortDefinition`
- `StaticControlPortDefinition`
- `DynamicIntentDefinition`
- `ModuleDefinitionMetaData`
- `ModuleAttribute`

The following child entities already carry a `systemId` in the domain — use it directly:
- `StaticIntentDefinition` — uses `intent.systemId` directly
- `SpfModuleParameterDefinition` — uses `param.systemId` directly (already assigned by `EntityBuilderService`)

**`StaticIntentDefinition` field mapping note:** `StaticIntentDefinitionRow.maxPort` has no corresponding field in the `StaticIntentDefinition` domain value object. Use `0` as the default value. `StaticIntentDefinitionRow.name` maps to `StaticIntentDefinition.intentName`.

**Join table rows** use `systemId` values already present in the domain sets — no ID generation needed:
- `processorSystemIds: Set<number>` → `ModuleDefinitionProcessorLinkRow`
- `containerTypesSystemIds: Set<number>` → `ModuleDefinitionContainerTypeLinkRow`

**`SpfModuleDefinition` field mapping:**

| Domain | Row |
|---|---|
| `systemId` | `systemId` |
| `moduleDefinitionId` | `moduleDefinitionId` |
| `fileSystemId` | `fileSystemId` |
| `name` | `name` |
| `displayName` | `displayName` |
| `description` | `description` |
| `groupName` | `groupName` |
| `modSearchKeys` | `modSearchKeys` |
| `stackSize` | `stackSize` |

**`SpfModuleParameterDefinition` field mapping:**

| Domain | Row |
|---|---|
| `param.systemId` | `systemId` |
| `param.paramId` | `parameterId` |
| `param.name` | `name` |
| `param.description` | `description` |
| `param.maxSize` | `maxSize` |
| `param.pidType` | `pidType` |
| `param.elementsStructure` | `paramStructure` |
| `param.isPersistent` | `isPersistent` |
| `param.defaultData` | `defaultData` |
| `param.isReadOnly` | `isReadOnly` |
| `JSON.stringify(param.toolPolicies)` | `toolPolicies` |
| `def.systemId` | `spfModuleDefinitionSystemId` |

**Error message format:**
```
Failed to insert some or all data belonging to Spf Module Definition {moduleDefinitionId=${BinaryUtils.toHexString(def.moduleDefinitionId)}, systemId=${def.systemId}}
```

---

## Wiring — `TypeOrmBulkImportRepository`

Replace the four stubs in `typeorm-bulk-import.repository.ts`:

```typescript
insertSpfModuleDefinitions(items: readonly SpfModuleDefinition[]): Promise<BulkInsertResult> {
  return new SpfModuleDefinitionInserter(this.manager, this.idGeneration).insert([...items]);
}
insertKeyDefinitions(items: readonly KeyDefinition[]): Promise<BulkInsertResult> {
  return new KeyDefinitionInserter(this.manager).insert([...items]);
}
insertProcessorDefinitions(items: readonly ProcessorDefinition[]): Promise<BulkInsertResult> {
  return new ProcessorDefinitionInserter(this.manager).insert([...items]);
}
insertContainerTypeDefinitions(items: readonly ContainerType[]): Promise<BulkInsertResult> {
  return new ContainerTypeInserter(this.manager).insert([...items]);
}
```

---

## Error Handling

All inserters follow the continue-on-error pattern:
- All insert steps are always attempted regardless of prior failures
- `RawFailure[]` collected from each private insert method
- Grouped by aggregate `systemId` → one `BulkInsertError` per failing aggregate
- Empty input → `okBulkInsert()` immediately (no DB calls)

---

## Testing

Integration tests follow the existing pattern in `packages/infrastructure/persistence/tests/integration/` using in-memory SQLite.

One test file per inserter:
- `processor-definition.inserter.spec.ts`
- `container-type.inserter.spec.ts`
- `key-definition.inserter.spec.ts`
- `spf-module-definition.inserter.spec.ts`

Each test file covers:
1. **Happy path** — all rows inserted, `okBulkInsert()` returned
2. **Partial failure** — one invalid row (e.g. duplicate PK), remaining rows succeed, `errBulkInsert()` returned with correct error details
3. **Empty input** — returns `okBulkInsert()` without hitting the DB

---

## File Inventory

### Modified files
| File | Change |
|---|---|
| `packages/core/src/domain/entities/definitions/processor/processor-definition.ts` | `systemId: string` → `number` |
| `packages/core/src/domain/entities/definitions/container/container-type-definition.ts` | `systemId: string` → `number` |
| `packages/core/src/domain/entities/definitions/common/entities/param-definition.ts` | Add `isPersistent`, `defaultData`, `isReadOnly` |
| `entity-schema/definitions/key-value/key-definition.schema.ts` | Add 8 new columns |
| `entity-schema/definitions/key-value/value-definition.schema.ts` | Add `specialValue` column |
| `entity-schema/definitions/module/spf/spf-module-parameter-definition.schema.ts` | Add `toolPolicies` column |
| `entity-schema/index.ts` | Export + register 2 new join-table schemas |
| `persistence-typeorm-sqllite/migration-index.ts` | Point to new migration |
| `repositories/bulk-import/typeorm-bulk-import.repository.ts` | Replace 4 stubs with real inserter calls |

### New files
| File | Purpose |
|---|---|
| `entity-schema/definitions/module/spf/module-definition-processor-link.schema.ts` | Join-table schema |
| `entity-schema/definitions/module/spf/module-definition-container-type-link.schema.ts` | Join-table schema |
| `migrations/<timestamp>-initial-create.ts` | Regenerated migration |
| `repositories/bulk-import/processor-definition/processor-definition.inserter.ts` | Inserter |
| `repositories/bulk-import/container-type/container-type.inserter.ts` | Inserter |
| `repositories/bulk-import/key-definition/key-definition.inserter.ts` | Inserter |
| `repositories/bulk-import/spf-module-definition/spf-module-definition.inserter.ts` | Inserter |
| `tests/integration/processor-definition.inserter.spec.ts` | Integration test |
| `tests/integration/container-type.inserter.spec.ts` | Integration test |
| `tests/integration/key-definition.inserter.spec.ts` | Integration test |
| `tests/integration/spf-module-definition.inserter.spec.ts` | Integration test |

### Deleted files
| File | Reason |
|---|---|
| `migrations/1775463707568-initial-create.ts` | Replaced by regenerated migration |