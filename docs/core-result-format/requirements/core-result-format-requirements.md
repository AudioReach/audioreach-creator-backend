<!--
Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
SPDX-License-Identifier: BSD-3-Clause
-->

# Core Result Format — Requirements

**Status:** Approved
**Date:** 2026-07-10
**Author:** Nithin Simon (with Claude)

## 1. Context

The codebase currently has three overlapping "result-shaped" types:
1. `Result<T>` in `packages/core/src/application/shared/Result/operation-result.ts` — used by 7 query services and 2 query handlers; carries `data`, `errors[]`, `warnings[]`, `isSuccess`, `isFailure`, `isComplete`.
2. `OperationResult<T>` in `packages/core/src/shared/types/operation-result.ts` — a discriminated-union placeholder used by ProjectRepository.
3. `ApiResult<T>` in `packages/api/src/presentation/rest/common/dto/api-response/api-result.dto.ts` — the wire DTO with `data`, `errors[]`, `warnings[]`, `success`, `message`.

There is also `ValidationIssue` in `packages/core/src/domain/validation/issue.ts`, produced by the validation framework's rules. PR #85 (unmerged) proposed a *separate* `ResultIssue` transport type in core with fields nearly identical to `ValidationIssue`.

This refactor **unifies the issue vocabulary** across the codebase and formalises Result as **the single outcome envelope** for the core layer. Rather than introducing a parallel `ResultIssue` (which duplicates `ValidationIssue`'s shape and forces a runtime mapper), we introduce a base `Issue` type in `shared/issues/` that `ValidationIssue` extends. The validation framework is not yet mainlined, so the rename cost inside it is acceptable in exchange for a single-vocabulary long-term design.

Design alignment with RFC 7807 (Problem Details), JSON:API, and GraphQL error conventions is preserved.

## 2. Goals

- **G1** — Establish one canonical `Result<T>` used by both query handlers and command handlers.
- **G2** — Establish one canonical `Issue` type as the single issue vocabulary across the core layer. `ValidationIssue extends Issue`; there is no separate transport type.
- **G3** — Enforce a clear "throw vs. return Result" principle so handlers are unambiguous.
- **G4** — Eliminate placeholder types and inconsistent per-cardinality behaviour in query services.
- **G5** — Preserve structural typing between core `Result<T>` / `Issue` and API `ApiResult<T>` / `ApiIssueItem` so the API mapper stays trivial.
- **G6** — Steer operational issue creation through factory functions (`Issue.notFound`, `Issue.dbError`, `Issue.parseError`, etc.) rather than ad-hoc object literals, maximising reuse and consistency.

## 3. Non-goals

- **NG1** — Not adopting a 3rd-party Result library (neverthrow, fp-ts, effect-ts). Hand-rolled, ~100 LOC extension of current Result.
- **NG2** — Not introducing monadic combinators (`.map`, `.andThen`, `.match`) unless a chaining use case emerges during design.
- **NG3** — Not changing the CQRS split (CommandBus / QueryBus remain distinct); only the outcome envelope is unified.
- **NG4** — Not changing `AllExceptionsFilter` behaviour or the `ErrorResponse` shape it produces for exception paths.
- **NG5** — Not preserving backwards compatibility with the existing `Result<T>` / `OperationResult<T>` / `ApiErrorItem` / `ApiWarningItem` shapes, nor with PR #85's separate `ResultIssue`. Full authority to refactor was given by the user.
- **NG6** — Not preserving `ValidationIssue`'s current field names (`description`, `effectiveSeverity`) — the refactor renames these to align with the base `Issue`.

## 4. Functional Requirements

### FR-1: Totality principle — throw vs. Result

The choice between throwing a `DomainException` and returning a `Result<T>` is governed by whether the response body would carry actionable structured information for the client.

- **FR-1.1** — When the handler can produce **no usable body** beyond a status code, error code, and message → throw a `DomainException`; `AllExceptionsFilter` maps to the HTTP status. Examples: single-item entity not found, session not open / wrong mode, auth failure, DB unreachable, entity-being-modified not found on a write.

- **FR-1.2** — When the handler produces **some usable data**, or produces **structured issues** the client acts on (validation issues with severity/category/impactedEntity/fixOptions) → return `Result<T>`. Examples: multi-item queries where some items are missing; write-path validation with per-item BLOCKING/NON_BLOCKING/DATA_LOSS issues; preview APIs; reconcile-changes output; batch import outcomes.

- **FR-1.3** — Cardinality (single vs. many) is **not** the deciding factor. `findOne` throws for NOT_FOUND (total failure with nothing structured to say). `findMany` returns `Result.partial(data, issues)` when items are missing. `SetCalibrationData` on a single item can still return `Result` if the response body carries validation issues.

- **FR-1.4** — The behavioural inconsistency in the current codebase — `SpfModuleQueryService.findOne` returning `Result.fail(ENTITY_NOT_FOUND)` — must be resolved in favour of throwing.

### FR-2: Unified Result<T> for queries and commands

- **FR-2.1** — One `Result<T>` class serves both query handlers (read path) and command handlers (write path).
- **FR-2.2** — `T` absorbs shape differences (read model, staged-change refs, groupId, void).
- **FR-2.3** — The API-layer DTO `ApiResult<T>` mirrors `Result<T>` structurally (same field names, same optionality). Mapping between core and API is a trivial pass-through (no field renames, no shape transforms), enabled by the shared `ResultIssue`/`ApiIssueItem` structural pair.

### FR-3: Result<T> state model

`Result<T>` must express these outcome states as a **tagged discriminated union**:

- **FR-3.1 `Result.ok(data, issues?)`** — kind `'ok'`. Data produced, no ERROR/FATAL-severity issues. Optional WARNING-severity issues permitted.
- **FR-3.2 `Result.partial(data, issues)`** — kind `'partial'`. Data produced but at least one item was rejected or produced an ERROR/FATAL-severity issue. `issues` must be non-empty (factory throws otherwise).
- **FR-3.3 `Result.fail(issues)`** — kind `'fail'`. No data produced, but the outcome is expressible as structured issues (e.g. validation failed with fixOptions the client can act on). `issues` must be non-empty (factory throws otherwise). If there is no structured client value in the body, throw instead (FR-1.1).

State is detected by inspecting the `kind` discriminator:

```typescript
if (result.kind === 'fail') { ... }              // failure branch
if (result.kind === 'partial') { ... }           // partial branch
if (result.kind === 'ok' && !result.issues) {}   // complete-success branch
```

Predicate helper functions (`isSuccess()`, `isFailure()`, `isPartial()`, `isComplete()`) are **deliberately not shipped** — the `kind` field is self-documenting and exhaustive; predicate helpers would introduce style drift with zero real value. Add later only if a repeating pattern justifies it.

Precise state-detection semantics (explicit `kind` field, not derived from issue severity) resolved during design.

### FR-4: Base Issue vocabulary + ValidationIssue extension

A single base `Issue` type lives in a new `shared/issues/` module and is the sole issue vocabulary for `Result<T>` and downstream API DTOs.

- **FR-4.1 — Base `Issue`** shape:
  ```typescript
  interface Issue {
    code: string;
    message: string;
    severity: IssueSeverity;              // FATAL | ERROR | WARNING
    category?: IssueCategory;             // BLOCKING | NON_BLOCKING | DATA_LOSS
    impactedEntity?: ImpactedEntity;      // { entityType, systemId, displayName? }
    impactedUsecases?: number[];
    fixOptions?: FixOption[];
  }
  ```
- **FR-4.2 — `ValidationIssue extends Issue`.** Adds only rule-specific fields:
  ```typescript
  interface ValidationIssue extends Issue {
    name: string;                    // Rule name — only meaningful for rule outputs
    defaultSeverity: IssueSeverity;  // Internal — never serialized to the wire
  }
  ```
- **FR-4.3 — Structural flow, no runtime mapper.** `ValidationIssue[]` flows into `Result<T>.issues: Issue[]` via TypeScript structural subtyping. Zero translation in core.
- **FR-4.4 — Field renames in `ValidationIssue`:** `description → message`, `effectiveSeverity → severity`. The internal-only `defaultSeverity` stays on `ValidationIssue`. `applyPreferences` sets `severity` (previously `effectiveSeverity`).
- **FR-4.5 — Enums live in `shared/issues/`:** `IssueSeverity`, `IssueCategory`, `deriveCategoryFromSeverity`, `SEVERITY_ORDER` move here. `VALIDATION_ENTITY_TYPE` is renamed `ISSUE_ENTITY_TYPE` and moves here. `FixOption`, `ClientInputSpec`, `CLIENT_INPUT_TYPE` move here. `ValidationEntityType` becomes `IssueEntityType`.
- **FR-4.6 — Operational issue factories.** A small module of factory functions on `Issue` covers common operational cases:
  ```typescript
  Issue.notFound(entityType, systemId, displayName?)
  Issue.dbError(message, impactedEntity?)
  Issue.parseError(code, message)
  ```
  Discourages ad-hoc `{code: '...', message: '...', severity: '...'}` literals. Extended as new operational categories emerge.
- **FR-4.7 — `code` is a documented open-set string.** Validation rules use `ARC-{ENTITY}-{SEQ}` format. Operational codes use descriptive constants (`ENTITY_NOT_FOUND`, `DB_QUERY_FAILED`, `PARSE_ERROR`, `PARAM_PAYLOAD_NOT_FOUND`). Not an enum.
- **FR-4.8 — API mapper projects `Issue` fields only.** `toApiIssueItem(issue: Issue): ApiIssueItem` — extra fields on `ValidationIssue` (`name`, `defaultSeverity`) are naturally not projected. `ApiIssueItem` mirrors `Issue` structurally.
- **FR-4.9 — Severity, category, and entity-type are named API-layer enums** (Swagger `$ref`-friendly). Core has type-level equivalents in `shared/issues/`. Structural equivalence between core and API enums is enforced by re-declaration + shared string values (per PR #85's approach — cannot import `@arc/core` enums into API DTOs).

### FR-5: Immutability

`Result<T>` instances are immutable. All fields are readonly. No mutating methods. Factory methods (`ok`, `partial`, `fail`) are the only construction path.

### FR-6: HTTP boundary behaviour

- **FR-6.1** — Complete success (`ok` with no issues) → HTTP 200.
- **FR-6.2** — Success with warnings (`ok` with WARNING-severity issues only) → HTTP 200; `issues[]` populated on the ApiResult body.
- **FR-6.3** — Partial success (`partial`) → HTTP 207 Multi-Status via `PartialSuccessInterceptor` (updated to check `issues[]` filtered by severity ≥ ERROR).
- **FR-6.4** — Structured failure (`fail`) → HTTP 4xx (e.g. 422 for validation) with the ApiResult body carrying `issues[]`. Exact status per code is a design decision.
- **FR-6.5** — Unstructured failure (thrown exception) → whatever status `AllExceptionsFilter` maps to for that domain exception class. Body is `ErrorResponse`, not `ApiResult`.

## 5. Migration Requirements

- **M-1** — Big-bang: single plan/PR that replaces both current Result types, introduces the new `shared/issues/` vocabulary, and updates all callers.
- **M-2** — Land after PR #85 merges. This plan **subsumes** PR #85's `ResultIssue`/`ApiIssueItem` — the separate `ResultIssue` transport type is not adopted; `Issue` takes its place. PR #85's `ApiIssueItem`, `ApiFixOptionDto`, `ApiImpactedEntityDto`, `api-issue-item.mapper.ts`, enum files, and `PartialSuccessInterceptor` changes are retained but adjusted to project the base `Issue` shape.
- **M-3** — Files in scope (approximate):
  - **New:** `packages/core/src/shared/issues/` — `issue.ts`, `severity.ts`, `impacted-entity.ts`, `fix-option.ts`, `factories.ts`, `index.ts`.
  - **Extended:** `packages/core/src/application/shared/Result/operation-result.ts` — accepts `Issue[]` in place of the old `Error`/`Warning` arrays.
  - **Deleted:** `packages/core/src/shared/types/operation-result.ts`; `packages/core/src/shared/types/api-result.ts` (PR #85 core-side, folded into `shared/issues/`).
  - **Refactored (validation framework, ~10 files):** `packages/core/src/domain/validation/issue.ts` (drastically shrunk — retains only `ValidationIssue extends Issue { name; defaultSeverity }`), `validation-context.ts`, `validation-report.ts`, `validation-preferences.ts`, `preference-enforcer.ts`, `validation-engine.ts`, `validation-orchestrator.ts`, `validation-context-builder.ts`, `missing-definition.rule.ts` (+ any other rules), all imports of `IssueSeverity`/`IssueCategory`/`VALIDATION_ENTITY_TYPE`/`ImpactedEntity`/`FixOption`.
  - **Query services (7 ports):** `spf-module`, `container`, `node`, `key-value`, `spf-module-definition`, `spf-tuning-config`, `ckv` — import Result from same location; issue-type import changes to `Issue`.
  - **Query handlers (2):** `query-spf-modules.handler.ts`, `query-containers.handler.ts` — same import updates.
  - **ProjectRepository:** drop `OperationResult<T>` usage in favour of `Result<T>`.
  - **API layer:**
    - `packages/api/src/presentation/rest/common/dto/api-response/` — `ApiResult<T>`, `ApiIssueItem`, `ApiFixOptionDto`, `ApiImpactedEntityDto`, `api-issue-item.mapper.ts` all mirror the base `Issue` shape.
    - `PartialSuccessInterceptor` — swap `errors[]` filter for `issues[]` severity ≥ ERROR filter.
    - `enums/` folder (from PR #85) — `IssueSeverity`, `IssueCategory`, `IssueEntityType`, `ClientInputType` — kept; enum names/values re-checked for parity with core.
- **M-4** — No backwards-compatibility shims. Old types deleted; imports updated.
- **M-5** — `SpfModuleQueryService.findOne` behaviour normalised — it currently returns `Result.fail(ENTITY_NOT_FOUND)` and must be changed to throw `ResourceNotFoundException` per FR-1.4.
- **M-6** — Estimated file touch: ~25 files (up from initial ~15 estimate because of validation framework rename scope).

## 6. Non-functional Requirements

- **NFR-1** — Result stays in `@arc/core`; no NestJS, TypeORM, or Node.js imports (per CLAUDE.md hexagonal rule).
- **NFR-2** — Only new dependencies allowed inside Result: `zod` if needed for validation, `uuid` if needed for ids. No 3rd-party Result libraries.
- **NFR-3** — Result implementation LOC target: ≤ 150 lines including doc comments.
- **NFR-4** — Structural typing between core `Result`/`ResultIssue` and API `ApiResult`/`ApiIssueItem` must not require runtime translation; mapper is a `toApi*` shape-preserving function.

## 7. Invariants

- **I-1** — A `Result` instance is exactly one of `ok`, `partial`, `fail`. Never overlapping, never null-state.
- **I-2** — `Result.partial` always has non-empty `issues[]` with at least one severity ≥ ERROR.
- **I-3** — `Result.fail` always has non-empty `issues[]`.
- **I-4** — `Result.ok` should carry only WARNING-severity issues. This is a **docs-only convention**, not runtime-enforced — enforcing on every construction would cost a full severity scan on the hot path; call-site discipline + code review is preferred.
- **I-5** — `data` access on `Result.fail` is prevented at compile time by TypeScript narrowing of the discriminated union. No runtime `.unwrap()` is required.
- **I-6** — Once constructed, `Result` state is immutable.

## 8. Out of Scope

- The exact HTTP status per issue `code` (design decision).
- Fix-command dispatcher wiring (`POST /apply-fix`) — that's the modification framework's concern.
- Chainable combinators (`.map`, `.andThen`) — deferred unless a real use case emerges in the design.
- Result observability / logging conventions — orthogonal.
- Replacing the current `AllExceptionsFilter` — it stays as-is.

## 9. Open Questions — resolved in design

All Q-A through Q-G resolved. See design document §3, §5, §6.

- **Q-A** — Explicit `kind` field (not derived from severity). [design §3.1]
- **Q-B** — Prefix-matched `codeToHttpStatus` in `packages/api/.../result/http-status-map.ts`. [design §5.2]
- **Q-C** — Manual `throwIfFailed()` helper (grep-able, explicit) rather than a hidden interceptor. [design §5.1]
- **Q-D** — TypeScript narrowing prevents `.data` on `'fail'` variant at compile time. No runtime throw needed. [design §3]
- **Q-E** — No custom Jest matchers for v1; native `expect(result.kind)` / `expect(result.data)` cover every case. [design §9]
- **Q-F** — v1 factory set: `IssueFactory.notFound`, `dbError`, `parseError`, `dataLoss`. [design §2.6]
- **Q-G** — `IssueCollector` retained as thin `Issue[]` accumulator; `formatForApi()` removed. [design §4.6]

## 10. Approval Gate

Requirements freeze pending user approval. Once approved, design phase begins.
