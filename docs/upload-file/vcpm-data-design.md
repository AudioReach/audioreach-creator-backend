# VCPM Data Upload Design

## Problem

When an ACDB file is uploaded, voice calibration data (VCPM_CALDATA chunk) contains per-subgraph calibration key-value entries. A subset of these entries belong to the VCPM module — identifiable by `moduleInstanceId = 4` (`SPF_VCPM_MODULE_ID`). This data needs to be persisted to the `vcpm_instances`, `vcpm_ckv`, `vcpm_ckv_values`, and `vcpm_parameter_payload` tables so that the VCPM module's calibration state is captured in the database alongside the rest of the subgraph data.

Currently, `vcpmDataInstance` on the `Subgraph` domain entity is always `null` after parsing. The `SubgraphInserter` already has full insertion logic for VCPM rows — it simply has nothing to insert.

---

## Scope

This design covers the full pipeline from AWSP definitions through to VCPM row insertion:

1. Parse `vcpmModuleDefinitions` from the AWSP `definitions.json`
2. Build and insert `VcpmModuleDefinition` entities (with params) before subgraphs
3. Build `VcpmInstance` objects (one per subgraph with voice cal data) and attach them to `Subgraph` entities
4. The existing `SubgraphInserter` writes the VCPM rows automatically once `vcpmDataInstance` is populated

---

## Data Sources

| Data | Source | Used for |
|------|--------|----------|
| VCPM module definitions (id, name, params) | AWSP `definitions.json` → `vcpmModuleDefinitions[]` | `vcpm_module_definitions` + `vcpm_module_parameter_definitions` tables |
| Voice calibration tables (subgraphId, CKV entries, payloads) | ACDB `VCPM_CALDATA` chunk | `vcpm_instances`, `vcpm_ckv`, `vcpm_ckv_values`, `vcpm_parameter_payload` tables |
| VCPM module instance ID (= 4) | `VCPM_CALDATA` chunk header → `voiceModuleInstanceId` | Resolves to `VcpmModuleDefinition.systemId` via ForeignKeyMapper |

---

## Entity Relationships

```
VcpmModuleDefinition (1) ──── (N) VcpmModuleParameterDefinition
        │
        │ (vcpmDefinitionId FK)
        ▼
VcpmInstance (per subgraph with voice cal data)
        │
        │ (vcpmInstanceSystemId FK)
        ▼
VcpmCkv  (one per calibration key-vector combination)
   │        │
   │        └──── VcpmCkvValues (join: ckv → value definitions)
   │
   └──── VcpmParameterPayload (one per module-parameter pair)
              └── vcpmParameterSystemId FK → VcpmModuleParameterDefinition
```

---

## Insertion Order

The VCPM pipeline slots into the existing hierarchical insertion order:

```
Phase 1d2: Driver Module Definitions
Phase 1d3: VCPM Module Definitions  ← NEW (must precede subgraphs)
Phase 1e:  Subgraph Property Definitions
Phase 2:   Subgraphs + VcpmInstances  ← SubgraphInserter already handles VCPM rows
```

`VcpmModuleDefinition` must be inserted before `Subgraph` because `vcpm_instances.vcpm_definition_id` is a FK to `vcpm_module_definitions.system_id`.

---

## Key Design Decisions

**1. VCPM module definition as a separate definition type**
VCPM modules live in `vcpmModuleDefinitions` in the AWSP file (not under SPF or driver modules). They follow the same JSON shape as driver modules (`id`, `name`, `displayName`, `description`, `paramDefinitions[]`) so the same serializer/builder pattern applies directly.

**2. ForeignKeyMapper carries VCPM definition systemIds**
After `VcpmModuleDefinition` entities are built and stored in the DB, their `(moduleDefinitionId → systemId)` mappings are registered in `ForeignKeyMapper`. The `VcpmDataBuilder` then resolves `vcpmDefinitionId` from `voiceCalChunk.voiceModuleInstanceId` at build time.

**3. VCPM attachment lives in `CalibrationDataBuilder`**
Rather than a dedicated `VcpmDataBuilder`, the VCPM attachment logic (`attachVcpmDataToSubgraphs`, `buildVcpmInstance`, `processVcpmCkvDataTable`, `processVcpmCalDataObject`, `resolveVcpmParamPayloads`) was added to `CalibrationDataBuilder`. `EntityBuilderService.buildSubgraphs()` instantiates `CalibrationDataBuilder` and calls `attachVcpmDataToSubgraphs()` immediately after subgraph entities are built.

**4. Param resolution uses VcpmParamDefinition mappings**
Parameter payloads in VCPM CKV entries reference `paramId` values. These are resolved to `VcpmModuleParameterDefinition.systemId` via new `addVcpmParamDefinitionMapping` / `getVcpmParamDefinitionSystemId` methods on `ForeignKeyMapper`, following the same pattern as SPF and driver param resolution.

**5. SubgraphInserter requires no changes**
The inserter already calls `insertVcpmInstances()`, `insertVcpmCkvs()`, and `insertVcpmParameterPayloads()` — gated on `subgraph.vcpmDataInstance !== null`. All changes are upstream in the build layer.

---

## New Components

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `AwspVcpmModuleDefinition` | `shared/awsp-serializers/v1/definitions/module-definition/vcpm/` | Deserializes VCPM definition JSON; `fromJSON` + `toJSON` |
| `AwspVcpmModuleDefinitionSchema` | same folder | Zod schema for validation |
| `VcpmModuleDefinitionBuilder` | `upload-file/services/entity-builders/` | Converts `AwspVcpmModuleDefinition` → `VcpmModuleDefinition` domain entities with systemIds; registers ForeignKeyMapper entries |

---

## Modified Components

| Component | Change |
|-----------|--------|
| `definition-block-names.ts` | Add `VCPM_MODULE_DEFINITIONS: 'vcpmModuleDefinitions'` |
| `ParsedAwsp` | Add `AwspVcpmModuleDefinition[]` to union; add `getVcpmModuleDefinitions()` |
| `AwspParser` | Register schema + hydrator for `vcpmModuleDefinitions` block |
| `ForeignKeyMapper` | Add VCPM module definition and param definition mappings |
| `EntityBuilderService` | Exposes `buildVcpmModuleDefinitions()`; after building subgraphs, instantiates `CalibrationDataBuilder` and calls `attachVcpmDataToSubgraphs()` to populate `vcpmDataInstance` on each `Subgraph` |
| `UploadFileOrchestrator` | Add Phase 1d3: `buildAndInsertVcpmModuleDefinitions()` |
