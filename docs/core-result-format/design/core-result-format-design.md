<!--
Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
SPDX-License-Identifier: BSD-3-Clause
-->

# Core Result Format — Design

**Status:** Implemented
**Date:** 2026-07-13
**Author:** Nithin Simon (with Claude)
**Requirements:** [../requirements/core-result-format-requirements.md](../requirements/core-result-format-requirements.md)

---

## 1. Overview

This design implements the requirements captured in `core-result-format-requirements.md`. It establishes:

1. A single **`Issue`** vocabulary in `packages/core/src/shared/issues/`.
2. A single **`Result<T>`** outcome envelope in `packages/core/src/application/shared/result/`, expressed as a discriminated union with a `Result` namespace of factory functions.
3. A refactored **`ValidationIssue extends Issue`** in `packages/core/src/domain/validation/`, replacing PR #85's separate `ResultIssue` transport type.
4. A **totality-based** HTTP boundary — handlers throw for unstructured failures, return `Result<T>` for structured outcomes; controllers use `throwIfFailed()` + `toApiResult()` at the edge.
5. A collapsed **`ApiResult<T>`** DTO of `{data?, issues?}` — no more `errors[]`/`warnings[]`/`success`/`message`.

---

## 2. `shared/issues/` module — the base Issue vocabulary

Location: `packages/core/src/shared/issues/`.

### 2.1 File layout

```
packages/core/src/shared/issues/
├── severity.ts           IssueSeverity, IssueCategory, deriveCategoryFromSeverity, SEVERITY_ORDER
├── impacted-entity.ts    ImpactedEntity, ISSUE_ENTITY_TYPE, IssueEntityType
├── fix-option.ts         FixOption, ClientInputSpec, CLIENT_INPUT_TYPE, ClientInputType
├── issue.ts              Issue interface
├── factories.ts          IssueFactory.notFound / dbError / parseError / dataLoss
└── index.ts              barrel re-exports
```

### 2.2 `severity.ts`

Content lifted from `packages/core/src/domain/validation/issue.ts` verbatim. No semantic change.

```typescript
export const IssueSeverity = { Fatal: 'FATAL', Error: 'ERROR', Warning: 'WARNING' } as const;
export type IssueSeverity = (typeof IssueSeverity)[keyof typeof IssueSeverity];

export const IssueCategory = { Blocking: 'BLOCKING', NonBlocking: 'NON_BLOCKING', DataLoss: 'DATA_LOSS' } as const;
export type IssueCategory = (typeof IssueCategory)[keyof typeof IssueCategory];

export const SEVERITY_ORDER: ReadonlyArray<IssueSeverity> = [
  IssueSeverity.Warning, IssueSeverity.Error, IssueSeverity.Fatal,
] as const;

export function deriveCategoryFromSeverity(severity: IssueSeverity): IssueCategory {
  return severity === IssueSeverity.Fatal || severity === IssueSeverity.Error
    ? IssueCategory.Blocking
    : IssueCategory.NonBlocking;
}
```

### 2.3 `impacted-entity.ts`

Enum renamed from `VALIDATION_ENTITY_TYPE` to `ISSUE_ENTITY_TYPE` — the values are now used by both validation and operational issues, so the old name is misleading.

```typescript
export const ISSUE_ENTITY_TYPE = {
  SpfModule: 'SpfModule',
  DataLink: 'DataLink',
  ControlLink: 'ControlLink',
  Subgraph: 'Subgraph',
  UseCase: 'UseCase',
  Container: 'Container',
  SpfModuleDefinition: 'SpfModuleDefinition',
} as const;
export type IssueEntityType = (typeof ISSUE_ENTITY_TYPE)[keyof typeof ISSUE_ENTITY_TYPE];

export interface ImpactedEntity {
  entityType: IssueEntityType;
  systemId: number;
  displayName?: string;
}
```

### 2.4 `fix-option.ts`

Content lifted from `packages/core/src/domain/validation/issue.ts` verbatim. `FixOption`, `ClientInputSpec`, `CLIENT_INPUT_TYPE`.

### 2.5 `issue.ts` — the base type

```typescript
import type {IssueSeverity, IssueCategory} from './severity.js';
import type {ImpactedEntity} from './impacted-entity.js';
import type {FixOption} from './fix-option.js';

/**
 * Base issue vocabulary. Carried by Result<T>.issues and mirrored on the wire
 * as ApiIssueItem.
 *
 * Operational failures populate {code, message, severity} at minimum.
 * Domain validation issues (ValidationIssue extends Issue) additionally
 * populate category, impactedEntity, impactedUsecases, and fixOptions.
 */
export interface Issue {
  code: string;
  message: string;
  severity: IssueSeverity;
  category?: IssueCategory;
  impactedEntity?: ImpactedEntity;
  impactedUsecases?: number[];
  fixOptions?: FixOption[];
}
```

### 2.6 `factories.ts` — `IssueFactory` for operational issues

```typescript
import type {Issue} from './issue.js';
import {IssueSeverity, IssueCategory} from './severity.js';
import type {IssueEntityType, ImpactedEntity} from './impacted-entity.js';

export const IssueFactory = {
  notFound(entityType: IssueEntityType, systemId: number, displayName?: string): Issue {
    return {
      code: 'ENTITY_NOT_FOUND',
      message: `${entityType} not found (systemId: ${systemId})`,
      severity: IssueSeverity.Error,
      impactedEntity: {entityType, systemId, ...(displayName && {displayName})},
    };
  },

  dbError(message: string, impactedEntity?: ImpactedEntity): Issue {
    return {
      code: 'DB_QUERY_FAILED',
      message,
      severity: IssueSeverity.Error,
      ...(impactedEntity && {impactedEntity}),
    };
  },

  parseError(code: string, message: string): Issue {
    return {
      code,
      message,
      severity: IssueSeverity.Error,
    };
  },

  dataLoss(
    code: string,
    message: string,
    impactedEntity: ImpactedEntity,
    fixOptions?: FixOption[],
  ): Issue {
    return {
      code,
      message,
      severity: IssueSeverity.Warning,
      category: IssueCategory.DataLoss,
      impactedEntity,
      ...(fixOptions && fixOptions.length > 0 && {fixOptions}),
    };
  },
};
```

`IssueFactory` (not `Issue.notFound`) because `Issue` is a type. Renaming the type to keep the namespace name is not worth the churn.

Ship-in-v1 factory set: `notFound`, `dbError`, `parseError`, `dataLoss`. Extend as new operational categories emerge.

### 2.7 Barrel

```typescript
// packages/core/src/shared/issues/index.ts
export * from './severity.js';
export * from './impacted-entity.js';
export * from './fix-option.js';
export * from './issue.js';
export * from './factories.js';
```

Re-exported from `packages/core/src/index.ts` for cross-package consumers.

---

## 3. `Result<T>` — the outcome envelope

Location: `packages/core/src/application/shared/result/result.ts`.

Folder is lowercase (`result/`) matching the codebase convention for all other core folders. The existing `Result/` (capital R) folder is renamed as part of this refactor.

### 3.1 The discriminated union

```typescript
import type {Issue} from '../../../shared/issues/index.js';

/**
 * Outcome envelope for query and command handlers.
 *
 * Three tagged variants:
 *   ok       — data produced; optional non-blocking issues (warnings)
 *   partial  — data produced with per-item or per-field ERROR/FATAL issues
 *   fail     — no data; outcome expressed as structured issues (validation
 *              rejection with fixOptions, request-shape rejection with hints).
 *              Handlers throw a DomainException for unstructured total failures.
 */
export type Result<T> =
  | {readonly kind: 'ok'; readonly data: T; readonly issues?: readonly Issue[]}
  | {readonly kind: 'partial'; readonly data: T; readonly issues: readonly Issue[]}
  | {readonly kind: 'fail'; readonly issues: readonly Issue[]};
```

### 3.2 The `Result` namespace — factories

```typescript
export const Result = {
  ok<T>(data: T, issues?: readonly Issue[]): Result<T> {
    if (issues && issues.length > 0) return {kind: 'ok', data, issues};
    return {kind: 'ok', data};
  },

  partial<T>(data: T, issues: readonly Issue[]): Result<T> {
    if (issues.length === 0) {
      throw new Error(
        'Result.partial() requires at least one issue — use Result.ok() for issue-free success',
      );
    }
    return {kind: 'partial', data, issues};
  },

  fail<T = never>(...issues: readonly Issue[]): Result<T> {
    if (issues.length === 0) {
      throw new Error('Result.fail() requires at least one issue');
    }
    return {kind: 'fail', issues};
  },
} as const;
```

**No predicate helpers.** `result.kind === 'fail'` is self-documenting, exhaustive, and one obvious way. Predicate wrappers would introduce style drift for zero real value. Add later if a genuine pattern emerges.

### 3.3 Canonical usage patterns

**Chaining outcomes inside a handler:**

```typescript
const modulesResult = await this.queryServices.spfModuleQueryService.findMany(ids, fileId);
if (modulesResult.kind === 'fail') return modulesResult;   // TS narrows to fail here
const modules = modulesResult.data;                        // TS narrowed to ok|partial
```

**Exhaustive branching:**

```typescript
switch (result.kind) {
  case 'ok':      /* result.data: T, result.issues?: readonly Issue[] */ break;
  case 'partial': /* result.data: T, result.issues: readonly Issue[]  */ break;
  case 'fail':    /* result.issues: readonly Issue[] */ break;
}
```

### 3.4 Files deleted

- `packages/core/src/application/shared/Result/operation-result.ts` (replaced by lowercase `result/result.ts`)
- `packages/core/src/shared/types/operation-result.ts` (placeholder discriminated union)
- `packages/core/src/shared/types/api-result.ts` (PR #85's `ResultIssue` — subsumed by `shared/issues/`)

---

## 4. Validation framework refactor

`ValidationIssue extends Issue`. All enums move to `shared/issues/`. Field renames are mechanical.

### 4.1 The reshaped `ValidationIssue`

```typescript
// packages/core/src/domain/validation/issue.ts (shrunk from ~120 LOC to ~15 LOC)
import type {Issue, IssueSeverity} from '../../shared/issues/index.js';

export interface ValidationIssue extends Issue {
  /** Rule name — e.g. "Missing Module Definition". Only meaningful for rule outputs. */
  name: string;
  /** Rule's built-in severity before user preferences applied. Internal only — never on the wire. */
  defaultSeverity: IssueSeverity;
}
```

### 4.2 Field renames

| Old field | New field | Location |
|---|---|---|
| `description: string` | `message: string` | inherited from `Issue` |
| `effectiveSeverity: IssueSeverity` | `severity: IssueSeverity` | inherited from `Issue` |
| `defaultSeverity: IssueSeverity` | `defaultSeverity: IssueSeverity` | kept on `ValidationIssue` |
| `name: string` | `name: string` | kept on `ValidationIssue` |
| `category: IssueCategory` | `category?: IssueCategory` | inherited (optional in base) |
| `fixOptions: FixOption[]` | `fixOptions?: FixOption[]` | inherited (optional in base) |
| `impactedEntity: ImpactedEntity` | `impactedEntity?: ImpactedEntity` | inherited (optional in base) |
| `impactedUsecases: number[]` | `impactedUsecases?: number[]` | inherited (optional in base) |

Base fields are optional to accommodate operational issues; rule code still populates them unconditionally.

### 4.3 Behavioural edit — `preference-enforcer.ts`

The one file with a non-mechanical change: it currently sets `effectiveSeverity` on the returned issue. After the refactor it sets `severity`. Logic (severity escalation via `SEVERITY_ORDER`) is unchanged. Rules seed `severity = defaultSeverity` at construction so the field is always present.

### 4.4 Rule authoring after refactor

```typescript
export class MissingDefinitionRule implements ValidationRule<ModuleValidationContext> {
  readonly code = 'ARC-MOD-001';
  readonly defaultSeverity = IssueSeverity.Error;
  readonly groups = [VALIDATION_RULE_GROUP.UploadFile, VALIDATION_RULE_GROUP.Commit];
  readonly requiredEntityTypes = [
    ISSUE_ENTITY_TYPE.SpfModule,
    ISSUE_ENTITY_TYPE.SpfModuleDefinition,
  ] as const;

  validate(ctx: ModuleValidationContext): ValidationIssue[] {
    return ctx.modules
      .filter(m => !ctx.definitions.has(m.definitionId))
      .map(m => ({
        code: this.code,
        name: 'Missing Module Definition',
        message: `Module '${m.alias ?? 'unknown'}' references missing definition ${m.definitionId}`,
        defaultSeverity: this.defaultSeverity,
        severity: this.defaultSeverity,
        category: deriveCategoryFromSeverity(this.defaultSeverity),
        impactedEntity: {entityType: ISSUE_ENTITY_TYPE.SpfModule, systemId: m.systemId, displayName: m.alias},
        impactedUsecases: [],
        fixOptions: [],
      }));
  }
}
```

Explicit field population — no `newValidationIssue()` helper (fewer indirection layers).

### 4.5 Insert-failure catalog — named issue templates

Location: `packages/core/src/domain/validation/insert-failures/`.

Replaces ad-hoc "synthetic ValidationIssue" fabrication in bulk-inserters with a formal catalog of stable codes and factory function.

```typescript
// insert-failure-codes.ts
export const INSERT_FAILURE = {
  ModuleDuplicateInstanceId: {
    code: 'ARC-INSERT-MOD-001',
    name: 'Module Insert Failed — Duplicate Instance ID',
    entityType: ISSUE_ENTITY_TYPE.SpfModule,
  },
  ModuleMissingDefinition: {
    code: 'ARC-INSERT-MOD-002',
    name: 'Module Insert Failed — Missing Definition',
    entityType: ISSUE_ENTITY_TYPE.SpfModule,
  },
  DataLinkDuplicate: {
    code: 'ARC-INSERT-LINK-001',
    name: 'Data Link Insert Failed — Duplicate',
    entityType: ISSUE_ENTITY_TYPE.DataLink,
  },
} as const;

export type InsertFailureType = keyof typeof INSERT_FAILURE;
```

```typescript
// insert-failure.factory.ts
export function newInsertFailureIssue(
  type: InsertFailureType,
  systemId: number,
  detail: string,
  displayName?: string,
  fixOptions?: FixOption[],
): ValidationIssue {
  const spec = INSERT_FAILURE[type];
  return {
    code: spec.code,
    name: spec.name,
    message: `${spec.name}: ${detail}`,
    defaultSeverity: IssueSeverity.Warning,
    severity: IssueSeverity.Warning,
    category: IssueCategory.DataLoss,
    impactedEntity: {entityType: spec.entityType, systemId, ...(displayName && {displayName})},
    impactedUsecases: [],
    ...(fixOptions && fixOptions.length > 0 && {fixOptions}),
  };
}
```

Grepping `ARC-INSERT-` finds every insert-failure code in the codebase.

### 4.6 `IssueCollector` becomes a thin accumulator

`packages/core/src/application/file-operations/upload-file/types/issue-collection.ts` — remove `formatForApi()` and rename accumulated type from `EntityBuildIssue` to `Issue`. Callers use `newInsertFailureIssue(...)` and `IssueFactory.parseError(...)` etc. to construct concrete issues.

`IssueCollector.getIssues(): Issue[]` — flows directly into `Result.partial(data, collector.getIssues())`.

### 4.7 DATA_LOSS storage — unchanged

`files.data_loss_issues` continues to hold `ValidationIssue[]`. Insert failures produce `ValidationIssue` (via the catalog factory) — the serialized shape preserves `name` and `defaultSeverity` for the acknowledgment gate's display info.

---

## 5. HTTP boundary — controller unwrap + status mapping

Location for new files: `packages/api/src/presentation/rest/common/result/`.

### 5.1 `throwIfFailed()`

```typescript
import {HttpException} from '@nestjs/common';
import type {Result} from '@arc/core';
import {resolveHttpStatus} from './http-status-map.js';

/**
 * Throws a mapped HttpException if the Result is a failure.
 * Narrows Result<T> to Exclude<Result<T>, {kind: 'fail'}> for subsequent code.
 */
export function throwIfFailed<T>(
  result: Result<T>,
): asserts result is Exclude<Result<T>, {kind: 'fail'}> {
  if (result.kind !== 'fail') return;

  const primary = result.issues[0];
  const status = resolveHttpStatus(primary.code);
  throw new HttpException(
    {
      statusCode: status,
      errorCode: primary.code,
      message: primary.message,
      issues: result.issues,
    },
    status,
  );
}
```

`asserts` return type gives TypeScript-level narrowing at the call site.

### 5.2 HTTP status map

```typescript
// http-status-map.ts
import {HttpStatus} from '@nestjs/common';

const EXACT_CODE_MAP = new Map<string, HttpStatus>([
  ['ENTITY_NOT_FOUND', HttpStatus.NOT_FOUND],           // 404
  ['DB_QUERY_FAILED', HttpStatus.INTERNAL_SERVER_ERROR], // 500
  ['PARSE_ERROR', HttpStatus.BAD_REQUEST],               // 400
  ['PARAM_PAYLOAD_NOT_FOUND', HttpStatus.NOT_FOUND],     // 404
  ['SESSION_NOT_OPEN', HttpStatus.FORBIDDEN],            // 403
  ['SESSION_MODE_NOT_ALLOWED', HttpStatus.FORBIDDEN],    // 403
]);

const PREFIX_MAP: ReadonlyArray<[string, HttpStatus]> = [
  ['ARC-INSERT-', HttpStatus.UNPROCESSABLE_ENTITY],      // 422 — DATA_LOSS
  ['ARC-', HttpStatus.UNPROCESSABLE_ENTITY],             // 422 — validation rules
];

export function resolveHttpStatus(code: string): HttpStatus {
  const exact = EXACT_CODE_MAP.get(code);
  if (exact !== undefined) return exact;
  for (const [prefix, status] of PREFIX_MAP) {
    if (code.startsWith(prefix)) return status;
  }
  return HttpStatus.INTERNAL_SERVER_ERROR;
}
```

Prefix matching handles the open set of `ARC-*` validation rule codes. New rules get correct status automatically.

### 5.3 `toApiResult()`

```typescript
import type {Result} from '@arc/core';
import type {ApiResult} from '../dto/api-response/api-result.dto.js';
import {toApiIssueItems} from '../dto/api-response/api-issue-item.mapper.js';

export function toApiResult<T>(
  result: Exclude<Result<T>, {kind: 'fail'}>,
): ApiResult<T> {
  return {
    data: result.data,
    ...(result.issues && result.issues.length > 0 && {issues: toApiIssueItems(result.issues)}),
  };
}
```

Signature accepts the narrowed type — callers must have run `throwIfFailed()` first.

### 5.4 `PartialSuccessInterceptor` — updated check

```typescript
private isPartialSuccess(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const response = body as Record<string, unknown>;
  if (!('issues' in response) || !Array.isArray(response.issues)) return false;
  return (response.issues as ApiIssueItem[]).some(
    i => i.severity === IssueSeverity.Error || i.severity === IssueSeverity.Fatal,
  );
}
```

WARNING-only issues stay 200; ERROR/FATAL trigger 207.

### 5.5 `AllExceptionsFilter` — top-level issues propagation

Small delta: when an `HttpException` payload contains `issues[]`, propagate to top-level `ErrorResponse.issues` (not buried in `details`). This makes failed-Result responses have the same top-level `issues[]` shape as partial-success responses.

### 5.6 Controller pattern

```typescript
@Get(':id')
async getModule(@Param('id') id: string): Promise<ApiResult<SpfModuleReadModel>> {
  const result = await this.queryBus.execute(new GetSpfModuleQuery(id));
  throwIfFailed(result);
  return toApiResult(result);
}
```

Two-line boilerplate per handler call. `throwIfFailed` is grep-able and appears in stack traces.

---

## 6. API layer DTOs

Location: `packages/api/src/presentation/rest/common/dto/api-response/`.

### 6.1 `ApiResult<T>` — final shape

```typescript
export class ApiResult<T> {
  @ApiProperty({required: false}) data?: T;
  @ApiProperty({type: [ApiIssueItem], required: false}) issues?: ApiIssueItem[];
}
```

Two fields. `success` and `message` dropped — they carry no information under the new design:
- `success` is always true when an `ApiResult` body exists (failures go through `ErrorResponse`)
- `message` is always "ok" / "partial" — noise

HTTP status (200/207) conveys partial-vs-complete. Clients derive booleans from `issues[]` if needed.

### 6.2 `ApiIssueItem` — structurally mirrors `Issue`

Same fields as core `Issue`, decorated for Swagger. `ApiImpactedEntityDto` for the nested `impactedEntity`. Enum imports from `@arc/core` (value imports, so Swagger emits `$ref`'d schemas).

### 6.3 `ApiFixOptionDto` — unchanged from PR #85

Retained as-is: `id`, `description`, `commandType`, `commandPayload`, `requiredClientInputs`.

### 6.4 Mappers

`toApiIssueItem(issue: Issue): ApiIssueItem` — field-for-field projection. Extra fields on `ValidationIssue` (`name`, `defaultSeverity`) naturally not projected.

`toApiIssueItems(issues?: readonly Issue[]): ApiIssueItem[] | undefined` — array wrapper; returns `undefined` for empty input so the ApiResult doesn't carry an empty `issues[]` field.

### 6.5 Deleted DTOs

- `api-error-item.dto.ts`
- `api-warning-item.dto.ts`

---

## 7. Response body shapes on the wire

| Response | HTTP status | Body shape |
|---|---|---|
| Complete success | 200 | `{data}` |
| Success + warnings | 200 | `{data, issues: [WARNING-severity]}` |
| Partial success | 207 | `{data, issues: [ERROR/FATAL-severity + optional WARNING]}` |
| Structured failure | 4xx (per `http-status-map`) | `{statusCode, errorCode, message, issues, timestamp, path}` (ErrorResponse) |
| Unstructured failure | 4xx/5xx | `{statusCode, errorCode, message, timestamp, path}` (ErrorResponse, no `issues`) |

Two-shape wire contract: `ApiResult` for success paths, `ErrorResponse` for failure paths.

---

## 8. Migration order

Deterministic bottom-up. Each batch depends only on previous batches.

**Batch 1 — Foundation:** Create `shared/issues/`.
**Batch 2 — Result type:** Create `application/shared/result/result.ts`; delete placeholder files; delete `Result/` uppercase folder.
**Batch 3 — Validation framework:** Shrink `domain/validation/issue.ts`, rename fields across ~10 files, create `insert-failures/` catalog + factory, update `IssueCollector` and bulk-inserter call sites.
**Batch 4 — Core callers:** Update 7 query service ports, 2 query handlers, `ProjectRepository`; fix `SpfModuleQueryService.findOne` (throw instead of `Result.fail`).
**Batch 5 — API layer:** Collapse `ApiResult`, update `ApiIssueItem`, delete `ApiErrorItem`/`ApiWarningItem`, create `throw-if-failed`/`http-status-map`/`to-api-result`, update interceptor + filter, update controllers to new pattern.
**Batch 6 — Finalization:** Regenerate Swagger, update dto-examples, run full test suite.

Big-bang (single PR). Any partial state doesn't compile.

Prerequisite: PR #85 must merge first.

---

## 9. Testing strategy

### Unit tests (new)

- `packages/core/tests/unit/shared/result/result.spec.ts` — factory invariants, empty-issues rejection, type-narrowing (`@ts-expect-error` for compile-time failure cases).
- `packages/core/tests/unit/shared/issues/factories.spec.ts` — `IssueFactory.notFound`, `dbError`, `parseError`, `dataLoss`.
- `packages/core/tests/unit/domain/validation/insert-failures/insert-failure.factory.spec.ts` — each catalog entry produces the expected shape.

### Unit tests (updated)

- Existing validation framework tests — field-rename updates (`description → message`, `effectiveSeverity → severity`).
- Existing query handler tests — access-pattern updates (`.isFailure` → `.kind === 'fail'`).

### Integration tests

- Existing query service integration tests — same access-pattern updates. No behavioural change.

### E2E tests

- Add three cases covering the new response shapes: complete success (200), partial (207 with `issues[]`), thrown domain exception (`ErrorResponse` shape).
- Update `all-exceptions.filter.spec.ts` to cover `HttpException` payload with `issues[]` propagating to top-level.

### Custom Jest matchers — deliberately not shipped

No custom `expect(result).toBeOk()` / `toBePartialWith(...)` matchers for v1. Native assertions (`expect(result.kind).toBe('ok')`, `expect(result.data).toEqual(...)`) cover every case with less magic. Introduce custom matchers only if a repeating assertion pattern proves painful in practice.

---

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| PR #85 not yet merged | Sequenced dependency — Batch 1 doesn't start until PR #85 lands. |
| Half-migrated state doesn't compile | Big-bang single PR; no partial commits merged to main. |
| Validation framework behavioural regression | `preference-enforcer` is the only behavioural edit (severity key rename); existing tests cover it. |
| Swagger client regeneration required for downstream consumers | Low blast radius today — API isn't publicly consumed. Regen in final commit; document breaking change. |
| Test suite noise from mechanical renames | Landed in a dedicated commit within the PR so review can focus on the rename. |

## 11. Rollback plan

`git revert` the merge commit returns the codebase to PR #85's state (which is a coherent, self-consistent state). Safe rollback.

---

*End of document.*
