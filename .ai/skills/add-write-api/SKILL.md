---
name: add-write-api
description: >
  Interactive skill for planning new write (PATCH/POST/DELETE/PUT) API endpoints
  in the AudioReach Creator Backend. First checks the LLD/spec for Swagger or API
  documentation and extracts what it can, then runs a targeted interview for anything
  not covered, then produces a chapter-level plan skeleton per API. Use this skill
  whenever: a developer needs to add a new write endpoint, an LLD describes one or
  more new write APIs to implement, the user asks "scaffold the POST/PATCH/DELETE for X",
  or `writing-plans` is processing an LLD that contains API endpoint definitions.
  Each API in the LLD gets its own dedicated chapter output.
---

# Add Write API Skill

## Purpose

Generate a chapter skeleton for any new write endpoint in this codebase. The
skeleton gives the plan author or executing engineer:

- The exact files to create or modify (with full paths)
- The correct code structure at each layer (Command → Handler → Registry → Controller → DTO → Tests)
- The right architectural decisions already made (repo placement, validation reads, shared fetchers)

This skill acts as the structured input for the `writing-plans` skill — hand the output to
`writing-plans` as the "spec" for a chapter, or use it directly as a chapter outline.

---

## Reference Documents

Always read these before generating output — they are authoritative:

1. `references/add-write-api-guide.md` — implementation checklist, aggregate rules, file locations
2. `references/handler-design-guidelines.md` — return types, exception mapping, controller pattern
3. `docs/edit-crud/overall-design.md §5` — aggregate registry (which entities belong to which aggregate)
4. `docs/write-path-validation-reads-pattern.md` — validation reads, shared fetcher pattern
5. `docs/edit-crud/foundation.md §9` — PendingChangeWriter spec

**Reference implementation (read the code, not deleted plan files):**
- Command: `packages/core/src/application/usecase-designer/spf-module/patch/patch-spf-module.command.ts`
- Handler: `packages/core/src/application/usecase-designer/spf-module/patch/patch-spf-module.handler.ts`
- Controller method: search for `patchSpfModule` in `packages/api/src/presentation/rest/modules/spf-module/spf-module.controller.ts`
- E2E test: `packages/api/tests/e2e/spf-module/spf-module-patch.e2e-spec.ts`
- Integration test: `packages/infrastructure/persistence/tests/integration/repositories/module/module-edit.repository.integration.spec.ts`

---

## Step 0: Check for Swagger / API Documentation

**Do this first, before asking any interview questions.**

### 0a. Look for API documentation in the LLD or linked files

Search the LLD and any spec files referenced for:
- OpenAPI / Swagger YAML or JSON blocks
- `@ApiOperation`, `@ApiBody`, `@ApiResponse` annotations (if spec shows controller stubs)
- Sections titled "API Endpoint", "Request Format", "Response Format", "HTTP Contract"
- Request/response object definitions with field names and types

### 0b. If documentation IS found — extract and confirm

Extract as many of the following as possible:

| Field | Where to find it |
|---|---|
| HTTP verb + URL | Endpoint path (e.g., `PATCH /projects/{projectId}/spf-modules/{id}`) |
| Input fields | Request body schema — name, type, required/optional, description |
| Response codes | `responses:` block — 200, 400, 403, 404, 422 definitions |
| Response body shape | 200 response schema (tells us if follow-up read is needed) |
| Validation constraints | Field descriptions, enum values, min/max annotations |

Present the extracted info to the user in a summary like:

```
I found API documentation. Here's what I extracted:

- Verb + URL: PATCH /projects/:projectId/spf-modules/:id
- Input fields:
    alias?: string — optional, module display name
    containerId?: number — optional, target container
    maxInputPortsSupported?: number — optional, positive int
- Responses: 200 (SpfModuleDto), 400 (no fields), 403 (no session), 404 (not found), 422 (rule violation)
- Response shape: returns updated SpfModuleDto (requires follow-up read)

Does this look correct? Should I use this to build the chapter skeleton?
```

If the user confirms, skip the corresponding interview questions (2, 5, 9) and only ask for anything the docs didn't cover (typically: aggregate, repo scope, domain rules, session modes).

### 0c. If documentation is NOT found — warn and continue

Tell the user:

> **Warning: No Swagger/API documentation found for this endpoint.**
> I'll need to ask you for the request/response format manually. Consider adding
> `@ApiOperation`, `@ApiBody`, and `@ApiResponse` annotations to the controller
> method once it is implemented — this skill and future maintainers will use them.

Then proceed with the full 9-question interview.

---

## Interview — Ask These Questions

Ask only what wasn't already answered by the API documentation in Step 0.
Most have defaults — note them and skip if context is already clear.

### 1. API scope
"Does this LLD cover one write API or multiple? If multiple, list them (verb + resource for each)."

*Why:* Multiple APIs → one chapter per API. The interview runs once per API.

### 2. HTTP verb + URL shape *(skip if extracted from Swagger)*
"What is the HTTP verb and URL? (e.g., PATCH /projects/:projectId/spf-modules/:id)"

### 3. Aggregate
"Which aggregate root does this operation belong to? (e.g., SpfModule, Container, Subgraph, KeyDefinition, UseCase, DataLink)"

*If unclear:* look up `overall-design.md §5`. The aggregate is the domain entity whose `systemId` will be `aggregateId` on every `edit_actions` row this handler produces.

### 4. Is this aggregate already in edit scope?
"Does `ModuleEditRepository` / `ContainerEditRepository` / `<aggregate>EditRepository` already exist?"

*Why:* If yes, add methods to the existing repo. If no, scaffold the full new-repo path.

### 5. Input fields *(skip if extracted from Swagger)*
"What are the input fields? List each with: name, type, required/optional, and any constraint."

*Why:* Drives the DTO class-validator decorators, the command constructor, and handler validation.

### 6. Domain rules (validation that can fail)
"What domain rules must the handler enforce? For each rule, note:
  - What gets checked (existence, cross-entity constraint, business limit)
  - Which entity is checked (same aggregate or different?)
  - What the error looks like to the client (404 / 400 / 422)"

*Why:* Determines whether validation reads are needed and which exception to throw.

### 7. Validation reads — same aggregate or cross-aggregate?
If validation reads are needed:
"For each check: is the data you're reading part of the same aggregate you're writing to, or a different one?"

- **Same aggregate** → add `findXxxForPatch(systemId, fileSystemId)` to the existing edit repo
- **Different aggregate** → a separate read port interface in core is needed
- **Shared with query side** → ask if a fetcher in `@arc/persistence/fetchers/` already exists or should be created

### 8. Session modes
"Which session modes can execute this command? DESIGNER only, DIFF_MERGE only, or both?"

*Default:* `[SESSION_MODE.Designer, SESSION_MODE.DiffMerge]`

### 9. Response shape *(skip if extracted from Swagger)*
"After the write succeeds, what does the HTTP response return?
  (a) The updated entity — requires a follow-up read query in the controller
  (b) Just `{groupId}` — no follow-up read needed
  (c) Something else"

*Default:* (a) — return the updated entity.

---

## Output Format — Chapter Skeleton

After completing Step 0 + the interview, produce a chapter skeleton in this format.

```markdown
## Chapter: <HTTP Verb> /<resource-path>

**Operation:** <one sentence — what this API does and why>

**Aggregate:** <AggregateName> — <brief note on ownership>

**Pre-conditions:** <what LLD chapters must be complete first, if any>

**Chapter goal:** <what a developer will have shipped when this chapter is done>

---

### Files to create
<exact path list>

### Files to modify
<exact path list + what changes in each>

---

### Task 1: Command
File: `packages/core/src/application/usecase-designer/<aggregate>/<verb>/<Name>Command.ts`

Key decisions:
- `requiresSession = true`
- `allowedModes = [<list>]`
- Constructor fields: <list from Step 0 / interview>

### Task 2: Handler
File: same directory

Key decisions:
- Validation reads needed: <yes/no — method name + where>
- Cross-aggregate reads: <yes/no — port name>
- Domain rules to enforce: <list with exception type for each>
- Shared fetcher needed: <yes/no>

#### Shared fetcher — schema split required first

When a new overlay fetcher is needed (or an existing one is extended for a new aggregate),
the entity's schema file must export a `XxxBase` interface before the fetcher is written.
Fetchers cast `QueryBuilder.getOne()/getMany()` results to `XxxBase`, not `XxxRow` — this
keeps fetcher code free of TypeORM relation types and audit columns that aren't selected.

**Check first:** does the schema already have `export interface XxxBase`?
If yes, use it directly. If not, add it before writing the fetcher.

The split looks like this (scalar columns only in `Base`; relations stay in `Row`):

```typescript
// packages/infrastructure/persistence/src/.../entity-schema/.../<entity>.schema.ts

/** Scalar columns only — no relations, no audit fields. Used by overlay fetchers. */
export interface SpfModuleBase {
  systemId: number;
  instanceId: number;
  alias: string;
  subgraphSystemId: number;
  containerSystemId: number;
  definitionSystemId: number;
  fileSystemId: number;
}

export interface SpfModuleRow extends EntityBaseRow, SpfModuleBase {
  // TypeORM relations only — fetchers never need these
  subgraph?: SubgraphRow;
  container?: ContainerRow;
  definition?: SpfModuleDefinitionRow;
}
```

Rules for `Base`:
- Include only columns that appear in `.select([...])` calls in fetchers
- Never include relations (`subgraph?`, `container?`, etc.)
- Never include audit columns (`creationDate`, `updateDate`, `version`) — those belong on `EntityBaseRow`
- `systemId` must always be in `Base` (required by `OverlayMergeImpl`)

Then in the fetcher, import and cast to `Base`:

```typescript
import type {SpfModuleBase} from '../entity-schema/.../spf-module.schema.js';

const baseRow = (await this.manager
  .getRepository(ENTITY_NAMES.SpfModule)
  .createQueryBuilder('sm')
  .select(['sm.systemId', 'sm.instanceId', 'sm.alias', ...])
  .where(...)
  .getOne()) as unknown as SpfModuleBase | null;
```

### Task 3: Edit repository changes
<If extending existing repo:>
Add to `<ExistingEditRepository>`:
- Write method: `<methodName>(params): Promise<void>`
- Validation read (if needed): `<methodName>(params): Promise<XxxBase | null>`

<If new aggregate:>
- New interface file
- New adapter file
- UoW accessor + TypeOrmUnitOfWork wiring

### Task 4: CommandHandlerRegistry entry
File: `packages/core/src/application/orchestration/cqrs/registries/command-handler-registry.ts`

### Task 5: Request DTO
File: `packages/api/src/presentation/rest/modules/<resource>/dto/request/`
Fields: <list with @IsOptional/@IsString/@IsInt decorators — all optional fields MUST have @IsOptional()>

### Task 6: Controller method
File: `packages/api/src/presentation/rest/modules/<resource>/<resource>.controller.ts`
Swagger decorators: `@ApiOperation`, `@ApiBody({ type: <RequestDto> })`, `@ApiResponse` for each documented code
Session guard: `@UseGuards(SessionGuard)` + `@ArcSession() session: ActiveSession`
Follow-up read: <yes — query class name / no>
Response type: `ApiResult<<ResponseDto>>`

**Important:** Always add Swagger annotations on the controller method so future invocations
of this skill can extract them automatically.

### Task 7: Export command from @arc/core
File: `packages/core/src/index.ts`

### Task 8: Handler unit tests
File: `packages/core/tests/unit/application/usecase-designer/<aggregate>/<verb>/<Name>Handler.spec.ts`
Cover: empty/invalid body (400), not found (404), domain rule violation (422), success + groupId, rollback on failure

### Task 9: Repository integration tests
Files:
- `packages/infrastructure/persistence/tests/integration/repositories/<aggregate>/<aggregate>-edit.repository.integration.spec.ts`
- `packages/infrastructure/persistence/tests/integration/repositories/<aggregate>/<aggregate>-write-path.integration.spec.ts`
Cover: write produces correct edit_actions row; group_id shared; supersession

### Task 10: E2E tests
File: `packages/api/tests/e2e/<resource>/<resource>-<verb>.e2e-spec.ts`
Scenarios: 403 no session / wrong mode, 400 invalid body, 404 not found, 422 rule violation, 200 success + response body

### Commit: <Chapter Name>
Use the `commit` skill. Wait for explicit confirmation before running git commit.
```

---

## Multi-API LLDs

If the interview surfaces N APIs (N > 1), run Step 0 + the interview for each API
and produce N independent chapter skeletons. Apply this ordering:

1. Dependency order — API B depends on data created by API A → ship A first
2. Risk order — simpler (rename/set field) before complex (create/delete with cascades)
3. Label chapters `NN-verb-resource.md` (e.g., `03-post-add-spf-module.md`)

---

## writing-plans Integration

When `writing-plans` is processing an LLD that contains API endpoint specifications,
it should invoke this skill **before** writing tasks for those endpoints. Workflow:

1. `writing-plans` detects an API spec in the LLD (Swagger block, "API Endpoint" section, or HTTP verb + path + request/response definitions)
2. `writing-plans` invokes `/add-write-api`, passing the LLD path and the specific API section
3. This skill runs Step 0 (extracts from the spec), confirms with the user, and outputs a chapter skeleton
4. `writing-plans` incorporates the chapter skeleton as tasks in the plan

If `writing-plans` is operating in batch/phased mode with a handoff file, it should
note the Swagger extraction results in the handoff so subagents generating individual
chapters don't repeat the extraction.

---

## Alignment Checklist

Before finalizing output, verify each chapter skeleton satisfies:

- [ ] `aggregateId` is the aggregate root's `systemId` on every write (not the child entity's)
- [ ] `groupId` comes from `uow.getWriteContext().groupId` — never generated fresh
- [ ] All validation reads are overlay-aware (use session from `uow.getWriteContext()`)
- [ ] Same-aggregate validation reads are on the edit repo, not a query service
- [ ] DTO optional fields have `@IsOptional()` + a type validator (`@IsString`, `@IsInt`, etc.)
- [ ] Controller has `@UseGuards(SessionGuard)` + `@ArcSession() session`
- [ ] Controller does NOT contain business logic or validation
- [ ] Controller method has `@ApiOperation`, `@ApiBody`, `@ApiResponse` Swagger decorators
- [ ] Test plan covers handler unit, repo integration, write-path integration, E2E
- [ ] Session modes explicitly declared on the command class
- [ ] If a new fetcher was created: entity schema exports `XxxBase` (scalar columns only) and `XxxRow extends EntityBaseRow, XxxBase`; fetcher imports `XxxBase`, not `XxxRow`
