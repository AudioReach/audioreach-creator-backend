# PR-02 Implementation Gap Report

**Status:** Current-state review

**Scope:** This document explains the gaps remaining after the PR-02 routing
scaffolding work. It is written as a high-level handoff for someone familiar
with routing-engine concepts but who should not need to inspect the source code
to understand the problems, expected behavior, or remediation.

## Executive Summary

PR-02 is intended to publish a safe, compilable routing skeleton. It is not
intended to activate routing behavior. The current implementation contains the
core routing classes and command flow, but several boundaries are not aligned
with the PR-02 contract:

1. The structural use-case replacement API contract is intentionally deferred to the
   actual API implementation stage rather than being published in PR-02.
2. The automatic and manual create endpoints are active when they should still
   be inert HTTP 501 stubs.
3. Request validation still relies on NestJS decorator DTOs rather than the
   core-owned Zod contract.
4. MDF classification has the intended application-service shape, but its
   effective-overlay behavior is not sufficiently proven and its deletion
   semantics need to follow the module-deletion invariant.
5. The transaction flow does not flush pending cached edit actions before
   committing.
6. The required test safety net is mostly missing.
7. The source layout, phase naming, and dependency construction have drifted
   from the approved PR-02 design.

The most important immediate risk is endpoint activation. Because the current
resolver was changed to return success and the create controllers dispatch
commands, a client can reach transaction-owning routing handlers before the
later routing PRs are ready. The PR-02 safety rule is specifically intended to
prevent that.

## How To Read This Report

Each issue is described using the same questions:

- **What is currently present?** The observed implementation state.
- **What is expected?** The PR-02 contract or later-PR boundary.
- **Why does it matter?** The practical risk or consequence.
- **What should be done?** The smallest coherent remediation.
- **How do we know it is fixed?** The verification evidence that should exist.

The phrases “missing” and “absent” mean that the required behavior or proof was
not found. They do not necessarily mean that no related code exists.

## 1. Structural PUT Contract Deferred to the Implementation Stage

### What Is Currently Present?

The repository contains a design for the structural use-case replacement API,
but the API contract has not been implemented in the source tree. This is now an
intentional sequencing decision, not a PR-02 defect: no earlier routing phase
depends on the endpoint, so the contract will be delivered with the actual PR-11
implementation.

Until PR 11, the following remain absent:

- Core-owned Zod request and response schemas.
- Exported inferred core types and schemas.
- Thin API DTO wrappers built with `createZodDto`.
- A `PUT` route for
  `/arc-api/v1/projects/:projectId/usecases/:usecaseSystemId/structure`.
- The HTTP 501 controller stub for that route.
- Swagger metadata describing the request, future response, errors, and current
  501 behavior.
- Contract-level tests proving that the endpoint returns 501 and does not
  dispatch a command or mutate session state.

There is no structural-update source file or route corresponding to the
contract-only design. The existing create-usecase route and the existing
alias-only use-case update route are separate concerns.

### What Is Expected?

PR 11 should deliver the UI-facing contract and structural mutation together.
The endpoint should:

- Accept the required active-subgraph and data-link selections defined by
  `FR-UC-UPDATE-01`.
- Expose the future response shape containing `usecase` and `groupId`.
- Document future 400, 403, 404, 409, and 422 outcomes.
- Use the PR-7 reusable manual validation and PR-10 commit safety prerequisites.
- Activate only after the command, handler, persistence mutation, validation
  behavior, and tests are complete.

### Why Does It Matter?

Until PR 11, the client cannot integrate against the planned structural-update
operation and Swagger does not describe that future API surface. Delivering the
contract and implementation together avoids publishing a temporary contract
that has no usable runtime behavior and keeps validation, mutation, and response
mapping aligned.

### What Should Be Done?

1. Start this work after PR-7 validation and PR-10 commit-safety prerequisites.
2. Add the request and response Zod schemas to `@arc/core`.
3. Export the schemas and inferred types from the core public index.
4. Add API `createZodDto` wrappers in the use-case REST module.
5. Add the dedicated `PUT` method to `UseCaseController` with its active
   contract and error metadata.
6. Implement the command, handler, repository write, response mapping, and
   transaction behavior.
7. Add controller, schema, integration, and E2E verification.

### How Do We Know It Is Fixed?

- The generated Swagger document contains the exact PUT path.
- Swagger exposes the nested request and response fields.
- API tests prove the endpoint is unavailable before activation and functional
  after the complete PR-11 implementation is enabled.
- Core and API typechecks pass.
- The existing alias-only PATCH route remains unchanged.

## 2. Create Endpoints Violate PR-02 Safety

### What Is Currently Present?

Both create routes are implemented as active POST handlers:

- `POST /arc-api/v1/projects/:projectId/create-usecases`
- `POST /arc-api/v1/projects/:projectId/create-manual-usecases`

The controller methods construct commands, call `CommandBus`, project the
result through `QueryBus`, and return a successful response shape. The command
handlers start transactions, invoke chain resolution, read routing input, run
the engine, and commit.

The current handler flow is therefore mutating-capable, even though many engine
phases are still stubs. The resolver was also changed to return a successful
no-op, so the previous always-fail safety barrier is no longer present.

### What Is Expected?

PR-02 must publish the endpoint contract but leave both methods as HTTP 501
stubs. A request to either endpoint must:

- Return 501.
- Avoid command dispatch.
- Avoid query projection.
- Avoid routing execution.
- Avoid AUTO_ROUTING cleanup.
- Avoid cache writes and database mutation.

Automatic dispatch is activated in PR-06. Manual dispatch is activated in
PR-07, after their respective routing behavior is implemented.

### Why Does It Matter?

An active controller creates a false impression that routing is available. It
can also delete existing AUTO_ROUTING edit actions before the engine has
implemented the behavior that recreates them. A no-op or partially stubbed
engine can then produce an empty or incomplete result while the API reports a
successful operation.

This violates the safety boundary that separates “publish the scaffold” from
“activate routing.” It is especially dangerous because endpoint callers do not
know which phases are still no-ops.

### What Should Be Done?

1. Replace both controller bodies with explicit HTTP 501 behavior.
2. Remove command and query dispatch from the PR-02 controller path.
3. Keep the final request and response Swagger contracts in place.
4. Add endpoint tests proving no command, query, cleanup, or persistence path is
   reached.
5. Reintroduce automatic dispatch only in PR-06.
6. Reintroduce manual dispatch only in PR-07.
7. Before activation, restore the intended resolver checkpoint behavior rather
   than relying on a silent success fallback.

### How Do We Know It Is Fixed?

- Both create endpoints return 501 in PR-02.
- Their controller tests assert zero `CommandBus` calls.
- An API E2E test confirms no edit actions are created, deleted, or changed.
- Swagger continues to publish the future 200 response without making it the
  current runtime behavior.

## 3. Zod Validation Is Not Implemented for the Routing Requests

### What Is Currently Present?

The routing request DTOs still use NestJS decorator validation:

- `CreateUsecasesRequestDto` uses `class-validator` decorators.
- `CreateManualUsecasesRequestDto` uses `class-validator` decorators.
- Nested DTO conversion uses `class-transformer`.
- `main.ts` registers only NestJS `ValidationPipe` globally.

There is some Zod usage elsewhere in the API, including a response-side
`createZodDto` wrapper, but the routing request contracts are not core-owned
Zod schemas and are not validated through a Zod-aware request path.

### What Is Expected?

The authoritative routing wire contracts should live in `@arc/core` as Zod
schemas. The API layer should wrap those schemas with thin `createZodDto`
classes for NestJS integration and Swagger generation.

The application still contains older decorator-based DTOs, so the validation
transition must be compatible with the rest of the API. Practically, this
means either a hybrid validation setup or a carefully staged migration that:

- Validates Zod-backed routing DTOs with the Zod contract.
- Keeps legacy decorator DTOs working until they are migrated.
- Does not duplicate the same routing rules in two independent DTO systems.

### Why Does It Matter?

The current design splits the contract between decorators, transformation
metadata, controller code, and core command construction. That creates several
risks:

- API and core can disagree about required fields or nested shapes.
- Transformation can silently alter values before core sees them.
- Swagger may describe a class shape that is not exactly the runtime Zod shape.
- The core package cannot validate or reuse the same contract without importing
  NestJS concerns.

This is particularly important for nested SGKV selections, string system IDs,
optional exclusion arrays, and malformed nested arrays.

### What Should Be Done?

1. Define routing request schemas in `@arc/core`.
2. Define inferred request types from those schemas.
3. Replace routing API DTO implementations with `createZodDto` wrappers.
4. Introduce or configure the validation pipe path so Zod DTOs and remaining
   legacy DTOs both behave correctly.
5. Remove routing-specific `class-validator` and `class-transformer` usage once
   the replacement is verified.
6. Keep business validation out of the DTO layer. Empty combinations,
   duplicate selections, and routing conflicts belong to routing phases.

### How Do We Know It Is Fixed?

- Valid and invalid requests produce the same result in API validation and core
  schema parsing.
- Nested malformed IDs and arrays are rejected before command construction.
- Optional exclusion fields behave consistently when omitted versus empty.
- Swagger is generated from the same schema used for runtime validation.
- Legacy non-routing DTOs continue to pass their existing validation tests.

## 4. MDF Effective-Overlay Correction Is Incomplete or Unproven

### What Is Currently Present?

The current implementation has a positive structural change: MDF classification
is performed by a core application service rather than being entirely hidden
inside a subgraph persistence fetcher. The service:

1. Loads candidate subgraphs.
2. Loads modules for those subgraphs.
3. Loads module definitions in a batch.
4. Applies the exact-two-module rule using IPC_TX and IPC_RX definitions.

The module repository path now uses an overlay-aware module fetcher. However,
the required end-to-end evidence is incomplete. There is no dedicated MDF
classification integration suite proving that session-created, updated, and
deleted modules produce the correct effective MDF result. Existing overlay
tests do not by themselves prove that the application-level classifier uses
the effective result correctly.

### Important Deletion Semantics

The phrase “effective Node deletions” needs to be interpreted carefully. The
frozen persistence requirements do **not** define a Node-only tombstone as a
supported module-deletion state.

The expected invariant is:

- A supported module deletion is represented by an `SpfModule DELETE` action.
- The effective module read excludes that module.
- The coupled `Node DELETE` is topology cleanup.
- MDF classification must not add a special Node-only visibility rule.

Therefore, the fix is not to make MDF classification independently inspect
Node DELETE rows. The fix is to guarantee that effective module reads apply
module CREATE, UPDATE, and DELETE actions, and that the coupled node cleanup
does not leave a deleted module visible to MDF classification.

### What Is Expected?

For every candidate subgraph, MDF classification must operate on the effective
module set after the active session overlay:

- Include matching module CREATE actions.
- Apply valid module UPDATE actions.
- Exclude module DELETE actions.
- Keep the lookup scoped to the candidate subgraphs.
- Resolve definitions in a batched projection.
- Preserve the exact-two-module IPC_TX plus IPC_RX predicate.
- Do not apply session overlays to module-definition natural IDs for this
  refactor.

### Why Does It Matter?

If MDF classification uses committed modules, a user can delete or add a module
in the current session and still receive a classification based on stale
topology. That changes KV pass-through and downstream routing behavior. The
failure may only appear in a session, making it difficult to diagnose from
committed database state.

### What Should Be Done?

1. Confirm that `findModulesBySubgraphIds` returns the complete effective module
   collection for the requested subgraphs.
2. Confirm that module CREATE, UPDATE, and DELETE actions are handled by the
   shared overlay primitive.
3. Keep Node DELETE as coupled topology cleanup, not as an MDF-specific filter.
4. Add integration tests covering:
   - committed IPC_TX plus IPC_RX classification;
   - session-created qualifying module;
   - session-deleted TX or RX module;
   - module UPDATE that changes the relevant definition or scope field;
   - non-qualifying module counts;
   - scope isolation across subgraphs and files;
   - coupled Node DELETE behavior;
   - batch definition lookup behavior.
5. Remove any remaining cross-aggregate MDF fetcher operation after the
   application service is proven.

### How Do We Know It Is Fixed?

- An integration test demonstrates that deleting either effective IPC module
  removes MDF classification before commit.
- An integration test demonstrates that a session-created qualifying module is
  visible to classification.
- A Node-only tombstone is rejected as unsupported or otherwise does not create
  a second MDF deletion semantic.
- The classifier performs one scoped module read and one batched definition
  projection rather than one lookup per module.

## 5. Cached Actions Are Not Flushed Before Commit

### What Is Currently Present?

The Unit of Work exposes `applyCachedActions()`, and the infrastructure
implementation knows how to flush the pending-change cache through the active
transaction. However, both routing handlers call `uow.commit()` immediately
after successful engine execution. Neither handler calls
`uow.applyCachedActions()` first.

The current `RoutingChangeStager` is still a no-op, so this omission may not be
visible while every phase is a stub. It becomes a real persistence defect as
soon as a routing phase enqueues edit actions in the cache.

### What Is Expected?

The successful handler sequence is:

1. Run the engine.
2. If the engine succeeds, flush cached actions through the same UoW.
3. Commit the transaction.
4. Return the routing outcome.

If the cache flush fails, the handler must roll back and must not report a
successful routing operation.

### Why Does It Matter?

Committing without flushing can produce a false success:

- The transaction commits without the edit actions that the engine staged.
- The returned response claims that changes were accepted.
- A later read cannot see the expected changes.
- The in-memory cache may retain stale rows and contaminate later operations.

This breaks the transaction boundary because the engine and the persistence
adapter no longer agree about what “committed” means.

### What Should Be Done?

1. Call `await uow.applyCachedActions()` in both automatic and manual handlers
   after a successful engine result and before `commit()`.
2. Preserve the existing rollback path for cache-flush failures.
3. Ensure resolver and routing writes use the same transaction and cache.
4. Add ordering tests proving flush precedes commit.
5. Add failure tests proving a flush error rolls back all earlier work.

### How Do We Know It Is Fixed?

- A handler test asserts `applyCachedActions` occurs once before `commit`.
- A failure test asserts `rollback` occurs when flushing fails.
- An integration test confirms staged edit actions are visible after the command
  returns.
- A second operation starts with an empty pending cache.

## 6. Required PR-02 Tests Are Largely Missing

### What Is Currently Present?

Some related tests exist. For example:

- A core command-construction test exists.
- A controller unit test covers the current active create-endpoint response
  flow and projection retry behavior.
- Domain-level subsystem chain resolver tests exist.

Those tests do not cover the PR-02 scaffold safety contract. No dedicated suites
were found for most of the following:

- Routing context defaults and input immutability.
- Exact twelve-phase engine order.
- Engine short-circuiting after a failed phase.
- Warning continuation behavior.
- Automatic and manual handler transaction sequencing.
- Resolver failure rollback and “no later work” behavior.
- Manual pair-discovery scaffold and routing-input handoff.
- Routing DTO/schema validation.
- Structural PUT contract, activation, and implementation behavior (owned by PR 11).
- Create-endpoint 501 behavior and no-mutation guarantees.
- Routing-specific API E2E behavior.

The current controller test actually asserts that the create endpoint dispatches
a command. That is useful for an activated endpoint, but it contradicts the
PR-02 requirement while the endpoint is still supposed to be a 501 stub.

### What Is Expected?

PR-02 needs tests that prove the skeleton is safe, not tests that pretend the
future routing algorithm is complete. The minimum test layers are:

- **Core unit tests:** contracts, engine order, phase failure semantics,
  handler transactions, resolver checkpoint, cache flush, and manual discovery
  scaffold.
- **Persistence integration tests:** overlay foundation corrections, MDF
  effective reads, GKV hydration, session-created rows, and AUTO_ROUTING
  cleanup.
- **API tests:** DTO validation, 501 endpoint behavior, no command dispatch,
  and structural PUT Swagger/controller coverage.
- **E2E tests:** ensure HTTP calls cannot mutate session edit actions while PR-02
  is still in scaffold mode.

### Why Does It Matter?

Without these tests, a later contributor can accidentally activate a route,
change phase order, skip rollback, or omit cache flushing while all existing
tests remain green. The missing tests are not just coverage statistics; they are
the executable guardrails for the PR-02 architecture.

### What Should Be Done?

1. Add the tests listed above before activating routing behavior.
2. Change the existing create-controller tests to assert the PR-02 501 contract.
3. Add dedicated handler tests with mocked UoW, resolver, engine, and cache.
4. Add one engine test per control-flow rule rather than testing only individual
   phase classes.
5. Add integration coverage for the effective overlay and MDF deletion cases.
6. Add API E2E coverage that observes the database or edit-action table before
   and after a 501 request.

### How Do We Know It Is Fixed?

- Every PR-02 verification item in the scaffolding design has a named test.
- The tests prove both positive wiring and negative safety behavior.
- A full test run remains green after routes are later activated in PR-06/07,
  with the 501 tests moved or replaced at the planned activation boundary.

## 7. Contract Drift From the Approved PR-02 Design

### What Is Currently Present?

The implementation and the written plan disagree in several visible ways:

#### Source folder

The implementation is under:

`packages/core/src/application/usecase-designer/use-case-creator/`

The PR-02 design says new core routing files belong under:

`packages/core/src/application/usecase-designer/auto-usecase-creator/`

The distinction matters because it affects imports, exports, test discovery,
future PR file ownership, and whether contributors create duplicate routing
implementations in both locations.

#### Phase name

The implementation uses `IslandTransitionService` and
`island-transition.service.ts`. The approved phase sequence names the phase
`DisconnectedTransitionService`, with the documented legacy behavior
`ISLAND -> LINKED`.

This may be a naming-only difference, but it is currently undocumented as an
intentional deviation. A naming mismatch can still cause the wrong phase to be
replaced, duplicated, or omitted when later PRs implement the phase.

#### Dependency construction

The current handlers construct their own resolver and call
`createRoutingEngine()` internally. The current engine factory supplies the
phase instances behind that factory.

The PR-02 design describes explicit engine dependencies and says the resolver
checkpoint must be wired into both handlers before input assembly. The frozen
temporary-stub design separately says each handler directly constructs its own
stateless resolver. These documents are not fully consistent with each other,
so the implementation cannot be judged against one unambiguous dependency
contract yet.

### What Is Expected?

There must be one authoritative contract for:

- The source folder and public export paths.
- The phase class and file names.
- Whether the engine receives explicit phase instances or builds them through a
  factory.
- Whether the temporary resolver is directly constructed per handler or shared
  through explicit wiring.

The implementation should match that contract before later PRs replace the
stubs. The temporary resolver decision should be made explicitly because the
real resolver will have persistence dependencies and its lifecycle matters.

### Why Does It Matter?

Contract drift creates a second implementation problem before routing behavior
has even been added. A contributor following the plan may add files under
`auto-usecase-creator`, while another contributor modifies the existing
`use-case-creator` files. The result can compile partially, hide stale classes,
or make tests exercise a different implementation than the API uses.

The resolver dependency ambiguity also affects transaction ownership and test
isolation. A stateful or infrastructure-backed resolver cannot be treated like
the current empty stateless stub without an explicit lifecycle decision.

### What Should Be Done?

1. Select the authoritative source folder and update either the code or the
   plan.
2. Rename `IslandTransitionService` to the approved legacy name, or record a
   deliberate exception and update all plan references.
3. Choose the engine-construction model: explicit dependencies at the handler
   composition boundary or the existing factory model.
4. Resolve the conflict between the temporary-stub direct-construction rule
   and the full-design shared-resolver wiring rule.
5. Update registries, exports, factories, tests, and all affected documents in
   one change.
6. Add a composition test proving that the API dispatches the intended class
   and phase sequence.

### How Do We Know It Is Fixed?

- There is one source location for each routing component.
- The class names in source, tests, exports, and plans match.
- The handler dependency graph is documented and testable.
- No stale `dist` declaration or duplicate source path is used as the runtime
  implementation.
- A composition test verifies the actual engine and handler wiring.

## Recommended Fix Order

The issues should be addressed in this order:

1. Restore PR-02 endpoint safety by making both create routes return 501.
2. Resolve the source-folder, naming, and dependency-contract drift.
3. Add the missing structural PUT contract and Zod validation path.
4. Add the handler cache flush before any routing phase can persist changes.
5. Complete and verify effective MDF overlay behavior.
6. Add the PR-02 unit, integration, API, and E2E guardrails.
7. Activate automatic and manual endpoints only in PR-06 and PR-07.

The first two steps prevent additional behavior from being built on an
ambiguous or unsafe scaffold. The remaining steps make the scaffold complete
and provide the evidence needed for later routing implementation.

## Source References

### PR-02 contracts and design

- `docs/use-case-creator/plans/pr-02/pr-02-scaffolding-implementation-plan.md`
- `docs/use-case-creator/plans/pr-02/pr-02-scaffolding-design.md`
- `docs/use-case-creator/design/update-usecase-structure-stub-design.md`
- `docs/use-case-creator/requirements/persistence-overlay-and-mdf-refactor-requirements.md`
- `docs/use-case-creator/design/persistence-overlay-and-mdf-refactor-design.md`

### Current implementation evidence

- `packages/api/src/presentation/rest/modules/project/project.controller.ts:1009-1036`
  and `:1103-1130` — active automatic and manual create dispatch.
- `packages/api/src/presentation/rest/modules/project/dto/create-usecases-request.dto.ts`
  — decorator-based automatic request DTO.
- `packages/api/src/presentation/rest/modules/project/dto/create-manual-usecases-request.dto.ts`
  — decorator-based manual request DTO.
- `packages/api/src/main.ts:17-29` — global NestJS `ValidationPipe`.
- `packages/core/src/application/usecase-designer/use-case-creator/services/mdf-classification.service.ts:17-72`
  — application-level MDF classification.
- `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/module/module.repository.ts:95-107`
  — module lookup used by MDF classification.
- `packages/core/src/application/usecase-designer/use-case-creator/create-usecases/create-usecases.handler.ts:34-95`
  — automatic transaction flow and direct commit.
- `packages/core/src/application/usecase-designer/use-case-creator/create-manual-usecases/create-manual-usecases.handler.ts:33-99`
  — manual transaction flow and direct commit.
- `packages/api/src/infrastructure-wrapper/persistence/unit-of-work/typeorm-unit-of-work.ts:115-124`
  — available cache-flush operation.
- `packages/core/src/application/usecase-designer/use-case-creator/engine/routing-engine.ts:29-80`
  — current phase construction and execution.
- `packages/core/src/application/usecase-designer/use-case-creator/phases/island-transition.service.ts`
  — current phase name.
- `packages/api/tests/unit/presentation/rest/modules/project/project-create-usecases.controller.spec.ts`
  — existing active-dispatch controller tests that need to be realigned with
  the PR-02 501 contract.
