<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Handler Design Guidelines

**Status:** Established  
**Applies to:** All CQRS command handlers in `@arc/core` and their wiring in `@arc/api`

---

## 1. Handler return type

Command handlers return the **success payload directly** — never `Result<T>`.

```typescript
// ✅ Correct
async handle(command: PatchSpfModuleCommand): Promise<{groupId: string}>

// ❌ Wrong — Result<T> wrapping is not needed for HTTP command handlers
async handle(command: PatchSpfModuleCommand): Promise<Result<{groupId: string}>>
```

`Result<T>` is reserved for:
- **Query handlers** that may return partial results (`Result.partial` → HTTP 207)
- **Internal service composition** where a caller needs to propagate failure up a chain

Write command handlers are leaf nodes — they either succeed or throw. No propagation.

---

## 2. Failure strategy — throw, never return `Result.fail`

Handlers throw exceptions for **all failures**. The `toApiResult()` helper enforces this: it throws a 500 if it ever receives a `Result.fail` — it is a programming error to return one.

### Exception → HTTP status mapping

| Exception | HTTP | When to use |
|---|---|---|
| `ResourceNotFoundException` | 404 | Entity doesn't exist in the DB (module, container, definition) |
| `InvalidOperationException` | 400 | Malformed request — missing required fields, invalid combination |
| `DomainRuleViolationException(issues[])` | 422 | Domain business rule blocked the operation — carries structured `Issue[]` so the client knows exactly what failed and can act on it |

All three are in `@arc/core` — no NestJS imports in handlers.

### When to use `DomainRuleViolationException` vs `ResourceNotFoundException`

Use `DomainRuleViolationException` when:
- The client needs **structured issue data** to know what failed (issue code, impacted entity, link IDs, etc.)
- There can be **multiple issues in one response** (e.g., one `ARC-MOD-PORT-COUNT-DECREASE-BLOCKED` per blocked port)
- The failure is an **expected domain outcome**, not an error (e.g., "port has an active link")

Use `ResourceNotFoundException` when:
- A single lookup failed — "entity X not found" — no further structured data needed

---

## 3. The AllExceptionsFilter mapping

```
ResourceNotFoundException    → 404  (no issues field)
InvalidOperationException    → 400  (no issues field)
DomainNotImplementedException → 501 (no issues field)
DomainRuleViolationException → 422  (issues[] surfaced in response body)
HttpException                → pass-through status (issues[] if present in payload)
Any other Error              → 500
```

`DomainRuleViolationException` is handled **before** the generic `DomainException` branch in the filter so its `issues[]` are always surfaced at the top level of the error response.

---

## 4. Controller pattern

The controller is a **pure HTTP adapter** — translate HTTP → command, execute, map response. No business logic, no validation.

```typescript
@Patch('/:spfModuleSystemId')
@UseGuards(SessionGuard)
async patchSpfModule(
  @Param('projectId') projectId: string,
  @Param('spfModuleSystemId') spfModuleSystemId: string,
  @Body() dto: PatchSpfModuleRequestDto,          // named 'dto', not 'request'
  @ArcSession() session: ActiveSession,            // not @Req() req: ArcRequest
): Promise<ApiResult<SpfModuleDto>> {

  // 1. Build command — parse route params to numbers here
  const cmd = new PatchSpfModuleCommand(
    'api-client',
    Number.parseInt(spfModuleSystemId, 10),
    session.fileSystemId,
    dto.alias,
    dto.containerId,
    // ...
  );

  // 2. Execute — handler throws on any failure, no result check needed
  await this.commandBus.execute<{groupId: string}>(cmd, session);

  // 3. Follow-up read (write endpoints always return the updated resource)
  const readResult = await this.queryBus.execute<Result<SpfModuleDetailedReadModel>>(
    new SpfModuleQuery([Number.parseInt(spfModuleSystemId, 10)], Number.parseInt(projectId, 10), false, false, 'api-client'),
  );
  return toApiResult(readResult, ({modules}) => this.mapToSpfModuleDto(modules[0]));
}
```

### Rules

- Parameter name: `@Body() dto` — never `@Body() request` (conflicts with `@Req()`)
- Session: `@ArcSession() session: ActiveSession` — never `@Req() req: ArcRequest`
- **No `BadRequestException` in controller** — empty-body / missing-field validation belongs in the handler as `throw new InvalidOperationException(...)`
- **No `result.kind` check in controller** — if the handler returns, it succeeded
- Swagger: do not list `207 MULTI_STATUS` for write endpoints — partial success does not apply when the transaction is all-or-nothing

---

## 5. Where validation lives

| Validation type | Lives in | Exception |
|---|---|---|
| HTTP contract (missing required field, invalid type coercion) | Controller — NestJS `class-validator` on DTO, or explicit `throw` before command | `BadRequestException` (400) |
| Business logic ("at least one field must be provided") | **Handler** | `InvalidOperationException` (400) |
| Existence checks ("module not found") | **Handler** | `ResourceNotFoundException` (404) |
| Domain rules ("container type incompatible", "port blocked by link") | **Handler** | `DomainRuleViolationException(issues[])` (422) |

The controller validates **HTTP shape** (is the body parseable? are required path params present?). The handler validates **domain intent** (does this operation make sense for this entity?).

---

## 6. Partial success — when to use `Result.partial`

Use `Result.partial(data, issues)` when:
- The operation produced **some data** AND there are **non-fatal issues** alongside it
- Example: bulk query — "10 modules requested, 8 found, 2 not found"

The `PartialSuccessInterceptor` detects `issues[]` with `ERROR` or `FATAL` severity in the response and upgrades HTTP 200 → 207.

Write endpoints in this codebase use all-or-nothing transactions. Do not return `Result.partial` from write handlers — rollback and throw instead.

---

## 7. `@ArcSession()` decorator

Located at `packages/api/src/guards/arc-session.decorator.ts`.

Use it on any controller method decorated with `@UseGuards(SessionGuard)`. The guard guarantees `arcSession` is populated before the method runs, so the decorator returns `ActiveSession` (non-nullable).

```typescript
// ✅
@UseGuards(SessionGuard)
async myMethod(@ArcSession() session: ActiveSession)

// ❌ — verbose and leaks HTTP internals into method signature
async myMethod(@Req() req: ArcRequest) { const session = req.arcSession!; ... }
```

---

## 8. Quick reference: implementing a new write endpoint

1. **Command** in `@arc/core/application/<feature>/<operation>/`:
   - Extend `BaseCommand`
   - Declare `static override readonly requiresSession = true`
   - Declare `static override readonly allowedModes` (e.g., `[SESSION_MODE.Designer, SESSION_MODE.DiffMerge]`)
   - Fields mirror the HTTP contract (same names as the DTO, right types)

2. **Handler** in the same folder:
   - Constructor: `(private uow: UnitOfWork, private idGeneration: IdGenerationPort)`
   - Return type: `Promise<{groupId: string}>` (or the relevant success payload)
   - Validate business logic first → throw `InvalidOperationException` if invalid
   - Start transaction, do work, commit — catch block calls `rollback()` and re-throws
   - Use `throw ResourceNotFoundException` for 404, `throw DomainRuleViolationException([...])` for 422

3. **Registry** in `CommandHandlerRegistry.registerAllCommandHandlers()`:
   ```typescript
   this.commandHandlerFactories.set(MyCommand, {
     create: deps => new MyHandler(deps.uow, deps.idGeneration),
   });
   ```

4. **Controller method**:
   - `@UseGuards(SessionGuard)`
   - `@Body() dto`, `@ArcSession() session`
   - Build command, execute (no result check), follow-up read, `toApiResult`
   - Swagger: list 400, 403, 404, 422 only — no 207 for atomic write operations

5. **`AllExceptionsFilter`**: if the handler needs a new exception type, add it to `DOMAIN_STATUS_MAP`. If it carries `issues[]`, handle it before the generic `DomainException` branch.
