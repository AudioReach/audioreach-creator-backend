<!--
Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
SPDX-License-Identifier: BSD-3-Clause
-->

# ApiIssueItem: Unified Issue Shape for ApiResult

**Date:** 2026-07-09  
**Status:** Implemented (wire shape updated 2026-11-25 for rendered issues)  
**Related documents:**
- `api-error-handling-design.md` — exception hierarchy, AllExceptionsFilter, layer responsibilities
- `../validation-framework-design.md` — ValidationIssue domain model
- `../logging/design/human-readable-logging-and-errors-phase-1-design.md` §8 — issue facts, renderer, and entity references

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

  category?: IssueCategory;
  impactedEntity?: ApiEntityRef;
  impactedUsecases?: ApiEntityRef[];
  relatedEntities?: ApiRelatedEntities;  // rendered issues only
  params?: ApiIssueParams;               // rendered issues only
  fixOptions?: ApiFixOptionDto[];
}

class ApiEntityRef {
  entityType!: EntityType;   // OpenAPI enum name IssueEntityType
  systemId!: string;         // decimal string
  displayName?: string;      // natural identity, e.g. "Subgraph 'Mic capture' (0x00001234)"
}

type ApiRelatedEntities = Record<
  string,                    // role, e.g. "subgraphs"
  ApiEntityRef | ApiEntityRef[] | Record<string, ApiEntityRef | ApiEntityRef[]>[]
>;
type ApiIssueParams = Record<string, string | number>;
```

All fields after `severity` are optional. Operational failures (parse errors, bulk item
failures) populate only `{code, message, severity}`.

`ApiEntityRef` is used for `impactedEntity`, `impactedUsecases`, and every entity in
`relatedEntities`. A role in `relatedEntities` holds one entity, a list, or a list of
groups (entities that belong together, such as a key value and the subgraphs that
conflict on it). `params` holds the machine context that is not an entity. The roles
and params of each code are listed in the core `IssueContextMap`; there is one generic
`ApiIssueItem` shape and no per-code OpenAPI union. Empty `relatedEntities` and
`params` are omitted.

### 2.2.1 ApiFixOptionDto

```typescript
class ApiFixOptionDto {
  id!: string;                        // stable identifier
  kind?: string;                      // rendered fix options only, e.g. SELECT_CANDIDATE
  description!: string;
  commandType!: string;
  commandPayload!: Record<string, unknown>;  // unchanged; client inputs set to null
  requiredClientInputs!: ApiClientInputSpecDto[];
  relatedEntities?: ApiRelatedEntities;      // rendered fix options only
  params?: ApiIssueParams;                   // rendered fix options only
}
```

### 2.2.2 Rendered and legacy issues

Core issues are either rendered `Issue`s (from issue facts, with `relatedEntities` and
`params`) or `LegacyIssue`s (free-text message), until every producer is converted.
The mapper maps both to the same shape:

- a rendered issue sends every field, and each entity reference has a `displayName`;
- a legacy issue has no `relatedEntities`, `params`, or fix-option `kind`; its
  `impactedUsecases` carry only `entityType` and `systemId`, and a
  `LegacyFixOption.systemId` is sent as `id`.

Extra fields of subtypes such as `ValidationIssue` (`name`, `defaultSeverity`) are not
sent.

### 2.3 Enums

All closed value sets are named enums. Swagger generates named `$ref` schemas
(not inlined strings), allowing code generators to produce typed client enums.

| OpenAPI enum | Values | Core constant |
|---|---|---|
| `IssueSeverity` | `FATAL`, `ERROR`, `WARNING` | `IssueSeverity` in `shared/issues/severity.ts` |
| `IssueCategory` | `BLOCKING`, `NON_BLOCKING`, `DATA_LOSS` | `IssueCategory` in `shared/issues/severity.ts` |
| `IssueEntityType` | every `EntityType` | `ENTITY_TYPE` in `shared/entity-type.ts` |
| `ClientInputType` | `NUMBER`, `STRING`, `BOOLEAN` | `CLIENT_INPUT_TYPE` in `shared/issues/fix-option.ts` |

The DTOs use these `@arc/core` constants directly; the API layer has no copies.

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

Core results carry `Issue | LegacyIssue` (`Result<T, I = Issue | LegacyIssue>`). `Issue`
is in `packages/core/src/application/issues/issue.ts`; `LegacyIssue` is in
`packages/core/src/shared/issues/issue.ts`.

The mapper `api-issue-item.mapper.ts` projects them at the API boundary:

```typescript
toApiIssueItems(result.issues)  // (Issue | LegacyIssue)[] → ApiIssueItem[] | undefined
```

`toApiIssueItems` returns `undefined` for no issues, so `issues` is omitted rather than
sent as `[]`.

---

## 5. How to Populate Issues

### 5.1 Operational failure (no validation context)

```typescript
const issues: ApiIssueItem[] = failedIds.map(id => ({
  code: 'PARAM_PAYLOAD_NOT_FOUND',
  message: `No calibration payload found for parameter system ID ${id}`,
  severity: IssueSeverity.Error,
  // category, impactedEntity, relatedEntities, params, fixOptions — omit
}));
```

### 5.2 Domain validation issues (from ValidationReport)

Use `toApiIssueItems()` from the mapper — do not construct manually:

```typescript
import {toApiIssueItems} from '../../common/dto/api-response/api-issue-item.mapper.js';

// In the handler, return a Result whose issues are Issue | LegacyIssue
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

`IssueCollector` collects `LegacyIssue`s; its output is returned through
`Result.partial(data, collector.getIssues())`, and the API mapper projects it. Operational
issues produced during file parsing get `severity: 'ERROR'` or `'WARNING'` — no `category` or
`impactedEntity` (that information is not available at parse time).

---

## 6. File Locations

```
packages/api/src/presentation/rest/common/dto/api-response/
├── api-result.dto.ts            — ApiResult<T> with issues?: ApiIssueItem[]
├── api-issue-item.dto.ts        — ApiIssueItem, ApiEntityRef, ApiRelatedEntities, ApiIssueParams
├── api-fix-option.dto.ts        — ApiFixOptionDto, ApiClientInputSpecDto
├── issue-context.docs.ts        — OpenAPI descriptions of relatedEntities and params
└── api-issue-item.mapper.ts     — toApiIssueItem(), toApiIssueItems()

packages/core/src/
├── application/issues/issue.ts  — Issue, RenderedEntityRef, RenderedFixOption
├── domain/issues/               — IssueFact, FixOptionFact, IssueContextMap
└── shared/issues/               — LegacyIssue, LegacyFixOption, IssueSeverity, IssueCategory
```

---

## 7. What Does NOT Change

- `AllExceptionsFilter` — produces `ErrorResponse` for the fail-fast exception path, not `ApiResult`;
  the issues of a domain exception go through the same `toApiIssueItems` mapper
- `PartialSuccessInterceptor` — updated to check `issues[]` instead of `errors[]` for 207 determination
- Domain layer (`ValidationReport`, `ValidationIssue`, `ValidationEngine`) — untouched
