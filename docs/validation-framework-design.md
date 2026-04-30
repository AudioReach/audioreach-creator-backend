<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Validation Framework: Design Document

## Document Information
- **Version**: 1.0
- **Date**: May 2026
- **Author**: Nithin Simon

**Related Documents**:
- `project-architecture-overview.md` — Overall architecture
- `modification-framework/modification-framework-design.md` — Edit session & CQRS patterns
- `upload-file-design.md` — File upload workflow

---

## Table of Contents

1. [Context & Goals](#1-context--goals)
2. [Architecture Overview](#2-architecture-overview)
3. [Domain Model](#3-domain-model)
4. [Application Layer](#4-application-layer)
5. [User Preferences & Persistence](#5-user-preferences--persistence)
6. [Fix Dispatch](#6-fix-dispatch)
7. [CQRS Integration](#7-cqrs-integration)
8. [Integration Points](#8-integration-points)
9. [API Design](#9-api-design)
10. [Folder Structure](#10-folder-structure)
11. [Data Design](#11-data-design)
12. [Architecture Decision Records](#12-architecture-decision-records)

---

## 1) Context & Goals

### Problem

The AudioReach Creator API manages complex audio graph data (modules, subgraphs, usecases, links, definitions). When a file is opened or saved, the fully loaded domain model may contain structural problems — missing definitions, broken links, invalid configurations — that need to be surfaced to the user with enough context to understand and fix them.

### Goals

1. **Validate fully loaded domain data** on file open (upload), file save, and optionally before edit commits
2. **Surface structured issues** to the client: code, name, description, severity, impacted entities, fix options
3. **User-configurable severity**: users can escalate issue severity (e.g., `WARNING → ERROR`); they can disable non-blocking issues
4. **Stateless fix dispatch**: fix options are command descriptors; the client dispatches them via the existing command bus
5. **Preferences serialized to file**: user preferences travel with the file (stored in DB at runtime, serialized into binary format on save)
6. **DATA_LOSS acknowledgment gate**: when a file is opened with DATA_LOSS issues, the project enters `PENDING_DATA_LOSS_ACK` state; all normal API calls are blocked until all DATA_LOSS issues are resolved (via fix or explicit acknowledgment)

### Non-Goals (current phase)

- Severity downgrade by user (reserved for future via a per-rule `canDowngrade` flag)

---

## 2) Architecture Overview

The validation framework lives entirely in `packages/core` (domain + application layers). It has zero dependencies on NestJS, TypeORM, or any infrastructure concern.

```
┌─────────────────────────────────────────────────────────────────┐
│  packages/api (NestJS)                                          │
│                                                                 │
│  REST Controllers                                               │
│    • POST /validate          → ValidateFileQuery                │
│    • POST /apply-fix         → FixCommandDispatcher + CommandBus│
│    • PATCH /validation-prefs → UpdateValidationPreferencesCmd   │
│    • POST /acknowledge-data-loss → AcknowledgeDataLossCommand   │
│    (All REST endpoints deferred — CQRS layer is wired)          │
│                                                                 │
│  FixCommandDispatcher (NestJS @Injectable)                      │
│    Maps commandType string → command constructor                │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│  packages/core (Application layer)                              │
│                                                                 │
│  ValidationOrchestrator                                         │
│    .validate(fileSystemId, group) → ValidationReport            │
│    Merges engine issues + stored DATA_LOSS issues               │
│                                                                 │
│  ValidationEngine                                               │
│    .run(context, group) → ValidationReport                      │
│    .getRequiredEntityTypes(group) → Set<ValidationEntityType>   │
│                                                                 │
│  ValidationContextBuilder                                       │
│    .fromEntities(entities, prefs?) → FileValidationContext      │
│    .fromDb(fileSystemId, requiredEntityTypes) → FileValidationContext│
│                                                                 │
│  PreferenceEnforcer                                             │
│    applyPreferences(issue, prefs) → ValidationIssue | null      │
│                                                                 │
│  CQRS:                                                          │
│    ValidateFileQuery / Handler                                  │
│    UpdateValidationPreferencesCommand / Handler                 │
│    AcknowledgeDataLossCommand / Handler                         │
│                                                                 │
│  Ports:                                                         │
│    ValidationPreferencesRepository (write path via UnitOfWork)  │
│    ValidationQueryRepository (read path — entities + prefs)     │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│  packages/core (Domain layer)                                   │
│                                                                 │
│  ValidationRule interface (+ requiredEntityTypes field)         │
│  ValidationRuleGroup enum                                       │
│  ValidationIssue, IssueSeverity, IssueCategory, SEVERITY_ORDER  │
│  FixOption, ClientInputSpec                                     │
│  ValidationPreferences, IssuePreference                         │
│  ValidationReport, ValidationSummary                            │
│  FileValidationContext, LinkValidationContext,                   │
│  ModuleValidationContext, BaseValidationContext                  │
│                                                                 │
│  Rules (one class per rule):                                    │
│    rules/module/missing-definition.rule.ts  (ARC-MOD-001)       │
│    rules/link/  (future rules)                                  │
│    rules/usecase/ (future rules)                                │
│    rules/subgraph/ (future rules)                               │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│  packages/infrastructure/persistence                            │
│                                                                 │
│  TypeOrmValidationPreferencesRepository                         │
│    Implements ValidationPreferencesRepository                   │
│    Table: validation_preferences (per-file JSON blob)           │
│                                                                 │
│  TypeOrmValidationQueryRepository                               │
│    Implements ValidationQueryRepository                         │
│    Entity-loading methods are stubs (wired when REST endpoint   │
│    is implemented). getPreferences() and                        │
│    findStoredDataLossIssues() are fully implemented.            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3) Domain Model

### 3.1 Severity Levels

Industry-standard severity vocabulary
| Severity  | Meaning                                                    | Blocks Save? |
|-----------|------------------------------------------------------------|-------------|
| `FATAL`   | Unrecoverable structural corruption; no fix options        | Yes         |
| `ERROR`   | Significant problem; may have fix options                  | Yes         |
| `WARNING` | Potential problem; does not block save by default          | No          |

`FATAL` and `ERROR` → **BLOCKING** category (save not allowed).
`WARNING` → **NON_BLOCKING** category (save allowed; user can disable).
`DATA_LOSS` → data was not inserted into the DB during upload; save is not blocked but data will be absent.

```typescript
// packages/core/src/domain/validation/issue.ts

export const IssueSeverity = {
  Fatal:   'FATAL',
  Error:   'ERROR',
  Warning: 'WARNING',
} as const;
export type IssueSeverity = typeof IssueSeverity[keyof typeof IssueSeverity];

export const IssueCategory = {
  Blocking:    'BLOCKING',
  NonBlocking: 'NON_BLOCKING',
  DataLoss:    'DATA_LOSS',   // Data was not inserted into DB during upload
} as const;
export type IssueCategory = typeof IssueCategory[keyof typeof IssueCategory];

/**
 * Ordered severity levels from least to most severe.
 * Used to validate that severity overrides are strictly escalating.
 */
export const SEVERITY_ORDER: ReadonlyArray<IssueSeverity> = [
  IssueSeverity.Warning,
  IssueSeverity.Error,
  IssueSeverity.Fatal,
] as const;

/**
 * Maps severity to BLOCKING or NON_BLOCKING.
 * DATA_LOSS is set explicitly by the insertion failure code — not derived from severity.
 */
export function deriveCategoryFromSeverity(severity: IssueSeverity): IssueCategory {
  return severity === IssueSeverity.Fatal || severity === IssueSeverity.Error
    ? IssueCategory.Blocking
    : IssueCategory.NonBlocking;
}
```

### 3.2 Fix Option

A fix option is a **command descriptor** — it tells the client which existing CQRS command to dispatch to fix the issue. Some payload fields may be `null` (the server does not know the value; the client asks the user and fills them in before calling apply-fix).

```typescript
// packages/core/src/domain/validation/issue.ts

export const CLIENT_INPUT_TYPE = {
  Number:  'NUMBER',
  String:  'STRING',
  Boolean: 'BOOLEAN',
} as const;
export type ClientInputType = (typeof CLIENT_INPUT_TYPE)[keyof typeof CLIENT_INPUT_TYPE];

export interface ClientInputSpec {
  field: string;   // Key in commandPayload the client must fill in
  label: string;   // Human-readable label shown in UI prompt
  type: ClientInputType;
}

export interface FixOption {
  id: string;                                      // e.g., "delete-duplicate-link"
  description: string;                             // Human-readable description
  commandType: string;                             // e.g., "DeleteDataLinkCommand"
  commandPayload: Record<string, unknown | null>;  // null = client must fill
  requiredClientInputs: ClientInputSpec[];         // Describes null slots
}
```

### 3.3 Impacted Entity

```typescript
// packages/core/src/domain/validation/issue.ts

/**
 * Entity types that can appear in validation issues.
 * A curated subset of domain entities — only those that validation rules
 * actually validate and report issues against.
 * Defined in core (not infrastructure) to keep the domain layer independent
 * of TypeORM entity names. Add new values here as rules are added.
 */
export const VALIDATION_ENTITY_TYPE = {
  SpfModule:           'SpfModule',
  DataLink:            'DataLink',
  ControlLink:         'ControlLink',
  Subgraph:            'Subgraph',
  UseCase:             'UseCase',
  Container:           'Container',
  SpfModuleDefinition: 'SpfModuleDefinition',  // Added for MissingDefinitionRule
} as const;
export type ValidationEntityType =
  (typeof VALIDATION_ENTITY_TYPE)[keyof typeof VALIDATION_ENTITY_TYPE];

export interface ImpactedEntity {
  entityType: ValidationEntityType;
  systemId: number;
  displayName?: string;
}
```

### 3.4 Validation Issue

The internal representation carries both `defaultSeverity` and `effectiveSeverity` (after user preferences are applied). Only `severity` (the effective value) is exposed in the API response DTO.

```typescript
// packages/core/src/domain/validation/issue.ts

export interface ValidationIssue {
  code: string;
  name: string;
  description: string;
  defaultSeverity: IssueSeverity;   // As defined by the rule author (internal only)
  effectiveSeverity: IssueSeverity; // After user preferences applied (exposed as "severity" in API)
  category: IssueCategory;
  fixOptions: FixOption[];
  impactedEntity: ImpactedEntity;
  impactedUsecases: number[];
}
```

**Note on multiple issues per rule**: A single rule can return multiple `ValidationIssue` instances (the return type is `ValidationIssue[]`). For example, `MissingDefinitionRule` returns one issue per module that references a missing definition.

### 3.5 Validation Rule Interface

Rules are **synchronous** — the `FileValidationContext` is pre-loaded with all domain data before the engine runs. Rules inspect in-memory data only; no async DB calls inside a rule. This keeps rules pure, fast, and independently testable.

```typescript
// packages/core/src/domain/validation/validation-rule.ts

/**
 * Validation rule groups — define which set of rules runs in each context.
 *
 * Group descriptions:
 *   COMMIT      — Lightweight subset; structural integrity check before commit
 *   UPLOAD_FILE — Rules specific to file upload/open
 *   SAVE_FILE   — Rules specific to file save
 */
export const VALIDATION_RULE_GROUP = {
  Commit:     'COMMIT',
  UploadFile: 'UPLOAD_FILE',
  SaveFile:   'SAVE_FILE',
} as const;
export type ValidationRuleGroup = (typeof VALIDATION_RULE_GROUP)[keyof typeof VALIDATION_RULE_GROUP];

export interface ValidationRule<
  TContext extends BaseValidationContext = FileValidationContext
> {
  readonly code: string;
  readonly defaultSeverity: IssueSeverity;
  readonly groups: ValidationRuleGroup[];
  /**
   * Entity types this rule needs to validate.
   * Used by ValidationContextBuilder.fromDb() to load only the required DB tables,
   * avoiding unnecessary queries when running a subset of rules (e.g., COMMIT group).
   *
   * The context builder maps each entity type to its DB query and derived index maps:
   *   SpfModule           → modules + modulesBySystemId + modulesBySubgraphId
   *   DataLink            → dataLinks
   *   ControlLink         → controlLinks
   *   UseCase             → usecases + usecasesByModuleId
   *   Subgraph            → subgraphs + subgraphsBySystemId
   *   SpfModuleDefinition → definitions
   */
  readonly requiredEntityTypes: ReadonlyArray<ValidationEntityType>;
  validate(context: TContext): ValidationIssue[];
}
```

**Example rule typed to its profile:**
```typescript
export class MissingDefinitionRule implements ValidationRule<ModuleValidationContext> {
  readonly code = 'ARC-MOD-001';
  readonly defaultSeverity = IssueSeverity.Error;
  readonly groups = [VALIDATION_RULE_GROUP.UploadFile, VALIDATION_RULE_GROUP.Commit];
  readonly requiredEntityTypes = [
    VALIDATION_ENTITY_TYPE.SpfModule,
    VALIDATION_ENTITY_TYPE.SpfModuleDefinition,
  ] as const;

  validate(context: ModuleValidationContext): ValidationIssue[] { ... }
}
```

### 3.6 Validation Context — Profile Hierarchy

Rules are typed to a **context profile** — a subset of `FileValidationContext` containing only the fields they need. TypeScript enforces at compile time that a rule cannot access fields outside its declared profile.

**Profile hierarchy:**

```
BaseValidationContext (fileSystemId, preferences)
  │
  ├── LinkValidationContext (dataLinks, controlLinks, modulesBySystemId, usecasesByModuleId)
  │     Rules: DuplicateDataLinkRule (future), OrphanedLinkRule (future)
  │
  ├── ModuleValidationContext (modules, definitions, modulesBySystemId, usecasesByModuleId)
  │     Rules: MissingDefinitionRule (ARC-MOD-001) ✅ implemented
  │
  ├── SubgraphValidationContext (subgraphs, subgraphsBySystemId, modulesBySubgraphId)
  │     Rules: (future)
  │
  └── UsecaseValidationContext (usecases)
        Rules: (future)

FileValidationContext extends LinkValidationContext + ModuleValidationContext
  (SubgraphValidationContext and UsecaseValidationContext fields are included
   directly in FileValidationContext without a separate profile interface)
```

**Implementation status**: `LinkValidationContext` and `ModuleValidationContext` are both defined. `MissingDefinitionRule` (using `ModuleValidationContext`) is implemented. Link rules are future work.

```typescript
// packages/core/src/domain/validation/validation-context.ts

export interface BaseValidationContext {
  fileSystemId: number;
  preferences: ValidationPreferences;
}

export interface LinkValidationContext extends BaseValidationContext {
  dataLinks: ReadonlyArray<DataLink>;
  controlLinks: ReadonlyArray<ControlLink>;
  modulesBySystemId: ReadonlyMap<number, SpfModule>;
  usecasesByModuleId: ReadonlyMap<number, ReadonlyArray<UseCase>>;
}

export interface ModuleValidationContext extends BaseValidationContext {
  modules: ReadonlyArray<SpfModule>;
  definitions: ReadonlyMap<number, SpfModuleDefinition>;
  modulesBySystemId: ReadonlyMap<number, SpfModule>;
  usecasesByModuleId: ReadonlyMap<number, ReadonlyArray<UseCase>>;
}

/** Full context — extends all implemented profiles. */
export interface FileValidationContext extends LinkValidationContext, ModuleValidationContext {
  subgraphs:           ReadonlyArray<Subgraph>;
  subgraphsBySystemId: ReadonlyMap<number, Subgraph>;
  modulesBySubgraphId: ReadonlyMap<number, ReadonlyArray<SpfModule>>;
  usecases:            ReadonlyArray<UseCase>;
}
```

### 3.7 Validation Preferences

```typescript
// packages/core/src/domain/validation/validation-preferences.ts

export interface IssuePreference {
  severityOverride?: IssueSeverity;  // Escalation only (WARNING → ERROR/FATAL)
  disabled?: boolean;                // Only honoured for NON_BLOCKING issues
}

export interface IssueSuppression {
  reason?: string;
}

export interface ValidationPreferences {
  overrides: Record<string, IssuePreference>;
  suppressions: Record<string, IssueSuppression>;
}

export const EMPTY_PREFERENCES: ValidationPreferences = {overrides: {}, suppressions: {}};

export function buildSuppressionKey(
  code: string,
  entityType: string,
  systemId: number,
): string {
  return `${code}:${entityType}:${systemId}`;
}
```

### 3.8 Validation Report

```typescript
// packages/core/src/domain/validation/validation-report.ts

export interface ValidationSummary {
  total: number;
  bySeverity: Record<IssueSeverity, number>;
  blocking: number;
  nonBlocking: number;
  dataLoss: number;
}

export class ValidationReport {
  readonly issues: ReadonlyArray<ValidationIssue>;
  readonly blockedSave: boolean;
  readonly summary: ValidationSummary;

  constructor(issues: ValidationIssue[]) {
    this.issues = issues;
    this.blockedSave = issues.some(i => i.category === IssueCategory.Blocking);
    this.summary = this.buildSummary(issues);
  }
}
```

---

## 4) Application Layer

### 4.1 Validation Engine

The engine receives an array of `ValidationRule` instances, filters by group, runs each rule against the context, applies user preferences, and assembles the report.

```typescript
// packages/core/src/application/validation/validation-engine.ts

export class ValidationEngine {
  constructor(private readonly rules: ReadonlyArray<ValidationRule<FileValidationContext>>) {}

  /**
   * Returns the union of requiredEntityTypes across all rules in the given group.
   * Pass this to ValidationContextBuilder.fromDb() to load only the needed DB tables.
   */
  getRequiredEntityTypes(group: ValidationRuleGroup): Set<ValidationEntityType> {
    return new Set(
      this.rules
        .filter(r => r.groups.includes(group))
        .flatMap(r => [...r.requiredEntityTypes]),
    );
  }

  run(context: FileValidationContext, group: ValidationRuleGroup): ValidationReport {
    const applicableRules = this.rules.filter(r => r.groups.includes(group));
    const issues: ValidationIssue[] = [];
    for (const rule of applicableRules) {
      const ruleIssues = rule.validate(context);
      for (const issue of ruleIssues) {
        const resolved = applyPreferences(issue, context.preferences);
        if (resolved !== null) issues.push(resolved);
      }
    }
    return new ValidationReport(issues);
  }
}
```

**Registration** (inside `ValidateFileQueryHandler`):
```typescript
const engine = new ValidationEngine([
  new MissingDefinitionRule(),
  // Add new rules here — engine does not change
]);
```

Adding a new rule = one new file + one line in the handler's engine construction. The engine itself never changes.

### 4.2 Preference Enforcer

A pure function — no side effects, no dependencies. Uses `SEVERITY_ORDER` from `issue.ts` for severity comparison.

```typescript
// packages/core/src/application/validation/preference-enforcer.ts

export function applyPreferences(
  issue: ValidationIssue,
  preferences: ValidationPreferences,
): ValidationIssue | null {
  // 1. DATA_LOSS: always shown, no preferences apply
  if (issue.category === IssueCategory.DataLoss) return issue;

  // 2. Fast path: no code override and no instance suppression for this entity
  const pref = preferences.overrides[issue.code];
  const suppressionKey = buildSuppressionKey(
    issue.code, issue.impactedEntity.entityType, issue.impactedEntity.systemId,
  );
  if (!pref && !preferences.suppressions?.[suppressionKey]) return issue;

  // 3. Apply severity override (escalation only, using SEVERITY_ORDER index comparison)
  let effectiveSeverity = issue.defaultSeverity;
  let effectiveCategory: IssueCategory = issue.category;
  if (pref?.severityOverride) {
    const defaultIdx = SEVERITY_ORDER.indexOf(issue.defaultSeverity);
    const overrideIdx = SEVERITY_ORDER.indexOf(pref.severityOverride);
    if (overrideIdx > defaultIdx) {
      effectiveSeverity = pref.severityOverride;
      effectiveCategory = deriveCategoryFromSeverity(effectiveSeverity);
    }
  }

  // 4. BLOCKING: cannot suppress or disable
  if (effectiveCategory === IssueCategory.Blocking) {
    return effectiveSeverity !== issue.defaultSeverity
      ? {...issue, effectiveSeverity, category: effectiveCategory}
      : issue;
  }

  // 5. NON_BLOCKING: check instance suppression then global disable
  if (preferences.suppressions?.[suppressionKey]) return null;
  if (pref?.disabled) return null;

  return effectiveSeverity !== issue.defaultSeverity
    ? {...issue, effectiveSeverity, category: effectiveCategory}
    : issue;
}
```

### 4.3 Validation Context Builder

The context builder has two construction paths:

1. **From in-memory entities** — used during file upload (entities are already parsed in memory; DB insert has not happened yet)
2. **From DB** — used for on-demand validation and save-to-file (entities are loaded from the repository port)

Both paths produce an identical `FileValidationContext`.

The builder takes a single `ValidationQueryRepository` port (not multiple separate repository ports). The `fromDb()` path accepts a `requiredEntityTypes` set to load only the needed DB tables — this optimization is implemented (not deferred).

```typescript
// packages/core/src/application/validation/validation-context-builder.ts

export interface FileEntities {
  fileSystemId: number;
  modules:      SpfModule[];
  usecases:     UseCase[];
  subgraphs:    Subgraph[];
  dataLinks:    DataLink[];
  controlLinks: ControlLink[];
  definitions:  SpfModuleDefinition[];
}

export class ValidationContextBuilder {
  constructor(readonly queryRepo: ValidationQueryRepository) {}

  /**
   * Build context from already-parsed in-memory entities (upload path).
   * Preferences are loaded from DB if not provided; falls back to EMPTY_PREFERENCES.
   */
  async fromEntities(
    entities: FileEntities,
    preferences?: ValidationPreferences,
  ): Promise<FileValidationContext> { ... }

  /**
   * Build context by loading entities from DB (on-demand validate / save path).
   * Only loads entity types listed in requiredEntityTypes — avoids unnecessary DB queries.
   * Use ValidationEngine.getRequiredEntityTypes(group) to compute this set.
   */
  async fromDb(
    fileSystemId: number,
    requiredEntityTypes: ReadonlySet<ValidationEntityType>,
  ): Promise<FileValidationContext> { ... }
}
```

### 4.4 Validation Orchestrator

`ValidationOrchestrator` is the primary entry point for running a full validation pass. It encapsulates the multi-step orchestration so handlers don't duplicate the logic.

```typescript
// packages/core/src/application/validation/validation-orchestrator.ts

export class ValidationOrchestrator {
  constructor(
    private readonly engine: ValidationEngine,
    private readonly contextBuilder: ValidationContextBuilder,
  ) {}

  /**
   * Steps:
   *   1. Compute required entity types from the active rule group
   *   2. Build FileValidationContext (loading only needed DB tables)
   *   3. Run the engine → domain validation issues
   *   4. Load stored DATA_LOSS issues from files.data_loss_issues
   *   5. Merge both sets into a single ValidationReport
   */
  async validate(
    fileSystemId: number,
    group: ValidationRuleGroup,
  ): Promise<ValidationReport> {
    const requiredEntityTypes = this.engine.getRequiredEntityTypes(group);
    const context = await this.contextBuilder.fromDb(fileSystemId, requiredEntityTypes);
    const engineReport = this.engine.run(context, group);

    const storedDataLossIssues =
      await this.contextBuilder.queryRepo.findStoredDataLossIssues(fileSystemId);

    if (storedDataLossIssues.length === 0) return engineReport;
    return new ValidationReport([...engineReport.issues, ...storedDataLossIssues]);
  }
}
```

---

## 5) User Preferences & Persistence

### 5.1 Ports (in `packages/core`)

Two separate ports serve different access patterns:

```typescript
// packages/core/src/application/ports/persistence/repositories/validation/validation-preferences.repository.ts
// Write path — used by UpdateValidationPreferencesHandler via UnitOfWork

export interface ValidationPreferencesRepository {
  getPreferences(fileSystemId: number): Promise<ValidationPreferences>;
  savePreferences(fileSystemId: number, prefs: ValidationPreferences): Promise<void>;
}
```

```typescript
// packages/core/src/application/ports/persistence/repositories/validation/validation-query.repository.ts
// Read path — used by ValidationContextBuilder for on-demand validate / save

export interface ValidationQueryRepository {
  findModulesByFile(fileSystemId: number): Promise<SpfModule[]>;
  findUsecasesByFile(fileSystemId: number): Promise<UseCase[]>;
  findSubgraphsByFile(fileSystemId: number): Promise<Subgraph[]>;
  findDataLinksByFile(fileSystemId: number): Promise<DataLink[]>;
  findControlLinksByFile(fileSystemId: number): Promise<ControlLink[]>;
  findDefinitionsByFile(fileSystemId: number): Promise<SpfModuleDefinition[]>;
  getPreferences(fileSystemId: number): Promise<ValidationPreferences>;
  findStoredDataLossIssues(fileSystemId: number): Promise<ValidationIssue[]>;
}
```

`ValidationQueryRepository` is also exposed on `UnitOfWork` as `getValidationQueryService()` for command handlers that need to run validation against DB-persisted entities.

### 5.2 Storage Strategy

Preferences are stored in **two places**:

| Location | Purpose |
|----------|---------|
| **DB** (`validation_preferences` table) | Authoritative runtime source; used by the server during validation |
| **Binary file** (AWSP/ACDB serialized field) | Portable carrier; preferences travel with the file |

**On file open**: preferences are read from the binary format and upserted into the DB.
**On file save**: preferences are read from the DB and serialized into the binary format.
**On preference update**: DB is updated immediately; file is updated on next save.

### 5.3 Preference Validation Rules

Enforced by `UpdateValidationPreferencesHandler`:

**Global overrides (`overrides` map):**
1. `severityOverride` must be a valid `IssueSeverity` value — rejected with an error if not
2. Severity override is applied only if strictly higher than the rule's `defaultSeverity` (escalation only; silently ignored if not higher)
3. Incoming overrides are **merged** into existing preferences (not replaced)

**Instance-level suppressions (`suppressions` map):**
4. Suppression key must follow the format `"code:entityType:systemId"` (3 colon-separated parts) — rejected with an error if malformed
5. Incoming suppressions are **merged** into existing preferences

**Not currently enforced** (deferred):
- Unknown issue codes in the overrides map are not rejected
- `disabled: true` on BLOCKING issues is not stripped (it is stored but has no effect since `applyPreferences` ignores `disabled` for BLOCKING issues)
- Suppressions for BLOCKING or DATA_LOSS issues are not rejected at the command level (they are silently ineffective since `applyPreferences` ignores suppressions for those categories)

---

## 6) Fix Dispatch

### 6.1 Concept

Fix options are **command descriptors** — they reference existing CQRS commands by name. The client receives a fix option, optionally fills in `null` payload slots (by prompting the user), then calls the apply-fix endpoint. The server constructs and dispatches the named command.

This design is **stateless**: the server does not hold any fix state between the validation call and the apply-fix call.

### 6.2 FixCommandDispatcher (in `packages/api`)

A NestJS `@Injectable()` service that maps command type name strings to command factory functions. This is a practical factory, not a security whitelist.

**Standard pattern**: Every fixable command provides a `static fromPayload(p: Record<string, unknown>)` method. The mapping logic is co-located with the command.

```typescript
// packages/api/src/infrastructure-wrapper/validation/fix-command-dispatcher.ts

@Injectable()
export class FixCommandDispatcher {
  private readonly registry = new Map<string, (payload: Record<string, unknown>) => BaseCommand>();

  constructor() {
    this.registerAll();
  }

  private registerAll(): void {
    // No commands registered yet — add one line per fixable command as rules are added:
    // this.registry.set('DeleteDataLinkCommand', DeleteDataLinkCommand.fromPayload);
  }

  resolve(commandType: string): ((payload: Record<string, unknown>) => BaseCommand) | undefined {
    return this.registry.get(commandType);
  }
}
```

**`fromPayload` on each fixable command**:
```typescript
export class DeleteDataLinkCommand extends BaseCommand {
  constructor(
    public readonly systemId: number,
    public readonly fileSystemId: number,
    public readonly sessionId: number,
  ) { super(); }

  static fromPayload(p: Record<string, unknown>): DeleteDataLinkCommand {
    return new DeleteDataLinkCommand(
      p['systemId'] as number,
      p['fileSystemId'] as number,
      p['sessionId'] as number,
    );
  }
}
```

### 6.3 Apply-Fix Flow

```
1. Client receives ValidationIssue with FixOption:
   {
     commandType: "DeleteDataLinkCommand",
     commandPayload: { systemId: 8388625, fileSystemId: 12345, sessionId: null },
     requiredClientInputs: [{ field: "sessionId", label: "Active session ID", type: "number" }]
   }

2. Client fills in null slots (prompts user if needed):
   { systemId: 8388625, fileSystemId: 12345, sessionId: 99 }

3. Client calls:
   POST /arc-api/v1/projects/:projectId/apply-fix
   Body: { commandType: "DeleteDataLinkCommand", commandPayload: { ... } }

4. Server (apply-fix controller):
   a. FixCommandDispatcher.resolve(commandType)
      → If not found: 400 Bad Request ("unknown fix command type")
   b. Construct command from payload
   c. CommandBus.execute(command)
      → If command handler throws validation error (missing required fields): 422
   d. Return command result
```

---

## 7) CQRS Integration

### 7.1 Validate File (Query)

```typescript
// packages/core/src/application/validation/queries/validate-file.query.ts

export class ValidateFileQuery extends BaseQuery {
  constructor(
    public readonly fileSystemId: number,
    public readonly group: ValidationRuleGroup,
    clientId: string,
  ) { super(clientId); }
}

export interface ValidateFileResult {
  report: ValidationReport;
}
```

The handler constructs `ValidationEngine`, `ValidationContextBuilder`, and `ValidationOrchestrator` internally (consistent with how other query handlers use `queryServices` directly). It delegates to `ValidationOrchestrator.validate()` which merges engine issues with stored DATA_LOSS issues.

```typescript
export class ValidateFileQueryHandler implements QueryHandler<ValidateFileQuery, Promise<ValidateFileResult>> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: ValidateFileQuery): Promise<ValidateFileResult> {
    const engine = new ValidationEngine([new MissingDefinitionRule()]);
    const contextBuilder = new ValidationContextBuilder(this.queryServices.validationQueryService);
    const orchestrator = new ValidationOrchestrator(engine, contextBuilder);
    const report = await orchestrator.validate(query.fileSystemId, query.group);
    return {report};
  }
}
```

### 7.2 Update Validation Preferences (Command)

```typescript
// packages/core/src/application/validation/commands/update-validation-preferences.command.ts

export class UpdateValidationPreferencesCommand extends BaseCommand {
  constructor(
    public readonly fileSystemId: number,
    public readonly overrides: Record<string, IssuePreference>,
    clientId: string,
    public readonly suppressions?: Record<string, IssueSuppression>,
  ) { super(clientId); }
}
```

Handler responsibilities:
1. Load existing preferences from DB
2. Validate that `severityOverride` values are valid `IssueSeverity` strings
3. Merge incoming `overrides` into existing overrides
4. Validate suppression key format (`"code:entityType:systemId"`)
5. Merge incoming `suppressions` into existing suppressions
6. Persist merged preferences to DB via `ValidationPreferencesRepository`

### 7.3 Acknowledge Data Loss (Command)

```typescript
// packages/core/src/application/validation/commands/acknowledge-data-loss.command.ts

export class AcknowledgeDataLossCommand extends BaseCommand {
  constructor(
    public readonly fileSystemId: number,
    clientId: string,
  ) { super(clientId); }
}
```

Handler: clears all stored DATA_LOSS issues and sets `open_status` to `READY` via `ProjectRepository.updateFileStatus()`.

---

## 8) Integration Points

### 8.1 Upload File (existing flow, modified)

The upload flow currently collects DATA_LOSS issues from insertion failures only. Domain validation via `fromEntities()` is planned but not yet implemented (the upload orchestrator does not yet expose parsed entities to the handler).

```
Parse file → Build domain entities (in memory)
  │
  ├─ Phase 1: Domain Validation (PLANNED — not yet implemented)
  │    → ValidationContextBuilder.fromEntities(entities)
  │    → ValidationEngine.run(context, VALIDATION_RULE_GROUP.UploadFile)
  │    → domainIssues: ValidationIssue[]
  │    Note: validationReport in OpenFileResult is currently null
  │
  ├─ Phase 2: Bulk-insert (always proceeds)
  │    → For each entity: attempt DB insert
  │    → On failure: create ValidationIssue directly (category: DATA_LOSS)
  │    → insertionFailureIssues: ValidationIssue[]
  │    Note: UploadFileOrchestrator.dataLossIssues[] is populated by inserters
  │
  └─ Phase 3: Persist DATA_LOSS state
       → If dataLossIssues.length > 0:
           Store full ValidationIssue[] in files.data_loss_issues (JSON)
           SET files.open_status = 'PENDING_DATA_LOSS_ACK'
           Return { openStatus: "PENDING_DATA_LOSS_ACK", projectId: ..., validationReport: null }
       → Else:
           Return { openStatus: "READY", projectId: ..., validationReport: null }
```

**Why insert still proceeds**: The user needs the data in the DB to use fix options (fix commands operate on DB entities). Aborting on BLOCKING issues would leave the user with no data and no way to fix the problem.

#### Insertion Failure Issues (Phase 2)

Insertion failure issues are **not produced by rules** — they bypass the `ValidationEngine` entirely. The bulk-insert process creates `ValidationIssue` instances directly when it catches a DB exception.

| Property | Value |
|----------|-------|
| `category` | `DATA_LOSS` — data is absent from DB; project enters `PENDING_DATA_LOSS_ACK` state |
| `defaultSeverity` | `WARNING` |
| `fixOptions` | Present if a fix command can resolve the underlying cause; empty if no fix is available |

### 8.4 DATA_LOSS Acknowledgment Flow

When a file is opened with DATA_LOSS issues, the project enters `PENDING_DATA_LOSS_ACK` state. The full `ValidationIssue[]` array is stored in `files.data_loss_issues`. All normal API calls are blocked until all DATA_LOSS issues are resolved.

**Two resolution paths:**

**Path 1 — Fix available** (issue has `fixOptions`):
```
POST /apply-fix { commandType, commandPayload, dataLossIssueKey: "ARC-INSERT-MOD-001:SpfModule:8388610" }
  → Apply fix command (may insert the missing data into DB)
  → Remove that entry from files.data_loss_issues
  → If data_loss_issues is now empty:
      SET open_status = 'READY'
      Return { projectStatus: 'READY' }
  → If entries remain:
      Return { projectStatus: 'PENDING_DATA_LOSS_ACK', remainingDataLossIssues: [...] }
```

**Path 2 — No fix available** (issue has empty `fixOptions`):
```
POST /acknowledge-data-loss
  → AcknowledgeDataLossCommand → AcknowledgeDataLossHandler
  → Clears files.data_loss_issues, SET open_status = 'READY'
  → Return 200 OK
```

**State diagram:**
```
PENDING_DATA_LOSS_ACK
  │
  ├─ POST /apply-fix (with dataLossIssueKey)
  │    → Remove entry from data_loss_issues
  │    → If empty → READY (automatic)
  │    → If not empty → still PENDING_DATA_LOSS_ACK
  │
  ├─ POST /acknowledge-data-loss
  │    → AcknowledgeDataLossCommand → clears all entries → READY
  │
  └─ DELETE /projects/:id → abandon
```

#### DataLossAckGuard (planned — not yet implemented)

A NestJS `DataLossAckGuard` will enforce the allowed-operations list above.
It reads `open_status` from the `files` table and returns `409 Conflict`
(with the remaining DATA_LOSS issues) for any disallowed operation.

**Allowed operations in `PENDING_DATA_LOSS_ACK` state:**
- `POST /upload-files` — re-upload
- `POST /validate` — view full validation report (includes stored DATA_LOSS issues)
- `POST /apply-fix` — apply fix options (with `dataLossIssueKey` to remove a specific issue)
- `POST /acknowledge-data-loss` — accept remaining data loss
- `DELETE /projects/:id` — abandon project

All other API calls return `409 Conflict` with the remaining DATA_LOSS issues.

### 8.2 Save to File (future endpoint)

```
Fetch entities from DB
  → Build FileValidationContext
  → ValidationEngine.run(context, VALIDATION_RULE_GROUP.SaveFile)
  → If report.blockedSave:
      Return 422 Unprocessable Entity with validationReport
  → Serialize preferences from DB into binary format
  → Serialize domain entities to binary format
  → Return file bytes
```

### 8.3 Pre-Commit (edit operations)

Two modes:

**On-demand validate** (explicit, no side effects):
```
POST /arc-api/v1/projects/:projectId/validate
Body: { group: "COMMIT" | "UPLOAD_FILE" }
→ ValidateFileQuery
→ Returns ValidationReport
```

**Commit with validation gate** (optional):
```
POST /arc-api/v1/projects/:projectId/commit-changes?enforceValidation=true
→ Build FileValidationContext (committed + pending overlay)
→ ValidationEngine.run(context, VALIDATION_RULE_GROUP.Commit)
→ If report.blockedSave:
    Return 422 with validationReport (commit aborted)
→ Proceed with commit
```

Without `?enforceValidation=true`, commit proceeds without validation (existing behaviour preserved).

---

## 9) API Design

### 9.1 Endpoints

> **Implementation status:** The CQRS commands and queries are fully wired.
> REST endpoints (controllers, DTOs, guards) are **deferred** — not yet implemented.
> `AcknowledgeDataLossCommand` and `AcknowledgeDataLossHandler` are implemented
> in `packages/core` but have no REST controller yet.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/arc-api/v1/projects/:projectId/validate` | Run validation on demand |
| `POST` | `/arc-api/v1/projects/:projectId/apply-fix` | Dispatch a fix command; removes DATA_LOSS entry if `dataLossIssueKey` provided |
| `POST` | `/arc-api/v1/projects/:projectId/acknowledge-data-loss` | Accept remaining DATA_LOSS issues; project → READY |
| `GET`  | `/arc-api/v1/projects/:projectId/validation-preferences` | Get current preferences |
| `PATCH`| `/arc-api/v1/projects/:projectId/validation-preferences` | Update preferences |

### 9.2 Validate Response

```json
{
  "status": "PARTIAL_SUCCESS",
  "validationReport": {
    "fileId": 12345,
    "runAt": "2026-04-19T11:00:00Z",
    "group": "UPLOAD_FILE",
    "blockedSave": true,
    "summary": {
      "total": 4,
      "bySeverity": { "FATAL": 0, "ERROR": 1, "WARNING": 3 },
      "blocking": 1,
      "nonBlocking": 1,
      "dataLoss": 2
    },
    "issues": [
      {
        "code": "ARC-MOD-001",
        "name": "Missing Module Definition",
        "description": "Module 'AudioDecoder' (0x800005) references definition 0x1234 which is not present in the loaded ACDB.",
        "severity": "ERROR",
        "category": "BLOCKING",
        "fixOptions": [],
        "impactedEntity": { "entityType": "SpfModule", "systemId": 8388613, "displayName": "AudioDecoder" },
        "impactedUsecases": [101, 102]
      },
      {
        "code": "ARC-INSERT-MOD-001",
        "name": "Module Insert Failed — Duplicate Instance ID",
        "description": "Module 'EchoCancel' (0x800042) could not be inserted.",
        "severity": "WARNING",
        "category": "DATA_LOSS",
        "fixOptions": [],
        "impactedEntity": { "entityType": "SpfModule", "systemId": 8388610, "displayName": "EchoCancel" },
        "impactedUsecases": []
      }
    ]
  }
}
```

**Key**: `severity` in the response is the **effective** severity (after user preferences). `defaultSeverity` is an internal field not exposed in the API.

### 9.3 Apply-Fix Request / Response

```json
// Request (normal fix)
POST /arc-api/v1/projects/:projectId/apply-fix
{
  "commandType": "DeleteDataLinkCommand",
  "commandPayload": { "systemId": 8388625, "fileSystemId": 12345, "sessionId": 99 }
}

// Request (fix for a DATA_LOSS issue)
POST /arc-api/v1/projects/:projectId/apply-fix
{
  "commandType": "InsertMissingModuleCommand",
  "commandPayload": { ... },
  "dataLossIssueKey": "ARC-INSERT-MOD-001:SpfModule:8388610"
}
```

### 9.4 Preferences API

```json
// PATCH /validation-preferences request
{
  "overrides": {
    "ARC-LINK-002": { "severityOverride": "ERROR" }
  },
  "suppressions": {
    "ARC-LINK-002:DataLink:8388625": { "reason": "Expected for non-concurrent usecases" }
  }
}
```

---

## 10) Folder Structure

```
packages/core/src/
│
├── domain/
│   └── validation/
│       ├── issue.ts                         # ValidationIssue, IssueSeverity, IssueCategory,
│       │                                    # SEVERITY_ORDER, FixOption, ClientInputSpec,
│       │                                    # ImpactedEntity, VALIDATION_ENTITY_TYPE
│       ├── validation-rule.ts               # ValidationRule (+ requiredEntityTypes), ValidationRuleGroup
│       ├── validation-context.ts            # FileValidationContext, LinkValidationContext,
│       │                                    # ModuleValidationContext, BaseValidationContext
│       ├── validation-preferences.ts        # ValidationPreferences, IssuePreference, IssueSuppression
│       ├── validation-report.ts             # ValidationReport, ValidationSummary
│       └── rules/
│           └── module/
│               └── missing-definition.rule.ts    # ARC-MOD-001 ✅ implemented
│           (link/, usecase/, subgraph/ — future)
│
└── application/
    ├── ports/
    │   └── persistence/
    │       └── repositories/
    │           └── validation/
    │               ├── validation-preferences.repository.ts  # ValidationPreferencesRepository (write)
    │               └── validation-query.repository.ts        # ValidationQueryRepository (read)
    │
    └── validation/
        ├── validation-engine.ts                 # ValidationEngine (+ getRequiredEntityTypes)
        ├── validation-context-builder.ts        # fromEntities() + fromDb(fileSystemId, requiredEntityTypes)
        ├── preference-enforcer.ts               # applyPreferences() pure function
        ├── validation-orchestrator.ts           # ValidationOrchestrator — merges engine + DATA_LOSS issues
        ├── commands/
        │   ├── acknowledge-data-loss.command.ts     # ✅ implemented
        │   ├── acknowledge-data-loss.handler.ts     # ✅ implemented
        │   ├── update-validation-preferences.command.ts
        │   └── update-validation-preferences.handler.ts
        └── queries/
            ├── validate-file.query.ts
            └── validate-file.handler.ts           # Uses ValidationOrchestrator internally

packages/api/src/
└── infrastructure-wrapper/
    └── validation/
        └── fix-command-dispatcher.ts            # NestJS @Injectable: maps commandType → constructor
                                                 # (registry empty — populated as rules add fix commands)

packages/infrastructure/persistence/src/
└── persistence-typeorm-sqllite/
    ├── entity-schema/
    │   └── validation/
    │       └── validation-preferences.schema.ts  # TypeORM schema for validation_preferences table
    └── repositories/
        └── validation/
            ├── typeorm-validation-preferences.repository.ts  # Implements ValidationPreferencesRepository
            └── typeorm-validation-query.repository.ts        # Implements ValidationQueryRepository
                                                              # Entity-loading methods are stubs;
                                                              # getPreferences() and findStoredDataLossIssues()
                                                              # are fully implemented
```

---

## 11) Data Design

### 11.1 `files` Table — Validation Columns

The `files` table (mapped as `arc_db_files` in the domain entity) includes two columns for validation state, present in the initial migration:

```sql
-- Part of the initial CREATE TABLE for "files":
"open_status" varchar(30) NOT NULL DEFAULT ('READY'),
"data_loss_issues" text  -- JSON array of full ValidationIssue[], nullable
```

| Column | Purpose |
|--------|---------|
| `open_status` | `'READY'` = normal; `'PENDING_DATA_LOSS_ACK'` = DATA_LOSS issues exist, user must resolve |
| `data_loss_issues` | JSON array of full `ValidationIssue[]` (not minimal); `NULL` when none |

**Note**: The `open_status` column has no SQL `CHECK` constraint in the migration — valid values are enforced at the application layer via `FILE_OPEN_STATUS` enum.

**`open_status` transitions:**
- Upload with DATA_LOSS issues → `PENDING_DATA_LOSS_ACK`
- Upload without DATA_LOSS issues → `READY`
- Last DATA_LOSS issue fixed via `POST /apply-fix` → `READY` (automatic)
- `POST /acknowledge-data-loss` → `READY` (via `AcknowledgeDataLossHandler`)

**Guard**: `DataLossAckGuard` in `packages/api` (planned, not yet implemented) will check `open_status` before allowing API calls.

### 11.2 `validation_preferences` Table

```sql
CREATE TABLE "validation_preferences" (
  "file_system_id" integer PRIMARY KEY NOT NULL,
  "preferences"    text NOT NULL DEFAULT ('{"overrides":{},"suppressions":{}}'),
  "updated_at"     datetime NOT NULL DEFAULT (datetime('now'))
);
```

**Design notes**:
- One row per file. The entire preferences object is stored as a JSON blob.
- No explicit `FOREIGN KEY` constraint to `files` in the TypeORM schema or migration (cascade delete is not enforced at DB level; cleanup is application-level).
- JSON blob is appropriate here: the preferences object is always read and written as a whole unit.
- Default value includes both `overrides` and `suppressions` keys.

### 11.3 No Migration Required for Rules

Validation rules are pure code — they have no DB schema. Adding a new rule requires no migration.

---

## 12) Architecture Decision Records

### ADR-VAL-001: Synchronous Rules Over Async Rules

**Context**: Rules need access to domain data (modules, definitions, links). Two options: rules fetch their own data asynchronously, or a context builder pre-loads all data and rules operate synchronously.

**Decision**: Rules are synchronous. All data is pre-loaded into `FileValidationContext` by `ValidationContextBuilder` before the engine runs.

**Rationale**:
- Synchronous rules are pure functions over in-memory data — independently testable with no mocks
- Avoids N×M DB calls (N rules × M entities)
- Keeps rules free of infrastructure dependencies (no repository injection)
- The full domain model for a single file fits comfortably in memory for local SQLite

**Trade-off**: The context builder must load all entity types upfront, even if only a subset of rules runs. Mitigated by `requiredEntityTypes` on each rule and `ValidationEngine.getRequiredEntityTypes()` — only the needed tables are queried.

**Status**: Accepted

---

### ADR-VAL-002: Rule Declares Its Own Group Membership

**Context**: Rules need to be filtered by group (FULL vs. COMMIT). Two options: rules declare their own groups, or a central group registry lists rule codes.

**Decision**: Each rule declares `readonly groups: ValidationRuleGroup[]` on itself.

**Rationale**:
- Adding a new rule is self-contained (one file, no other file to update)
- The rule author is best positioned to know whether their rule is appropriate for pre-commit validation
- Simpler than maintaining a separate registry

**Trade-off**: To see "what runs in COMMIT mode", you must scan all rule files. Mitigated by keeping the rule directory small and well-organized.

**Status**: Accepted

---

### ADR-VAL-003: Upload Proceeds Regardless of Validation Issues

**Context**: During file upload, validation issues are found after parsing. Two options: abort the insert on BLOCKING issues, or insert everything and return issues as `PARTIAL_SUCCESS`.

**Decision**: Insert always proceeds. Issues are returned as `PARTIAL_SUCCESS` alongside the data.

**Rationale**:
- The user needs the data in the DB to use fix options (fix commands operate on DB entities)
- Aborting on BLOCKING issues would leave the user with no data and no way to fix the problem
- `PARTIAL_SUCCESS` clearly communicates that data was loaded but requires attention

**Trade-off**: BLOCKING issues in the DB mean the file cannot be saved until fixed. This is intentional — the user must resolve them before saving.

**Status**: Accepted

---

### ADR-VAL-004: FixCommandDispatcher as the Explicit Opt-In Registry

**Context**: The apply-fix endpoint accepts a `commandType` string from the client and dispatches the corresponding CQRS command. The question is whether a separate allowlist is needed to restrict which commands are dispatchable via this endpoint, or whether the dispatcher registry itself is sufficient.

**Decision**: No separate allowlist. `FixCommandDispatcher.registerAll()` in `packages/api` is the explicit opt-in registry — only commands that a developer consciously adds to it can be dispatched. Nothing is dispatchable by default.

**Rationale**:
- `FixCommandDispatcher` already serves as the boundary: the registry starts empty and grows only as rules introduce fix commands. A separate allowlist would duplicate this.
- Each command handler validates its own required fields; missing or malformed payload fields return `422`.
- The codebase is open source and runs as a local desktop tool — access control is handled at the authentication layer, not by restricting which commands a registered user can invoke.

**Status**: Accepted

---

### ADR-VAL-005: Severity Escalation Only (No Downgrade)

**Context**: Users can configure severity overrides per issue code. Should they be allowed to downgrade severity (e.g., ERROR → WARNING)?

**Decision**: Only upward escalation is allowed in the current phase. Downgrading is silently ignored.

**Rationale**:
- Downgrading a BLOCKING issue to WARNING could allow saving a file with structural corruption
- Domain experts set default severities based on domain knowledge; user overrides should only make things stricter
- Future hook: a per-rule `canDowngrade: boolean` flag can unlock downgrading for specific rules when the domain justifies it

**Status**: Accepted

---

### ADR-VAL-006: Preferences Stored in Both DB and Binary File

**Context**: User preferences need to be available at runtime (DB) and portable with the file (binary format).

**Decision**: DB is the authoritative runtime source. Binary file is the portable carrier. On open: file → DB. On save: DB → file.

**Rationale**:
- DB provides fast, structured access at runtime without parsing the binary format
- Binary file ensures preferences are not lost when the file is moved to another machine or shared
- The pattern mirrors how other file metadata is handled in the system

**Status**: Accepted

---

### ADR-VAL-007: Context Passed to validate() as Primary Pattern

**Context**: Two approaches for how rules receive their data:
- **Approach A**: `validate(context: FileValidationContext)` — rule receives full context, uses what it needs
- **Approach B**: Constructor injection + `validate()` no args — rule declares exact dependencies in constructor

**Decision**: Approach A as the primary pattern. Rules are typed to a context profile (e.g., `ModuleValidationContext`) to constrain what they can access at compile time.

**Rationale**:
- Simpler engine: `rule.validate(context)` — rules are plain instances, no factory needed
- Simpler registration: `new MissingDefinitionRule()` — no factory boilerplate
- TypeScript profile typing provides compile-time enforcement of dependency boundaries
- YAGNI: targeted reuse is not a current requirement

**Status**: Accepted

---

### ADR-VAL-008: DATA_LOSS as a Third IssueCategory Value

**Context**: Insertion failure issues (data not inserted into DB during upload) were originally modelled with a separate `dataLoss: boolean` field alongside `category: NON_BLOCKING`.

**Decision**: Replace `dataLoss: boolean` with `DATA_LOSS` as a third `IssueCategory` value. Remove the `dataLoss` boolean field.

**Rationale**:
- The three states (BLOCKING, NON_BLOCKING, DATA_LOSS) are semantically distinct from the client's perspective and require different UI treatment
- A single `category` field is cleaner than two fields (`category` + `dataLoss`) that partially overlap
- `blockedSave` computation is unaffected: `issues.some(i => i.category === IssueCategory.Blocking)` — DATA_LOSS is non-blocking
- `deriveCategoryFromSeverity()` is unchanged — it only maps severity to BLOCKING/NON_BLOCKING; DATA_LOSS is set explicitly by the insertion failure code

**Status**: Accepted

---

### ADR-VAL-009: Instance-Level Issue Suppression (NON_BLOCKING Only)

**Context**: Some validation warnings are expected in specific contexts (e.g., "single port has multiple links" is a WARNING, but for non-concurrent usecases this is intentional). Users need to suppress a specific occurrence of a warning for a specific entity, without disabling the rule globally.

**Decision**: Add `suppressions: Record<string, IssueSuppression>` to `ValidationPreferences`. Key format: `"code:entityType:systemId"`. Only `NON_BLOCKING` issues can be suppressed at the instance level. `BLOCKING` and `DATA_LOSS` issues cannot be suppressed.

**Rationale**:
- Global `disabled` in `IssuePreference` silences all instances of a rule — too broad for this use case
- Instance-level suppression is precise: the user acknowledges a specific known-good deviation
- The suppression key is deterministic and stable (based on entity identity, not position)
- Stateless: suppression is stored in preferences (DB + file), no server-side session state needed

**Lifecycle**: When an entity is deleted, its suppression becomes dead (no issue will be generated for a non-existent entity). Dead suppressions are cleaned up lazily when saving preferences.

**Status**: Accepted

---

### ADR-VAL-010: DATA_LOSS Acknowledgment Gate with Per-Issue Tracking

**Context**: When a file is opened with DATA_LOSS issues, the user must explicitly resolve each issue before the project becomes usable. Issues may be resolved by applying fix options (which insert the missing data) or by acknowledging the loss.

**Decision**:
1. Store full DATA_LOSS `ValidationIssue[]` in `files.data_loss_issues` (JSON blob) on upload
2. `open_status = 'PENDING_DATA_LOSS_ACK'` blocks all normal API calls (enforced by `DataLossAckGuard` — planned)
3. `POST /apply-fix` with `dataLossIssueKey` removes the resolved issue from the stored list; if the list becomes empty, automatically moves to `READY`
4. `POST /acknowledge-data-loss` → `AcknowledgeDataLossCommand` → clears all remaining issues and moves to `READY`

**Rationale**:
- Per-issue tracking allows partial resolution — user can fix some issues and acknowledge others
- Automatic transition to READY when all issues are fixed avoids a redundant acknowledgment step
- `acknowledge-data-loss` is only needed for issues with no fix option
- Storing full `ValidationIssue[]` (not minimal) avoids a separate DB query to reconstruct issue details for the client

**Trade-off**: The `POST /apply-fix` endpoint gains awareness of DATA_LOSS state (via the optional `dataLossIssueKey` field). This is a small coupling but justified by the UX benefit of automatic READY transition.

**Status**: Accepted

---

### ADR-VAL-011: Single ValidationQueryRepository Port (Not Multiple Separate Repos)

**Context**: The `ValidationContextBuilder.fromDb()` needs to load multiple entity types (modules, usecases, subgraphs, links, definitions, preferences). Two options: inject one repository per entity type (6+ constructor params), or define a single `ValidationQueryRepository` port that aggregates all read operations.

**Decision**: Single `ValidationQueryRepository` port. The builder takes `constructor(readonly queryRepo: ValidationQueryRepository)`.

**Rationale**:
- Simpler constructor — one dependency instead of 6+
- The query repository is a cohesive read-only interface for validation; all methods serve the same use case
- `requiredEntityTypes` selective loading is implemented inside `fromDb()` — the port exposes all methods but only the needed ones are called
- The port is also exposed on `UnitOfWork` as `getValidationQueryService()` for command handlers

**Trade-off**: The port interface is larger than strictly needed for any single rule. Acceptable given the cohesion of the validation use case.

**Status**: Accepted

---

*End of Document*
