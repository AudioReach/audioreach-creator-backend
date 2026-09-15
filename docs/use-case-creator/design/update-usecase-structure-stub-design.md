# Structural UseCase Update API Stub Design

**Requirement:** `../auto-usecase-routing-requirements-extended.md` FR-UC-UPDATE-01

## Scope

Establish the UI-facing HTTP contract for structural UC replacement before the command,
handler, and persistence behavior are implemented. The endpoint remains unavailable at
runtime and returns HTTP 501. This contract-only work ships with PR 02; PR 11 activates
the endpoint.

## Contract

- Add `PUT /arc-api/v1/projects/:projectId/usecases/:usecaseSystemId/structure`.
- Keep the existing alias-only `PATCH /usecases/:usecaseSystemId` unchanged.
- Accept required `activeSubgraphs` and `dataLinkSystemIds` fields exactly as defined by
  FR-UC-UPDATE-01.
- Document the future HTTP 200 response as `{usecase, groupId}`. The endpoint owns a
  dedicated rich UC snapshot schema containing public GKV/alias/category fields,
  `{systemId, changeId}`, effective SG membership, and directed SG pairs. The routing
  create APIs use a separate rich before/after change-details response. Internal
  `usecaseType` is recomputed from topology by the future implementation and is not
  exposed.
- Document future 400, 403, 404, 409, and 422 outcomes and the current 501 outcome.

## DTO Ownership

Define the request and response contracts as Zod schemas in `@arc/core`, alongside the
existing usecase application DTOs. Export inferred TypeScript types and the schemas from
the core public index. Core remains framework-free.

Define thin API DTO classes with `createZodDto` under the usecase REST module. These
classes provide NestJS validation and Swagger model generation without duplicating the
contract.

## Controller

Add a dedicated `@Put(':usecaseSystemId/structure')` method to `UseCaseController` with
detailed operation, parameter, request, response, validation, and not-implemented Swagger
metadata. The method accepts the typed request body but performs no parsing, validation
logic, CQRS dispatch, or persistence work. Its body throws `NotImplementedException`.

No command bus dependency, command, handler, repository change, migration, or session
mutation is introduced by this stub.

## Verification

- Core and API packages compile.
- Zod-derived Swagger models expose all nested request and response fields.
- Generated Swagger includes the PUT path and HTTP 501 response.
- The existing alias PATCH remains unchanged.
