# Structural UseCase Update API Stub Design

**Requirement:** `../auto-usecase-routing-requirements-extended.md` FR-UC-UPDATE-01

## Scope

Define the UI-facing HTTP contract and implementation boundary for structural UC
replacement. This work is intentionally deferred from PR 02 because no earlier routing
phase depends on the endpoint. PR 11 delivers the contract, command, handler, persistence
behavior, and endpoint activation together. Until PR 11 is delivered, the endpoint is not
available at runtime.

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

## Controller and Implementation Boundary

PR 11 adds a dedicated `@Put(':usecaseSystemId/structure')` method to `UseCaseController`
with detailed operation, parameter, request, response, validation, and error Swagger
metadata. The same PR adds the command, handler, reusable validation path, repository
write, response mapping, and endpoint activation.

The endpoint remains unavailable until the complete PR 11 implementation is ready; no
standalone PR-02 controller stub is required. The implementation must not add a routing
mode and must preserve the existing alias-only PATCH behavior.

## Verification

- Core and API packages compile.
- Zod-derived Swagger models expose all nested request and response fields.
- Generated Swagger includes the PUT path and the documented 200/400/403/404/409/422
  behavior once Chapter 11 is delivered. Before that chapter, the route is intentionally
  not part of the PR-02 API surface.
- The existing alias PATCH remains unchanged.
