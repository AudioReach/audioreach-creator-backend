<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Add Module — Calibration Defaults & Property Seeding

**Status:** Draft
**Owner:** Nithin Simon

**Parent design:** [`add-module-design.md`](add-module-design.md)
**Depends on:** Add Module design (complete), LLD1 (Foundation)

---

## 1. Scope

This document extends the Add Module design with three write operations that happen after the module row is created:

1. **Calibration parameter payloads** — create a zero-CKV and populate default binary blobs for every calibration parameter of the module definition.
2. **Subgraph property defaults** — when a new subgraph is auto-created (Variants 1 and 2), seed a `SubgraphPropertyData` row for every property definition in the file.
3. **Container property defaults** — when a new container is auto-created (Variants 1 and 2), seed a `ContainerPropertyData` row for every property definition in the file.

The original add-module design listed these as out of scope. This doc adds them back in and specifies everything needed to implement them: a new binary serializer, port method additions, and handler step additions.

---

## 2. Background — Element Structure & Binary Format

Parameter and property definitions both store their element schema in an `elementsStructure` column as a JSON string. The types come from `packages/core/src/application/usecase-designer/spf-module/param-parser/types/element-definition.ts`:

| Type | Binary representation |
|---|---|
| `ConfigElement` | One scalar value of `dataType` (UInt8/16/32/64, Int8/16/32/64, Float, Double, RawData) |
| `StructElement` | Children written in order, then aligned to 4 bytes |
| `ElementArray` | `arrayLength` copies of the template item |
| `StructArray` | `arrayLength` copies of the struct template |

The existing `BinaryDataReader` (`param-parser/utils/binary-data-reader.ts`) reads this format. The existing `parseParameterData` function uses it to turn a `Uint8Array` payload into `ElementCalData[]`.

For seeding defaults we need the inverse: walk the element definitions and **write** default values into a `Uint8Array`. `ConfigElement.defaultValue` provides the per-scalar default as a string; absent `defaultValue` emits zero bytes for the element's width.

---

## 3. `BinaryDataWriter`

**File (new):** `packages/core/src/application/usecase-designer/spf-module/param-parser/utils/binary-data-writer.ts`

Mirror of `BinaryDataReader`. Accumulates typed writes into chunks and assembles them on demand.

```ts
export class BinaryDataWriter {
  private readonly chunks: Uint8Array[] = [];
  private offset = 0;

  private push(size: number, fill: (view: DataView) => void): void {
    const buf = new Uint8Array(size);
    fill(new DataView(buf.buffer));
    this.chunks.push(buf);
    this.offset += size;
  }

  writeUInt8(v: number):  void { this.push(1, dv => dv.setUint8(0, v)); }
  writeUInt16(v: number): void { this.push(2, dv => dv.setUint16(0, v, true)); }
  writeUInt32(v: number): void { this.push(4, dv => dv.setUint32(0, v, true)); }
  writeUInt64(v: bigint): void { this.push(8, dv => dv.setBigUint64(0, v, true)); }
  writeInt8(v: number):   void { this.push(1, dv => dv.setInt8(0, v)); }
  writeInt16(v: number):  void { this.push(2, dv => dv.setInt16(0, v, true)); }
  writeInt32(v: number):  void { this.push(4, dv => dv.setInt32(0, v, true)); }
  writeInt64(v: bigint):  void { this.push(8, dv => dv.setBigInt64(0, v, true)); }
  writeFloat(v: number):  void { this.push(4, dv => dv.setFloat32(0, v, true)); }
  writeDouble(v: number): void { this.push(8, dv => dv.setFloat64(0, v, true)); }

  writeRawData(data: Uint8Array): void {
    this.chunks.push(data);
    this.offset += data.length;
  }

  align(alignment: number): void {
    const rem = this.offset % alignment;
    if (rem !== 0) this.writeRawData(new Uint8Array(alignment - rem));
  }

  toUint8Array(): Uint8Array {
    const out = new Uint8Array(this.offset);
    let pos = 0;
    for (const chunk of this.chunks) { out.set(chunk, pos); pos += chunk.length; }
    return out;
  }
}
```

---

## 4. `serializeDefaultParameterData`

**File (new):** `packages/core/src/application/usecase-designer/spf-module/param-parser/serialize-elements.ts`

Entry point mirrors `parseParameterData` in shape. Takes the `elementsStructure` JSON string (from `ParamDefinition.elementsStructure` or `PropertyDefinition.elementsStructure`) and returns a `Uint8Array` of all-default bytes.

```ts
export function serializeDefaultParameterData(elementsStructure: string): Uint8Array {
  const definitions = convertParamDefinition(elementsStructure);  // reuse from parse-elements
  const writer = new BinaryDataWriter();
  const context: WrittenScalar[] = [];  // for formula resolution, mirrors parsedSoFar
  for (const el of definitions) {
    writeDefaultElement(el, writer, context);
  }
  writer.align(8);  // matches binary format: payload padded to 8-byte boundary
  return writer.toUint8Array();
}
```

### 4.1 Dispatch (`writeDefaultElement`)

```
ConfigElement →
  if element.alignment: writer.align(element.alignment)
  value = parseDefaultScalar(element.defaultValue, element.dataType)  // 0 if absent
  writeScalar(element.dataType, value, writer)
  push { name: element.name, value } to context for formula resolution

StructElement →
  if element.alignment: writer.align(element.alignment)
  recurse each child in element.elements
  writer.align(4)

ElementArray →
  if element.alignment: writer.align(element.alignment)
  length = element.arrayLength ?? 0  // formula-driven length: use arrayLength fallback
  for i in [0..length): writeDefaultElement(element.template, writer, context)

StructArray →
  if element.alignment: writer.align(element.alignment)
  length = element.arrayLength ?? 0
  for i in [0..length): writeDefaultElement(element.template, writer, context)
```

### 4.2 `parseDefaultScalar`

Parses `defaultValue: string | undefined` to the native type expected by the writer. Matches the same type dispatch as `readScalar` in `parse-elements.ts`:

| `dataType` | Parse method | Zero fallback |
|---|---|---|
| UInt8/16/32 | `parseInt(v, 10) \|\| 0` | 0 |
| Int8/16/32 | `parseInt(v, 10) \|\| 0` | 0 |
| UInt64/Int64 | `BigInt(parseInt(v, 10))` | 0n |
| Float/Double | `parseFloat(v) \|\| 0` | 0 |
| RawData | emit `maxSize` zero bytes | all zeros |

For `RawData`, the element has no fixed width from `dataType` alone — emit `Math.ceil((element.maxSize ?? 0))` zero bytes. This mirrors how `readRawData` consumes all remaining bytes in the reader (for default generation, `maxSize` is the authoritative size).

### 4.3 Formula-driven arrays

`arrayLenFormulaStr` references previously written scalar values by name (same as `parsedSoFar` in the reader). For default blobs, all scalars are their `defaultValue` or 0. The formula evaluator from `param-parser/utils/formular-evaluator.ts` is reused with a context map built from the written scalars. If the formula cannot be evaluated or yields 0, fall back to `element.arrayLength ?? 0` — the same rule the reader uses.

---

## 5. Identifying Calibration Parameters

A calibration parameter is one whose `pidType` field (on `SpfModuleParameterDefinition`) identifies it as a calibration PID type. These are the parameters that have `CkvParameterPayload` rows in the committed state.

**New method on `ModuleDefinitionRepository` port:**

```ts
findCalibrationParametersByDefinitionId(
  definitionSystemId: number,
  fileSystemId: number,
): Promise<Array<{ systemId: number; elementsStructure: string }>>;
```

Persistence SQL:

```sql
SELECT system_id, elements_structure
FROM spf_module_parameter_definitions
WHERE spf_module_definition_system_id = ?
  AND file_system_id = ?
  AND pid_type = 'CAL'
```

> If the exact `pid_type` string value for calibration is not `'CAL'`, it can be confirmed from an existing ACDB upload — query `spf_module_parameter_definitions` for any module that has `ckv_parameter_payloads` rows and read its `pid_type`. The SQL above uses `'CAL'` as the expected value per the AudioReach parameter type convention.

---

## 6. Zero CKV

A zero-CKV is a `Ckv` row with no `CkvValues` entries — it represents the default calibration bin where all key dimensions are zero. Every newly added module gets exactly one zero-CKV.

**New methods on `ModuleRepository` port:**

```ts
createZeroCkv(
  moduleSystemId: number,
  ckvSystemId: number,
  options?: EditOptions,
): Promise<void>;

createCkvParameterPayload(
  ckvSystemId: number,
  parameterDefinitionSystemId: number,
  payload: Uint8Array,
  payloadSystemId: number,
  options?: EditOptions,
): Promise<void>;
```

Both write through `PendingChangeWriter` with `aggregateId = moduleSystemId`, sharing the same `groupId` as all other rows in the call. `createZeroCkv` writes a `Ckv` CREATE row (no `CkvValues` children). `createCkvParameterPayload` writes a `CkvParameterPayload` CREATE row.

---

## 7. Subgraph Property Defaults

When a new subgraph is auto-created (Variants 1 and 2), every `SubgraphPropertyDefinition` present in the file gets a seeded `SubgraphPropertyData` row.

**New methods on `SubgraphRepository` port:**

```ts
findPropertyDefinitions(
  fileSystemId: number,
): Promise<Array<{ systemId: number; elementsStructure: string }>>;

createPropertyData(
  subgraphSystemId: number,
  propertyDefinitionSystemId: number,
  payload: Uint8Array,
  options?: EditOptions,
): Promise<void>;
```

`findPropertyDefinitions` is a committed-state read — no overlay needed, property definitions are imported at upload time and never modified in-session. `createPropertyData` writes through `PendingChangeWriter` with `aggregateId = subgraphSystemId`.

---

## 8. Container Property Defaults

When a new container is auto-created (Variants 1 and 2), every `ContainerPropertyDefinition` in the file gets a seeded `ContainerPropertyData` row.

**New method on `ContainerRepository` port:**

```ts
findPropertyDefinitions(
  fileSystemId: number,
): Promise<Array<{ systemId: number; propertyId: number; elementsStructure: string }>>;
```

`propertyId` is included so the handler can skip properties whose values are already written by `ContainerStackSizeService`. The write side reuses the existing `setPropertyValue` method (already on the port from the add-module design §5.2) — for a new container there is no existing row, so `setPropertyValue` writes a CREATE.

**Interaction with `ContainerStackSizeService`:**

`ContainerStackSizeService.initializeStackSize` calls `setPropertyValue` for `CONTAINER_PROP_ID_STACK_SIZE` (0x08001013). If the handler also writes a default blob for that property in step 12, the stack-size service call (which happens first in the original step 4) will be overwritten. To avoid this conflict, **skip `CONTAINER_PROP_ID_STACK_SIZE` in step 12**:

```ts
for (const propDef of ctrPropDefs) {
  if (propDef.propertyId === CONTAINER_PROP_ID_STACK_SIZE) continue;
  const blob = serializeDefaultParameterData(propDef.elementsStructure);
  await containerRepo.setPropertyValue(containerSystemId, propDef.systemId, blob);
}
```

`CONTAINER_HEAP_PROP_ID` (0x08001174) should be seeded normally — it is a container-level property that controls heap mode, distinct from the `heap_property` column on `spf_modules` which stores the module's heap allocation value.

---

## 9. Handler Steps Added to `AddModuleHandler`

These are appended to the handler body in `add-module.handler.ts` after the original step 9 (module creation), all within the same transaction:

```
// Step 10: Zero CKV + calibration parameter default payloads
calibrationParams ← moduleDefRepo.findCalibrationParametersByDefinitionId(definition.systemId, fileSystemId)
if calibrationParams.length > 0:
  ckvSystemId ← idGeneration.getNextId(fileSystemId)
  await moduleRepo.createZeroCkv(moduleSystemId, ckvSystemId)
  for each param in calibrationParams:
    blob ← serializeDefaultParameterData(param.elementsStructure)
    payloadSystemId ← idGeneration.getNextId(fileSystemId)
    await moduleRepo.createCkvParameterPayload(ckvSystemId, param.systemId, blob, payloadSystemId)

// Step 11: Subgraph property defaults  (Variants 1 and 2 only — newSubgraphCreated flag)
if newSubgraphCreated:
  sgPropDefs ← subgraphRepo.findPropertyDefinitions(fileSystemId)
  for each propDef in sgPropDefs:
    blob ← serializeDefaultParameterData(propDef.elementsStructure)
    await subgraphRepo.createPropertyData(subgraphSystemId, propDef.systemId, blob)

// Step 12: Container property defaults  (Variants 1 and 2 only — newContainerCreated flag)
if newContainerCreated:
  ctrPropDefs ← containerRepo.findPropertyDefinitions(fileSystemId)
  for each propDef in ctrPropDefs:
    if propDef.propertyId === CONTAINER_PROP_ID_STACK_SIZE: continue
    blob ← serializeDefaultParameterData(propDef.elementsStructure)
    await containerRepo.setPropertyValue(containerSystemId, propDef.systemId, blob)
```

`newSubgraphCreated` and `newContainerCreated` are local boolean flags set in the subgraph and container resolution blocks (steps 3 and 4 in the original handler skeleton).

The `moduleDefRepo` reference is already in scope (`ModuleDefinitionRepository` is injected to resolve the definition in step 1). No new constructor parameters needed on the handler.

---

## 10. Port Interface Changes Summary

| Interface | Method | Purpose |
|---|---|---|
| `ModuleDefinitionRepository` | `findCalibrationParametersByDefinitionId` | Fetch calibration param definitions for default-blob generation |
| `ModuleRepository` | `createZeroCkv` | Stage zero-CKV CREATE row |
| `ModuleRepository` | `createCkvParameterPayload` | Stage parameter payload CREATE row under the CKV |
| `SubgraphRepository` | `findPropertyDefinitions` | Fetch subgraph property definitions |
| `SubgraphRepository` | `createPropertyData` | Stage subgraph property data CREATE row |
| `ContainerRepository` | `findPropertyDefinitions` | Fetch container property definitions (returns `propertyId` for skip-list check) |
| `ContainerRepository` | `setPropertyValue` | Already on port — reused for container property seeding |

---

## 11. File Layout

**New files:**
- `packages/core/src/application/usecase-designer/spf-module/param-parser/utils/binary-data-writer.ts`
- `packages/core/src/application/usecase-designer/spf-module/param-parser/serialize-elements.ts`

**Modified files:**
- `packages/core/src/application/ports/persistence/repositories/module-definition/module-definition.repository.ts` — add `findCalibrationParametersByDefinitionId`
- `packages/core/src/application/ports/persistence/repositories/module/module.repository.ts` — add `createZeroCkv`, `createCkvParameterPayload`
- `packages/core/src/application/ports/persistence/repositories/subgraph/subgraph.repository.ts` — add `findPropertyDefinitions`, `createPropertyData`
- `packages/core/src/application/ports/persistence/repositories/container/container.repository.ts` — add `findPropertyDefinitions`
- `packages/core/src/application/usecase-designer/spf-module/add-module/add-module.handler.ts` — steps 10–12
- `packages/core/src/application/usecase-designer/spf-module/param-parser/index.ts` — export `serializeDefaultParameterData`
- Persistence adapters for all modified port interfaces

---

## 12. Testing Strategy

### 12.1 Unit tests (`@arc/core`)

**`BinaryDataWriter`:**
- Round-trip: write a known value of each scalar type, read it back with `BinaryDataReader` — values match.
- `align`: offset advances to correct boundary; no-op when already aligned.
- `toUint8Array`: concatenation is correct across multiple chunks.

**`serializeDefaultParameterData`:**
- `ConfigElement` with `defaultValue` present → correct bytes.
- `ConfigElement` with absent `defaultValue` → zero bytes of the correct width.
- `StructElement` → children serialized in order, 4-byte alignment pad applied after.
- `ElementArray` with fixed `arrayLength` → N copies of template written.
- `RawData` element → `maxSize` zero bytes emitted.
- Final output is padded to 8-byte boundary.
- Round-trip: `serializeDefaultParameterData` output → `parseParameterData` → each `ConfigElementData.value` matches the `defaultValue` from the definition (or `"0"`).

**`AddModuleHandler` new cases:**
- Module with calibration params → `createZeroCkv` and `createCkvParameterPayload` called once per param.
- Module with zero calibration params → neither method called.
- Variant 1 (new subgraph + new container) → `subgraphRepo.createPropertyData` and `containerRepo.setPropertyValue` called for each property definition; `CONTAINER_PROP_ID_STACK_SIZE` skipped.
- Variant 3 (existing container) → no container property seeding.

### 12.2 Integration tests (`@arc/persistence`)

- `findCalibrationParametersByDefinitionId` returns only params with `pid_type = 'CAL'`; excludes persistent params.
- `createZeroCkv` + `createCkvParameterPayload`: correct `edit_actions` CREATE rows; `aggregateId = moduleSystemId` on all rows.
- `SubgraphRepository.createPropertyData`: correct CREATE row in `edit_actions`; `aggregateId = subgraphSystemId`.
- `ContainerRepository.findPropertyDefinitions`: returns all property definitions for the file; includes `propertyId` field.

### 12.3 E2E tests (`@arc/api`)

- Variant 1 POST → response module has a zero-CKV visible via the GET cal-data endpoint; calibration parameter payloads parse correctly with all-default values.
- Variant 1 POST → GET subgraph returns subgraph with property data rows present.
- Variant 1 POST → container property data rows present; stack-size property has the value set by `ContainerStackSizeService`, not the default blob.
