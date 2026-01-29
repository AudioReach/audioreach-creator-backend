<!--
Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
SPDX-License-Identifier: BSD-3-Clause
-->

# ApiIssueItem: Unified Issue Shape for ApiResult

**Date:** 2026-07-09  
**Status:** Implemented  
**Related documents:**
- `api-error-handling-design.md` — exception hierarchy, AllExceptionsFilter, layer responsibilities
- `../validation-framework-design.md` — ValidationIssue domain model

---

## 1. Context

`ApiResult<T>` previously carried two separate arrays: `errors?: ApiErrorItem[]` and
`warnings?: ApiWarningItem[]`. Both had a flat `{code, message, id?}` shape — losing all
structure from the validation framework (`severity`, `category`, impacted entity, fix options).

Splitting errors and warnings into two arrays contradicts:
- RFC 7807 (Problem Details) — severity is an extension field, not an array split
- JSON:API Errors — single `errors[]` array, severity in `meta`
- GraphQL — single `errors[]` array, severity in `extensions`
- The domain model itself — `ValidationReport.issues[]` is one array with `effectiveSeverity` as a field

---

## 2. Design

`errors[]` and `warnings[]` are replaced by a single `issues?: ApiIssueItem[]` on `ApiResult`.

### 2.1 ApiResult

```typescript
class ApiResult<T> {
  data?: T;
  success!: boolean;
  message!: string;
  issues?: ApiIssueItem[];
}
```

### 2.2 ApiIssueItem

```typescript
class ApiIssueItem {
  code!: string;                      // always present
  message!: string;                   // always present
  severity!: IssueSeverity;           // always present

  category?: IssueCategory;          // validation issues only
  impactedEntity?: ApiImpactedEntityDto;  // validation issues only
  impactedUsecases?: number[];        // validation issues only
  fixOptions?: ApiFixOptionDto[];     // validation issues only
}
```

Fields `category`, `impactedEntity`, `impactedUsecases`, and `fixOptions` are optional.
Operational failures (parse errors, bulk item failures) populate only `{code, message, severity}`.
Domain validation issues populate all fields.

### 2.3 Enums

All closed value sets are named API-layer enums. Swagger generates named `$ref` schemas
(not inlined strings), allowing code generators to produce typed client enums.

| Enum | Values | File |
|---|---|---|
| `IssueSeverity` | `FATAL`, `ERROR`, `WARNING` | `enums/issue-severity.enum.ts` |
| `IssueCategory` | `BLOCKING`, `NON_BLOCKING`, `DATA_LOSS` | `enums/issue-category.enum.ts` |
| `IssueEntityType` | `SpfModule`, `DataLink`, `ControlLink`, `Subgraph`, `UseCase`, `Container`, `SpfModuleDefinition` | `enums/issue-entity-type.enum.ts` |
| `ClientInputType` | `NUMBER`, `STRING`, `BOOLEAN` | `enums/client-input-type.enum.ts` |

The API layer defines its own copies. Core domain enums (`IssueSeverity`, `IssueCategory`,
`VALIDATION_ENTITY_TYPE` in `packages/core/src/domain/validation/issue.ts`) are NOT imported
into DTOs — the architecture rule prohibits importing from `@arc/core` into DTO classes.

### 2.4 `code` Field

The `code` field is a documented **string**, not an enum. This follows the industry standard:

| API | `type`/`status` | `code` |
|---|---|---|
| Stripe | Strict enum (4 values) | Documented string |
| GitHub | HTTP status | Documented string constants |
| RFC 7807 | `type` URI | Extension members |

Rule codes are an **open set** — new validation rules add new codes without API changes.
Format: `ARC-{ENTITY}-{SEQ}` for validation rules (e.g. `ARC-MOD-001`).
Operational codes use descriptive constants (e.g. `DB_QUERY_FAILED`, `PARAM_PAYLOAD_NOT_FOUND`).

---

## 3. `blockedSave` Semantics

`blockedSave` is not a top-level field. Clients derive it:

```typescript
const blockedSave = issues?.some(i => i.category === 'DATA_LOSS') ?? false;
```

A `DATA_LOSS` issue means an entity failed to insert into the DB during upload. All normal
API calls are blocked until acknowledged. A `BLOCKING` category issue (FATAL or ERROR severity)
means save is blocked but normal reads are permitted.

---

## 4. Core Layer Bridge

The core layer uses `ResultIssue` / `ResultFixOption` in `packages/core/src/shared/types/api-result.ts`.
Fields that would need to be typed enums in the API layer are typed as `string` in core (to avoid
importing API-layer enums into `@arc/core`).

The mapper `api-issue-item.mapper.ts` performs the cast at the API boundary:

```typescript
toApiIssueItems(result.issues)  // ResultIssue[] → ApiIssueItem[]
```

---

## 5. How to Populate Issues

### 5.1 Operational failure (no validation context)

```typescript
const issues: ApiIssueItem[] = failedIds.map(id => ({
  code: 'PARAM_PAYLOAD_NOT_FOUND',
  message: `No calibration payload found for parameter system ID ${id}`,
  severity: IssueSeverity.Error,
  // category, impactedEntity, fixOptions — omit
}));
```

### 5.2 Domain validation issues (from ValidationReport)

Use `toApiIssueItems()` from the mapper — do not construct manually:

```typescript
import {toApiIssueItems} from '../../common/dto/api-response/api-issue-item.mapper.js';

// In the handler, return issues?: ResultIssue[] on the result type
// In the controller:
const apiIssues = toApiIssueItems(result.issues);
return {
  data: ...,
  success: !apiIssues?.some(i => i.category === IssueCategory.Blocking),
  message: '...',
  issues: apiIssues,
};
```

### 5.3 IssueCollector (upload-time parse/insert errors)

`IssueCollector.formatForApi()` returns `{issues?: ResultIssue[]}`. Operational issues
produced during file parsing get `severity: 'ERROR'` or `'WARNING'` — no `category` or
`impactedEntity` (that information is not available at parse time).

---

## 6. File Locations

```
packages/api/src/presentation/rest/common/dto/api-response/
├── enums/
│   ├── issue-severity.enum.ts
│   ├── issue-category.enum.ts
│   ├── issue-entity-type.enum.ts
│   └── client-input-type.enum.ts
├── api-result.dto.ts            — ApiResult<T> with issues?: ApiIssueItem[]
├── api-issue-item.dto.ts        — ApiIssueItem, ApiImpactedEntityDto
├── api-fix-option.dto.ts        — ApiFixOptionDto, ApiClientInputSpecDto
└── api-issue-item.mapper.ts     — toApiIssueItem(), toApiIssueItems()

packages/core/src/shared/types/
└── api-result.ts                — ResultIssue, ResultFixOption, ResultClientInputSpec
```

---

## 7. What Does NOT Change

- `AllExceptionsFilter` — produces `ErrorResponse` for the fail-fast exception path, not `ApiResult`
- `PartialSuccessInterceptor` — updated to check `issues[]` instead of `errors[]` for 207 determination
- Domain layer (`ValidationReport`, `ValidationIssue`, `ValidationEngine`) — untouched
