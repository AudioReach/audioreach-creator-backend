<!--
Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
SPDX-License-Identifier: BSD-3-Clause
-->

# Error Handling: Consolidated Requirements & Low-Level Design

**Date:** 2026-06-30 (updated 2026-07-01)
**Status:** Implemented

---

## 1. Context

### 1.1 Problem Statement

The AudioReach Creator Backend needs a unified, consistent error handling strategy across all API endpoints. Prior to this design, the codebase used mixed error handling patterns (Result/Either types, manual status code mapping, try-catch in controllers) leading to inconsistent error responses, duplicated error logic, and difficulty in maintaining/debugging the API.

### 1.2 What This Builds On

- Hexagonal (Ports & Adapters) + CQRS + DDD architecture
- NestJS framework with Express underneath
- NestJS `AllExceptionsFilter` at `packages/api/src/infrastructure-wrapper/filters/all-exceptions.filter.ts`
- Domain exception hierarchy in `packages/core/src/shared/exceptions/`
- NestJS built-in exceptions from `@nestjs/common` for API-layer concerns
- ESLint enforcement rules at `eslint-rules/`

### 1.3 Key Decisions Already Made

- **Two-tier exception approach**: Domain exceptions (`DomainException` from `@arc/core`) for business logic errors + NestJS built-in exceptions (`@nestjs/common`) for API-layer concerns
- **HTTP status codes reflect reality** — `200 OK` means success; broken resources return 5xx
- **Coarse-grained error codes** — `errorCode` is category-level; `message` differentiates scenarios
- **Do NOT create a new exception class per failure reason** — only per distinct HTTP status code or programmatic branching need
- **Bulk GET partial success** uses `207 Multi-Status` with `data[] + errors[]` envelope when partial failures occur; `200 OK` when all items succeed
- **ESLint rules configured as errors** — fail the build on violation
- **No custom HTTP exception hierarchy** — use NestJS built-ins directly; framework-agnostic domain exceptions live in `@arc/core`

---

## 2. Definitions

| Term | Definition |
|------|------------|
| DomainException | Abstract base class in `@arc/core` for framework-agnostic domain errors. Carries `errorCode`, `message`, `details`. Mapped to HTTP status codes by `AllExceptionsFilter`. |
| NestJS HttpException | NestJS's built-in exception class from `@nestjs/common`. Used directly by controllers for API-level concerns (input validation, stub endpoints). |
| AllExceptionsFilter | NestJS `@Catch()` exception filter that catches all exceptions and maps them to structured HTTP error responses. Registered globally. |
| ErrorResponse | Standardized JSON format returned for all API errors |
| BulkResponse | Response envelope with `data[]` + `errors[]` for partial-success bulk operations |
| Fail Fast | Design principle: detect and throw errors immediately, don't catch and swallow |

---

## 3. Functional Requirements

### 3.1 Exception Hierarchy

#### FR-EH-01: Domain Exception Base Class
The core package (`@arc/core`) SHALL provide an abstract `DomainException` base class with properties: `message` (string), `errorCode` (string), `details` (unknown, optional). Domain exceptions are framework-agnostic and do NOT depend on NestJS.

#### FR-EH-02: Domain Exception Classes
The core package SHALL provide the following typed domain exception classes, each extending `DomainException`:

| Exception Class | Error Code | Maps to HTTP Status |
|----------------|------------|---------------------|
| `ResourceNotFoundException` | `RESOURCE_NOT_FOUND` | 404 |
| `InvalidOperationException` | `INVALID_OPERATION` | 400 |
| `DomainNotImplementedException` | `NOT_IMPLEMENTED` | 501 |

#### FR-EH-03: NestJS Built-in Exceptions for Controllers
Controllers SHALL use NestJS built-in exceptions from `@nestjs/common` for API-layer concerns:

| Exception Class | Status Code | Use Case |
|----------------|-------------|----------|
| `BadRequestException` | 400 | Input parsing/validation failures |
| `UnauthorizedException` | 401 | Authentication failures |
| `ForbiddenException` | 403 | Authorization failures |
| `NotFoundException` | 404 | Direct 404 from controller (rare) |
| `ConflictException` | 409 | Direct conflict from controller (rare) |
| `NotImplementedException` | 501 | Stub/unimplemented endpoints |
| `UnprocessableEntityException` | 422 | Result failures in controllers |
| `InternalServerErrorException` | 500 | Unexpected failures |

#### FR-EH-04: New Exception Class Criteria
A new exception class SHALL only be created when a **different HTTP status code** is needed OR a distinct `errorCode` that clients will programmatically branch on is required. Variations of the same error category use the existing class with a descriptive `message`.

### 3.2 Error Response Format

#### FR-EH-06: Consistent Error Response Structure
ALL error responses SHALL follow this JSON structure:
```json
{
  "statusCode": <number>,
  "errorCode": "<string>",
  "message": "<string>",
  "timestamp": "<ISO 8601>",
  "path": "<request path>",
  "details": <optional>,
  "stack": "<optional, non-production only>"
}
```

#### FR-EH-07: Stack Trace Visibility
Stack traces SHALL be included in error responses ONLY when `NODE_ENV !== 'production'`. In production, stack traces MUST be omitted.

### 3.3 AllExceptionsFilter (Global Exception Handler)

#### FR-EH-09: NestJS Exception Filter
The `AllExceptionsFilter` SHALL be registered globally via NestJS's `APP_FILTER` provider and SHALL catch ALL uncaught exceptions from any layer.

#### FR-EH-10: Three-Category Exception Mapping
The filter SHALL handle three categories of exceptions:
1. **DomainException** (from `@arc/core`) — mapped to HTTP status via `DOMAIN_STATUS_MAP`
2. **NestJS HttpException** (from `@nestjs/common`) — uses `getStatus()` directly
3. **Unknown errors** — mapped to 500 Internal Server Error

#### FR-EH-11: Differentiated Logging
Client errors (4xx) SHALL be logged at WARNING level. Server errors (5xx) SHALL be logged at ERROR level. Log context SHALL include: `error.message`, `error.stack`, `req.path`, `req.method`, `statusCode`, `timestamp`.

#### FR-EH-12: No Sensitive Information in Logs
The handler SHALL NOT log passwords, tokens, PII, or other sensitive request data.

### 3.4 Layer Responsibilities

#### FR-EH-13: Controllers — No Try-Catch
Controllers SHALL NOT contain try-catch blocks. All exceptions MUST bubble up to the `AllExceptionsFilter`. Controllers only throw exceptions for request validation failures and return success responses (200, 201, 204).

#### FR-EH-14: Controllers — No Manual Status Code Mapping
Controllers SHALL NOT contain error status code logic (e.g., `res.status(404).json(...)`). Only success status codes (200, 201, 204) are permitted in controller response calls.

#### FR-EH-15: Controllers — NestJS Exceptions Only
Controllers SHALL only throw exceptions from `@nestjs/common`. Generic `new Error(...)` throws are forbidden in controller files.

#### FR-EH-16: Application Layer — Throw Domain Exceptions
Use cases and command/query handlers SHALL throw `DomainException` subclasses from `@arc/core` on error conditions (e.g., `ResourceNotFoundException`, `InvalidOperationException`). The `AllExceptionsFilter` handles the HTTP mapping automatically.

#### FR-EH-17: Application Layer — Transaction Rollback Re-throw
When a use case catches exceptions for transaction rollback purposes (`await this.uow.rollback()`), it MUST re-throw the original exception after rollback. Swallowing exceptions after rollback is forbidden.

#### FR-EH-18: Domain Layer — DomainException Subclasses
Domain entities and services SHALL throw `DomainException` subclasses from `@arc/core` for business rule violations. These bubble up through the application layer to the `AllExceptionsFilter` which maps them to HTTP status codes.

#### FR-EH-19: Domain Layer — No Infrastructure Dependencies
Domain entities SHALL NOT import from infrastructure, API, or framework packages. Domain exceptions are pure TypeScript classes in `@arc/core`.

#### FR-EH-20: Infrastructure Layer — Technical Exception Wrapping
Repositories SHALL catch infrastructure-specific errors (database failures, connection issues) and throw an appropriate `DomainException` subclass or let the error bubble as-is (caught by the filter as a 500).

### 3.5 Bulk GET — Partial Success Pattern

#### FR-EH-21: Bulk Response Envelope
Bulk GET endpoints that can partially succeed SHALL return:
- HTTP `200 OK` when ALL items succeed (`errors[]` is empty)
- HTTP `207 Multi-Status` when `errors[]` is non-empty (regardless of whether `data[]` is empty or populated)

This means:
- Some items found, some failed → `207` with `data: [...found]`, `errors: [...failed]`
- ALL items failed → `207` with `data: []`, `errors: [...all failed]`
- All items succeeded → `200` with `data: [...all]`, `errors: []`

Response body (same shape for both 200 and 207):
```json
{
  "data": [...],
  "errors": [
    { "id": "<item-id>", "code": "<error-code>", "message": "<description>" }
  ]
}
```
The `PartialSuccessInterceptor` automatically determines the correct status code based on the response content. Failures SHALL NOT cause the entire bulk request to return 500.

#### FR-EH-22: Never Silently Drop Failures
When processing bulk items, any item that fails to load/parse MUST be surfaced in the `errors[]` array. Silent failure is forbidden.

#### FR-EH-23: Bulk Collect-and-Continue
The query handler / service layer for bulk operations SHALL collect per-item results (success or failure) instead of failing fast on the first error. The controller assembles the `{ data, errors }` envelope.

### 3.6 Single GET — Mandatory Field Missing

#### FR-EH-24: Mandatory Field Failure → 500
When constructing a DTO for a single-resource GET and a mandatory field cannot be retrieved (DB failure, parse error, data corruption), the system SHALL throw `InternalServerErrorException` with a descriptive message identifying the specific field and resource.

#### FR-EH-25: Coarse-Grained Error Codes
The `errorCode` field SHALL remain coarse-grained (e.g., `INTERNAL_SERVER_ERROR` for all 500s). The `message` field carries specifics. The optional `details` field provides structured context for programmatic inspection if needed.

### 3.7 Domain Exception Mapping

#### FR-EH-26: Automatic Domain-to-HTTP Mapping
Domain exceptions (`DomainException` subclasses from `@arc/core`) are automatically mapped to HTTP status codes by the `AllExceptionsFilter` via a `DOMAIN_STATUS_MAP`. The application layer does NOT need to manually catch and re-throw domain exceptions as HTTP exceptions — they bubble up naturally.

---

## 4. Invariants

**I1 — Consistent Error Format:** Every HTTP error response from the API, regardless of origin (controller validation, application logic, domain rule, infrastructure failure, unexpected error), MUST conform to the `ErrorResponse` structure defined in FR-EH-06.

**I2 — Status Code Truthfulness:** The HTTP status code MUST accurately reflect the outcome. A response with `200 OK` MUST mean the operation fully succeeded. For bulk operations with partial failures, `207 Multi-Status` MUST be used. A broken resource MUST NOT return 200.

**I3 — Exception Bubbling:** No layer between the point of failure and the `AllExceptionsFilter` SHALL silently catch and discard an exception, except for the specific case of transaction rollback (which MUST re-throw).

**I4 — Layer Isolation:** Domain layer has zero dependencies on infrastructure/API/framework. Controllers have zero business logic. Repositories have zero business validation.

**I5 — Single Source of Truth for Error Mapping:** The `AllExceptionsFilter` is the ONLY place where exception types are mapped to HTTP status codes. No controller or middleware duplicates this mapping.

---

## 5. Non-Functional Requirements

**NFR-EH-01: Build-Time Enforcement**
All error handling patterns SHALL be enforced via ESLint rules configured as errors (not warnings). CI/CD SHALL fail the build on any violation.

**NFR-EH-02: Zero-Downtime Migration**
The migration from old patterns to exception-based patterns SHALL be achievable incrementally without requiring a big-bang deployment. ESLint rules can be temporarily downgraded to warnings during transition.

**NFR-EH-03: Performance**
The `AllExceptionsFilter` SHALL add negligible latency (<1ms) to error responses. Exception creation cost is acceptable for error paths (not hot paths).

**NFR-EH-04: Testability**
All exception classes SHALL be unit-testable in isolation. Integration tests SHALL verify the filter maps exceptions to correct HTTP responses. The `toThrow` Jest matcher is the standard assertion pattern.

**NFR-EH-05: IDE Support**
The typed exception hierarchy SHALL provide full TypeScript type safety and IDE autocompletion for exception properties.

---

## 6. Out of Scope

- **Custom error codes per failure scenario** — Rejected; `errorCode` stays coarse-grained
- **Result/Either types** — Explicitly rejected in favor of exceptions
- ~~**207 Multi-Status** — Not adopted due to poor Swagger/OpenAPI tooling support~~ — **Adopted**: 207 is the semantically correct HTTP status for partial success (RFC 4918)
- **Retry logic in exception handler** — Infrastructure retry is a repository/adapter concern, not the handler's
- **Client-facing error documentation/registry** — May be added later as an OpenAPI extension
- **Rate limiting / abuse control errors (429)** — Separate concern, not part of this design
- **WebSocket error handling** — REST-only scope

---

## 7. Open Questions

**OQ-1:** Should the `BulkResponseDto` include metadata like `totalRequested`, `successCount`, `failureCount` alongside `data[]` and `errors[]`? (Useful for clients that need to know completeness without counting arrays.)

**OQ-2:** ~~When domain exceptions are caught and re-thrown as HTTP exceptions at the application layer, should the original stack trace be preserved (e.g., via `cause` property) for debugging?~~ **Resolved:** Domain exceptions now bubble directly to `AllExceptionsFilter` — no catch/rethrow needed. Stack traces are preserved naturally.

**OQ-3:** Should there be a `ServiceUnavailableException` (503) for transient infrastructure failures (e.g., database connection pool exhausted) to distinguish from permanent 500s?

---

## 8. Design (Low-Level Design)

### 8.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         Client Request                       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    NestJS Middleware Chain                    │
│  (Authentication, Validation Pipes, Body Parsing)           │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                         Controller                           │
│  • Validates request params → throws @nestjs/common exc.    │
│  • Calls CommandBus / QueryBus                              │
│  • Returns 200/201/204 on success                           │
│  • NEVER catches exceptions                                 │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
│  (Command/Query Handlers, Use Cases)                        │
│  • Business validation → throws DomainException subclass    │
│  • Transaction: try/commit, catch/rollback/re-throw         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      Domain Layer                            │
│  • Enforces invariants → throws DomainException subclass    │
│  • Pure TypeScript, no framework deps                       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   Infrastructure Layer                       │
│  • DB errors → bubble up or throw DomainException           │
│  • Maps DB entities ↔ Domain entities                       │
└─────────────────────────────────────────────────────────────┘

         ═══════════ ERROR PATH ═══════════
                              ↓
┌─────────────────────────────────────────────────────────────┐
│        AllExceptionsFilter (NestJS @Catch() filter)         │
│  • Catches ALL uncaught exceptions                          │
│  • DomainException → maps via DOMAIN_STATUS_MAP             │
│  • NestJS HttpException → uses getStatus()                  │
│  • Unknown Error → 500                                      │
│  • Logs with appropriate level (warn vs error)              │
│  • Formats ErrorResponse JSON                               │
│  • Strips stack trace in production                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
                    Client receives ErrorResponse
```

### 8.2 Exception Hierarchy

```
Error (built-in)
│
├── DomainException (abstract, @arc/core — framework-agnostic)
│   ├── ResourceNotFoundException   (errorCode: RESOURCE_NOT_FOUND → HTTP 404)
│   ├── InvalidOperationException   (errorCode: INVALID_OPERATION → HTTP 400)
│   └── DomainNotImplementedException (errorCode: NOT_IMPLEMENTED → HTTP 501)
│
├── NestJS HttpException (@nestjs/common — used in controllers)
│   ├── BadRequestException         (400)
│   ├── UnauthorizedException       (401)
│   ├── ForbiddenException          (403)
│   ├── NotFoundException           (404)
│   ├── ConflictException           (409)
│   ├── UnprocessableEntityException (422)
│   ├── NotImplementedException     (501)
│   └── InternalServerErrorException (500)
│
└── Unknown Error → 500
```

**File locations:**
- `packages/core/src/shared/exceptions/domain-exception.ts` — Abstract base class
- `packages/core/src/shared/exceptions/resource-not-found.exception.ts`
- `packages/core/src/shared/exceptions/invalid-operation.exception.ts`
- `packages/core/src/shared/exceptions/not-implemented.exception.ts`
- `packages/core/src/shared/exceptions/index.ts` — Barrel export
- `packages/api/src/infrastructure-wrapper/filters/all-exceptions.filter.ts` — Global exception filter

### 8.3 Error Response Contract

```typescript
interface ErrorResponse {
  statusCode: number;        // HTTP status code (400, 404, 409, 422, 500, etc.)
  errorCode: string;         // Machine-readable category: RESOURCE_NOT_FOUND, INVALID_OPERATION, etc.
  message: string;           // Human-readable description (always present)
  timestamp: string;         // ISO 8601 timestamp of when error occurred
  path: string;              // Request path that triggered the error
  details?: unknown;         // Optional structured context (validation errors, IDs, etc.)
  stack?: string;            // Stack trace (non-production ONLY)
}
```

### 8.4 Bulk Response Contract

```typescript
interface BulkResponse<T> {
  data: T[];                 // Successfully processed items
  errors: BulkItemError[];   // Items that failed to process
}

interface BulkItemError {
  id: string;                // Identifier of the failed item
  code: string;              // Error code (e.g., DB_QUERY_FAILED, PARSE_ERROR)
  message: string;           // Human-readable failure description
}
```

**Usage rule:** Return HTTP `200 OK` when `errors[]` is empty (full success). Return HTTP `207 Multi-Status` when `errors[]` is non-empty (regardless of whether `data[]` is empty or populated). The status code is determined automatically by the `PartialSuccessInterceptor` — controllers simply return the `BulkResponse` envelope.

### 8.5 AllExceptionsFilter Implementation

```typescript
// packages/api/src/infrastructure-wrapper/filters/all-exceptions.filter.ts

import {
  Catch,
  HttpException as NestHttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import type {ExceptionFilter, ArgumentsHost} from '@nestjs/common';
import type {Request, Response} from 'express';
import type {Logger} from '@arc/core';
import {
  DomainException,
  ResourceNotFoundException,
  InvalidOperationException,
  DomainNotImplementedException,
} from '@arc/core';

/**
 * Maps domain exception constructors to HTTP status codes.
 * Add new domain exceptions here as the core layer grows.
 */
const DOMAIN_STATUS_MAP = new Map<Function, number>([
  [ResourceNotFoundException, HttpStatus.NOT_FOUND],
  [InvalidOperationException, HttpStatus.BAD_REQUEST],
  [DomainNotImplementedException, HttpStatus.NOT_IMPLEMENTED],
]);

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(@Inject('LOGGER') private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let errorCode: string | undefined;
    let details: unknown;

    if (exception instanceof DomainException) {
      // Domain exceptions from @arc/core
      status = DOMAIN_STATUS_MAP.get(exception.constructor) ?? HttpStatus.INTERNAL_SERVER_ERROR;
      errorCode = exception.errorCode;
      details = exception.details;
    } else if (exception instanceof NestHttpException) {
      // NestJS built-in HTTP exceptions (from controllers, guards, pipes)
      status = exception.getStatus();
      const exResponse = exception.getResponse();
      if (typeof exResponse === 'object' && exResponse != null) {
        const resp = exResponse as Record<string, unknown>;
        errorCode = (resp.errorCode as string) ?? exception.name;
        details = resp.details;
      } else {
        errorCode = exception.name;
      }
    } else {
      // Unknown/unexpected exceptions
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      errorCode = 'INTERNAL_SERVER_ERROR';
    }

    // Log with appropriate severity
    const logContext = { /* ... */ };
    if (status < 500) {
      this.logger.logWarn(logContext);
    } else {
      this.logger.logError(logContext);
    }

    // Build error response
    const errorResponse: Record<string, unknown> = {
      statusCode: status,
      errorCode: errorCode || 'UNKNOWN_ERROR',
      message: exception instanceof Error ? exception.message : 'Internal server error',
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    if (details !== undefined) {
      errorResponse.details = details;
    }

    if (process.env.NODE_ENV !== 'production' && exception instanceof Error) {
      errorResponse.stack = exception.stack;
    }

    response.status(status).json(errorResponse);
  }
}
```

### 8.6 When to Use What (Developer Guide)

| Scenario | What to throw | Import from | Where |
|----------|--------------|-------------|-------|
| Input parsing failure in controller (bad ID format, missing field) | `BadRequestException` | `@nestjs/common` | Controller |
| Endpoint not yet implemented | `NotImplementedException` | `@nestjs/common` | Controller |
| Result failure from query bus | `UnprocessableEntityException` | `@nestjs/common` | Controller |
| Domain entity not found | `ResourceNotFoundException` | `@arc/core` | Handler/Service |
| Invalid operation or state | `InvalidOperationException` | `@arc/core` | Handler/Service |
| Feature not built yet in domain | `DomainNotImplementedException` | `@arc/core` | Handler/Service |

### 8.7 Controller Pattern (Single Resource)

```typescript
import {
  Controller,
  Get,
  Post,
  BadRequestException,
  Param,
  Body,
} from '@nestjs/common';

export class ProjectController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus
  ) {}

  @Get(':id')
  async getProject(@Param('id') id: string): Promise<ApiResult<ProjectDto>> {
    if (!id) {
      throw new BadRequestException('Project ID is required');
    }

    const project = await this.queryBus.execute(new GetProjectQuery(id));
    return { data: project, success: true, message: 'Project retrieved' };
  }

  @Post()
  async createProject(@Body() body: CreateProjectDto): Promise<ApiResult<ProjectDto>> {
    if (!body.name) {
      throw new BadRequestException('Project name is required');
    }

    const project = await this.commandBus.execute(new CreateProjectCommand(body));
    return { data: project, success: true, message: 'Project created' };
  }
}
```

### 8.8 Controller Pattern (Bulk Response)

```typescript
@UseInterceptors(PartialSuccessInterceptor)
export class UseCaseController {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('components/query')
  async queryUsecaseComponents(
    @Body() usecaseSystemIds: SystemIdsRequestDto,
  ): Promise<ApiResult<ComponentCollectionDto>> {
    if (!usecaseSystemIds?.systemIds?.length) {
      throw new BadRequestException('systemIds array is required and cannot be empty');
    }

    // Query handler returns components; PartialSuccessInterceptor handles 200 vs 207
    const result = await this.queryBus.execute(new GetComponentsQuery(systemIds, clientId));
    return { data: result, success: true, message: 'Components retrieved' };
  }
}
```

### 8.9 Use Case / Handler Pattern

```typescript
import { ResourceNotFoundException, InvalidOperationException } from '@arc/core';

export class GetProjectHandler {
  constructor(private readonly repository: ProjectRepository) {}

  async handle(query: GetProjectQuery): Promise<Project> {
    const project = await this.repository.findById(query.id);

    if (!project) {
      throw new ResourceNotFoundException(`Project '${query.id}' not found`);
    }

    return project;
  }
}
```

### 8.10 Bulk Query Handler Pattern (Collect-and-Continue)

```typescript
export class GetComponentsHandler {
  constructor(private readonly repository: ComponentRepository) {}

  async handle(query: GetComponentsQuery): Promise<BulkResponse<ComponentDto>> {
    const data: ComponentDto[] = [];
    const errors: BulkItemError[] = [];

    for (const componentId of query.componentIds) {
      try {
        const component = await this.repository.findById(componentId);
        if (!component) {
          errors.push({
            id: componentId,
            code: 'NOT_FOUND',
            message: `Component '${componentId}' not found`
          });
          continue;
        }
        data.push(this.toDto(component));
      } catch (error) {
        errors.push({
          id: componentId,
          code: 'DB_QUERY_FAILED',
          message: `Failed to fetch component '${componentId}': ${error.message}`
        });
      }
    }

    return { data, errors };
  }
}
```

### 8.11 ESLint Enforcement Rules

| # | Rule Name | Purpose | Applies To |
|---|-----------|---------|------------|
| 1 | `no-manual-status-codes` | Prevents `res.status(4xx/5xx)` in controllers; allows 200/201/204 only | `packages/api/src/presentation/**/*.ts` |
| 2 | `no-controller-try-catch` | Prevents try-catch in controllers (exceptions must bubble) | `packages/api/src/presentation/**/*.ts` |
| 3 | `enforce-http-exceptions` | Only NestJS exceptions (`@nestjs/common`) may be thrown in controllers; bans generic `Error` and raw `HttpException` | `packages/api/src/presentation/**/*.ts` |
| 4 | `no-domain-infrastructure-deps` | Bans imports from infrastructure/api/framework in domain | `packages/core/src/domain/**/*.ts` |

**All rules are configured as `'error'`** in `eslint.config.js`. CI pipeline fails on violation.

### 8.12 Migration Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Create exception infrastructure (AllExceptionsFilter + DomainException hierarchy) | ✅ Complete |
| 2 | Implement ESLint rules | ✅ Complete |
| 3 | Migrate controllers to NestJS built-ins, delete custom exceptions folder | ✅ Complete |
| 4 | Testing & validation | ✅ Complete |

### 8.13 Testing Approach

**Unit tests (DomainException hierarchy):**
```typescript
// packages/core/tests/unit/shared/exceptions/domain-exception.spec.ts
describe('DomainException hierarchy', () => {
  it('ResourceNotFoundException stores message and errorCode', () => {
    const ex = new ResourceNotFoundException('Project 123 not found');
    expect(ex.message).toBe('Project 123 not found');
    expect(ex.errorCode).toBe('RESOURCE_NOT_FOUND');
    expect(ex).toBeInstanceOf(DomainException);
    expect(ex).toBeInstanceOf(Error);
  });
});
```

**Unit tests (AllExceptionsFilter):**
```typescript
// packages/api/tests/unit/infrastructure-wrapper/filters/all-exceptions.filter.spec.ts
describe('AllExceptionsFilter', () => {
  it('maps ResourceNotFoundException to 404', () => {
    const exception = new ResourceNotFoundException('Project not found');
    filter.catch(exception, mockHost as any);
    expect(mockResponse.status).toHaveBeenCalledWith(404);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        errorCode: 'RESOURCE_NOT_FOUND',
        message: 'Project not found',
      }),
    );
  });
});
```

**Unit tests (per handler):**
```typescript
describe('GetProjectHandler', () => {
  it('should throw ResourceNotFoundException when project not found', async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(handler.handle(new GetProjectQuery('123')))
      .rejects.toThrow(ResourceNotFoundException);
  });
});
```

### 8.14 Code Review Checklist

**Controllers:**
- [ ] No try-catch blocks?
- [ ] No manual error status codes (only 200/201/204)?
- [ ] Only `@nestjs/common` exceptions thrown?
- [ ] Uses CommandBus/QueryBus (no direct repository access)?
- [ ] Validates request params before delegating?

**Application Layer:**
- [ ] Throws `DomainException` subclasses from `@arc/core`?
- [ ] No HTTP concerns (status codes, headers)?
- [ ] Transaction rollback always re-throws?
- [ ] Focused single responsibility?

**Domain Layer:**
- [ ] No infrastructure imports?
- [ ] Enforces invariants in constructors/factory methods?
- [ ] Throws `DomainException` subclasses (not NestJS exceptions)?

**Infrastructure Layer:**
- [ ] Maps DB entities to domain entities?
- [ ] No business logic?
- [ ] Handles technical errors appropriately?

---

## 9. Summary of Key Design Principles

| # | Principle | Rationale |
|---|-----------|-----------|
| 1 | HTTP status codes are for infrastructure | Load balancers, monitoring, CDNs read status codes; `207` signals partial success to observability tools |
| 2 | Error bodies are for clients | Application code reads the JSON body for detail |
| 3 | Two-tier exceptions | Domain exceptions (`@arc/core`) for business logic; NestJS exceptions (`@nestjs/common`) for API-level concerns |
| 4 | Fail fast | Detect errors at point of occurrence, throw immediately |
| 5 | Coarse-grained error codes | One `errorCode` per exception type; `message` differentiates |
| 6 | Never silently drop failures | Bulk ops surface all failures in `errors[]` |
| 7 | Single responsibility per layer | Controllers: HTTP; App: orchestration; Domain: rules; Infra: tech |
| 8 | Enforce at build time | ESLint rules prevent regression without code review overhead |
| 9 | Framework-agnostic domain | `DomainException` has zero NestJS dependencies; testable without HTTP |

---

## 10. References

- [NestJS Exception Filters](https://docs.nestjs.com/exception-filters)
- [RFC 7231 — HTTP Semantics](https://tools.ietf.org/html/rfc7231)
- [RFC 4918 — 207 Multi-Status](https://tools.ietf.org/html/rfc4918)