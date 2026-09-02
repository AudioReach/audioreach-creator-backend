# Temporary Chain Resolver Stub Requirements

**Status:** Frozen

## Goal

Allow PR-02 to define, construct, and test the routing chain-resolver dependency while
the real data/control subsystem-link resolution feature remains unavailable.

## Functional Requirements

1. `@arc/core` exposes one concrete application service named
   `SubsystemLinkResolutionService` with exactly:

   ```typescript
   resolveAllChains(uow: UnitOfWork): Promise<Result<void>>;
   ```

2. Each routing handler directly constructs its own stateless
   `SubsystemLinkResolutionService`. `ArcCqrsModule`, `CommandBus`, and command-handler
   dependency bags do not receive or expose this service.

3. The temporary implementation always returns a generic failed `Result`. It does
   not introduce a dedicated resolver-unavailable issue code or a new API error
   contract.

4. The temporary implementation performs no reads, writes, ID allocation, cache
   flush, transaction start, commit, or rollback. Transaction ownership remains in
   the handler.

5. Both routing handlers invoke the resolver immediately after starting their UoW
   transaction. On its failed result, each handler rolls back and converts the
   failure through the existing domain-failure path before any AUTO_ROUTING cleanup,
   graph-input read, manual pair discovery, routing-engine execution, cache flush,
   or commit.

6. The routing HTTP endpoints remain HTTP 501 in PR-02. The stub must not make them
   callable or mutate session state.

7. During this temporary stage, handler tests cover only the resolver-failure guard:
   rollback occurs and no later handler step runs. Successful resolver-path tests are
   deferred until the real resolver implementation replaces the stub.

## Non-Functional Requirements

1. Core remains framework-, TypeORM-, and Node-free.
2. The concrete service method is stable for the later real composite resolver.
   Implementing its internals must not require changes to the routing-handler
   constructor contract.
3. No database schema, migration, data/control subsystem-link algorithm, or
   resolution persistence behavior is added in this scope.

## Out Of Scope

- Resolving data-link or control-link chains.
- Reading unresolved subsystem-link segments from the session overlay.
- Creating derived links or updating resolved segments.
- Aggregating incomplete-chain issues.
- Activating the routing endpoints.

## Replacement Boundary

A later dedicated resolver PR implements the existing temporary service's
`resolveAllChains` method as the real composite resolver. That implementation will
coordinate data/control plane resolvers using the handler-provided UoW and satisfy the
subsystem-links requirements.
