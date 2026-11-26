<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Human-Readable Logging and Errors: Guide

This guide is for engineers working on a logging task. It explains what is
already in place and how to convert issue producers and query-service reads.
Each task's GitHub issue lists its scope. Section numbers (§) refer to the
[Phase 1 design](human-readable-logging-and-errors-phase-1-design.md).

All paths are under `packages/core/src/` unless stated otherwise.

## 1. Goal

User-facing issue messages name entities by their natural identity, not by
the database `systemId`:

```text
Before: Module with systemId 268435458 was not found.
After:  Module 'RX MFC' (0x0000A1B2) was not found in this project.
```

To do this, issue creators stop building message text. They return an
`IssueFact` (code, severity, entity references). `IssueRenderer` reads the
names of the referenced entities in one batched read per entity type, and
builds the message from a template (§8.3).

## 2. What is already in place

- **Identity of entities** (`domain/identity/entity-identity.ts`,
  `application/issues/identity-formatter.ts`). These entity types have an
  identity entry, a formatter case, and a batched identity read: UseCase,
  Subgraph, SpfModule, Container, Subsystem, DataPort, ControlPort, DataLink,
  ControlLink, Ckv, Tag, Tkv, KeyDefinition, ValueDefinition, TagDefinition,
  SpfModuleDefinition, SpfModuleParameterDefinition. Text formats are in
  §4.3. Any other type is shown with the §4.2 fallback
  (`Module with systemId: 0x10000002`). If your task needs to name a new
  type, add its entry, formatter case, and read in the same way.
- **Shared facts** (`domain/issues/entity-issue-factory.ts`):
  - `EntityIssueFactory.notFound(entity)` replaces `IssueFactory.notFound`
    and inline `ENTITY_NOT_FOUND` issues.
  - `EntityIssueFactory.unresolvedReference(entity, missingEntity?)` for an
    entity that references something that does not exist.
- **Renderers** (`application/issues/issue-renderer.ts`):
  - Commands: `IssueRenderer.forUnitOfWork(uow)`. The reads see the
    session's own writes.
  - Query handlers:
    `IssueRenderer.forQueryServices(queryServices, fileSystemId)`.
  - `IssueRenderer.renderWithoutReads(facts)` when the producer already set
    every identity it can know.
  - A reference that already carries `identity` is not read again.
- **`renderOrThrow(result, renderer)`**
  (`application/issues/render-or-throw.ts`): throws
  `DomainRuleViolationException` with the rendered issues for a failed
  result, otherwise returns the result with its warnings rendered.
- **Read helpers** (`application/shared/result/`): `requireOne`,
  `requireAll`, `failedToIssues`. They already return rendered issues.

## 3. Converting an issue producer

A producer is an `IssueFactory` method, or an inline issue object
(`{code, message, severity}`) passed to an exception or a `Result`.

1. Keep the issue code (`ISSUE_CODE` in `shared/issues/operational-codes.ts`).
   Add the code there if it is an inline string today (for example
   `'SELF_LOOP'`).
2. Declare the code's context in `domain/issues/issue-context-map.ts`: the
   related entities, the params, and the fix-option kinds (§8.3). Use
   `CodeContext` (no context) when the message needs only `impactedEntity`.
3. Add the message template to `MESSAGE_TEMPLATES` in
   `application/issues/issue-templates.ts`, and a `FIX_OPTION_TEMPLATES`
   entry for each fix-option kind.
4. Add the code's entry in
   `packages/api/src/presentation/rest/common/dto/api-response/issue-context.docs.ts`.
   The table is keyed by `IssueFactCode`, so the build fails if one is
   missing.
5. Change the producer to return `IssueFact<typeof ISSUE_CODE.X>`. Pass
   entity references (`{entityType, systemId}`), not text. Set `identity` on
   a reference only when you already hold the exact fields, and always for an
   entity the current command created or changed (§5.4 "Pending change
   cache").
6. Render once: in a command, inside the unit of work, before commit or
   rollback; in a query handler, with the query-side renderer.
7. Update the tests to assert the code, `impactedEntity`, and the rendered
   message.

Example, in a command (see
`application/usecase-designer/use-case-creator/services/routing-graph-snapshot-builder.ts`):

```typescript
const fact = EntityIssueFactory.notFound({
  entityType: ENTITY_TYPE.Subgraph,
  systemId: cmd.subgraphSystemId,
});
throw new DomainRuleViolationException(
  await IssueRenderer.forUnitOfWork(uow).render([fact]),
);
```

Converted factories to copy from:
`application/usecase-designer/use-case-creator/issues/routing-issue-factory.ts`.

## 4. Converting a query-service part

The routing reads were changed this way in Phase 3. For each port in scope:

1. Change its reads to the §5.4 read rules:
   - A read returns plain data, or a `BatchRead<T, E>`
     (`{entityType, items, failed}`,
     `application/ports/persistence/batch-read.ts`). It never returns
     `Result`.
   - A requested ID that does not exist goes in `failed` as `NOT_FOUND`; an
     entity whose parts cannot be resolved as `UNRESOLVED_REFERENCE`.
   - Batch reads are named `find<Plural>`, with `fileSystemId` first, then
     the IDs, then options. They are the only form; there is no single-ID
     variant.
2. In the `Db*QueryService`, remove the per-method try/catch and the
   `ERROR_CODES` / `IssueFactory` issues. Infrastructure errors are thrown
   and become a 500.
3. Move the callers:
   - Commands: `requireOne` / `requireAll`, which throw when an entity is
     missing.
   - Query handlers: return a partial result for what is missing.
4. Where the area has a repository, make it extend the query service, and
   remove a repository read that reads the same thing as a query-service
   read. Implement each read once in persistence and use it from both the
   repository and the query service.
5. If step 4 applies, update the §5.4 table of repositories that extend
   their query services.

A query handler that needs exactly one entity
(`application/definition/key-definition/get-key/get-key-definition.handler.ts`):

```typescript
const keys = await this.queryServices.keyValueDefQueryService
  .findKeyDefinitions(fileId, [query.keySystemId]);
const key = requireOne(keys);
return Result.ok(mapKeyDefinition(key));
```

A query handler that returns a list
(`application/usecase-designer/subgraph/get-all/get-all-subgraphs.handler.ts`):

```typescript
const dtos = batch.items.map(subgraph => mapSubgraph(subgraph));
if (batch.failed.length === 0) return Result.ok(dtos);
return Result.partial(dtos, failedToIssues(batch));
```

In a task with both parts, do the query-service part first, so the issue
conversion already works on `BatchRead`.

## 5. Rules

- Keep the issue code, severity, fix options, blocking behaviour, and
  transaction behaviour unchanged.
- No feature-specific formatter and no hidden lookup. Names come only from
  the batched identity reads and `IdentityFormatter` (§4.4, §5.1).
- A system ID appears in text only in the §4.2 fallback, in hex, through
  `BinaryUtils.toHexString()`.
- IDs that a client needs for an action stay in `relatedEntities` or
  `commandPayload`; they are not repeated in the message (§5.3).

## 6. Done for every task

- The scope in the task's issue is complete.
- `pnpm build` passes. Rebuild core before checking api or persistence.
- No new lint warnings. Baseline: `npx eslint packages/core/src` reports
  `262 problems (0 errors, 262 warnings)`.
- `pnpm test:unit` and `pnpm test:integration` pass in every changed package
  (`packages/core`, `packages/api`, `packages/infrastructure/persistence`).

## 7. Working with the other tasks

The tasks run in parallel. When two PRs touch the same file, the one merged
second rebases. The number of PRs per task is up to the assignee.
