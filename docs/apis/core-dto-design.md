# Core-Owned Response DTOs — Design

## Problem

Today, query handlers in `packages/core` return `Result<ReadModel[]>`. ReadModels are persistence-layer projections owned by `packages/infrastructure/persistence`. API controllers receive them and contain the response-shaping logic:

```typescript
// packages/api: controller owns the shape — this is wrong
return toApiResult(result, data =>
  data.map(c => ({
    systemId: String(c.systemId),
    id: c.containerId,
    name: c.containerTypeName ?? String(c.containerTypeSystemId ?? ''),
  }))
);
```

This means:
- Business logic for "what does this API return" lives in the presentation layer.
- ReadModel types cross the Core→API boundary, coupling infrastructure schema to HTTP contracts.
- When a new endpoint is added, handler authors cannot know what shape the API expects until the controller is written.

**The fix:** Core handlers assemble the DTO and return `Result<Dto>`. API controllers become passthroughs. The API layer adds only Swagger metadata.

**Existing precedent:** `StartSessionHandler` already returns `Result<SessionResult>` (a Core-defined type, not a ReadModel). This design generalises that pattern.

---

## Approach Decision

Two options were evaluated. The team should pick one before implementation begins.

### Option 1 — Plain TypeScript Interfaces in Core

**Core** defines a plain TS interface (no framework deps). **API** mirrors it as a class with `@ApiProperty`.

**File layout:**

```
packages/core/src/application/<feature>/<operation>/
├── <operation>.query.ts
├── <operation>.handler.ts           ← returns Result<XyzDto>
└── <operation>-dto.ts               ← NEW: plain TS interface

packages/api/src/presentation/rest/modules/<feature>/dto/
└── <operation>-response.dto.ts      ← NEW: mirror class, @ApiProperty only
```

**Core interface:**

```typescript
// packages/core/.../container/query/container-dto.ts
export interface ContainerDto {
  readonly systemId: string;
  readonly id: number;
  readonly name: string;
}
```

**Handler:**

```typescript
export class ContainerQueryHandler
  implements QueryHandler<ContainerQuery, Promise<Result<ContainerDto[]>>>
{
  async handle(q: ContainerQuery): Promise<Result<ContainerDto[]>> {
    const fileSystemId = await this.queryServices.projectQueryService
      .getFileIdByProjectId(q.projectId);
    const readModels = await this.queryServices.containerQueryService
      .findAll(fileSystemId);
    if (readModels.kind === 'fail') return readModels;
    return Result.ok(
      readModels.data.map(c => ({
        systemId: String(c.systemId),
        id: c.containerId,
        name: c.containerTypeName ?? String(c.containerTypeSystemId ?? ''),
      }))
    );
  }
}
```

**API class (Swagger metadata only):**

```typescript
// packages/api/.../container/dto/container-response.dto.ts
// The NestJS CLI plugin auto-adds @ApiProperty for primitive fields.
// Only add it manually when a description or extra metadata is needed.
export class ContainerResponseDto implements ContainerDto {
  @ApiProperty({ description: 'Unique system identifier' })
  systemId: string;
  @ApiProperty({ description: 'Container database ID' })
  id: number;
  @ApiProperty({ description: 'Container type name or system ID as string' })
  name: string;
}
```

**Controller:**

```typescript
async queryContainers(): Promise<ApiResult<ContainerResponseDto[]>> {
  const result = await this.queryBus.execute<Result<ContainerDto[]>>(q);
  return toApiResult(result);   // passthrough — no mapper function
}
```

**Trade-offs:**

| | |
|---|---|
| ✅ Zero new dependencies | ❌ Two files per endpoint |
| ✅ Familiar NestJS pattern | ❌ Description lives in API, shape in Core |
| ✅ NestJS CLI plugin already running | ❌ `implements ContainerDto` guard is the only drift protection |
| ✅ Incremental migration | |

---

### Option 2 — Zod Schemas in Core

**Core** defines a Zod schema that carries both the TypeScript type and field descriptions. **API** uses `nestjs-zod`'s `createZodDto()` to derive a NestJS-compatible class from the schema — this gives Swagger full type info with zero `@ApiProperty` duplication.

> **Library choice:** `nestjs-zod` (not `@asteasolutions/zod-to-openapi`) — it supports Zod 4 and NestJS 11, integrates directly with the existing `SwaggerModule.createDocument()` pipeline, and requires no changes to `swagger-service.ts` or the custom `@ApiDocumentationWithExample` decorator. It was evaluated against `@asteasolutions/zod-to-openapi` (which does not support Zod 4 as of evaluation) and `@anatine/zod-nestjs` (Zod 3 only).

**File layout:**

```
packages/core/src/application/<feature>/<operation>/
├── <operation>.query.ts
├── <operation>.handler.ts           ← returns Result<XyzDto>
└── <operation>-dto.ts               ← NEW: Zod schema + inferred type

packages/api/src/presentation/rest/modules/<feature>/dto/
└── <operation>-response.dto.ts      ← NEW: createZodDto(XyzDtoSchema)
```

**Core schema (descriptions via `.describe()`, not `.openapi()`):**

```typescript
// packages/core/.../container/query/container-dto.ts
import { z } from 'zod';

export const ContainerDtoSchema = z.object({
  systemId: z.string().describe('Unique system identifier'),
  id: z.number().int().describe('Container database ID'),
  name: z.string().describe('Container type name or system ID as string'),
});
export type ContainerDto = z.infer<typeof ContainerDtoSchema>;
```

**Handler:** identical to Option 1.

**API DTO (no `@ApiProperty` needed — schema drives Swagger):**

```typescript
// packages/api/.../container/dto/container-response.dto.ts
import { createZodDto } from 'nestjs-zod';
import { ContainerDtoSchema } from '@arc/core';

export class ContainerResponseDto extends createZodDto(ContainerDtoSchema) {}
```

**Controller:**

```typescript
async queryContainers(): Promise<ApiResult<ContainerResponseDto[]>> {
  const result = await this.queryBus.execute<Result<ContainerDto[]>>(q);
  return toApiResult(result);
}
```

**Trade-offs:**

| | |
|---|---|
| ✅ Single source of truth (shape + description in Core) | ❌ New dependency: `nestjs-zod` in `@arc/api` |
| ✅ Zero drift — schema IS the Swagger doc | ❌ Slightly less familiar to NestJS-first teams |
| ✅ One file per endpoint (vs two in Option 1) | ❌ `createZodDto` classes have no custom constructor |
| ✅ No changes to existing Swagger infrastructure | |
| ✅ Runtime validation possible via `schema.parse()` | |

---

## Recommendation

**Lean toward Option 2 long-term; start with Option 1 if the team prefers lower risk.**

Both options are structurally identical at the handler level — handlers return `Result<Dto>` either way. The only difference is where Swagger metadata lives and whether there is an API DTO class.

If the team decides to migrate from Option 1 to Option 2 later, the migration is mechanical: replace API classes with `createZodDto(schema)` subclasses, move descriptions from `@ApiProperty` to `.describe()` on the Zod schema.

---

## Migration Strategy

1. **Pilot 3 handlers** — `ContainerQueryHandler`, `SpfModuleQueryHandler`, and one command handler (e.g. `StartSessionHandler` is already done). Use these as the team reference.
2. **Update handler registry typing** — ensure `QueryHandlerRegistry` and `CommandHandlerRegistry` reflect the actual return types of migrated handlers.
3. **Scaffold unimplemented endpoints** — for every route with no handler, define the Core DTO interface/schema + API class now. Handler authors then have a typed contract.
4. **Ongoing** — all new handlers follow the chosen pattern from day one.

---

## File Layout Convention

DTOs follow a **three-tier placement rule** based on their scope:

### Tier 1 — Cross-feature shared primitives

Used by two or more modules. Place in `packages/core/src/shared/dto/`.

```
packages/core/src/shared/dto/
├── property-dto.ts
└── element-data/
    ├── config-element-dto.ts
    ├── bit-field-dto.ts
    └── ...
```

### Tier 2 — Entity-level / composable DTOs

Belongs to one module; may be embedded in other DTOs. Place in a `dto/` subfolder at the module root.

```
packages/core/src/application/<feature>/<module>/dto/<entity>-dto.ts
```

Examples:
- `usecase-designer/container/dto/container-dto.ts`
- `usecase-designer/subgraph/dto/subgraph-dto.ts`
- `definition/tag-definition/dto/tag-definition-dto.ts`

### Tier 3 — Operation-specific DTOs

Unique to one handler's output shape; not expected to be embedded elsewhere. Place inside the operation subfolder alongside the handler.

```
packages/core/src/application/<feature>/<module>/<operation>/<operation>-dto.ts
```

Examples:
- `spf-module/get/module-compact-dto.ts`
- `spf-module/get-cal-data/ckv-cal-data-dto.ts`
- `spf-module/query/spf-module-dto.ts`

### Summary table

| DTO type | Path pattern | Example |
|---|---|---|
| Cross-feature primitive | `shared/dto/` | `shared/dto/property-dto.ts` |
| Entity-level / composable | `<module>/dto/` | `container/dto/container-dto.ts` |
| Operation-specific | `<module>/<operation>/` | `spf-module/get/module-compact-dto.ts` |

Export the schema + type (Option 2) from the file. Re-export from `packages/core/src/index.ts`.

For command handlers that return domain data (not just `WriteResult`), the same placement rule applies.

---

## Key Files

| File | Role |
|------|------|
| `packages/core/src/application/edit-session/session-types.ts` | Existing precedent — `SessionResult` |
| `packages/core/src/application/usecase-designer/container/query/query-containers.handler.ts` | First migration candidate |
| `packages/core/src/application/ports/persistence/query-services/container/container-read-model.ts` | ReadModel that becomes internal after migration |
| `packages/api/src/presentation/rest/modules/container/container.controller.ts` | Controller that becomes a passthrough |
| `packages/api/src/presentation/rest/common/result/to-api-result.ts` | `toApiResult()` — unchanged |
| `packages/core/src/application/shared/result/result.ts` | `Result<T>` — unchanged |

---

## Scaffolding Guide for Unimplemented Endpoints

For a route that has a controller method but no handler yet:

**Step 1 — Define the Core DTO** (Option 1):

```typescript
// packages/core/src/application/<feature>/query/<operation>-dto.ts
export interface XyzDto {
  // fields here — consult the API spec or the ReadModel for the fields
}
```

**Step 2 — Define the API class** (Option 1):

```typescript
// packages/api/src/presentation/rest/modules/<feature>/dto/<operation>-response.dto.ts
export class XyzResponseDto implements XyzDto {
  @ApiProperty({ description: '...' })
  fieldName: type;
}
```

**Step 3 — Wire the controller return type:**

```typescript
async getXyz(): Promise<ApiResult<XyzResponseDto[]>> {
  // TODO: implement handler
  throw new Error('Not implemented');
}
```

This lets the Swagger doc show the correct response shape even before the handler is written.

---

## HATEOAS Link Injection — Permitted Controller Exception

Controllers that need to add `relatedEndPointLinks` to their response are **permitted to use a mapper argument** in `toApiResult`. This is an API-layer concern (HATEOAS metadata) that intentionally lives in the controller, not in the Core Dto. It is the permanent, approved pattern — not a violation of the passthrough rule.

Correct form:

```typescript
return toApiResult(result, data =>
  data.map(item => {
    const link = new EndPointLink();
    link.hypertextRef = '...';
    link.method = 'POST';
    link.description = '...';
    return {...item, relatedEndPointLinks: [link]};
  }),
);
```

Rules:
- The mapper must only add API-layer fields (`relatedEndPointLinks`). It must not reshape, rename, or recompute domain fields.
- Do not mutate `apiResult.data` after calling `toApiResult` — always pass the mapper as the second argument.
- `relatedEndPointLinks` must not be added to Core Zod schemas. Core Dtos are transport-agnostic.

---

## Verification

1. `pnpm build` — no type errors after migration
2. `pnpm run generate:swagger` → `docs/swagger-api.json` — migrated endpoints show correct response schemas
3. Existing e2e tests pass — `packages/api/tests/e2e/`
4. Controllers that add `relatedEndPointLinks` use the mapper argument form of `toApiResult`, never post-call mutation
5. No ReadModel imports remain in API files for migrated endpoints
