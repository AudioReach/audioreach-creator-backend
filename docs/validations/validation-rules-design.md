<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Validation Rules — Low Level Design

**Requirements:** [`requirements/validations-requirements.md`](requirements/validations-requirements.md)  
**Decision Log:** [`requirements/decision-log.md`](requirements/decision-log.md)  
**Implementation Handoff:** [`requirements/implementation-handoff.md`](requirements/implementation-handoff.md)  
**Framework Design:** [`../validation-framework-design.md`](../validation-framework-design.md)

---

## Table of Contents

1. [Scope](#1-scope)
2. [Validation Ownership Model](#2-validation-ownership-model)
3. [Validation Framework — High-Level Workflow](#3-validation-framework--high-level-workflow)
4. [REST Endpoint Support](#4-rest-endpoint-support)
5. [Infrastructure Prerequisites](#5-infrastructure-prerequisites)
6. [Context Profile Changes](#6-context-profile-changes)
7. [Rule Designs — Module Rules](#7-rule-designs--module-rules)
8. [Rule Designs — Container Rules](#8-rule-designs--container-rules)
9. [Rule Designs — Link Rules](#9-rule-designs--link-rules)
10. [Rule Designs — Subgraph Rules](#10-rule-designs--subgraph-rules)
11. [P2/P3 Rule Catalog](#11-p2p3-rule-catalog)
12. [Fix Command Catalog](#12-fix-command-catalog)
13. [Rule Registration](#13-rule-registration)
14. [Testing Strategy](#14-testing-strategy)

---

## 1. Scope

### 1.1 Purpose

Define the low-level design for all validation rules in the ARC Creator validation framework. The framework infrastructure (engine, orchestrator, context builder, preferences, fix dispatch) is already designed and partially implemented. This document covers the rule catalog, context profile extensions, infrastructure gaps to close, and fix-command schemas.

### 1.2 Already Implemented

`ARC-MOD-001` (`MissingDefinitionRule`) has a stub implementation in `packages/core/src/domain/validation/rules/module/missing-definition.rule.ts`. The current code checks only that a definition with the matching `definitionSystemId` exists — it does not verify the definition belongs to the module's container's processor domain. The stub must be replaced with the full implementation described in §7.1.

### 1.3 Excluded

Deprecated switch validations (`SwitchValidation`, `SwitchCtrlLinksValidation`) are out of scope.

### 1.4 Code Naming Convention

Each rule maps to exactly one check. Two ARC codes are never the same check.

- **ARC code** — primary identifier used in the implementation. Format: `ARC-<CATEGORY>-<NNN>`.
- **QACT legacy code** — reference to the original QACT error/warning code (e.g., `E133`, `W108`). Kept for traceability only; not present in implementation code.

### 1.5 Priority

P1 rules are implemented first. P2 and P3 rules are cataloged in §11 with "TODO — future phase" markers. P2/P3 groups columns will be expanded to the detailed format before those rules are implemented.

---

## 2. Validation Ownership Model

Each validation has two independent dimensions.

**Dimension 1 — WHEN it runs**

| Group | When | Who decides what runs | Execution model |
|---|---|---|---|
| `UPLOAD_FILE` | During file upload, before DB insertion — entities are in memory | `ValidationEngine` — runs all rules declaring this group | Batch |
| `SESSION_UPDATE` | During a user edit, inside a command handler, before the handler persists | Each handler — calls only the rules relevant to its operation | Per-handler, selective |
| `SAVE_FILE` | During save-file, after all edits, before final persistence | `ValidationEngine` — runs all rules declaring this group | Batch |

> **`SESSION_UPDATE` is a conceptual label only** — it is not a `ValidationRuleGroup` enum value and is not processed by `ValidationEngine`. Handlers call rules directly with a minimal inline context; no group constant is needed.

> **Upload-time validation is not yet wired.** The upload handler currently returns `validationReport = null`. The `fromEntities()` path in `ValidationContextBuilder` is the planned mechanism but is not yet connected. See §5.1 (OQ-003).

> **`SAVE_FILE` vs DB constraint:** If a DB foreign-key constraint enforces the same invariant a rule checks, that rule does not need to be in the `SAVE_FILE` group — the DB constraint serves as the final gate at INSERT time. The Core rule is still required in other groups (`UPLOAD_FILE`, `SESSION_UPDATE`); only `SAVE_FILE` can be omitted.

**Dimension 2 — WHERE the check lives**

| Category | Where implemented | Role |
|---|---|---|
| **DB Constraint** | Database schema (migration) | Final gate — fires automatically on every `INSERT`/`UPDATE`. Transparent to the validation framework. Never a substitute for a Core rule. |
| **Core Validation** | `ValidationRule` in `core/domain/validation/rules/` | Primary mechanism for `UPLOAD_FILE` and `SAVE_FILE` groups. Can also be called by a handler for `SESSION_UPDATE`. |
| **Handler-specific** | Inside a command handler | Used for `SESSION_UPDATE` checks unique to one operation and never needed at upload or save time. |

**How context is built — the caller decides:**

- **`/validate` endpoint and Save File** → `ValidationContextBuilder.fromDb(fileSystemId, requiredEntityTypes)`
- **Upload File** → `ValidationContextBuilder.fromEntities(entities)` (future — not yet wired)
- **Handler** → constructs a minimal context inline, calls the rule directly — no `ValidationContextBuilder` needed

### Representative Examples

| Validation | DB Constraint | Groups |
|---|---|---|
| **ARC-MOD-001** Missing Module Definition | FK on `definitionSystemId` | **UPLOAD_FILE:** Core rule via engine (`fromEntities`)<br>**SESSION_UPDATE:** Handler constructs minimal context, calls rule directly |
| **Module–Container Compatibility** | None | **SESSION_UPDATE:** Handler constructs minimal context, calls rule directly<br>**SAVE_FILE:** Core rule via engine (`fromDb`) — no DB constraint, must run here |
| **Replace Module compatibility** | None | **SESSION_UPDATE:** Handler-specific check only; throws domain exception |

### Shared Implementation between Handlers and Validation Rules

**Case 1 — Rule called directly from the handler.** If the handler already has the relevant entities in scope, it constructs a minimal context inline and calls the rule:

```typescript
const context: ModuleValidationContext = {
  fileSystemId,
  preferences: EMPTY_PREFERENCES,
  modules: [newModule],
  definitions: new Map([[definition.systemId, definition]]),
  modulesBySystemId: new Map([[newModule.systemId, newModule]]),
  usecasesByModuleSystemId: new Map(),
};
const issues = new MissingDefinitionRule().validate(context);
if (issues.length > 0) throw new ValidationException(issues);
```

**Case 2 — Rule and handler implemented separately.** Some validations cannot share implementation due to execution context. Example: in a batch set operation, validating one entry requires considering other entries in the same batch that are not yet in the DB. A Core rule using `fromDb()` would miss them. The handler must implement its own check aware of the full batch payload; the Core rule implements the DB-based check independently for save scenarios.

### Upload Validation Error Behavior

When an `UPLOAD_FILE` validation run detects errors: **continue file opening; do not abort.** Entities whose DB insertion fails (due to constraint violations) are not inserted — their data is lost. All failures and data-loss events are collected and presented in the validation report after upload. The user can acknowledge the data loss and continue, or cancel and fix the source externally.

**AutoFix for upload data loss** (retrying failed insertions after the user supplies a fix) is deferred to future work.

### UPLOAD_FILE: `fromEntities` only

`UPLOAD_FILE` validations are entity-based only (`fromEntities`, pre-insert). There is no post-insert validation phase at file-open time.

- `UPLOAD_FILE` → always `fromEntities` (pre-insert)
- Rules that can only be checked against DB state → `SAVE_FILE` only (no `UPLOAD_FILE` entry)

---

## 3. Validation Framework — High-Level Workflow

The diagram below shows a batch validation run for the `SAVE_FILE` group.

```
Client
  │
  │  POST /validate  { group: "SAVE_FILE" }
  ▼
ValidateFileQueryHandler
  │
  │  constructs ValidationEngine([MissingDefinitionRule, ...])
  │  delegates to ValidationOrchestrator.validate(fileSystemId, SAVE_FILE)
  │
  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 1 — Collect required entity types                                  │
│                                                                         │
│  engine.getRequiredEntityTypes(SAVE_FILE)                               │
│  Scans every rule declaring SAVE_FILE, unions their requiredEntityTypes │
│  Result: { SpfModule, Container, SpfModuleDefinition, DataLink, ... }   │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 2 — Build FileValidationContext (once, shared by all rules)        │
│                                                                         │
│  ValidationContextBuilder.fromDb(fileSystemId, requiredEntityTypes)     │
│  Fires one DB query per entity type in parallel (Promise.all).          │
│  Builds reverse-index maps once from the loaded arrays.                 │
│  Result: FileValidationContext — one object, held in memory             │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 3 — Run each rule against the shared context                       │
│                                                                         │
│  engine.run(context, SAVE_FILE)                                         │
│  For each rule declaring SAVE_FILE:                                     │
│    rule.validate(context) → ValidationIssue[]                           │
│  Rules are synchronous and pure — no DB calls inside validate()         │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 4 — Apply user preferences to each issue                           │
│                                                                         │
│  preference-enforcer.applyPreferences(issue, context.preferences)       │
│  ERROR/FATAL → BLOCKING → always shown                                  │
│  WARNING     → NON_BLOCKING → check IssuePreference.disabled            │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 5 — Merge with stored DATA_LOSS issues                             │
│                                                                         │
│  Load files.data_loss_issues (persisted during upload when DB           │
│  insertion failed for an entity).                                       │
│  Merge: engine issues + stored DATA_LOSS issues → ValidationReport      │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
                           ValidationReport
                             issues[]         ← effective severity
                             blockedSave       ← true if any BLOCKING
                             summary           ← counts by severity/category
```

**Key design properties:**
- Rules are **synchronous and pure** — all data pre-loaded; no DB calls inside `validate()`
- Context is built **once** and shared across all rules in a single run
- Only the **minimal set of DB tables** is queried, determined by `requiredEntityTypes` union
- Each rule is **typed to a context profile** — TypeScript prevents accessing entity types outside its declared scope

---

## 4. REST Endpoint Support

The REST endpoints are defined in `validation-framework-design.md` §9. They are not yet wired to controllers.

### FR-REST-001: On-Demand Validation

`POST /arc-api/v1/projects/:projectId/validate` — runs the validation engine and returns a `ValidationReport`.

Accepts any `ValidationRuleGroup`. The engine builds context from DB (`fromDb()`) and runs only the rules declaring that group:

- **`SAVE_FILE`** (primary use) — runs all SAVE_FILE rules against DB state.
- **`SESSION_UPDATE`** — runs the Core rules that declare SESSION_UPDATE; handler-specific SESSION_UPDATE checks are invisible to the engine.
- **`UPLOAD_FILE`** — technically valid but **practically useless** on this path. All current UPLOAD_FILE rules have DB constraints, so running them against DB state finds nothing new.

### FR-REST-002: Apply Fix

`POST /arc-api/v1/projects/:projectId/apply-fix` — dispatches a fix command by `commandType` and `commandPayload`; accepts an optional `dataLossIssueKey` to remove a resolved DATA_LOSS issue.

### FR-REST-003: Acknowledge Data Loss

`POST /arc-api/v1/projects/:projectId/acknowledge-data-loss` — clears all stored DATA_LOSS issues and transitions the project to `READY`.

### FR-REST-004: Get Validation Preferences

`GET /arc-api/v1/projects/:projectId/validation-preferences` — returns the current validation preferences for the project file.

### FR-REST-005: Update Validation Preferences

`PATCH /arc-api/v1/projects/:projectId/validation-preferences` — merges incoming overrides and suppressions into existing preferences.

---

## 5. Infrastructure Prerequisites

These four gaps must be closed before the blocked P1 rules can run. They are ordered by dependency: step 1 is independent; steps 2–4 can be done in parallel after step 1.

### 5.1 Implement `findDefinitionsByFile()`

**File:** `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/typeorm-validation-query.repository.ts`

The method currently returns `[]`. It must query the `spf_module_definitions` table (and related parameter and port definition tables) filtered by `fileSystemId`, and return fully-constructed `SpfModuleDefinition` domain objects.

This follows the same loading pattern used by `findModulesByFile()` in the same file. The definition loading must include:
- Parameter definitions (loaded as `ParamDefinition[]` on each `SpfModuleDefinition`)
- Data port groups (`DataPortGroupDefinition[]`)
- Static control ports (`StaticControlPortDefinition[]`)
- Dynamic intents (`DynamicIntentDefinition[]`)

After this is implemented, add a `ValidationQueryRepository` integration test that verifies the definition load against a real SQLite DB fixture (see §10).

**Blocked rules that become unblocked:** ARC-MOD-001, ARC-MOD-002, ARC-LINK-005.

---

### 5.2 Add `Container` to `FileValidationContext` and `fromDb()`

**Core files to change:**

**`packages/core/src/domain/validation/validation-context.ts`** — add a new `ContainerValidationContext` profile and extend `FileValidationContext`:

```typescript
export interface ContainerValidationContext extends BaseValidationContext {
  containers: ReadonlyArray<Container>;
  /** Lookup: container systemId → Container. O(1) access in rules. */
  containersBySystemId: ReadonlyMap<number, Container>;
}

// FileValidationContext must extend ContainerValidationContext:
export interface FileValidationContext
  extends LinkValidationContext, ModuleValidationContext, ContainerValidationContext {
  // ... existing fields ...
}
```

**`packages/core/src/application/ports/persistence/repositories/validation/validation-query.repository.ts`** — add port method:

```typescript
findContainersByFile(fileSystemId: number): Promise<Container[]>;
```

**`packages/core/src/application/validation/validation-context-builder.ts`** — add to `fromDb()` parallel load block:

```typescript
requiredEntityTypes.has(ISSUE_ENTITY_TYPE.Container)
  ? this.queryRepo.findContainersByFile(fileSystemId)
  : Promise.resolve([] as Container[]),
```

Then build the reverse index in `buildContext()`:

```typescript
const containersBySystemId = new Map(containers.map(c => [c.systemId, c]));
```

**Infrastructure:** add `TypeOrmValidationQueryRepository.findContainersByFile()` — loads Container rows filtered by `fileSystemId`, including their `properties` map.

**Blocked rules that become unblocked:** ARC-MOD-001, ARC-MOD-007, ARC-MOD-008, ARC-MOD-009, ARC-CON-001, ARC-CON-002, ARC-CON-003, ARC-LINK-010.

---

### 5.3 Add `ContainerPropertyDefinition` to `FileValidationContext` and `fromDb()`

Container property definitions define the required properties for each container type. They are needed to check property completeness (ARC-CON-001) and parse validity (ARC-CON-002).

**New context profile** in `validation-context.ts`:

```typescript
export interface ContainerPropertyValidationContext extends ContainerValidationContext {
  /**
   * Lookup: containerTypeSystemId → ordered list of ContainerPropertyDefinition.
   * Used to determine which properties are required for a given container type.
   */
  containerPropertyDefinitionsByTypeId: ReadonlyMap<number, ReadonlyArray<PropertyDefinition>>;
}
```

**Port addition:**

```typescript
findContainerPropertyDefinitionsByFile(fileSystemId: number): Promise<PropertyDefinition[]>;
```

The loaded flat array is then grouped into a `Map<containerTypeSystemId, PropertyDefinition[]>` in `buildContext()`.

> **Note:** `PropertyDefinition` is used here (the base class) rather than `ContainerPropertyDefinitions` (which is a container class, not the item). Each `PropertyDefinition` carries a `naturalId` that maps to the CONTAINER_PROP_ID_* constants.

**`FileValidationContext`** must additionally extend `ContainerPropertyValidationContext`.

**Blocked rules that become unblocked:** ARC-CON-001, ARC-CON-002.

---

### 5.4 Add `SubgraphPropertyDefinition` to `FileValidationContext` and `fromDb()`

Subgraph property definitions are needed to check for missing or corrupt subgraph properties (ARC-SG-001, ARC-SG-002).

**New context profile** in `validation-context.ts`:

```typescript
export interface SubgraphPropertyValidationContext extends BaseValidationContext {
  /**
   * All subgraph property definitions for the file.
   * Each SubgraphPropertyDefinition has isVoice: boolean to distinguish
   * voice-only properties (required only for voice subgraphs).
   */
  subgraphPropertyDefinitions: ReadonlyArray<SubgraphPropertyDefinition>;
}
```

**Port addition:**

```typescript
findSubgraphPropertyDefinitionsByFile(fileSystemId: number): Promise<SubgraphPropertyDefinition[]>;
```

**`FileValidationContext`** must additionally extend `SubgraphPropertyValidationContext`.

**Blocked rules that become unblocked:** ARC-SG-001, ARC-SG-002.

---

### 5.5 Group Rename: `COMMIT` → `SAVE_FILE`

**File:** `packages/core/src/domain/validation/validation-rule.ts`

The current code defines `VALIDATION_RULE_GROUP.Commit = 'COMMIT'`. Per DEC-003, this must be renamed to align with the requirements doc.

```typescript
export const VALIDATION_RULE_GROUP = {
  UploadFile: 'UPLOAD_FILE',
  SaveFile: 'SAVE_FILE',   // was: Commit: 'COMMIT'
} as const;
```

**Impact:** Update `MissingDefinitionRule` (the only existing rule) to replace `VALIDATION_RULE_GROUP.Commit` with `VALIDATION_RULE_GROUP.SaveFile`. Update any other references to `VALIDATION_RULE_GROUP.Commit` in the codebase.

> **Status: done** — committed in feat(validations): implement ARC-MOD-005 ZeroCkvMixRule.

---

### 5.6 Implement `findModulesByFile()` in `TypeOrmValidationQueryRepository`

**File:** `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/validation/typeorm-validation-query.repository.ts`

The method currently returns `[]`. It must query committed (baseline) tables for all `SpfModule` domain objects belonging to a file, including their CKVs.

**Semantics:** SAVE_FILE validation runs after the session is committed to the DB, so reading baseline tables (no overlay, no session) is correct.

**Requirements:**

- **FR-1** — Return all `SpfModule` domain objects for `fileSystemId` from committed tables; no session, no overlay.
- **FR-2** — Each module carries `systemId`, `naturalId`, `alias`, `definitionSystemId`, `containerSystemId`, `subgraphSystemId`, `fileSystemId`; `dataPorts` and `controlPorts` are empty arrays (no validation rule uses them).
- **FR-3** — Each module has its CKVs loaded via `addModuleCkv(new KvData({systemId, valueDefinitionSystemIds, uiPersistence: null}))`; a `ckv` row with no `ckv_values` rows produces `valueDefinitionSystemIds: []` (the zero-key case ARC-MOD-005 detects).
- **FR-4** — Module rows are fetched in one query; `ckv_values` rows are fetched in chunks (≤999 bind variables) to respect the SQLite variable limit — follow the same pattern used in `TypeOrmBulkReadQueryService.readCalibrationData`.
- **FR-5** — Uses only the `DataSource` already held by `TypeOrmValidationQueryRepository`; no constructor changes required.

**Implementation sketch:**

```typescript
async findModulesByFile(fileSystemId: number): Promise<SpfModule[]> {
  // Step 1: load all spf_module rows for the file
  const moduleRows = await this.dataSource
    .getRepository(SpfModuleSchema)
    .createQueryBuilder('m')
    .where('m.fileSystemId = :fileSystemId', {fileSystemId})
    .getMany();

  if (moduleRows.length === 0) return [];

  // Step 2: build domain SpfModule objects (no ports needed for validation)
  const moduleMap = new Map<number, SpfModule>();
  for (const row of moduleRows) {
    const mod = new SpfModule({
      systemId: row.systemId,
      naturalId: row.naturalId,
      alias: row.alias,
      definitionSystemId: row.definitionSystemId,
      containerSystemId: row.containerSystemId,
      subgraphSystemId: row.subgraphSystemId,
      fileSystemId,
      dataPorts: [],
      controlPorts: [],
    });
    moduleMap.set(row.systemId, mod);
  }

  // Step 3: load ckv rows for the file's modules
  const moduleIds = [...moduleMap.keys()];
  const ckvRows = await this.dataSource
    .getRepository(CkvSchema)
    .createQueryBuilder('ckv')
    .where('ckv.spfModuleSystemId IN (:...moduleIds)', {moduleIds})
    .getMany();

  if (ckvRows.length === 0) return [...moduleMap.values()];

  // Step 4: load ckv_values in chunks (SQLite 999-variable limit)
  const ckvIds = ckvRows.map(c => c.systemId);
  const valueRows = await queryInChunks(this.dataSource, CkvValuesSchema, ckvIds);

  // Step 5: group values by ckvSystemId and attach to modules
  const valuesByckv = groupBy(valueRows, v => v.ckvSystemId);
  for (const ckvRow of ckvRows) {
    const values = valuesByckv.get(ckvRow.systemId) ?? [];
    const mod = moduleMap.get(ckvRow.spfModuleSystemId);
    mod?.addModuleCkv(new KvData({
      systemId: ckvRow.systemId,
      valueDefinitionSystemIds: values.map(v => v.valueDefSystemId),
      uiPersistence: null,
    }));
  }

  return [...moduleMap.values()];
}
```

**Integration test** — `packages/infrastructure/persistence/tests/integration/repositories/validation/validation-query.repository.spec.ts`:

Follow the seed pattern from `module-ckv-cal-data.repository.spec.ts`. Cover:
1. Module with only a zero-key CKV (`ckv` row, no `ckv_values`) — `valueDefinitionSystemIds` is `[]`
2. Module with non-zero CKVs — `valueDefinitionSystemIds` contains the correct IDs
3. Module with mixed CKVs (one zero-key + one non-zero) — ARC-MOD-005 case; both CKVs returned
4. File with no modules — returns `[]`

**Blocked rules that become unblocked:** ARC-MOD-005 (end-to-end via SAVE_FILE path).

---

### 5.7 Implement the `POST /:projectId/validate` REST endpoint

**Files:** `packages/core/src/application/validation/queries/` (query, handler), `packages/api/src/presentation/rest/modules/project/` (controller, DTOs).

Implements FR-REST-001 (§4). Without it no rule can fire through the HTTP API, so it is the last prerequisite for end-to-end coverage of ARC-MOD-005.

**Already in place (no change):** `ValidateFileQueryHandler` is registered in `QueryHandlerRegistry`; `DbQueryServices.validationQueryService` is wired to `TypeOrmValidationQueryRepository`; `ValidationReport.blockedSave` is `readonly` and set only in the constructor.

**Requirements:**

- **FR-1** — Body is `{ "group"?: "UPLOAD_FILE" | "SAVE_FILE" }`. `group` is optional; an unknown value returns 400. When omitted, the query layer applies `SAVE_FILE`.
- **FR-2** — Resolve the project's `fileSystemId` from `projectId`, run `ValidateFileQuery`, return the report. A project with no file returns 404.
- **FR-3** — HTTP 200 with `ApiResult<ValidateFileResponseDto>`: the run metadata and summary in `data`, the issues in the envelope's `issues` like every other endpoint.
- **FR-4** — ARC-MOD-005 fires through this endpoint for a file with a module that has both a zero-key and a non-zero CKV.

**Query.** `ValidateFileQuery` takes `projectId` instead of `fileSystemId`, matching the other project-level queries. Nothing instantiates the query today, so the change breaks no caller. `group` is optional.

The constructor follows the same pattern as `GetCkvCalibrationDataQuery`: it accepts the raw string from the HTTP layer and exposes the parsed number. The controller does no parsing.

```typescript
constructor(
  projectIdStr: string,
  public readonly group: ValidationRuleGroup | undefined,
  clientId: string,
) {
  super(clientId);
  this.projectId = parseId(projectIdStr, 'projectId'); // readonly projectId: number
}
```

`parseId` (`application/usecase-designer/shared/parse-id.ts`) accepts decimal or `0x` hex and throws `InvalidOperationException` (mapped to 400) for non-integers, unsafe integers and values <= 0. It is imported as-is from its current location; moving it is out of scope.

**Handler.** The handler returns `Result<ValidateFileResult>` where `ValidateFileResult` is already the shape of the response `data`, so the controller passes it straight through `toApiResult` with no mapper (the usual pattern in the other controllers).

1. `fileId = await queryServices.projectQueryService.getFileIdByProjectId(query.projectId)`
2. `group = query.group ?? VALIDATION_RULE_GROUP.SaveFile`
3. `report = await orchestrator.validate(fileId, group)`
4. Return `Result.ok({fileSystemId: String(fileId), runAt, group, blockedSave: report.blockedSave, summary: report.summary}, report.issues)`

```typescript
export interface ValidateFileResult {
  fileSystemId: string;         // a string like every wire system id (dto-system-ids-are-strings lint rule)
  runAt: string;                // ISO 8601, set by the handler
  group: ValidationRuleGroup;   // effective group after the default is applied
  blockedSave: boolean;         // report.blockedSave
  summary: ValidationSummary;   // total, bySeverity, blocking, nonBlocking, dataLoss
}
```

The default lives only in the handler; the controller never derives it. `Result.ok(data, issues)` stays HTTP 200 and omits `issues` when the list is empty.

**Request DTO.** `group` uses `@IsOptional()` and `@IsEnum(VALIDATION_RULE_GROUP)` with `@ApiProperty({enum: VALIDATION_RULE_GROUP, required: false})`. The DTO reads the core constant, so adding a group in core needs no DTO change.

**Response DTO.** `ValidateFileResponseDto` (with `ValidationSummaryDto`) exists only to describe `data` in Swagger; `ValidateFileResult` is structurally identical and passes through unchanged. It has no `issues` field.

```typescript
class ValidateFileResponseDto {
  fileSystemId!: string;
  runAt!: string;
  group!: ValidationRuleGroup;
  blockedSave!: boolean;
  summary!: ValidationSummaryDto;
}
```

- **Issues travel in the envelope.** `toApiResult` projects them with the existing `toApiIssueItems` (`systemId` as a string; `name` and `defaultSeverity` not exposed). A clean file omits `issues` while `summary.total` is `0`. There is no response mapper.
- `summary` is an aggregate of the envelope `issues` and always describes the whole report: `total` equals the issue count, and the three category buckets and `bySeverity` each sum to `total`.
- `status` from the framework design §9.2 is not carried: the `ApiResult` envelope retired `success`/`status`, and `blockedSave` conveys the outcome.

**Controller.** `@Post('/:projectId/validate')` with `@HttpCode(HttpStatus.OK)` in `project.controller.ts`, dispatching `ValidateFileQuery` via `queryBus` as `execute<Result<ValidateFileResult>>` and returning `toApiResult(result)`. Swagger documents 200, 400 and 404.

**Errors.** Invalid `group` returns 400 (ValidationPipe); invalid `projectId` (rejected by `parseId` in the query constructor) returns 400; missing project or file returns 404. A run that finds issues is a successful validation and returns 200.

**Tests:**

- Core unit: the handler defaults `group` to `SAVE_FILE` when undefined and passes an explicit group through; the result carries `fileSystemId` (a string), the effective `group`, `blockedSave` and `summary`, with the issues in `Result.issues` (absent for a clean file); the query constructor exposes the parsed numeric `projectId` and rejects an invalid one.
- API unit: the request DTO accepts an empty body and every core group, and rejects an unknown group.
- E2E (`packages/api/tests/e2e/`): seed a module with a zero-key and a non-zero CKV. `POST /:projectId/validate` with `{"group":"SAVE_FILE"}` returns 200, `data.blockedSave === true` and one `ARC-MOD-005` entry in the top-level `issues`. An empty body gives the same result. `UPLOAD_FILE` does not report it. An invalid `group` returns 400 and an unknown `projectId` returns 404.

**Blocked rules that become unblocked:** none by itself. It exposes every rule that already has a working loader (ARC-MOD-005 today) through the HTTP API.

---

## 6. Context Profile Changes

After §1.2–1.4 are complete, the full `FileValidationContext` hierarchy is:

```
BaseValidationContext
  ├── ModuleValidationContext
  │     modules, definitions, modulesBySystemId, usecasesByModuleSystemId
  ├── LinkValidationContext
  │     dataLinks, controlLinks, modulesBySystemId, usecasesByModuleSystemId
  ├── ContainerValidationContext
  │     containers, containersBySystemId
  ├── ContainerPropertyValidationContext  (extends ContainerValidationContext)
  │     containerPropertyDefinitionsByTypeId
  └── SubgraphPropertyValidationContext
        subgraphPropertyDefinitions

FileValidationContext extends all of the above, plus:
  subgraphs, subgraphsBySystemId, modulesBySubgraphSystemId, usecases
```

Each rule is typed to the minimal profile it needs. The engine always passes `FileValidationContext`, which satisfies every profile constraint.

### Updated `FileValidationContext` declaration

```typescript
export interface FileValidationContext
  extends LinkValidationContext,
    ModuleValidationContext,
    ContainerPropertyValidationContext,
    SubgraphPropertyValidationContext {
  subgraphs: ReadonlyArray<Subgraph>;
  subgraphsBySystemId: ReadonlyMap<number, Subgraph>;
  modulesBySubgraphSystemId: ReadonlyMap<number, ReadonlyArray<SpfModule>>;
  usecases: ReadonlyArray<UseCase>;
}
```

### `ISSUE_ENTITY_TYPE` additions required

The following entity types are referenced in `requiredEntityTypes` declarations but may not yet be present in `ISSUE_ENTITY_TYPE`:
- `Container` — already present ✓
- `ContainerPropertyDefinition` — already present ✓
- `SubgraphPropertyDefinition` — already present ✓
- `ControlLink` — already present ✓

No additions needed; all required entity types are already in the enum.

---

## 7. Rule Designs — Module Rules

### 7.1 ARC-MOD-001 — Missing Module Definition (Processor-Domain-Scoped)

**Replaces the existing stub** (`missing-definition.rule.ts`). The stub performs only a definition-existence check; the correct check also verifies the definition belongs to the container's processor domain.

**Class:** `MissingDefinitionRule`  
**File:** `packages/core/src/domain/validation/rules/module/missing-definition.rule.ts`  
**Severity:** `ERROR`  
**Groups:** `UPLOAD_FILE` only — no `SAVE_FILE` because a DB FK constraint on `definitionSystemId` serves as the final gate (DEC-004)  
**Required entity types:** `SpfModule`, `Container`, `SpfModuleDefinition`  
**Context profile:** extends `ModuleValidationContext` + `ContainerValidationContext`  
**QACT Code:** E104  
**Description:** Module's `definitionSystemId` is not found in the definitions for the container's processor domain.  
**Fix:** No  
**DB Constraint:** Yes — FK on `definitionSystemId`

> **Note:** A minimal combined profile type can be declared inline in the rule file (or added to `validation-context.ts`):
> ```typescript
> type ModuleContainerValidationContext = ModuleValidationContext & ContainerValidationContext;
> ```

**Algorithm:**

```
For each module in context.modules:
  1. Look up container = context.containersBySystemId.get(module.containerSystemId)
     If container not found:
       → emit issue (separate case; see below)
       continue

  2. Find procDomainPropDef:
     Among containerPropertyDefinitionsByTypeId.get(container.containerTypeSystemId),
     find the PropertyDefinition whose naturalId === CONTAINER_PROP_ID_PROC_DOMAIN

     If not found:
       → skip (container has no proc-domain property — cannot validate)
       continue

  3. Get procDomainBlob:
     const propValue = container.properties.get(procDomainPropDef.systemId)
     If not found:
       → skip (property not set on this container)
       continue

  4. Decode processorSystemId from procDomainBlob.data:
     const view = new DataView(propValue.data.buffer, propValue.data.byteOffset)
     const processorSystemId = view.getUint32(0, true)  // little-endian

  5. Look up definition = context.definitions.get(module.definitionSystemId)
     If not found OR definition.processorSystemId !== processorSystemId:
       → emit issue
```

**Issue structure:**
```typescript
{
  code: 'ARC-MOD-001',
  name: 'Missing Module Definition',
  message: `Module '${alias}' (${hex(module.systemId)}) references definition ` +
           `${hex(module.definitionSystemId)} which is not present for ` +
           `processor ${hex(processorSystemId)}.`,
  severity: ERROR,
  impactedEntity: { entityType: SpfModule, systemId: module.systemId, displayName: alias },
  impactedUsecases: [...],
  fixOptions: [],
}
```

**Open question (OQ from handoff):** When a module's container is not found in context, this document specifies emitting a separate issue rather than silently skipping. The message should say the container is missing, not the definition. Revisit if a dedicated container-not-found rule covers this case.

**Unit tests:**
- Module whose `definition.processorSystemId` matches → no issue
- Module whose `definition.processorSystemId` does not match → issue emitted
- Module with no matching definition at all → issue emitted
- Module whose container is not in context → issue with distinct message
- Module whose container's proc-domain property is absent → no issue (silent skip)

---

### 7.2 ARC-MOD-005 — Zero-Key CKV Alongside Non-Zero CKV Entries

**Class:** `ZeroCkvMixRule`  
**File:** `packages/core/src/domain/validation/rules/module/zero-ckv-mix.rule.ts`  
**Severity:** `ERROR`  
**Groups:** `SAVE_FILE`  
**Required entity types:** `SpfModule`  
**Context profile:** `ModuleValidationContext` (only `modules` needed)  
**QACT Code:** E153  
**Description:** A module instance must not have a zero-key CKV entry when it also has one or more non-zero CKV entries. A zero-key CKV entry is only valid when it is the sole CKV entry for that module instance.  
**Fix:** Yes — remove zero-CKV entry from affected module instances  
**DB Constraint:** No

**Algorithm:**

```
For each module in context.modules:
  const hasZero = module.ckvs.some(ckv => ckv.valueDefinitionSystemIds.length === 0)
  const hasNonZero = module.ckvs.some(ckv => ckv.valueDefinitionSystemIds.length > 0)
  if hasZero && hasNonZero:
    zeroCkv = module.ckvs.find(ckv => ckv.valueDefinitionSystemIds.length === 0)
    → emit issue
```

**Fix option:**
```typescript
{
  systemId: 'remove-zero-ckv',
  commandType: 'RemoveCkvCommand',
  commandPayload: { moduleSystemId: module.systemId, ckvSystemId: zeroCkv.systemId },
  requiredClientInputs: [],
}
```

**Issue structure:**
```typescript
{
  code: 'ARC-MOD-005',
  name: 'Zero-Key CKV Mixed With Non-Zero CKV',
  message: `Module '${alias}' (${hex(module.systemId)}) has a zero-key CKV entry ` +
           `alongside ${nonZeroCount} non-zero CKV entries.`,
  severity: ERROR,
  impactedEntity: { entityType: SpfModule, systemId: module.systemId },
  fixOptions: [/* remove-zero-ckv option */],
}
```

**Unit tests:**
- Module with only zero-key CKV → no issue
- Module with only non-zero CKV entries → no issue
- Module with both zero and non-zero → issue with remove fix option

---

## 8. Rule Designs — Container Rules

### 8.1 ARC-CON-001 — Missing Required Container Property

**Class:** `MissingContainerPropertyRule`  
**File:** `packages/core/src/domain/validation/rules/container/missing-container-property.rule.ts`  
**Severity:** `ERROR`  
**Groups:** `UPLOAD_FILE`, `SAVE_FILE`  
**Required entity types:** `Container`, `ContainerPropertyDefinition`  
**Context profile:** `ContainerPropertyValidationContext`  
**QACT Code:** E107  
**Description:** A container is missing one or more property data entries that are required by its container property definitions.  
**Fix:** Yes — add the missing container property with default data  
**DB Constraint:** No

**Prerequisite:** §1.2 and §1.3 must be complete.

> **UPLOAD_FILE path gap (OQ-002):** `FileEntities` (the in-memory bag used by `fromEntities()`) currently does not include `containers` or `containerPropertyDefinitions`. Until `FileEntities` is extended with these fields and the upload orchestrator populates them, ARC-CON-001 cannot run on the `UPLOAD_FILE` path. The `SAVE_FILE` path is unblocked once §1.2–1.3 are complete.

**Algorithm:**

```
For each container in context.containers:
  requiredDefs = context.containerPropertyDefinitionsByTypeId
                   .get(container.containerTypeSystemId) ?? []

  For each propDef in requiredDefs:
    if !container.properties.has(propDef.systemId):
      → emit issue
```

**Fix option:**
```typescript
{
  systemId: 'add-missing-container-property',
  commandType: 'AddContainerPropertyWithDefaultCommand',
  commandPayload: {
    containerSystemId: container.systemId,
    propertyDefinitionSystemId: propDef.systemId,
  },
  requiredClientInputs: [],
}
```

**Issue structure:**
```typescript
{
  code: 'ARC-CON-001',
  name: 'Missing Container Property',
  message: `Container (${hex(container.naturalId)}) is missing required property ` +
           `'${propDef.name}' (${hex(propDef.naturalId)}).`,
  severity: ERROR,
  impactedEntity: { entityType: Container, systemId: container.systemId },
  impactedUsecases: [...],  // derived from modules in this container → usecasesByModuleSystemId
  fixOptions: [/* add-missing-property option */],
}
```

**Note on impactedUsecases:** To derive impacted use cases for a container, find all modules whose `containerSystemId == container.systemId`, then look up each module in `usecasesByModuleSystemId`. This requires adding `modules` and `usecasesByModuleSystemId` to the context profile (i.e., also extending `ModuleValidationContext`).

**Unit tests:**
- Container with all required properties → no issue
- Container missing one property → one issue with add fix option
- Container with unknown type (no defs in map) → no issue (skip)

---

### 8.2 ARC-CON-002 — Container Property Payload Parse Failure

**Class:** `ContainerPropertyParseRule`  
**File:** `packages/core/src/domain/validation/rules/container/container-property-parse.rule.ts`  
**Severity:** `ERROR`  
**Groups:** `SAVE_FILE`  
**Required entity types:** `Container`, `ContainerPropertyDefinition`  
**Context profile:** `ContainerPropertyValidationContext`  
**QACT Code:** E108  
**Description:** Container property payload fails to parse according to its definition.  
**Fix:** No  
**DB Constraint:** No

**Algorithm:**

```
For each container in context.containers:
  For each [propDefSystemId, propValue] in container.properties:
    propDef = find in containerPropertyDefinitionsByTypeId
              (search all lists for propDef.systemId === propDefSystemId)
    if propDef not found: skip

    Try to parse propValue.data according to propDef.elementsStructure
    If parse fails:
      → emit issue
```

> **Implementation note:** To efficiently find a `PropertyDefinition` by systemId across all container types, build an additional flat `Map<propDefSystemId, PropertyDefinition>` lookup in `buildContext()`. This avoids a linear scan per property.

**Issue structure:**
```typescript
{
  code: 'ARC-CON-002',
  name: 'Container Property Parse Failure',
  message: `Container (${hex(container.naturalId)}) property '${propDef.name}' ` +
           `(${hex(propDef.naturalId)}) payload fails to parse.`,
  severity: ERROR,
  impactedEntity: { entityType: Container, systemId: container.systemId },
  fixOptions: [],
}
```

---

## 9. Rule Designs — Link Rules

### 9.1 ARC-LINK-002 — Data Link: Source or Destination Module Not Found

**Class:** `DataLinkModuleNotFoundRule`  
**File:** `packages/core/src/domain/validation/rules/link/data-link-module-not-found.rule.ts`  
**Severity:** `ERROR`  
**Groups:** `UPLOAD_FILE`  
**Required entity types:** `SpfModule`, `DataLink`, `Subgraph`  
**Context profile:** `LinkValidationContext`  
**QACT Code:** E100  
**Description:** Data connection's source or destination module not found in any subgraph.  
**Fix:** Yes — remove the invalid data connection  
**DB Constraint:** Yes — FK on source/dest `nodeSystemId` → `nodes`

> **Note:** No `SAVE_FILE` group because a DB FK constraint on `sourceNodeSystemId` / `destinationNodeSystemId` → `nodes` serves as the final gate (DEC-004). No SESSION_UPDATE group because the handler already prevents creating a link to a non-existent module.

**Algorithm:**

```
For each dataLink in context.dataLinks:
  if !context.modulesBySystemId.has(dataLink.sourceNodeSystemId)
     OR !context.modulesBySystemId.has(dataLink.destinationNodeSystemId):
    → emit issue
```

**Fix option:**
```typescript
{
  systemId: 'delete-data-link',
  commandType: 'DeleteDataLinkCommand',
  commandPayload: { dataLinkSystemId: dataLink.systemId },
  requiredClientInputs: [],
}
```

**Issue structure:**
```typescript
{
  code: 'ARC-LINK-002',
  name: 'Data Link: Module Not Found',
  message: `Data link (${hex(dataLink.systemId)}) references a module that does not exist.`,
  severity: ERROR,
  impactedEntity: { entityType: DataLink, systemId: dataLink.systemId },
  fixOptions: [/* delete-data-link */],
}
```

---

### 9.2 ARC-LINK-003 — Dangling Data Link Duplicates SG-Pair Connection

**Class:** `DanglingLinkDuplicatesSgPairRule`  
**File:** `packages/core/src/domain/validation/rules/link/dangling-link-duplicates-sg-pair.rule.ts`  
**Severity:** `ERROR`  
**Groups:** `SAVE_FILE`  
**Required entity types:** `SpfModule`, `DataLink`, `Subgraph`  
**Context profile:** `LinkValidationContext` + subgraph fields from `FileValidationContext`  
**QACT Code:** E100  
**Description:** A dangling data link duplicates an SG-pair connection.  
**Fix:** Yes — remove the duplicate data connection  
**DB Constraint:** No

**Background:** A "dangling" data link is a link whose `sourceSubgraphSystemId != destSubgraphSystemId`. An SG-pair connection is a use-case-level connection between subgraph pairs (stored on `UseCase.subgraphPairs`). A dangling link that exactly matches an existing SG-pair connection is redundant and invalid.

**Algorithm:**

```
Build sgPairSet: Set<string> from all UseCase.subgraphPairs:
  key = `${pair.sourceSubgraphSystemId}:${pair.destSubgraphSystemId}`

For each dataLink in context.dataLinks:
  if dataLink.sourceSubgraphSystemId === dataLink.destSubgraphSystemId: skip (intra-subgraph)
  key = `${dataLink.sourceSubgraphSystemId}:${dataLink.destSubgraphSystemId}`
  if sgPairSet.has(key):
    → emit issue (this dangling link duplicates an SG-pair connection)
```

**Fix option:**
```typescript
{
  systemId: 'delete-duplicate-dangling-link',
  commandType: 'DeleteDataLinkCommand',
  commandPayload: { dataLinkSystemId: dataLink.systemId },
  requiredClientInputs: [],
}
```

---

### 9.3 ARC-LINK-004 — Control Link: Peer Node Not Found

**Class:** `ControlLinkPeerNotFoundRule`  
**File:** `packages/core/src/domain/validation/rules/link/control-link-peer-not-found.rule.ts`  
**Severity:** `ERROR`  
**Groups:** `UPLOAD_FILE`  
**Required entity types:** `SpfModule`, `ControlLink`, `Subgraph`  
**Context profile:** `LinkValidationContext`  
**QACT Code:** — (OQ-001: code not yet confirmed)  
**Description:** Control link's peer node A or peer node B not found.  
**Fix:** Yes — remove the invalid control link  
**DB Constraint:** Yes — FK on `peerNodeASystemId` / `peerNodeBSystemId` → `nodes`

> **Note:** No `SAVE_FILE` because DB FK constraints on `peerNodeASystemId` / `peerNodeBSystemId` → `nodes` serve as the final gate. QACT code is currently unknown (OQ-001 in handoff).

**Algorithm:**

```
For each controlLink in context.controlLinks:
  if !context.modulesBySystemId.has(controlLink.peerNodeASystemId)
     OR !context.modulesBySystemId.has(controlLink.peerNodeBSystemId):
    → emit issue
```

**Fix option:**
```typescript
{
  systemId: 'delete-control-link',
  commandType: 'DeleteControlLinkCommand',
  commandPayload: { controlLinkSystemId: controlLink.systemId },
  requiredClientInputs: [],
}
```

---

### 9.4 ARC-LINK-005 — Control Link Intent Validity

**Class:** `ControlLinkIntentValidityRule`  
**File:** `packages/core/src/domain/validation/rules/link/control-link-intent-validity.rule.ts`  
**Severity:** `ERROR`  
**Groups:** `SAVE_FILE`  
**Required entity types:** `SpfModule`, `ControlLink`, `SpfModuleDefinition`  
**Context profile:** `LinkValidationContext & ModuleValidationContext` (needs definitions)  
**QACT Code:** E101  
**Description:** Control link has zero intents, uses an unsupported intent on a static port, or references a dynamic intent not defined for the module.  
**Fix:** Yes — remove the invalid control link  
**DB Constraint:** No

**Algorithm:**

```
For each controlLink in context.controlLinks:
  moduleA = context.modulesBySystemId.get(controlLink.peerNodeASystemId)
  moduleB = context.modulesBySystemId.get(controlLink.peerNodeBSystemId)
  if moduleA is undefined OR moduleB is undefined: skip (ARC-LINK-004 covers this)

  defA = context.definitions.get(moduleA.definitionSystemId)
  defB = context.definitions.get(moduleB.definitionSystemId)

  For each intent on this control link's port on each peer:
    Case 1 — zero intents: emit issue (link has no intents)
    Case 2 — static port with unsupported intent:
      check intent is in defA.staticControlPorts[portA].supportedIntents
      if not → emit issue
    Case 3 — dynamic intent not defined:
      check intent is in defA.dynamicIntents
      if not → emit issue
```

**Fix option:**
```typescript
{
  systemId: 'delete-invalid-control-link',
  commandType: 'DeleteControlLinkCommand',
  commandPayload: { controlLinkSystemId: controlLink.systemId },
  requiredClientInputs: [],
}
```

---

### 9.5 ARC-LINK-006 — Duplicate Data Connection

**Class:** `DuplicateDataLinkRule`  
**File:** `packages/core/src/domain/validation/rules/link/duplicate-data-link.rule.ts`  
**Severity:** `ERROR`  
**Groups:** `SAVE_FILE`  
**Required entity types:** `DataLink`, `Subgraph`  
**Context profile:** `LinkValidationContext`  
**QACT Code:** E119  
**Description:** Same data connection appears more than once in a subgraph or SG-pair.  
**Fix:** Yes — remove the duplicate data connection  
**DB Constraint:** No

**Algorithm:**

```
seen = Map<string, DataLink>  // key → first occurrence
For each dataLink in context.dataLinks:
  key = `${dataLink.sourceNodeSystemId}:${dataLink.sourcePortSystemId}:` +
        `${dataLink.destinationNodeSystemId}:${dataLink.destinationPortSystemId}:` +
        `${dataLink.sourceSubgraphSystemId}:${dataLink.destSubgraphSystemId}`
  if seen.has(key):
    → emit issue for dataLink (the duplicate)
  else:
    seen.set(key, dataLink)
```

**Fix option:**
```typescript
{
  systemId: 'delete-duplicate-data-link',
  commandType: 'DeleteDataLinkCommand',
  commandPayload: { dataLinkSystemId: dataLink.systemId },
  requiredClientInputs: [],
}
```

---

### 9.6 ARC-LINK-007 — Duplicate Control Link

**Class:** `DuplicateControlLinkRule`  
**File:** `packages/core/src/domain/validation/rules/link/duplicate-control-link.rule.ts`  
**Severity:** `ERROR`  
**Groups:** `SAVE_FILE`  
**Required entity types:** `ControlLink`, `Subgraph`  
**Context profile:** `LinkValidationContext`  
**QACT Code:** E120  
**Description:** Same control link appears more than once in a subgraph or SG-pair.  
**Fix:** Yes — remove the duplicate control link  
**DB Constraint:** No

**Algorithm:** Same pattern as ARC-LINK-006 but for control links. Key:
```
`${link.peerNodeASystemId}:${link.nodeAPortSystemId}:` +
`${link.peerNodeBSystemId}:${link.nodeBPortSystemId}:` +
`${link.sourceSubgraphSystemId}:${link.destSubgraphSystemId}`
```

**Fix option:** `DeleteControlLinkCommand` with `{ controlLinkSystemId }`.

---

### 9.7 ARC-LINK-008 — Dangling Link's Endpoints Are in the Same GKV

**Class:** `DanglingLinkSameGkvRule`  
**File:** `packages/core/src/domain/validation/rules/link/dangling-link-same-gkv.rule.ts`  
**Severity:** `ERROR`  
**Groups:** `SAVE_FILE`  
**Required entity types:** `DataLink`, `Subgraph`  
**Context profile:** `LinkValidationContext` + subgraph fields  
**QACT Code:** E121  
**Description:** Dangling link's source and destination are in the same GKV and should be an SG-pair connection.  
**Fix:** Yes — remove from both subgraphs and re-add as a proper SG-pair connection  
**DB Constraint:** No

**Background:** If a dangling link's source and destination subgraphs both belong to the same GKV (use case), that connection should be a proper SG-pair link, not a dangling link.

**Algorithm:**

```
Build subgraphToGkvs: Map<subgraphSystemId, Set<usecaseSystemId>>
  (derived from context.usecases: for each uc, for each sgId → record uc.systemId)

For each dataLink in context.dataLinks:
  if dataLink.sourceSubgraphSystemId === dataLink.destSubgraphSystemId: skip
  srcGkvs = subgraphToGkvs.get(dataLink.sourceSubgraphSystemId) ?? empty set
  dstGkvs = subgraphToGkvs.get(dataLink.destSubgraphSystemId) ?? empty set
  sharedGkvs = intersection of srcGkvs and dstGkvs
  if sharedGkvs is not empty:
    → emit issue (dangling link in same GKV — should be SG-pair)
```

**Fix option:**
```typescript
{
  systemId: 'convert-to-sg-pair',
  commandType: 'ConvertDanglingLinkToSgPairCommand',
  commandPayload: {
    dataLinkSystemId: dataLink.systemId,
    sourceSubgraphSystemId: dataLink.sourceSubgraphSystemId,
    destSubgraphSystemId: dataLink.destSubgraphSystemId,
  },
  requiredClientInputs: [],
}
```

---

## 10. Rule Designs — Subgraph Rules

### 10.1 ARC-SG-001 — Missing Required Subgraph Property

**Class:** `MissingSubgraphPropertyRule`  
**File:** `packages/core/src/domain/validation/rules/subgraph/missing-subgraph-property.rule.ts`  
**Severity:** `ERROR`  
**Groups:** `SAVE_FILE`  
**Required entity types:** `Subgraph`, `SubgraphPropertyDefinition`  
**Context profile:** `SubgraphPropertyValidationContext` + subgraph fields from `FileValidationContext`  
**QACT Code:** E113  
**Description:** Required subgraph property is absent; voice-only properties are only required for voice subgraphs.  
**Fix:** Yes — add missing subgraph property with default data  
**DB Constraint:** No

**Prerequisite:** §1.4 must be complete.

**Algorithm:**

```
For each subgraph in context.subgraphs:
  isVoiceSubgraph = determineIsVoice(subgraph)  // see note below

  For each propDef in context.subgraphPropertyDefinitions:
    if propDef.isVoice && !isVoiceSubgraph: skip (not required for non-voice)
    presentIds = Set(subgraph.properties.map(p => p.propertyDefinitionSystemId))
    if !presentIds.has(propDef.systemId):
      → emit issue
```

> **Note on `isVoiceSubgraph`:** The determination of whether a subgraph is a "voice" subgraph is not exposed as a direct field on `Subgraph`. The mechanism must be identified during implementation — likely based on a subgraph property value or use-case category. Flag this as an open question if the mechanism is not obvious from the data model.

**Fix option:**
```typescript
{
  systemId: 'add-missing-subgraph-property',
  commandType: 'AddSubgraphPropertyWithDefaultCommand',
  commandPayload: {
    subgraphSystemId: subgraph.systemId,
    propertyDefinitionSystemId: propDef.systemId,
  },
  requiredClientInputs: [],
}
```

---

### 10.2 ARC-SG-002 — Subgraph Property Payload Parse Failure

**Class:** `SubgraphPropertyParseRule`  
**File:** `packages/core/src/domain/validation/rules/subgraph/subgraph-property-parse.rule.ts`  
**Severity:** `ERROR`  
**Groups:** `SAVE_FILE`  
**Required entity types:** `Subgraph`, `SubgraphPropertyDefinition`  
**Context profile:** `SubgraphPropertyValidationContext` + subgraph fields  
**QACT Code:** E114  
**Description:** Subgraph property payload fails to parse.  
**Fix:** Yes — overwrite corrupt subgraph property with default data  
**DB Constraint:** No

**Algorithm:**

```
Build propDefBySystemId: Map<systemId, SubgraphPropertyDefinition>
  from context.subgraphPropertyDefinitions

For each subgraph in context.subgraphs:
  For each propertyData in subgraph.properties:
    propDef = propDefBySystemId.get(propertyData.propertyDefinitionSystemId)
    if propDef is undefined: skip

    Try to parse propertyData.data per propDef.elementsStructure
    If parse fails:
      → emit issue
```

**Fix option:**
```typescript
{
  systemId: 'overwrite-subgraph-property-with-default',
  commandType: 'OverwriteSubgraphPropertyWithDefaultCommand',
  commandPayload: {
    subgraphSystemId: subgraph.systemId,
    propertyDefinitionSystemId: propertyData.propertyDefinitionSystemId,
  },
  requiredClientInputs: [],
}
```

---

### 10.3 ARC-SG-005 — Duplicate KV Entry in Subgraph

**Class:** `DuplicateSgkvRule`  
**File:** `packages/core/src/domain/validation/rules/subgraph/duplicate-sgkv.rule.ts`  
**Severity:** `ERROR`  
**Groups:** `SAVE_FILE`  
**Required entity types:** `Subgraph`  
**Context profile:** subgraph fields from `FileValidationContext`  
**QACT Code:** E183  
**Description:** Subgraph has the same KV entry assigned more than once.  
**Fix:** Yes — remove all duplicate KV occurrences, restoring exactly one  
**DB Constraint:** No

**Algorithm:**

```
For each subgraph in context.subgraphs:
  seen = Map<string, Sgkv>  // canonical key → first occurrence
  For each sgkv in subgraph.sgkvs:
    key = [...sgkv.valueDefinitionSystemIds].sort().join(',')
    if seen.has(key):
      → emit issue for the duplicate sgkv
    else:
      seen.set(key, sgkv)
```

**Fix option:**
```typescript
{
  systemId: 'remove-duplicate-sgkv',
  commandType: 'RemoveSgkvCommand',
  commandPayload: {
    subgraphSystemId: subgraph.systemId,
    sgkvSystemId: duplicateSgkv.systemId,
  },
  requiredClientInputs: [],
}
```

---

### 10.4 ARC-SG-006 — Use Case GKV Does Not Match Any Subgraph KV Combination

**Class:** `UsecaseGkvMismatchRule`  
**File:** `packages/core/src/domain/validation/rules/subgraph/usecase-gkv-mismatch.rule.ts`  
**Severity:** `ERROR`  
**Groups:** `SAVE_FILE`  
**Required entity types:** `Subgraph`, `UseCase`  
**Context profile:** subgraph fields + `usecases` from `FileValidationContext`  
**QACT Code:** E184  
**Description:** Usecase GKV does not match any combination of subgraph KVs.  
**Fix:** Yes — add missing KV entries to the best-matching subgraph  
**DB Constraint:** No

**Background:** Each `UseCase` has a `keyVector.valueSystemIds` — the GKV (Graph Key-Value combination) that uniquely identifies the use case. Each `Subgraph` has `sgkvs` — sets of key-value IDs that the subgraph participates in. The union of all subgraph KVs across subgraphs in the use case must be able to form the use-case GKV. If a KV in the GKV is not covered by any subgraph KV, the GKV is unresolvable.

**Algorithm:**

```
For each useCase in context.usecases:
  gkvValueIds = Set(useCase.keyVector.valueSystemIds)
  coveredValueIds = new Set<number>()

  For each sgId in useCase.subgraphSystemIds:
    subgraph = context.subgraphsBySystemId.get(sgId)
    if not found: skip
    For each sgkv in subgraph.sgkvs:
      for each vId in sgkv.valueDefinitionSystemIds:
        coveredValueIds.add(vId)

  missingValueIds = gkvValueIds - coveredValueIds
  if missingValueIds.size > 0:
    → emit issue
```

**Fix option:**
```typescript
{
  systemId: 'add-missing-kv-to-subgraph',
  commandType: 'AddKvToSubgraphCommand',
  commandPayload: {
    usecaseSystemId: useCase.systemId,
    missingValueDefinitionSystemIds: [...missingValueIds],
  },
  requiredClientInputs: [
    {
      field: 'targetSubgraphSystemId',
      label: 'Select target subgraph',
      type: 'NUMBER',
    }
  ],
}
```

---

### 10.5 ARC-SG-007 — Connected Subgraphs Cannot Generate Use Case GKV

**Class:** `SgConnectivityGkvRule`  
**File:** `packages/core/src/domain/validation/rules/subgraph/sg-connectivity-gkv.rule.ts`  
**Severity:** `ERROR`  
**Groups:** `SAVE_FILE`  
**Required entity types:** `Subgraph`, `UseCase`, `DataLink`  
**Context profile:** subgraph fields + `usecases` + `dataLinks` from `FileValidationContext`  
**QACT Code:** E185  
**Description:** Connected subgraphs cannot generate the usecase GKV via active SG-pair connections; not reported when ARC-SG-006 is already present for the same GKV.  
**Fix:** No  
**DB Constraint:** No

**Background:** Even if all KV entries exist across subgraphs (ARC-SG-006 not triggered), the subgraphs carrying those KVs must be connected via SG-pair connections to produce the GKV at runtime. This rule checks connectivity. It is suppressed (not emitted) when ARC-SG-006 is already present for the same use case.

**Algorithm:**

```
For each useCase in context.usecases:
  // Skip if ARC-SG-006 would be reported for this use case
  // (reuse ARC-SG-006 detection logic inline or call a shared helper)
  if gkvHasMissingCoverage(useCase, context): skip

  // Build subgraph connectivity graph using SG-pair connections
  // UseCase.subgraphPairs defines the valid SG-pair connections
  sgPairsForUseCase = useCase.subgraphPairs

  // Check: for each KV entry in the GKV, the subgraph holding that KV
  // must be reachable (directly or transitively) from the "root" subgraph
  // of the use case via the SG-pair connections.
  //
  // Determine which subgraphs hold which GKV value IDs,
  // then verify they are all connected in the pair graph.
  if connectivity check fails:
    → emit issue
```

> **Implementation note:** The precise connectivity check algorithm requires understanding how "root" subgraphs and SG-pair traversal work at runtime. Refer to `PreValidationService` and `TopologyChangeAnalysisService` for analogous connectivity logic (those are separate from the validation framework but may contain reference implementations).

**Issue structure:**
```typescript
{
  code: 'ARC-SG-007',
  name: 'SG Connectivity Cannot Generate GKV',
  message: `Use case '${alias}' (${hex(useCase.systemId)}) GKV cannot be generated — ` +
           `the subgraphs holding its KV entries are not connected via SG-pair connections.`,
  severity: ERROR,
  impactedEntity: { entityType: UseCase, systemId: useCase.systemId },
  fixOptions: [],
}
```

---

## 11. P2/P3 Rule Catalog

> **TODO — future phase.** The P2 and P3 rules below are listed for completeness. Detailed algorithm designs, context profiles, and fix-option schemas will be added before P2/P3 implementation begins (see OQ-005 in the handoff doc). Groups columns for P2/P3 rules must also be expanded to the detailed format used for P1 rules.

### 11.1 Module Rules (P2/P3)

| ARC Code | QACT | Description | Sev | Groups | Fix | DB Constraint | Priority |
|----------|------|-------------|-----|--------|-----|---------------|----------|
| ARC-MOD-002 | E109 | Calibration or tag data payload fails to parse against the parameter definition | ERROR | SAVE_FILE, SESSION_UPDATE | Yes | No | P3 |
| ARC-MOD-003 | E118 | Calibration/tag entry references a parameter ID not in the module definition | ERROR | SAVE_FILE, SESSION_UPDATE | Yes | Yes | P2 |
| ARC-MOD-004 | E182 | Within a GKV, all modules that share the same CKV key dimensions must have CKV data for exactly the same set of CKV value combinations. For example, if module1 has cal data for `ckv1 = {key1=val1, key2=val2}` and module2 only has cal data for `ckv2 = {key1=val1, key2=val3}`, they are inconsistent: on device, when this use case is running, a CKV for `{key1, key2}` (either ckv1 or ckv2) will be queried, and only one module will have cal data returned from AML. QACT UI cannot avoid such a scenario. Modules using non-overlapping key dimensions (e.g. module1 uses `{key1, key2}`, module2 uses `{key3}`, `{key1, key3}`, or `{key1}` only) are **not** inconsistent. | ERROR | SAVE_FILE | No | No | P2 |
| ARC-MOD-006 | E111 | Channel mask inconsistency in multichannel module parameters | WARNING | SAVE_FILE, SESSION_UPDATE | No | No | P3 |
| ARC-MOD-007 | E134 | Module's container types do not intersect with the container's supported types | ERROR | SAVE_FILE, SESSION_UPDATE | No | No | P2 |
| ARC-MOD-008 | E135 | Non-island-friendly module in Low Power heap container | ERROR | SAVE_FILE, SESSION_UPDATE | No | No | P2 |
| ARC-MOD-009 | E158 | Module heap-ID inconsistent with container heap-ID | ERROR | SAVE_FILE, SESSION_UPDATE | Yes | No | P2 |
| ARC-MOD-010 | E112 | Max port index exceeds max ports in module definition | ERROR | SAVE_FILE, SESSION_UPDATE | Yes | No | P2 |
| ARC-MOD-011 | E112 | Port count exceeds MaxInputPorts/MaxOutputPorts | ERROR | SAVE_FILE, SESSION_UPDATE | Yes | No | P2 |
| ARC-MOD-012 | W107 | Dynamic control port ID outside valid range | WARNING | SAVE_FILE | Yes | No | P2 |
| ARC-MOD-013 | E128 | Replace: fewer input/output ports than original | ERROR | SESSION_UPDATE | No | No | P3 |
| ARC-MOD-014 | E127 | Replace: static control port count/IDs differ | ERROR | SESSION_UPDATE | No | No | P3 |
| ARC-MOD-015 | E129 | Replace: control port intents missing in replacement | ERROR | SESSION_UPDATE | No | No | P3 |
| ARC-MOD-016 | E174 | GROUP_INTF_CFG/GLOBAL_SYNC_CFG differs across module's own CKV entries | ERROR | SAVE_FILE, SESSION_UPDATE | No | No | P3 |
| ARC-MOD-017 | E175 | Modules in same group have different GROUP_INTF_CFG/GLOBAL_SYNC_CFG | ERROR | SAVE_FILE, SESSION_UPDATE | No | No | P3 |
| ARC-MOD-018 | E176 | num_intfs does not match actual module count | ERROR | SAVE_FILE, SESSION_UPDATE | Yes | No | P3 |
| ARC-MOD-019 | E177 | SYNC_ALIGNED: different frame_duration_in_us within same group | ERROR | SAVE_FILE, SESSION_UPDATE | No | No | P3 |
| ARC-MOD-020 | E178 | SYNC_ALIGNED: allow_frame_duration_normalization is TRUE | ERROR | SAVE_FILE, SESSION_UPDATE | No | No | P3 |
| ARC-MOD-021 | E172 | PARAM_ID_IPC_DATA_LINK_INFO payload does not match connection topology | ERROR | SAVE_FILE, SESSION_UPDATE | Yes | No | P3 |
| ARC-MOD-022 | E103 | Offload: selected modules not contiguous in data-flow sequence | ERROR | SESSION_UPDATE | No | No | P3 |
| ARC-MOD-023 | E105 | Offload: endpoint module has zero max input/output ports | ERROR | SESSION_UPDATE | No | No | P3 |
| ARC-MOD-024 | E106 | Offload: voice subgraph or satellite DSP limit exceeded | ERROR | SESSION_UPDATE | No | No | P3 |
| ARC-MOD-025 | E155 | Offload: module has IsOffloadable = false | ERROR | SESSION_UPDATE | No | No | P3 |
| ARC-MOD-026 | E156 | Offload: control link to third processor domain | ERROR | SESSION_UPDATE | No | No | P3 |

### 11.2 Container Rules (P2/P3)

| ARC Code | QACT | Description | Sev | Groups | Fix | DB Constraint | Priority |
|----------|------|-------------|-----|--------|-----|---------------|----------|
| ARC-CON-003 | E117 | Container ID in module-instance list not in container list of same subgraph | ERROR | SAVE_FILE, SESSION_UPDATE | No | No | P2 |
| ARC-CON-004 | W104 | Container stack size is 0xFFFFFFFF or below calculated required size | WARNING | SAVE_FILE, SESSION_UPDATE | Yes | No | P2 |

### 11.3 Link Rules (P2/P3)

| ARC Code | QACT | Description | Sev | Groups | Fix | DB Constraint | Priority |
|----------|------|-------------|-----|--------|-----|---------------|----------|
| ARC-LINK-001 | E157 | Control link between two different satellite DSPs (future-phase) | ERROR | SAVE_FILE, SESSION_UPDATE | No | No | P3 |
| ARC-LINK-009 | W100 | Multiple connections share same input/output port | WARNING | SAVE_FILE | Conditional | No | P3 |
| ARC-LINK-010 | W108 | Data-link path contains container sequence A→B→A | WARNING | SAVE_FILE | No | No | P3 |
| ARC-LINK-011 | E124 | Sync Module: input port connected but corresponding output port is not | ERROR | SAVE_FILE | No | No | P3 |
| ARC-LINK-012 | E126 | MailBox control link has more than one intent | ERROR | SAVE_FILE | No | No | P3 |

### 11.4 Subgraph Rules (P2/P3)

| ARC Code | QACT | Description | Sev | Groups | Fix | DB Constraint | Priority |
|----------|------|-------------|-----|--------|-----|---------------|----------|
| ARC-SG-003 | E173 | Subgraph has no associated GKVs (orphan) | ERROR | SAVE_FILE | Yes | No | P3 |
| ARC-SG-004 | W105 | Same container ID in multiple subgraphs | WARNING | SAVE_FILE | No | No | P3 |

### 11.5 GSL Rules (P2/P3)

| ARC Code | QACT | Description | Sev | Groups | Fix | DB Constraint | Priority |
|----------|------|-------------|-----|--------|-----|---------------|----------|
| ARC-GSL-001 | E115 | Missing required GSL property in subgraph driver data | ERROR | SAVE_FILE, SESSION_UPDATE | Yes | No | P2 |
| ARC-GSL-002 | E122 | GSL property payload parse failure | ERROR | SAVE_FILE, SESSION_UPDATE | Yes | No | P2 |

### 11.6 Subsystem Rules (P2/P3)

| ARC Code | QACT | Description | Sev | Groups | Fix | DB Constraint | Priority |
|----------|------|-------------|-----|--------|-----|---------------|----------|
| ARC-SS-001 | E165 | Subsystem data-port: non-existent module or both endpoints same side | ERROR | SAVE_FILE, SESSION_UPDATE | Yes | No | P2 |
| ARC-SS-002 | E166 | Subsystem control-link port invalid | ERROR | SAVE_FILE, SESSION_UPDATE | No | No | P2 |
| ARC-SS-003 | E168 | Subsystem references non-existent child subsystem or subgraph ID | ERROR | SAVE_FILE, SESSION_UPDATE | Yes | No | P2 |
| ARC-SS-004 | E169 | Subsystem contains no subgraphs | ERROR | SAVE_FILE | Yes | No | P2 |
| ARC-SS-005 | E170 | Malformed subsystem port connection | ERROR | SAVE_FILE, SESSION_UPDATE | Yes | No | P2 |
| ARC-SS-006 | W106 | Subsystem has no FilteredGraphKeys | WARNING | SAVE_FILE | No | No | P3 |

### 11.7 Preload Rules (P2/P3)

| ARC Code | QACT | Description | Sev | Groups | Fix | DB Constraint | Priority |
|----------|------|-------------|-----|--------|-----|---------------|----------|
| ARC-PRELOAD-001 | E181 | Invalid preload use case (GKV not found, zero GKV, voice, missing CKV, or concurrent port conflict) | ERROR | SAVE_FILE | Yes | No | P3 |

---

## 12. Fix Command Catalog

All fix commands emitted by P1 rules. Each is dispatched by `POST /apply-fix` with `commandType` and `commandPayload`.

| Command Type | Emitted By | Payload Fields | Description |
|---|---|---|---|
| `DeleteDataLinkCommand` | ARC-LINK-002, ARC-LINK-003, ARC-LINK-006, ARC-LINK-008 | `dataLinkSystemId: number` | Remove a data link by systemId |
| `DeleteControlLinkCommand` | ARC-LINK-004, ARC-LINK-005, ARC-LINK-007 | `controlLinkSystemId: number` | Remove a control link by systemId |
| `RemoveCkvCommand` | ARC-MOD-005 | `moduleSystemId`, `ckvSystemId` | Remove a CKV entry from a module |
| `AddContainerPropertyWithDefaultCommand` | ARC-CON-001 | `containerSystemId`, `propertyDefinitionSystemId` | Add a missing container property with its default value |
| `AddSubgraphPropertyWithDefaultCommand` | ARC-SG-001 | `subgraphSystemId`, `propertyDefinitionSystemId` | Add a missing subgraph property with its default value |
| `OverwriteSubgraphPropertyWithDefaultCommand` | ARC-SG-002 | `subgraphSystemId`, `propertyDefinitionSystemId` | Overwrite a corrupt subgraph property with the definition default |
| `RemoveSgkvCommand` | ARC-SG-005 | `subgraphSystemId`, `sgkvSystemId` | Remove a duplicate SGKV entry from a subgraph |
| `AddKvToSubgraphCommand` | ARC-SG-006 | `usecaseSystemId`, `missingValueDefinitionSystemIds[]`, `targetSubgraphSystemId` (client input) | Add missing KV entries to a subgraph to cover the use-case GKV |
| `ConvertDanglingLinkToSgPairCommand` | ARC-LINK-008 | `dataLinkSystemId`, `sourceSubgraphSystemId`, `destSubgraphSystemId` | Remove dangling link and create proper SG-pair connection |

> **Note:** Fix command handlers are implemented separately from the validation rules (OR-004). Each command handler operates on DB state. The command implementations are out of scope for this LLD and will be designed as a follow-on.

---

## 13. Rule Registration

All rules are registered in `ValidationEngine` at the call site in `ValidateFileQueryHandler`. The engine is constructed with the full list of rule instances:

```typescript
const engine = new ValidationEngine([
  new MissingDefinitionRule(),
  new CalibrationPayloadParseRule(),
  new CkvIidConsistencyRule(),
  new ZeroCkvMixRule(),
  new MissingContainerPropertyRule(),
  new ContainerPropertyParseRule(),
  new DataLinkModuleNotFoundRule(),
  new DanglingLinkDuplicatesSgPairRule(),
  new ControlLinkPeerNotFoundRule(),
  new ControlLinkIntentValidityRule(),
  new DuplicateDataLinkRule(),
  new DuplicateControlLinkRule(),
  new DanglingLinkSameGkvRule(),
  new MissingSubgraphPropertyRule(),
  new SubgraphPropertyParseRule(),
  new DuplicateSgkvRule(),
  new UsecaseGkvMismatchRule(),
  new SgConnectivityGkvRule(),
]);
```

Future-phase rules (ARC-MOD-022 through ARC-MOD-026, ARC-LINK-001) are implemented and unit-tested but **not registered** in the engine until the corresponding feature is delivered.

---

## 14. Testing Strategy

### Per-rule unit tests (required for every P1 rule)

Each rule has a companion spec file at the same path as the rule file, with `.spec.ts` suffix. Tests inject a hand-crafted context object directly into `rule.validate(context)` — no DB, no framework.

**Minimum test cases per rule:**
- Happy path — valid data, zero issues emitted
- Single violation — one invalid entity, correct issue emitted (code, severity, impactedEntity)
- Fix options — if rule emits fixOptions, verify `commandType` and `commandPayload` fields
- Edge cases — empty arrays, boundary conditions specific to the rule

**ARC-MOD-001 specific cases** (replacing existing stub tests):
- Module whose `definition.processorSystemId` matches container's proc-domain → no issue
- Module whose `definition.processorSystemId` does not match → issue emitted
- Module with no matching definition (unknown definitionSystemId) → issue emitted
- Module whose container is absent from context → issue with distinct message
- Module whose container's proc-domain property is not set → no issue (silent skip)

### Integration test — `findDefinitionsByFile()`

After §1.1 is implemented, add an integration test in:
`packages/infrastructure/persistence/tests/integration/`

The test verifies that `TypeOrmValidationQueryRepository.findDefinitionsByFile()` returns correctly structured `SpfModuleDefinition` objects (with parameter defs, port defs, intents) against a real in-memory SQLite DB fixture.

### File structure

```
packages/core/src/domain/validation/rules/
  module/
    missing-definition.rule.ts          (ARC-MOD-001, replaces stub)
    missing-definition.rule.spec.ts
    calibration-payload-parse.rule.ts   (ARC-MOD-002)
    calibration-payload-parse.rule.spec.ts
    zero-ckv-mix.rule.ts                (ARC-MOD-005)
    zero-ckv-mix.rule.spec.ts
  container/
    missing-container-property.rule.ts  (ARC-CON-001)
    missing-container-property.rule.spec.ts
    container-property-parse.rule.ts    (ARC-CON-002)
    container-property-parse.rule.spec.ts
  link/
    data-link-module-not-found.rule.ts  (ARC-LINK-002)
    data-link-module-not-found.rule.spec.ts
    dangling-link-duplicates-sg-pair.rule.ts  (ARC-LINK-003)
    dangling-link-duplicates-sg-pair.rule.spec.ts
    control-link-peer-not-found.rule.ts  (ARC-LINK-004)
    control-link-peer-not-found.rule.spec.ts
    control-link-intent-validity.rule.ts  (ARC-LINK-005)
    control-link-intent-validity.rule.spec.ts
    duplicate-data-link.rule.ts          (ARC-LINK-006)
    duplicate-data-link.rule.spec.ts
    duplicate-control-link.rule.ts       (ARC-LINK-007)
    duplicate-control-link.rule.spec.ts
    dangling-link-same-gkv.rule.ts       (ARC-LINK-008)
    dangling-link-same-gkv.rule.spec.ts
  subgraph/
    missing-subgraph-property.rule.ts   (ARC-SG-001)
    missing-subgraph-property.rule.spec.ts
    subgraph-property-parse.rule.ts     (ARC-SG-002)
    subgraph-property-parse.rule.spec.ts
    duplicate-sgkv.rule.ts              (ARC-SG-005)
    duplicate-sgkv.rule.spec.ts
    usecase-gkv-mismatch.rule.ts        (ARC-SG-006)
    usecase-gkv-mismatch.rule.spec.ts
    sg-connectivity-gkv.rule.ts         (ARC-SG-007)
    sg-connectivity-gkv.rule.spec.ts
```
